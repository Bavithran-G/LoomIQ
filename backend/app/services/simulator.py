"""What-If production simulator.

Reads a snapshot of live data, applies hypothetical changes to an in-memory COPY, and runs a
shift-by-shift weaving schedule for baseline and scenario. Nothing is written to the database.
Results are estimates based on stated assumptions, not guaranteed outcomes.

Assumptions (returned with every result):
- Weaving is the bottleneck; looms are pooled; orders are served by priority then deadline.
- Each loom produces its capacity_per_shift every shift it is available.
- Yarn pool = free + reserved stock; open purchase orders arrive on their expected date (+ delay).
- Gross metres to weave = remaining good metres / (1 - rejection rate).
- Downstream (dyeing, inspection, finishing) adds a fixed lead time of 2 days after weaving.
"""
from __future__ import annotations

import copy
import math
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (Machine, MachineState, MaterialLot, OrderStatus, PurchaseLine, RollQuality,
                      SalesOrder)
from .core import EPS, money, r3, today
from .costing import unit_estimate
from .orders import order_metrics
from .risk import ACTIVE, DOWNSTREAM_DAYS, PRIORITY_RANK

HORIZON_DAYS = 120


@dataclass
class SimOrder:
    id: int
    order_no: str
    buyer: str
    priority: str
    promised: date
    remaining_good_m: float
    downstream_only: bool
    per_m: dict[int, float]
    unit_cost: float


@dataclass
class Snapshot:
    as_of: date
    orders: list[SimOrder]
    looms: list[dict]
    pool: dict[int, float]
    inbound: list[dict]
    materials: dict[int, str]
    observed_rejection_rate: float
    notes: list[str] = field(default_factory=list)


def take_snapshot(db: Session, as_of: date | None = None) -> Snapshot:
    as_of = as_of or today()
    orders = []
    acc = rej = 0.0
    for o in db.scalars(select(SalesOrder).where(SalesOrder.status.in_(ACTIVE))):
        m = order_metrics(o)
        good_needed = max(0.0, o.quantity - (m["accepted_m"] + m["pending_inspection_m"] + m["rework_m"] + m["hold_m"]))
        orders.append(SimOrder(o.id, o.order_no, o.buyer.name, o.priority.value, o.promised_date, good_needed,
                               good_needed <= EPS,
                               {l.material_id: l.qty_per_m for l in o.fabric_spec.materials},
                               unit_estimate(o)["total"]))
    for r in db.scalars(select(SalesOrder)):
        for roll in r.rolls:
            if roll.quality == RollQuality.accepted:
                acc += roll.length_m
            elif roll.quality == RollQuality.rejected:
                rej += roll.length_m
    looms = [{"id": m.id, "code": m.code, "cap": m.capacity_per_shift, "available": m.state == MachineState.available}
             for m in db.scalars(select(Machine).where(Machine.stage_code == "weaving").order_by(Machine.code))]
    pool = {mid: float(q) for mid, q in db.execute(
        select(MaterialLot.material_id, func.sum(MaterialLot.qty_available + MaterialLot.qty_reserved))
        .group_by(MaterialLot.material_id))}
    inbound = [{"id": p.id, "po": p.po_number, "material_id": p.material_id, "sku": p.material.sku, "qty": p.qty,
                "expected": p.expected_date} for p in db.scalars(select(PurchaseLine).where(PurchaseLine.status == "open"))]
    from ..models import Material
    materials = {m.id: m.sku for m in db.scalars(select(Material))}
    rate = rej / (acc + rej) if acc + rej > EPS else 0.0
    return Snapshot(as_of, orders, looms, pool, inbound, materials, rate)


def _run(snap: Snapshot, *, rejection_rate: float, outage: dict | None, po_delay: dict | None,
         prioritize: int | None) -> dict:
    s = copy.deepcopy(snap)
    for ib in s.inbound:
        if po_delay and ib["id"] == po_delay["purchase_line_id"]:
            ib["expected"] = ib["expected"] + timedelta(days=int(po_delay["days"]))
    orders = sorted(s.orders, key=lambda o: (0 if o.id == prioritize else 1, PRIORITY_RANK[o.priority],
                                             o.promised, o.id))
    gross = {o.id: o.remaining_good_m / max(EPS, 1 - rejection_rate) for o in orders}
    done_day: dict[int, int] = {o.id: 0 for o in orders if gross[o.id] <= EPS}
    material_wait: dict[int, set] = {o.id: set() for o in orders}
    pool = dict(s.pool)
    outage_shifts = int(outage["shifts"]) if outage else 0
    for day in range(HORIZON_DAYS):
        d = s.as_of + timedelta(days=day)
        for ib in s.inbound:
            if ib["expected"] == d or (day == 0 and ib["expected"] < d):
                pool[ib["material_id"]] = pool.get(ib["material_id"], 0.0) + ib["qty"]
        for shift in range(3):
            shift_idx = day * 3 + shift
            cap = sum(l["cap"] for l in s.looms if l["available"]
                      and not (outage and l["id"] == outage["machine_id"] and shift_idx < outage_shifts))
            for o in orders:
                if cap <= EPS:
                    break
                if o.id in done_day:
                    continue
                want = min(cap, gross[o.id])
                # material-limited metres
                for mid, per in o.per_m.items():
                    if per > EPS:
                        possible = pool.get(mid, 0.0) / per
                        if possible + EPS < want:
                            material_wait[o.id].add(s.materials.get(mid, str(mid)))
                        want = min(want, possible)
                if want <= EPS:
                    continue
                for mid, per in o.per_m.items():
                    pool[mid] = pool.get(mid, 0.0) - want * per
                gross[o.id] -= want
                cap -= want
                if gross[o.id] <= EPS:
                    done_day[o.id] = day
        if len(done_day) == len(orders):
            break
    res = []
    for o in orders:
        if o.id in done_day:
            lead = DOWNSTREAM_DAYS if o.remaining_good_m > EPS else 1
            finish = s.as_of + timedelta(days=done_day[o.id] + lead)
            late = (finish - o.promised).days
        else:
            finish, late = None, None
        res.append({"order_id": o.id, "order_no": o.order_no, "buyer": o.buyer, "priority": o.priority,
                    "promised": o.promised.isoformat(),
                    "remaining_good_m": r3(o.remaining_good_m),
                    "gross_to_weave_m": r3(o.remaining_good_m / max(EPS, 1 - rejection_rate)),
                    "estimated_finish": finish.isoformat() if finish else None,
                    "late_days": late,
                    "status": "beyond_horizon" if finish is None else ("late" if late > 0 else "on_time"),
                    "material_constrained_by": sorted(material_wait[o.id]),
                    "material_need": {s.materials.get(mid, str(mid)): r3(o.remaining_good_m / max(EPS, 1 - rejection_rate) * per)
                                      for mid, per in o.per_m.items()},
                    "est_cost_to_complete": money(o.remaining_good_m / max(EPS, 1 - rejection_rate) * o.unit_cost)})
    return {"orders": res, "late_count": sum(1 for r in res if r["status"] != "on_time"),
            "est_cost_to_complete": money(sum(r["est_cost_to_complete"] for r in res))}


def simulate(db: Session, scenario: dict) -> dict:
    snap = take_snapshot(db)
    base_rate = round(snap.observed_rejection_rate, 4)
    rate = scenario.get("rejection_rate")
    rate = base_rate if rate is None else float(rate)
    if not 0 <= rate < 0.9:
        raise ValueError("Rejection rate must be between 0 and 0.9")
    baseline = _run(snap, rejection_rate=base_rate, outage=None, po_delay=None, prioritize=None)
    modified = _run(snap, rejection_rate=rate, outage=scenario.get("machine_outage"),
                    po_delay=scenario.get("po_delay"), prioritize=scenario.get("prioritize_order_id"))
    bmap = {r["order_id"]: r for r in baseline["orders"]}
    comparison = []
    for r in modified["orders"]:
        b = bmap[r["order_id"]]
        shift = None
        if r["estimated_finish"] and b["estimated_finish"]:
            shift = (date.fromisoformat(r["estimated_finish"]) - date.fromisoformat(b["estimated_finish"])).days
        comparison.append({**r, "baseline_finish": b["estimated_finish"], "baseline_status": b["status"],
                           "finish_shift_days": shift,
                           "newly_late": b["status"] == "on_time" and r["status"] != "on_time"})
    conflicts = [c for c in comparison if c["status"] != "on_time"]
    assumptions = [
        "Weaving is treated as the bottleneck; looms are pooled across orders.",
        "Orders are served by priority then promised date (the prioritised order, if any, goes first).",
        "Each available loom delivers its rated capacity every shift.",
        "Yarn pool = free + reserved stock; open POs arrive on their expected date (plus any delay).",
        f"Baseline rejection rate = observed historical rate {base_rate:.1%}; gross metres = remaining / (1 - rate).",
        f"Fixed {DOWNSTREAM_DAYS}-day downstream lead time after weaving.",
        "Estimated costs use standard material cost and spec labour/processing rates.",
    ]
    return {
        "label": "SIMULATION - estimates based on assumptions; no live records were changed",
        "as_of": snap.as_of.isoformat(), "scenario": scenario, "baseline_rejection_rate": base_rate,
        "scenario_rejection_rate": rate, "assumptions": assumptions,
        "baseline": {"late_count": baseline["late_count"], "est_cost_to_complete": baseline["est_cost_to_complete"]},
        "modified": {"late_count": modified["late_count"], "est_cost_to_complete": modified["est_cost_to_complete"]},
        "cost_delta": money(modified["est_cost_to_complete"] - baseline["est_cost_to_complete"]),
        "orders": comparison, "conflicts": [c["order_no"] for c in conflicts],
        "looms": snap.looms, "inbound": [{**i, "expected": i["expected"].isoformat()} for i in snap.inbound],
    }
