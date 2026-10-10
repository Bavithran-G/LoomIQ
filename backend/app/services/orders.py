"""Customer orders: creation, edits, explicit status transitions, derived metrics."""
from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import (Buyer, Dispatch, DispatchStatus, FabricSpec, JobStatus, OrderStatus, Priority,
                      ProductionJob, RollQuality, RollStage, SalesOrder, User)
from . import inventory
from .core import EPS, BusinessError, NotFound, log_event, next_number, r3

# Allowed manual transitions. in_production and completed are reached through business events
# (first job started / final dispatch confirmed), never by editing a status field.
TRANSITIONS: dict[OrderStatus, set[str]] = {
    OrderStatus.draft: {"confirm", "cancel"},
    OrderStatus.confirmed: {"hold", "cancel", "reserve"},
    OrderStatus.in_production: {"hold", "cancel", "reserve"},
    OrderStatus.on_hold: {"resume", "cancel"},
    OrderStatus.completed: set(),
    OrderStatus.cancelled: set(),
}


def order_metrics(order: SalesOrder) -> dict:
    """All order quantities derive from its rolls, so one inspection updates every view."""
    produced = accepted = rejected = rework = pending = hold = dispatched = ready = 0.0
    for r in order.rolls:
        produced += r.length_m
        if r.quality == RollQuality.accepted:
            accepted += r.length_m
            if r.stage == RollStage.dispatched:
                dispatched += r.length_m
            elif r.stage == RollStage.packed:
                ready += r.length_m
        elif r.quality == RollQuality.rejected:
            rejected += r.length_m
        elif r.quality == RollQuality.rework:
            rework += r.length_m
        elif r.quality == RollQuality.hold:
            hold += r.length_m
        else:
            pending += r.length_m
    q = order.quantity
    # Good-or-possibly-good fabric already made. Rejected fabric does not count.
    in_pipeline = accepted + pending + rework + hold
    projected_shortfall = max(0.0, q - in_pipeline)
    remaining_to_weave = max(0.0, q - (produced - rejected))
    return {
        "produced_m": r3(produced), "accepted_m": r3(accepted), "rejected_m": r3(rejected),
        "rework_m": r3(rework), "hold_m": r3(hold), "pending_inspection_m": r3(pending),
        "dispatched_m": r3(dispatched), "ready_m": r3(ready),
        "remaining_to_weave_m": r3(remaining_to_weave),
        "quality_shortfall_m": r3(max(0.0, min(rejected, q - in_pipeline))) if rejected > EPS else 0.0,
        "projected_shortfall_m": r3(projected_shortfall) if produced > EPS else r3(q),
        "rejection_rate": r3(rejected / (accepted + rejected)) if (accepted + rejected) > EPS else None,
    }


def stage_progress(order: SalesOrder, stage_codes: list[str]) -> list[dict]:
    """Per-stage completion (metres that have passed each stage / order qty)."""
    q = order.quantity or 1
    passed: dict[str, float] = {c: 0.0 for c in stage_codes}
    order_rank = {c: i for i, c in enumerate(stage_codes + ["packed", "dispatched"])}
    for r in order.rolls:
        if r.quality == RollQuality.rejected:
            continue
        cur = r.stage.value
        cur_rank = order_rank.get(cur, len(stage_codes))
        for c in stage_codes:
            if c == "weaving":
                passed[c] += r.length_m
            elif c == "inspection":
                if r.quality == RollQuality.accepted:
                    passed[c] += r.length_m
            elif order_rank[c] < cur_rank:
                passed[c] += r.length_m
    out = [{"stage": c, "done_m": r3(passed[c]), "pct": round(min(1.0, passed[c] / q), 3)} for c in stage_codes]
    dispatched = sum(r.length_m for r in order.rolls if r.stage == RollStage.dispatched)
    out.append({"stage": "dispatch", "done_m": r3(dispatched), "pct": round(min(1.0, dispatched / q), 3)})
    return out


def dispatch_state(db: Session, order: SalesOrder, m: dict) -> str:
    if order.status == OrderStatus.on_hold:
        return "on_hold"
    if m["dispatched_m"] >= order.quantity - EPS:
        return "fully_dispatched"
    if m["dispatched_m"] > EPS:
        return "partially_dispatched"
    planned = db.scalar(select(Dispatch.id).where(Dispatch.order_id == order.id,
                                                  Dispatch.status == DispatchStatus.planned))
    if planned:
        return "planned"
    if m["ready_m"] > EPS:
        return "ready"
    return "not_ready"


def _validate(quantity: float, order_date: date, promised_date: date):
    if quantity <= 0:
        raise BusinessError("Quantity must be greater than zero", 422)
    if quantity > 1_000_000:
        raise BusinessError("Quantity exceeds the 1,000,000 m sanity limit", 422)
    if promised_date < order_date:
        raise BusinessError("Promised delivery date cannot be before the order date", 422)


def create_order(db: Session, data: dict, user: User) -> SalesOrder:
    _validate(data["quantity"], data["order_date"], data["promised_date"])
    if not db.get(Buyer, data["buyer_id"]):
        raise NotFound("Buyer")
    if not db.get(FabricSpec, data["fabric_spec_id"]):
        raise NotFound("Fabric spec")
    po = data["buyer_po"].strip()
    if not po:
        raise BusinessError("Buyer PO reference is required", 422)
    dup = db.scalar(select(SalesOrder).where(SalesOrder.buyer_id == data["buyer_id"], SalesOrder.buyer_po == po))
    if dup:
        raise BusinessError(f"Duplicate order: buyer PO {po} already exists as {dup.order_no}")
    order = SalesOrder(order_no=next_number(db, SalesOrder, SalesOrder.order_no, "SO"), buyer_po=po,
                       buyer_id=data["buyer_id"], fabric_spec_id=data["fabric_spec_id"],
                       colour=data["colour"].strip(), quantity=r3(data["quantity"]), unit="m",
                       order_date=data["order_date"], promised_date=data["promised_date"],
                       priority=Priority(data.get("priority", "normal")), notes=data.get("notes", ""),
                       internal_notes=data.get("internal_notes", ""), status=OrderStatus.draft)
    db.add(order)
    try:
        db.flush()
    except IntegrityError:
        raise BusinessError("Duplicate order reference")
    log_event(db, "order", order.id, "created", f"Order {order.order_no} created ({order.quantity:g} m)",
              order_id=order.id, buyer_visible=True, user=user)
    return order


def update_order(db: Session, order: SalesOrder, data: dict, user: User) -> SalesOrder:
    if order.status in (OrderStatus.completed, OrderStatus.cancelled):
        raise BusinessError(f"A {order.status.value} order cannot be edited")
    locked_fields = {"quantity", "fabric_spec_id", "buyer_id", "colour", "buyer_po", "order_date"}
    changes = []
    for k, v in data.items():
        if v is None:
            continue
        if k in locked_fields and order.status != OrderStatus.draft:
            if getattr(order, k) != v:
                raise BusinessError(f"'{k}' can only be changed while the order is a draft")
            continue
        if getattr(order, k) != v:
            changes.append(k)
            setattr(order, k, Priority(v) if k == "priority" else v)
    _validate(order.quantity, order.order_date, order.promised_date)
    if changes:
        log_event(db, "order", order.id, "edited", f"{order.order_no} updated: {', '.join(changes)}",
                  order_id=order.id, user=user,
                  buyer_visible="promised_date" in changes)
    return order


def transition(db: Session, order: SalesOrder, action: str, user: User, reason: str = "") -> dict:
    allowed = TRANSITIONS[order.status]
    if action not in allowed:
        raise BusinessError(f"Cannot '{action}' an order that is {order.status.value.replace('_', ' ')}. "
                            f"Allowed: {', '.join(sorted(allowed)) or 'none'}")
    info: dict = {}
    if action == "confirm":
        info["reservation"] = inventory.reserve_for_order(db, order, user)
        order.status = OrderStatus.confirmed
        log_event(db, "order", order.id, "confirmed", f"{order.order_no} confirmed; materials reserved",
                  order_id=order.id, severity="success", buyer_visible=True, user=user)
    elif action == "reserve":
        info["reservation"] = inventory.reserve_for_order(db, order, user)
        log_event(db, "order", order.id, "reserved", f"{order.order_no}: reservation topped up",
                  order_id=order.id, user=user)
    elif action == "hold":
        if not reason.strip():
            raise BusinessError("A reason is required to put an order on hold", 422)
        order.hold_reason = reason.strip()
        order.status = OrderStatus.on_hold
        for j in order.jobs:
            if j.status == JobStatus.running:
                j.status = JobStatus.paused
        log_event(db, "order", order.id, "on_hold", f"{order.order_no} put on hold: {reason.strip()}",
                  order_id=order.id, severity="warning", buyer_visible=True, user=user)
    elif action == "resume":
        started = any(j.status in (JobStatus.running, JobStatus.paused, JobStatus.completed) for j in order.jobs)
        order.status = OrderStatus.in_production if started else OrderStatus.confirmed
        order.hold_reason = ""
        log_event(db, "order", order.id, "resumed", f"{order.order_no} resumed", order_id=order.id,
                  buyer_visible=True, user=user)
    elif action == "cancel":
        if any(r.stage == RollStage.dispatched for r in order.rolls):
            raise BusinessError("Order has dispatched rolls and cannot be cancelled")
        if not reason.strip():
            raise BusinessError("A reason is required to cancel an order", 422)
        released = inventory.release_for_order(db, order, user)
        for j in order.jobs:
            if j.status in (JobStatus.planned, JobStatus.paused, JobStatus.running):
                j.status = JobStatus.cancelled
        for d in db.scalars(select(Dispatch).where(Dispatch.order_id == order.id,
                                                   Dispatch.status == DispatchStatus.planned)):
            d.status = DispatchStatus.cancelled
        order.status = OrderStatus.cancelled
        order.hold_reason = reason.strip()
        info["released_material"] = r3(released)
        log_event(db, "order", order.id, "cancelled",
                  f"{order.order_no} cancelled ({reason.strip()}); {released:g} kg material released",
                  order_id=order.id, severity="warning", buyer_visible=True, user=user)
    return info


def mark_in_production(db: Session, order: SalesOrder, user: User | None):
    if order.status == OrderStatus.confirmed:
        order.status = OrderStatus.in_production
        log_event(db, "order", order.id, "in_production", f"{order.order_no} entered production",
                  order_id=order.id, buyer_visible=True, user=user)
