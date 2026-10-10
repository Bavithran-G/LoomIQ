"""Command-centre aggregations. Every number is computed from stored records."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (Downtime, Event, Inspection, JobStatus, Machine, OrderStatus, ProductionJob, Roll,
                      RollQuality, RollStage, SalesOrder)
from . import inventory, risk
from .costing import order_cost
from .core import EPS, money, r3
from .orders import order_metrics
from .production import machine_runtime_status
from ..models import Material

OPEN_ORDER = (OrderStatus.confirmed, OrderStatus.in_production, OrderStatus.on_hold, OrderStatus.draft)


def overview(db: Session, date_from: date, date_to: date, shift: str | None, search: str | None) -> dict:
    if date_to < date_from:
        date_from, date_to = date_to, date_from
    days = [date_from + timedelta(days=i) for i in range((date_to - date_from).days + 1)]
    orders = list(db.scalars(select(SalesOrder).where(SalesOrder.status.in_(OPEN_ORDER))))
    if search:
        s = search.lower()
        orders = [o for o in orders if s in o.order_no.lower() or s in o.buyer.name.lower()
                  or s in o.fabric_spec.name.lower() or s in o.colour.lower()]
    order_ids = {o.id for o in orders}

    # production in period (completed jobs, by planned date + shift)
    jq = select(ProductionJob).where(ProductionJob.planned_date >= date_from, ProductionJob.planned_date <= date_to,
                                     ProductionJob.status != JobStatus.cancelled)
    if shift:
        jq = jq.where(ProductionJob.shift == shift)
    jobs = list(db.scalars(jq))
    if search:
        jobs = [j for j in jobs if j.order_id in order_ids]
    out_by_day = defaultdict(float)
    target_by_day = defaultdict(float)
    for j in jobs:
        if j.stage_code == "weaving":
            target_by_day[j.planned_date] += j.planned_qty
            if j.status == JobStatus.completed:
                out_by_day[j.planned_date] += j.actual_qty
    woven = sum(out_by_day.values())

    # quality decisions in period
    insps = list(db.scalars(select(Inspection).where(Inspection.status == "reviewed")))
    q_by_day = defaultdict(lambda: {"accepted": 0.0, "rejected": 0.0, "rework": 0.0, "hold": 0.0})
    for i in insps:
        d = i.reviewed_at.date()
        if date_from <= d <= date_to and (not search or i.roll.order_id in order_ids):
            key = {"accept": "accepted", "reject": "rejected"}.get(i.decision, i.decision)
            q_by_day[d][key] += i.roll.length_m
    acc_p = sum(v["accepted"] for v in q_by_day.values())
    rej_p = sum(v["rejected"] for v in q_by_day.values())

    # order level
    metrics = {o.id: order_metrics(o) for o in orders}
    assessments = {a["order_id"]: a for a in risk.assess_all(db)}
    at_risk = [assessments[o.id] for o in orders if o.id in assessments and assessments[o.id]["band"] in ("high", "medium", "unknown")]
    at_risk.sort(key=lambda a: -(a["score"] if a["score"] is not None else 101))
    awaiting = sum(m["pending_inspection_m"] for m in metrics.values())
    awaiting_rolls = db.scalars(select(Roll).where(Roll.stage == RollStage.inspection,
                                                   Roll.quality == RollQuality.pending)).all()
    ready_rolls = [r for o in orders for r in o.rolls if r.quality == RollQuality.accepted and r.stage == RollStage.packed]

    # stock
    mats = [inventory.material_summary(db, m) for m in db.scalars(select(Material).order_by(Material.sku))]
    yarn = [m for m in mats if m["material_type"] == "yarn"]
    low = [m for m in mats if m["low_stock"]]

    # machines
    machines = list(db.scalars(select(Machine).order_by(Machine.stage_code, Machine.code)))
    status_count = defaultdict(int)
    util = []
    for m in machines:
        st = machine_runtime_status(db, m)
        status_count[st] += 1
        mj = [j for j in jobs if j.machine_id == m.id and j.status == JobStatus.completed]
        shifts_in_period = len(days) * (1 if shift else 3)
        capacity = m.capacity_per_shift * shifts_in_period
        out = sum(j.actual_qty for j in mj)
        dmins = sum(d.minutes for d in db.scalars(select(Downtime).where(
            Downtime.machine_id == m.id, Downtime.occurred_on >= date_from, Downtime.occurred_on <= date_to)))
        util.append({"machine_id": m.id, "code": m.code, "stage": m.stage_code, "status": st,
                     "output_m": r3(out), "capacity_m": r3(capacity),
                     "utilization": round(out / capacity, 3) if capacity else 0, "downtime_min": dmins})

    est_cost = sum(order_cost(db, o, metrics[o.id])["estimated_total"] for o in orders if o.status != OrderStatus.draft)

    alerts = []
    for a in at_risk[:5]:
        alerts.append({"severity": "critical" if a["band"] == "high" else "warning",
                       "title": f"{a['order_no']} at {a['band']} risk", "detail": a["summary"],
                       "action": a["recommendation"], "link": {"type": "order", "id": a["order_id"]}})
    for m in low:
        alerts.append({"severity": "warning", "title": f"Low stock: {m['sku']}",
                       "detail": f"{m['available']:g} {m['uom']} free vs reorder level {m['reorder_threshold']:g}"
                                 f"; {m['on_order']:g} on order",
                       "action": "Raise or expedite a purchase order.", "link": {"type": "material", "id": m["id"]}})
    held = [r for o in orders for r in o.rolls if r.quality in (RollQuality.hold, RollQuality.rejected)
            and r.stage != RollStage.scrapped]
    if held:
        alerts.append({"severity": "critical", "title": f"{len(held)} roll(s) rejected or on hold",
                       "detail": ", ".join(r.roll_no for r in held[:5]) + (" ..." if len(held) > 5 else ""),
                       "action": "Review disposition in Quality; dispatch is blocked for these rolls.",
                       "link": {"type": "quality", "id": None}})
    for m in machines:
        if m.state.value != "available":
            alerts.append({"severity": "warning", "title": f"{m.code} under {m.state.value}",
                           "detail": m.state_note or "No note", "action": "Re-plan jobs assigned to this machine.",
                           "link": {"type": "machine", "id": m.id}})

    stage_overview = defaultdict(float)
    for o in orders:
        for r in o.rolls:
            if r.stage not in (RollStage.dispatched, RollStage.scrapped):
                stage_overview[r.stage.value] += r.length_m
    events = db.scalars(select(Event).order_by(Event.id.desc()).limit(15)).all()

    return {
        "filters": {"date_from": date_from.isoformat(), "date_to": date_to.isoformat(), "shift": shift, "search": search},
        "kpis": {
            "active_orders": sum(1 for o in orders if o.status != OrderStatus.draft),
            "draft_orders": sum(1 for o in orders if o.status == OrderStatus.draft),
            "orders_at_risk": sum(1 for a in at_risk if a["band"] in ("high", "unknown")),
            "orders_medium_risk": sum(1 for a in at_risk if a["band"] == "medium"),
            "yarn_free_kg": r3(sum(m["available"] for m in yarn)),
            "yarn_reserved_kg": r3(sum(m["reserved"] for m in yarn)),
            "low_stock_items": len(low),
            "machines": dict(status_count),
            "woven_m": r3(woven), "target_m": r3(sum(target_by_day.values())),
            "accepted_m": r3(acc_p), "rejected_m": r3(rej_p),
            "rejection_rate": round(rej_p / (acc_p + rej_p), 4) if acc_p + rej_p > EPS else None,
            "uninspected_m": r3(awaiting), "at_inspection_rolls": len(awaiting_rolls),
            "at_inspection_m": r3(sum(r.length_m for r in awaiting_rolls)),
            "ready_rolls": len(ready_rolls), "ready_m": r3(sum(r.length_m for r in ready_rolls)),
            "estimated_cost_open_orders": money(est_cost),
        },
        "production_vs_target": [{"date": d.isoformat(), "output_m": r3(out_by_day[d]), "target_m": r3(target_by_day[d])}
                                 for d in days],
        "quality_trend": [{"date": d.isoformat(), **{k: r3(v) for k, v in q_by_day[d].items()},
                           "rejection_rate": round(q_by_day[d]["rejected"] / (q_by_day[d]["accepted"] + q_by_day[d]["rejected"]), 4)
                           if q_by_day[d]["accepted"] + q_by_day[d]["rejected"] > EPS else None} for d in days],
        "machine_utilization": util,
        "stage_overview": [{"stage": k, "metres": r3(v)} for k, v in stage_overview.items()],
        "order_risk": at_risk[:8],
        "alerts": alerts,
        "events": [{"id": e.id, "type": e.event_type, "message": e.message, "severity": e.severity,
                    "entity_type": e.entity_type, "entity_id": e.entity_id, "order_id": e.order_id,
                    "at": e.created_at.isoformat()} for e in events],
        "notes": ["Machine status is derived from job records and manual state changes, not physical sensors."],
    }
