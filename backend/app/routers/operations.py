"""Inventory, production, machines."""
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (Downtime, JobStatus, Machine, Material, MaterialLot, ProductionJob, ProductionStage,
                      PurchaseLine, StockMovement, Supplier, User)
from ..security import require
from ..serializers import job_out, lot_out, machine_out, movement_out
from ..services import inventory, production
from ..services.core import NotFound, today, validate_event_date, validate_planned_date
from ..services.inventory import DEFECT_REASONS

router = APIRouter(prefix="/api", tags=["operations"])


# ---------------- inventory ----------------
class ReceiptIn(BaseModel):
    material_id: int
    qty: float = Field(gt=0)
    unit_cost: float = Field(ge=0)
    lot_number: str = Field(min_length=1, max_length=40)
    receipt_date: date
    supplier_id: int | None = None
    purchase_line_id: int | None = None
    intended_order_id: int | None = None


class AdjustIn(BaseModel):
    lot_id: int
    delta: float
    reason: str = Field(min_length=3, max_length=240)


@router.get("/inventory/materials")
def materials(db: Session = Depends(get_db), _: User = Depends(require("inventory.view"))):
    return [inventory.material_summary(db, m) for m in db.scalars(select(Material).order_by(Material.material_type, Material.sku))]


@router.get("/inventory/materials/{mid}")
def material_detail(mid: int, db: Session = Depends(get_db), _: User = Depends(require("inventory.view"))):
    m = db.get(Material, mid)
    if not m:
        raise NotFound("Material")
    d = inventory.material_summary(db, m)
    d["lots"] = [lot_out(l) for l in m.lots]
    d["movements"] = [movement_out(mv) for mv in db.scalars(
        select(StockMovement).where(StockMovement.material_id == mid).order_by(StockMovement.id.desc()).limit(100))]
    d["purchase_lines"] = [_pl(p) for p in db.scalars(select(PurchaseLine).where(PurchaseLine.material_id == mid)
                                                       .order_by(PurchaseLine.expected_date))]
    return d


def _pl(p: PurchaseLine):
    return {"id": p.id, "po_number": p.po_number, "material_id": p.material_id, "sku": p.material.sku,
            "supplier": p.supplier.name if p.supplier else None, "supplier_id": p.supplier_id, "qty": p.qty,
            "unit_cost": p.unit_cost, "expected_date": p.expected_date.isoformat(), "status": p.status}


@router.get("/inventory/lots")
def lots(material_id: int | None = None, db: Session = Depends(get_db), _: User = Depends(require("inventory.view"))):
    q = select(MaterialLot).order_by(MaterialLot.receipt_date.desc())
    if material_id:
        q = q.where(MaterialLot.material_id == material_id)
    return [lot_out(l) for l in db.scalars(q)]


@router.get("/inventory/movements")
def movements(limit: int = 100, db: Session = Depends(get_db), _: User = Depends(require("inventory.view"))):
    return [movement_out(mv) for mv in db.scalars(select(StockMovement).order_by(StockMovement.id.desc())
                                                  .limit(min(limit, 500)))]


class PurchaseOrderIn(BaseModel):
    material_id: int
    supplier_id: int | None = None
    qty: float = Field(gt=0)
    unit_cost: float = Field(ge=0)
    expected_date: date
    po_number: str | None = None


@router.get("/inventory/purchase-lines")
def purchase_lines(db: Session = Depends(get_db), _: User = Depends(require("inventory.view"))):
    return [_pl(p) for p in db.scalars(select(PurchaseLine).order_by(PurchaseLine.expected_date))]


@router.post("/inventory/purchase-orders", status_code=201)
def create_purchase_order(body: PurchaseOrderIn, db: Session = Depends(get_db), user: User = Depends(require("inventory.manage"))):
    from ..services.core import next_number, log_event
    mat = db.get(Material, body.material_id)
    if not mat:
        raise NotFound("Material")
    po_no = body.po_number or next_number(db, PurchaseLine, PurchaseLine.po_number, "PO")
    pl = PurchaseLine(
        po_number=po_no,
        material_id=body.material_id,
        supplier_id=body.supplier_id or mat.supplier_id,
        qty=body.qty,
        unit_cost=body.unit_cost if body.unit_cost > 0 else mat.standard_cost,
        expected_date=body.expected_date,
        status="open",
    )
    db.add(pl)
    db.commit()
    db.refresh(pl)
    log_event(db, "stock", mat.id, "purchase_order_raised", f"Raised {po_no} for {body.qty:g} {mat.uom} of {mat.sku}", severity="info", user=user)
    return _pl(pl)


@router.get("/inventory/suppliers")
def suppliers(db: Session = Depends(get_db), _: User = Depends(require("inventory.view"))):
    return [{"id": s.id, "name": s.name, "city": s.city} for s in db.scalars(select(Supplier).order_by(Supplier.name))]


@router.post("/inventory/receipts", status_code=201)
def receive(body: ReceiptIn, db: Session = Depends(get_db), user: User = Depends(require("inventory.manage"))):
    # date validation is enforced inside inventory.receive_goods via validate_event_date
    lot = inventory.receive_goods(db, user=user, **body.model_dump())
    db.commit()
    return lot_out(lot)


@router.post("/inventory/adjustments")
def adjust(body: AdjustIn, db: Session = Depends(get_db), user: User = Depends(require("inventory.manage"))):
    lot = inventory.adjust_stock(db, lot_id=body.lot_id, delta=body.delta, reason=body.reason, user=user)
    db.commit()
    return lot_out(lot)


class DefectiveWriteoffIn(BaseModel):
    lot_id: int
    qty: float = Field(gt=0)
    defect_reason: str = Field(min_length=3, max_length=120)
    remarks: str = Field(default="", max_length=400)


@router.get("/inventory/defect-reasons")
def defect_reasons(_: User = Depends(require("inventory.view"))):
    return DEFECT_REASONS


@router.post("/inventory/defective-writeoff", status_code=201)
def defective_writeoff(body: DefectiveWriteoffIn, db: Session = Depends(get_db),
                       user: User = Depends(require("inventory.manage"))):
    """Write off defective stock from a material lot.
    Creates a traceable StockMovement (type=defect_writeoff) and an audit Event.
    Decreases qty_available only; never touches reserved or consumed quantities.
    """
    lot = inventory.defective_writeoff(
        db, lot_id=body.lot_id, qty=body.qty,
        defect_reason=body.defect_reason, remarks=body.remarks, user=user,
    )
    db.commit()
    return lot_out(lot)


# ---------------- production ----------------
class JobIn(BaseModel):
    order_id: int
    stage_code: str
    machine_id: int | None = None
    shift: str = Field(pattern="^[ABC]$")
    planned_date: date
    planned_qty: float = Field(gt=0)
    operator: str = ""


class JobAction(BaseModel):
    action: str = Field(pattern="^(start|pause|resume|complete|cancel)$")
    actual_qty: float | None = Field(None, ge=0)
    roll_length: float = 100.0
    reason: str = ""


class DowntimeIn(BaseModel):
    machine_id: int
    minutes: int = Field(gt=0, le=1440)
    reason: str = Field(min_length=3, max_length=120)
    job_id: int | None = None
    occurred_on: date | None = None


class MachineStateIn(BaseModel):
    state: str = Field(pattern="^(available|maintenance|breakdown)$")
    note: str = ""


@router.get("/production/stages")
def stages(db: Session = Depends(get_db), _: User = Depends(require("production.view"))):
    return [{"id": s.id, "code": s.code, "name": s.name, "sequence": s.sequence, "active": s.active,
             "job_based": s.job_based} for s in db.scalars(select(ProductionStage).order_by(ProductionStage.sequence))]


@router.get("/production/jobs")
def jobs(status: str | None = None, stage: str | None = None, order_id: int | None = None,
         machine_id: int | None = None, date_from: date | None = None, date_to: date | None = None,
         shift: str | None = None, db: Session = Depends(get_db), _: User = Depends(require("production.view"))):
    q = select(ProductionJob).order_by(ProductionJob.planned_date, ProductionJob.shift, ProductionJob.id)
    if status:
        q = q.where(ProductionJob.status == JobStatus(status))
    if stage:
        q = q.where(ProductionJob.stage_code == stage)
    if order_id:
        q = q.where(ProductionJob.order_id == order_id)
    if machine_id:
        q = q.where(ProductionJob.machine_id == machine_id)
    if date_from:
        q = q.where(ProductionJob.planned_date >= date_from)
    if date_to:
        q = q.where(ProductionJob.planned_date <= date_to)
    if shift:
        q = q.where(ProductionJob.shift == shift)
    return [job_out(j, db) for j in db.scalars(q)]


@router.post("/production/jobs", status_code=201)
def create_job(body: JobIn, db: Session = Depends(get_db), user: User = Depends(require("production.manage"))):
    validate_planned_date(body.planned_date, "Planned date")
    j = production.create_job(db, body.model_dump(), user)
    db.commit()
    return job_out(j, db)


@router.post("/production/jobs/{jid}/action")
def job_action(jid: int, body: JobAction, db: Session = Depends(get_db), user: User = Depends(require("production.manage"))):
    result = {}
    if body.action == "start":
        j = production.start_job(db, jid, user)
    elif body.action == "pause":
        j = production.pause_job(db, jid, user, body.reason)
    elif body.action == "resume":
        j = production.resume_job(db, jid, user)
    elif body.action == "cancel":
        j = production.cancel_job(db, jid, user, body.reason)
    else:
        if body.actual_qty is None:
            from ..services.core import BusinessError
            raise BusinessError("Actual output is required to complete a job", 422)
        result = production.complete_job(db, jid, body.actual_qty, user, body.roll_length, body.reason)
        j = db.get(ProductionJob, jid)
    db.commit()
    return {"job": job_out(j, db), "result": result}


@router.get("/production/capacity")
def capacity(on: date, shift: str, stage: str = "weaving", db: Session = Depends(get_db),
             _: User = Depends(require("production.view"))):
    out = []
    for m in db.scalars(select(Machine).where(Machine.stage_code == stage).order_by(Machine.code)):
        load = production.machine_load(db, m.id, on, shift)
        out.append({"machine_id": m.id, "code": m.code, "capacity": m.capacity_per_shift, "planned": load,
                    "free": max(0.0, m.capacity_per_shift - load), "state": m.state.value})
    return out


@router.get("/production/schedule-check")
def schedule_check(order_id: int, stage_code: str, planned_date: date, shift: str,
                   db: Session = Depends(get_db), _: User = Depends(require("production.view"))):
    from sqlalchemy import func
    from ..models import SalesOrder, ProductionJob, JobStatus
    order = db.get(SalesOrder, order_id)
    if not order:
        return {"has_conflict": False, "remaining_qty": 0.0}

    conflicting = db.scalar(
        select(ProductionJob).where(
            ProductionJob.order_id == order_id,
            ProductionJob.stage_code == stage_code,
            ProductionJob.planned_date == planned_date,
            ProductionJob.shift == shift,
            ProductionJob.status.in_(production.OPEN_JOB),
        )
    )

    completed = float(db.scalar(select(func.coalesce(func.sum(ProductionJob.actual_qty), 0.0)).where(
        ProductionJob.order_id == order_id,
        ProductionJob.stage_code == stage_code,
        ProductionJob.status == JobStatus.completed,
    )) or 0.0)
    opened = float(db.scalar(select(func.coalesce(func.sum(ProductionJob.planned_qty), 0.0)).where(
        ProductionJob.order_id == order_id,
        ProductionJob.stage_code == stage_code,
        ProductionJob.status.in_(production.OPEN_JOB),
    )) or 0.0)
    remaining_qty = max(0.0, (order.quantity * 1.1) - completed - opened)

    return {
        "has_conflict": bool(conflicting),
        "conflicting_job": conflicting.job_no if conflicting else None,
        "conflicting_machine": conflicting.machine.code if conflicting and conflicting.machine else None,
        "conflicting_shift": conflicting.shift if conflicting else None,
        "remaining_qty": remaining_qty,
    }


@router.get("/machines")
def machines(db: Session = Depends(get_db), _: User = Depends(require("production.view"))):
    out = []
    for m in db.scalars(select(Machine).order_by(Machine.stage_code, Machine.code)):
        d = machine_out(m, production.machine_runtime_status(db, m))
        running = db.scalar(select(ProductionJob).where(ProductionJob.machine_id == m.id,
                                                        ProductionJob.status == JobStatus.running))
        d["current_job"] = job_out(running) if running else None
        d["downtime_7d_min"] = sum(x.minutes for x in db.scalars(select(Downtime).where(
            Downtime.machine_id == m.id, Downtime.occurred_on >= date.fromordinal(today().toordinal() - 7))))
        out.append(d)
    return out


@router.get("/machines/{mid}/downtime")
def machine_downtime(mid: int, db: Session = Depends(get_db), _: User = Depends(require("production.view"))):
    return [{"id": d.id, "minutes": d.minutes, "reason": d.reason, "occurred_on": d.occurred_on.isoformat(),
             "job_no": d.job.job_no if d.job else None}
            for d in db.scalars(select(Downtime).where(Downtime.machine_id == mid).order_by(Downtime.id.desc()))]


@router.post("/machines/{mid}/state")
def machine_state(mid: int, body: MachineStateIn, db: Session = Depends(get_db),
                  user: User = Depends(require("machines.manage"))):
    m = production.set_machine_state(db, mid, body.state, body.note, user)
    db.commit()
    return machine_out(m, production.machine_runtime_status(db, m))


@router.post("/production/downtime", status_code=201)
def downtime(body: DowntimeIn, db: Session = Depends(get_db), user: User = Depends(require("production.manage"))):
    occurred = body.occurred_on or today()
    validate_event_date(occurred, "Downtime date")
    d = production.record_downtime(db, machine_id=body.machine_id, minutes=body.minutes, reason=body.reason,
                                   job_id=body.job_id, occurred_on=occurred, user=user)
    db.commit()
    return {"id": d.id}
