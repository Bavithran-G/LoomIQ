"""Raw-material stock: receipt, reservation, consumption, adjustment.

Quantities per lot:  qty_received = qty_available + qty_reserved + qty_consumed (+/- adjustments)
- available: free stock anyone may reserve
- reserved:  earmarked for a confirmed order (OrderReservation rows say which)
- consumed:  used by a completed weaving job (the ONLY event that consumes yarn)
- on order:  open PurchaseLine quantities, not yet received
All mutating functions lock the lot rows they touch (SELECT ... FOR UPDATE on PostgreSQL) and never
allow a negative quantity.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (CostEntry, Material, MaterialLot, OrderReservation, PurchaseLine, SalesOrder,
                      StockMovement, User)
from .core import EPS, BusinessError, NotFound, log_event, r3, validate_event_date


def _locked_lots(db: Session, material_id: int):
    return list(db.scalars(select(MaterialLot).where(MaterialLot.material_id == material_id)
                           .order_by(MaterialLot.receipt_date, MaterialLot.id).with_for_update()))


def material_summary(db: Session, m: Material) -> dict:
    agg = db.execute(select(func.coalesce(func.sum(MaterialLot.qty_available), 0),
                            func.coalesce(func.sum(MaterialLot.qty_reserved), 0),
                            func.coalesce(func.sum(MaterialLot.qty_consumed), 0))
                     .where(MaterialLot.material_id == m.id)).one()
    on_order = db.scalar(select(func.coalesce(func.sum(PurchaseLine.qty), 0))
                         .where(PurchaseLine.material_id == m.id, PurchaseLine.status == "open"))
    available, reserved, consumed = (r3(v) for v in agg)
    return {
        "id": m.id, "sku": m.sku, "name": m.name, "material_type": m.material_type, "colour": m.colour,
        "uom": m.uom, "reorder_threshold": m.reorder_threshold, "standard_cost": m.standard_cost,
        "supplier": m.supplier.name if m.supplier else None, "supplier_id": m.supplier_id,
        "available": available, "reserved": reserved, "consumed": consumed, "on_order": r3(on_order),
        "low_stock": available < m.reorder_threshold - EPS,
    }


def receive_goods(db: Session, *, material_id: int, qty: float, unit_cost: float, lot_number: str,
                  receipt_date: date, supplier_id: int | None, purchase_line_id: int | None,
                  intended_order_id: int | None, user: User | None) -> MaterialLot:
    if qty <= 0:
        raise BusinessError("Received quantity must be greater than zero", 422)
    if unit_cost < 0:
        raise BusinessError("Unit cost cannot be negative", 422)
    validate_event_date(receipt_date, "Receipt date")
    m = db.get(Material, material_id)
    if not m:
        raise NotFound("Material")
    if db.scalar(select(MaterialLot.id).where(MaterialLot.lot_number == lot_number)):
        raise BusinessError(f"Lot number {lot_number} already exists")
    if purchase_line_id:
        pl = db.get(PurchaseLine, purchase_line_id, with_for_update=True)
        if not pl or pl.material_id != material_id:
            raise BusinessError("Purchase line does not match this material", 422)
        if pl.status != "open":
            raise BusinessError(f"Purchase line {pl.po_number} is already {pl.status}")
        pl.status = "received"
        supplier_id = supplier_id or pl.supplier_id
    lot = MaterialLot(material_id=m.id, lot_number=lot_number, supplier_id=supplier_id or m.supplier_id,
                      receipt_date=receipt_date, unit_cost=unit_cost, qty_received=r3(qty),
                      qty_available=r3(qty), qty_reserved=0, qty_consumed=0,
                      intended_order_id=intended_order_id)
    db.add(lot)
    db.flush()
    db.add(StockMovement(material_id=m.id, lot_id=lot.id, movement_type="receipt", qty=r3(qty),
                         order_id=intended_order_id, reason=f"Goods receipt lot {lot_number}",
                         user_id=user.id if user else None))
    log_event(db, "stock", m.id, "goods_receipt", f"Received {qty:g} {m.uom} of {m.sku} (lot {lot_number})",
              severity="success", user=user)
    return lot


def adjust_stock(db: Session, *, lot_id: int, delta: float, reason: str, user: User | None) -> MaterialLot:
    if not reason.strip():
        raise BusinessError("A reason is required for stock adjustments", 422)
    if abs(delta) < EPS:
        raise BusinessError("Adjustment quantity cannot be zero", 422)
    lot = db.get(MaterialLot, lot_id, with_for_update=True)
    if not lot:
        raise NotFound("Lot")
    if lot.qty_available + delta < -EPS:
        raise BusinessError(f"Adjustment would make available stock negative "
                            f"(available {lot.qty_available:g}, adjustment {delta:g}). "
                            f"Reserved stock must be released before it can be adjusted.")
    lot.qty_available = r3(lot.qty_available + delta)
    db.add(StockMovement(material_id=lot.material_id, lot_id=lot.id, movement_type="adjust", qty=r3(delta),
                         reason=reason.strip(), user_id=user.id if user else None))
    log_event(db, "stock", lot.material_id, "stock_adjust",
              f"Stock adjustment {delta:+g} on lot {lot.lot_number}: {reason.strip()}",
              severity="warning" if delta < 0 else "info", user=user)
    return lot


DEFECT_REASONS = [
    "Contamination",
    "Damaged material",
    "Failed quality inspection",
    "Moisture / mildew damage",
    "Storage damage",
    "Supplier defect",
    "Other defect",
]


def defective_writeoff(db: Session, *, lot_id: int, qty: float, defect_reason: str,
                       remarks: str = "", user: User | None) -> MaterialLot:
    """Write off defective material from a lot.

    - qty must be positive (will be subtracted from available stock).
    - defect_reason is required.
    - Cannot reduce available stock below zero or touch reserved stock.
    - Creates a StockMovement with movement_type='defect_writeoff' for traceability.
    - Logs an Event so the audit trail shows who wrote it off and why.
    """
    if not defect_reason.strip():
        raise BusinessError("A defect reason is required for defective stock write-off", 422)
    if qty <= 0:
        raise BusinessError("Defective quantity must be greater than zero", 422)
    lot = db.get(MaterialLot, lot_id, with_for_update=True)
    if not lot:
        raise NotFound("Lot")
    if qty > lot.qty_available + EPS:
        avail = lot.qty_available
        raise BusinessError(
            f"Cannot write off {qty:g} — only {avail:g} is available in lot {lot.lot_number}. "
            f"Reserved stock ({lot.qty_reserved:g}) cannot be written off without releasing reservations first.",
            409,
        )
    note = defect_reason.strip()
    if remarks.strip():
        note = f"{note} — {remarks.strip()}"
    lot.qty_available = r3(lot.qty_available - qty)
    db.add(StockMovement(
        material_id=lot.material_id, lot_id=lot.id,
        movement_type="defect_writeoff", qty=r3(-qty),
        reason=f"Defective write-off: {note}",
        user_id=user.id if user else None,
    ))
    log_event(
        db, "stock", lot.material_id, "defect_writeoff",
        f"Defective write-off {qty:g} from lot {lot.lot_number}: {note}",
        severity="warning", user=user,
    )
    return lot


def order_requirements(db: Session, order: SalesOrder) -> list[dict]:
    """Material requirement = order quantity x qty_per_m from the fabric spec."""
    reserved = defaultdict(float)
    for res in db.scalars(select(OrderReservation).where(OrderReservation.order_id == order.id)):
        reserved[res.lot.material_id] += res.qty_reserved
    consumed = defaultdict(float)
    for mv in db.scalars(select(StockMovement).where(StockMovement.order_id == order.id,
                                                     StockMovement.movement_type == "consume")):
        consumed[mv.material_id] += -mv.qty
    rows = []
    for line in order.fabric_spec.materials:
        m = line.material
        summ = material_summary(db, m)
        required = r3(order.quantity * line.qty_per_m)
        still_needed = max(0.0, required - consumed[m.id] - reserved[m.id])
        free = summ["available"]
        rows.append({
            "material_id": m.id, "sku": m.sku, "name": m.name, "uom": m.uom, "qty_per_m": line.qty_per_m,
            "required": required, "consumed": r3(consumed[m.id]), "reserved": r3(reserved[m.id]),
            "still_needed": r3(still_needed), "free_available": free, "on_order": summ["on_order"],
            "shortage": r3(max(0.0, still_needed - free)),
            "standard_cost": m.standard_cost,
        })
    return rows


def reserve_for_order(db: Session, order: SalesOrder, user: User | None) -> list[dict]:
    """Reserve free stock FIFO by lot. Partial reservation is allowed; the shortage is reported."""
    result = []
    for req in order_requirements(db, order):
        need = req["still_needed"]
        got = 0.0
        if need > EPS:
            for lot in _locked_lots(db, req["material_id"]):
                if need - got <= EPS:
                    break
                take = r3(min(lot.qty_available, need - got))
                if take <= EPS:
                    continue
                lot.qty_available = r3(lot.qty_available - take)
                lot.qty_reserved = r3(lot.qty_reserved + take)
                db.add(OrderReservation(order_id=order.id, lot_id=lot.id, qty_reserved=take))
                db.add(StockMovement(material_id=lot.material_id, lot_id=lot.id, movement_type="reserve",
                                     qty=-take, order_id=order.id, reason=f"Reserved for {order.order_no}",
                                     user_id=user.id if user else None))
                got += take
        short = r3(max(0.0, need - got))
        result.append({"sku": req["sku"], "reserved_now": r3(got), "shortage": short, "uom": req["uom"]})
        if short > EPS:
            log_event(db, "order", order.id, "material_shortage",
                      f"{order.order_no}: short {short:g} {req['uom']} of {req['sku']} after reservation",
                      order_id=order.id, severity="warning", user=user)
    return result


def release_for_order(db: Session, order: SalesOrder, user: User | None) -> float:
    total = 0.0
    for res in list(db.scalars(select(OrderReservation).where(OrderReservation.order_id == order.id)
                               .with_for_update())):
        if res.qty_reserved > EPS:
            lot = db.get(MaterialLot, res.lot_id, with_for_update=True)
            lot.qty_reserved = r3(lot.qty_reserved - res.qty_reserved)
            lot.qty_available = r3(lot.qty_available + res.qty_reserved)
            db.add(StockMovement(material_id=lot.material_id, lot_id=lot.id, movement_type="release",
                                 qty=res.qty_reserved, order_id=order.id,
                                 reason=f"Released from {order.order_no}", user_id=user.id if user else None))
            total += res.qty_reserved
        db.delete(res)
    return total


def consume_for_production(db: Session, order: SalesOrder, metres: float, job_id: int,
                           user: User | None) -> tuple[list[str], float]:
    """Consume yarn for `metres` of woven fabric: order reservations first, then free stock.

    Raises BusinessError (nothing is changed - caller's transaction rolls back) if stock is insufficient.
    Returns (lot numbers used, actual material cost at lot cost)."""
    lots_used: list[str] = []
    cost = 0.0
    for line in order.fabric_spec.materials:
        need = r3(metres * line.qty_per_m)
        remaining = need
        reservations = list(db.scalars(
            select(OrderReservation).join(MaterialLot)
            .where(OrderReservation.order_id == order.id, MaterialLot.material_id == line.material_id,
                   OrderReservation.qty_reserved > 0)
            .order_by(MaterialLot.receipt_date, MaterialLot.id).with_for_update()))
        for res in reservations:
            if remaining <= EPS:
                break
            lot = db.get(MaterialLot, res.lot_id, with_for_update=True)
            take = r3(min(res.qty_reserved, remaining))
            res.qty_reserved = r3(res.qty_reserved - take)
            lot.qty_reserved = r3(lot.qty_reserved - take)
            lot.qty_consumed = r3(lot.qty_consumed + take)
            remaining = r3(remaining - take)
            cost += take * lot.unit_cost
            lots_used.append(lot.lot_number)
            db.add(StockMovement(material_id=lot.material_id, lot_id=lot.id, movement_type="consume", qty=-take,
                                 order_id=order.id, reason=f"Consumed by weaving job #{job_id}",
                                 user_id=user.id if user else None))
        if remaining > EPS:
            for lot in _locked_lots(db, line.material_id):
                if remaining <= EPS:
                    break
                take = r3(min(lot.qty_available, remaining))
                if take <= EPS:
                    continue
                lot.qty_available = r3(lot.qty_available - take)
                lot.qty_consumed = r3(lot.qty_consumed + take)
                remaining = r3(remaining - take)
                cost += take * lot.unit_cost
                lots_used.append(lot.lot_number)
                db.add(StockMovement(material_id=lot.material_id, lot_id=lot.id, movement_type="consume",
                                     qty=-take, order_id=order.id,
                                     reason=f"Consumed (unreserved stock) by weaving job #{job_id}",
                                     user_id=user.id if user else None))
        if remaining > EPS:
            raise BusinessError(
                f"Insufficient {line.material.sku}: {need:g} {line.material.uom} needed for {metres:g} m, "
                f"short by {remaining:g}. Receive stock before completing this job.")
    if cost > 0:
        db.add(CostEntry(order_id=order.id, category="material", amount=round(cost, 2), source_type="job",
                         source_id=job_id, description=f"Yarn consumed for {metres:g} m (lot cost)"))
    return sorted(set(lots_used)), cost
