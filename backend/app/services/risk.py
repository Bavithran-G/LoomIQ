"""Explainable production-risk engine.

This is a DETERMINISTIC, RULE-BASED score - not a trained or predictive AI model.
Every factor reports its points, the rule, and the data it used.

Projected finish (per order, earliest-deadline-first within priority):
  weaving capacity/day = sum(capacity_per_shift x 3) over available looms
  projected weaving done = today + ceil(cumulative remaining weaving of this and all
                           higher-ranked orders / weaving capacity per day)
  projected finish = projected weaving done + downstream lead time (2 days if weaving remains,
                     1 day if only inspection/rework/finishing remains)
Points:
  projected finish after promised date ............ +40   (+20 if slack <= 1 day)
  material shortage not covered by open POs ...... +25   (+10 if covered by an open PO)
  quality shortfall / rolls on hold or in rework .. +15
  order on hold ................................... +20
  machine downtime > 120 min in last 7 days on the
    order's machines .............................. +10
  remaining weaving not yet planned with <= 5 days  +10
Bands: >= 50 high, 25-49 medium, < 25 low.  "unknown" when no weaving capacity is available.
"""
from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (Downtime, JobStatus, Machine, MachineState, OrderStatus, ProductionJob, PurchaseLine,
                      SalesOrder)
from . import inventory
from .core import EPS, r3, today
from .orders import order_metrics

PRIORITY_RANK = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
DOWNSTREAM_DAYS = 2
ACTIVE = (OrderStatus.confirmed, OrderStatus.in_production, OrderStatus.on_hold)


def weaving_capacity_per_day(db: Session, exclude_machine_ids: set[int] | None = None) -> float:
    q = select(Machine).where(Machine.stage_code == "weaving", Machine.state == MachineState.available)
    return float(sum(m.capacity_per_shift * 3 for m in db.scalars(q)
                     if not exclude_machine_ids or m.id not in exclude_machine_ids))


def assess_all(db: Session, as_of: date | None = None) -> list[dict]:
    as_of = as_of or today()
    cap = weaving_capacity_per_day(db)
    orders = list(db.scalars(select(SalesOrder).where(SalesOrder.status.in_(ACTIVE))))
    orders.sort(key=lambda o: (PRIORITY_RANK[o.priority.value], o.promised_date, o.id))
    cum = 0.0
    out = []
    for o in orders:
        m = order_metrics(o)
        cum += m["remaining_to_weave_m"]
        out.append(_assess(db, o, m, cum, cap, as_of))
    return out


def assess_order(db: Session, order: SalesOrder, as_of: date | None = None) -> dict:
    for a in assess_all(db, as_of):
        if a["order_id"] == order.id:
            return a
    return {"order_id": order.id, "order_no": order.order_no, "band": "not_assessed", "score": None,
            "factors": [], "summary": f"{order.status.value.title()} orders are not risk-assessed.",
            "recommendation": "", "assessed_at": datetime.now(timezone.utc).isoformat(), "data": {}}


def _assess(db: Session, o: SalesOrder, m: dict, cum_weave: float, cap: float, as_of: date) -> dict:
    factors = []
    days_left = (o.promised_date - as_of).days
    rem = m["remaining_to_weave_m"]
    data = {"order_qty_m": o.quantity, "remaining_to_weave_m": rem, "accepted_m": m["accepted_m"],
            "days_to_deadline": days_left, "weaving_capacity_m_per_day": cap,
            "queue_ahead_incl_this_m": r3(cum_weave)}
    assessed_at = datetime.now(timezone.utc).isoformat()
    base = {"order_id": o.id, "order_no": o.order_no, "buyer": o.buyer.name, "priority": o.priority.value,
            "promised_date": o.promised_date.isoformat(), "assessed_at": assessed_at,
            "method": "deterministic rule-based score (not a trained model)"}

    if rem > EPS and cap <= EPS:
        return {**base, "band": "unknown", "score": None, "confidence": "insufficient_data", "factors": [],
                "summary": "Cannot assess: no weaving capacity is currently available (all looms down or in maintenance).",
                "recommendation": "Restore at least one loom to available status or reassign capacity.",
                "projected_finish": None, "data": data}

    pending_downstream = m["pending_inspection_m"] + m["rework_m"] + m["hold_m"] + \
        (m["accepted_m"] - m["ready_m"] - m["dispatched_m"])
    if rem > EPS:
        weave_days = math.ceil(cum_weave / cap - EPS)
        lead = DOWNSTREAM_DAYS
    else:
        weave_days = 0
        lead = 1 if pending_downstream > EPS else 0
    projected = as_of + timedelta(days=weave_days + lead)
    slack = (o.promised_date - projected).days
    data.update({"projected_finish": projected.isoformat(), "slack_days": slack,
                 "downstream_lead_days": lead})

    if m["dispatched_m"] < o.quantity - EPS:
        if slack < 0:
            factors.append(_f("schedule", 40, f"Projected finish {projected} is {-slack} day(s) after the "
                              f"promised date {o.promised_date}",
                              "projected finish > promised date", {"slack_days": slack}))
        elif slack <= 1:
            factors.append(_f("schedule", 20, "No slack left before the promised date" if slack <= 0
                              else "Only 1 day of slack before the promised date",
                              "slack <= 1 day", {"slack_days": slack}))

    # material
    if rem > EPS:
        reqs = inventory.order_requirements(db, o)
        for rq in reqs:
            # need only covers metres not yet woven
            need_remaining = max(0.0, rem * rq["qty_per_m"] - rq["reserved"])
            short = max(0.0, need_remaining - rq["free_available"])
            if short > EPS:
                po = db.scalar(select(func.coalesce(func.sum(PurchaseLine.qty), 0)).where(
                    PurchaseLine.material_id == rq["material_id"], PurchaseLine.status == "open",
                    PurchaseLine.expected_date <= o.promised_date - timedelta(days=DOWNSTREAM_DAYS)))
                covered = float(po) >= short - EPS
                factors.append(_f("material", 10 if covered else 25,
                                  f"{rq['sku']} short by {short:.1f} {rq['uom']}"
                                  + (" (covered by an open purchase order arriving in time)" if covered
                                     else " and not covered by purchase orders arriving in time"),
                                  "remaining need - reserved - free stock > 0",
                                  {"sku": rq["sku"], "shortage": r3(short), "on_order_in_time": r3(float(po))}))
    # quality
    q_issue = m["quality_shortfall_m"] + m["hold_m"] + m["rework_m"]
    if q_issue > EPS:
        parts = [f"{m[k]:g} m {label}" for k, label in (("rejected_m", "rejected"), ("hold_m", "on hold"),
                                                         ("rework_m", "in rework")) if m[k] > EPS]
        factors.append(_f("quality", 15, ", ".join(parts),
                          "rejected/held/rework fabric reduces deliverable quantity",
                          {"rejected_m": m["rejected_m"], "hold_m": m["hold_m"], "rework_m": m["rework_m"]}))
    if o.status == OrderStatus.on_hold:
        factors.append(_f("hold", 20, f"Order on hold: {o.hold_reason or 'no reason recorded'}",
                          "order status = on_hold", {}))
    # downtime on this order's machines
    machine_ids = {j.machine_id for j in o.jobs if j.machine_id}
    if machine_ids:
        mins = db.scalar(select(func.coalesce(func.sum(Downtime.minutes), 0)).where(
            Downtime.machine_id.in_(machine_ids), Downtime.occurred_on >= as_of - timedelta(days=7)))
        if mins > 120:
            factors.append(_f("downtime", 10, f"{mins} min downtime in the last 7 days on machines running this order",
                              "downtime > 120 min / 7 days", {"minutes": int(mins)}))
    # unplanned production close to deadline
    planned_open = sum(j.planned_qty for j in o.jobs if j.stage_code == "weaving"
                       and j.status in (JobStatus.planned, JobStatus.running, JobStatus.paused))
    unplanned = max(0.0, rem - planned_open)
    data["unplanned_weaving_m"] = r3(unplanned)
    if unplanned > EPS and days_left <= 5:
        factors.append(_f("workload", 10, f"{unplanned:g} m still to weave has no job planned, "
                          f"{days_left} day(s) to deadline", "unplanned remaining > 0 and <= 5 days left",
                          {"unplanned_m": r3(unplanned)}))

    score = min(100, sum(f["points"] for f in factors))
    band = "high" if score >= 50 else "medium" if score >= 25 else "low"
    no_plan = rem > EPS and planned_open <= EPS and not any(j.status == JobStatus.completed for j in o.jobs)
    confidence = "low" if no_plan else "normal"
    factors.sort(key=lambda f: -f["points"])
    summary = (f"Order at {band} risk because " + _join([_lc(f["detail"]) for f in factors[:3]]) + "."
               if factors else "No risk factors triggered by the current data.")
    return {**base, "band": band, "score": score, "confidence": confidence, "factors": factors,
            "summary": summary, "recommendation": _recommend(factors, o), "projected_finish": projected.isoformat(),
            "data": data}


def _f(kind, points, detail, rule, data):
    return {"kind": kind, "points": points, "detail": detail, "rule": rule, "data": data}


def _lc(s: str) -> str:
    """Lower-case the first letter unless the first word is a code like YRN-CT30 or LM-04."""
    first = s.split(" ", 1)[0]
    return s if (first.isupper() or any(c.isdigit() for c in first)) else s[0].lower() + s[1:]


def _join(parts):
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]


def _recommend(factors, o) -> str:
    if not factors:
        return "Continue as planned."
    recs = {
        "schedule": "Add shifts or move this order to a free loom; agree a revised date with the buyer early.",
        "material": "Expedite the open purchase order or receive replacement yarn before weaving resumes.",
        "quality": "Segregate the affected rolls, decide rework vs. replacement, and plan make-up production.",
        "hold": "Resolve the hold reason so production and dispatch can resume.",
        "downtime": "Schedule maintenance review for the affected machines before the next shift.",
        "workload": "Plan weaving jobs for the remaining quantity now.",
    }
    return " ".join(dict.fromkeys(recs[f["kind"]] for f in factors[:2]))
