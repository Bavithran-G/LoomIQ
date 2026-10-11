"""Dispatch: only accepted, packed, not-yet-dispatched rolls of the same order may ship.

Confirmation is one transaction: every roll is locked and re-validated; any failure rolls
back everything, so stock and order status are never partially updated."""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (Dispatch, DispatchLine, DispatchStatus, OrderStatus, Roll, RollEvent, RollQuality,
                      RollStage, SalesOrder, User)
from .core import EPS, BusinessError, NotFound, log_event, next_number, validate_planned_date
from .orders import order_metrics


def roll_block_reason(db: Session, roll: Roll, order: SalesOrder, dispatch_id: int | None = None) -> str | None:
    if roll.order_id != order.id:
        return f"{roll.roll_no} belongs to a different order"
    if roll.stage == RollStage.dispatched:
        return f"{roll.roll_no} has already been dispatched"
    if roll.quality == RollQuality.pending:
        return f"{roll.roll_no} has not passed inspection"
    if roll.quality != RollQuality.accepted:
        return f"{roll.roll_no} is {roll.quality.value} and is held from dispatch"
    if roll.stage != RollStage.packed:
        return f"{roll.roll_no} is at {roll.stage.value}, not packed"
    other = db.scalar(select(Dispatch.dispatch_no).join(DispatchLine)
                      .where(DispatchLine.roll_id == roll.id, Dispatch.status == DispatchStatus.planned,
                             Dispatch.id != (dispatch_id or -1)))
    if other:
        return f"{roll.roll_no} is already on planned dispatch {other}"
    return None


def order_block_reason(order: SalesOrder) -> str | None:
    if order.status in (OrderStatus.on_hold, OrderStatus.cancelled, OrderStatus.completed, OrderStatus.draft):
        return f"{order.order_no} is {order.status.value.replace('_', ' ')}"
    return None


def eligible_rolls(db: Session, order: SalesOrder) -> list[Roll]:
    return [r for r in order.rolls if roll_block_reason(db, r, order) is None]


def create_dispatch(db: Session, *, order_id: int, roll_ids: list[int], planned_date: date, vehicle_no: str,
                    transporter: str, user: User) -> Dispatch:
    validate_planned_date(planned_date, "Planned date")
    order = db.get(SalesOrder, order_id)
    if not order:
        raise NotFound("Order")
    if (why := order_block_reason(order)):
        raise BusinessError(f"Cannot plan dispatch: {why}")
    if not roll_ids:
        raise BusinessError("Select at least one roll", 422)
    if len(set(roll_ids)) != len(roll_ids):
        raise BusinessError("A roll is listed twice", 422)
    rolls = []
    for rid in roll_ids:
        r = db.get(Roll, rid, with_for_update=True)
        if not r:
            raise NotFound(f"Roll {rid}")
        if (why := roll_block_reason(db, r, order)):
            raise BusinessError(why)
        rolls.append(r)
    m = order_metrics(order)
    total = sum(r.length_m for r in rolls)
    if m["dispatched_m"] + total > order.quantity * 1.05 + EPS:
        raise BusinessError(f"Dispatch would exceed order quantity by more than 5% "
                            f"({m['dispatched_m'] + total:g} m vs {order.quantity:g} m)")
    d = Dispatch(dispatch_no=next_number(db, Dispatch, Dispatch.dispatch_no, "DSP"), order_id=order.id,
                 planned_date=planned_date, vehicle_no=vehicle_no.strip(), transporter=transporter.strip(),
                 created_by_id=user.id, status=DispatchStatus.planned)
    d.lines = [DispatchLine(roll_id=r.id, length_m=r.length_m) for r in rolls]
    db.add(d)
    db.flush()
    log_event(db, "dispatch", d.id, "planned", f"{d.dispatch_no} planned for {order.order_no}: "
              f"{len(rolls)} rolls, {total:g} m", order_id=order.id, buyer_visible=True, user=user)
    return d


def confirm_dispatch(db: Session, dispatch_id: int, user: User) -> dict:
    d = db.get(Dispatch, dispatch_id, with_for_update=True)
    if not d:
        raise NotFound("Dispatch")
    if d.status != DispatchStatus.planned:
        raise BusinessError(f"{d.dispatch_no} is already {d.status.value}")
    order = db.get(SalesOrder, d.order_id, with_for_update=True)
    if (why := order_block_reason(order)):
        raise BusinessError(f"Cannot confirm: {why}")
    if not d.vehicle_no:
        raise BusinessError("Vehicle number is required before confirming dispatch", 422)
    rolls = [db.get(Roll, ln.roll_id, with_for_update=True) for ln in d.lines]
    for r in rolls:                                  # validate everything first ...
        if (why := roll_block_reason(db, r, order, d.id)):
            raise BusinessError(f"Dispatch blocked: {why}")
    now = datetime.now(timezone.utc)
    for r in rolls:                                  # ... then apply
        r.stage = RollStage.dispatched
        r.location = f"Dispatched ({d.vehicle_no})"
        db.add(RollEvent(roll_id=r.id, event_type="dispatched", stage="dispatched",
                         detail=f"Dispatched on {d.dispatch_no}, vehicle {d.vehicle_no}"))
    d.status = DispatchStatus.confirmed
    d.confirmed_at = now
    db.flush()
    db.refresh(order)
    m = order_metrics(order)
    if m["dispatched_m"] >= order.quantity - EPS:
        order.status = OrderStatus.completed
        log_event(db, "order", order.id, "completed", f"{order.order_no} fully dispatched and completed",
                  order_id=order.id, severity="success", buyer_visible=True, user=user)
    total = sum(r.length_m for r in rolls)
    log_event(db, "dispatch", d.id, "confirmed",
              f"{d.dispatch_no} confirmed: {len(rolls)} rolls / {total:g} m left on {d.vehicle_no}",
              order_id=order.id, severity="success", buyer_visible=True, user=user)
    return {"dispatched_m": m["dispatched_m"], "order_status": order.status.value}


def cancel_dispatch(db: Session, dispatch_id: int, user: User) -> Dispatch:
    d = db.get(Dispatch, dispatch_id, with_for_update=True)
    if not d:
        raise NotFound("Dispatch")
    if d.status != DispatchStatus.planned:
        raise BusinessError("Only planned dispatches can be cancelled")
    d.status = DispatchStatus.cancelled
    log_event(db, "dispatch", d.id, "cancelled", f"{d.dispatch_no} cancelled", order_id=d.order_id, user=user)
    return d
