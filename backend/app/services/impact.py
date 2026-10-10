"""Quality Impact Chain: Defect -> Roll -> Order -> Shortfall -> Rework/Replacement -> Dispatch risk -> Cost.

Built from the real records linked to a roll. Each node states its basis
(measured / recorded / derived / estimated) and the rule or formula used."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Inspection, Roll, RollQuality
from .core import EPS, NotFound, money
from .costing import order_cost, unit_estimate
from .orders import dispatch_state, order_metrics


def chain_for_roll(db: Session, roll_id: int) -> dict:
    roll = db.get(Roll, roll_id)
    if not roll:
        raise NotFound("Roll")
    o = roll.order
    m = order_metrics(o)
    cost = order_cost(db, o, m)
    insp = db.scalar(select(Inspection).where(Inspection.roll_id == roll.id, Inspection.status == "reviewed")
                     .order_by(Inspection.id.desc()))
    u = unit_estimate(o)
    nodes = []
    defect = insp.confirmed_defect if insp else ""
    nodes.append({
        "key": "defect", "title": "Confirmed defect",
        "value": defect or ("none" if roll.quality == RollQuality.accepted else "not yet reviewed"),
        "basis": "recorded", "why": f"Inspector decision '{insp.decision}' on inspection #{insp.id}"
        + (f" (baseline suggested: {insp.suggested_outcome})" if insp and insp.suggested_outcome else "")
        if insp else "No reviewed inspection yet",
        "rule": "Human review decision; baseline suggestions never change status on their own",
        "link": {"type": "inspection", "id": insp.id} if insp else None,
    })
    nodes.append({
        "key": "roll", "title": f"Roll {roll.roll_no}", "value": f"{roll.length_m:g} m - {roll.quality.value}",
        "basis": "measured", "why": f"Woven on {roll.machine.code if roll.machine else 'n/a'}; now at {roll.location}",
        "rule": "Rejected / hold / rework rolls are blocked from dispatch",
        "link": {"type": "roll", "id": roll.id, "ref": roll.roll_no},
    })
    nodes.append({
        "key": "order", "title": f"Order {o.order_no}",
        "value": f"{m['accepted_m']:g} of {o.quantity:g} m accepted", "basis": "derived",
        "why": f"{o.buyer.name}, due {o.promised_date}",
        "rule": "accepted m = sum of lengths of accepted rolls",
        "link": {"type": "order", "id": o.id, "ref": o.order_no},
    })
    nodes.append({
        "key": "shortfall", "title": "Accepted-quantity shortfall from quality",
        "value": f"{m['quality_shortfall_m']:g} m",
        "basis": "derived",
        "why": f"Rejected fabric the order can no longer count on. Separately, {m['remaining_to_weave_m']:g} m "
               f"is still to be woven in the normal plan; {m['hold_m'] + m['rework_m']:g} m is on hold or in rework.",
        "rule": "quality shortfall = min(rejected m, order qty - (accepted + uninspected + hold + rework))",
        "link": {"type": "order", "id": o.id, "ref": o.order_no},
    })
    if roll.quality == RollQuality.rework:
        rr = o.fabric_spec.rework_cost_per_m
        nodes.append({"key": "remedy", "title": "Rework", "value": f"{roll.length_m:g} m in rework",
                      "basis": "estimated", "why": "Roll sent for authorised rework; must be re-inspected",
                      "rule": f"est. rework cost = {roll.length_m:g} m x {rr:g}/m = {money(roll.length_m * rr):,.2f}",
                      "link": {"type": "roll", "id": roll.id, "ref": roll.roll_no}})
    else:
        nodes.append({"key": "remedy", "title": "Replacement production",
                      "value": f"{m['quality_shortfall_m']:g} m to re-weave", "basis": "estimated",
                      "why": "Rejected fabric must be replaced to deliver the full quantity",
                      "rule": "replacement m = min(rejected m, order qty - non-rejected fabric)",
                      "link": {"type": "order", "id": o.id, "ref": o.order_no}})
    ds = dispatch_state(db, o, m)
    at_risk = m["quality_shortfall_m"] + m["hold_m"] + m["rework_m"] > EPS
    nodes.append({"key": "dispatch", "title": "Dispatch risk",
                  "value": ("Full quantity at risk" if at_risk else "No quantity risk") + f" - {ds.replace('_', ' ')}",
                  "basis": "derived", "why": f"{m['ready_m']:g} m ready, {m['dispatched_m']:g} m dispatched",
                  "rule": "Only accepted + packed rolls can be dispatched",
                  "link": {"type": "dispatch", "id": o.id, "ref": o.order_no}})
    q = cost["quality"]
    nodes.append({"key": "cost", "title": "Estimated cost impact",
                  "value": f"INR {q['cost_embedded_in_rejected'] + q['rework_cost_actual']:,.2f} incurred + "
                           f"INR {q['replacement_estimate']:,.2f} est. replacement",
                  "basis": "estimated",
                  "why": "Incurred = cost already sunk in rejected fabric + recorded rework; replacement is forward-looking",
                  "rule": f"embedded = rejected m x actual (material+labour+processing)/produced m; "
                          f"replacement = shortfall m x est. unit cost {u['total']:.2f}/m. "
                          f"Embedded cost is already inside the order's actual total and is not added again.",
                  "link": {"type": "cost", "id": o.id, "ref": o.order_no}})
    return {"roll_id": roll.id, "roll_no": roll.roll_no, "quality": roll.quality.value, "nodes": nodes,
            "recommendations": waste_recovery(roll, m)}


def waste_recovery(roll: Roll, m: dict) -> list[dict]:
    """Material Waste Recovery recommendations. Suggestions only - every disposition needs
    an authorised human action; rejected stock is never auto-returned to sellable inventory."""
    recs = []
    if roll.quality in (RollQuality.rejected, RollQuality.hold, RollQuality.rework):
        siblings = [r for r in roll.order.rolls if r.weaving_job_id == roll.weaving_job_id and r.id != roll.id]
        pending_sib = [r.roll_no for r in siblings if r.quality == RollQuality.pending]
        recs.append({"action": "Inspect and segregate the affected batch",
                     "detail": f"{len(siblings)} other roll(s) came from the same weaving job"
                               + (f"; {len(pending_sib)} still uninspected ({', '.join(pending_sib[:4])})" if pending_sib else ""),
                     "requires_approval": False})
        if roll.quality == RollQuality.rejected and roll.stage.value != "scrapped":
            recs.append({"action": "Decide final disposition of the rejected roll (scrap or sell as seconds)",
                         "detail": "Rejected fabric stays in quarantine and never returns to sellable stock "
                                   "without an authorised decision",
                         "requires_approval": True})
        if roll.quality == RollQuality.hold:
            recs.append({"action": "Re-inspect or send for authorised rework",
                         "detail": "Held rolls need a final decision before dispatch", "requires_approval": True})
        if m["quality_shortfall_m"] > EPS:
            recs.append({"action": f"Plan make-up weaving of {m['quality_shortfall_m']:g} m",
                         "detail": "Recalculated remaining requirement for the order", "requires_approval": True})
        if m["quality_shortfall_m"] > EPS:
            recs.append({"action": "Hold final dispatch or agree a partial shipment with the buyer",
                         "detail": f"Quality shortfall {m['quality_shortfall_m']:g} m", "requires_approval": True})
        if roll.machine:
            recs.append({"action": f"Review loom {roll.machine.code} and the production batch",
                         "detail": "Check settings and yarn lots " + ", ".join(roll.material_lots or []),
                         "requires_approval": False})
    return recs
