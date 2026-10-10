from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Buyer, Event, FabricSpec, OrderStatus, SalesOrder, User
from ..security import PERMISSIONS, require
from ..serializers import job_out, order_out, roll_out
from ..services import costing, impact, inventory, orders as svc, risk
from ..services.core import NotFound

router = APIRouter(prefix="/api", tags=["orders"])


class OrderIn(BaseModel):
    buyer_id: int
    buyer_po: str = Field(min_length=1, max_length=40)
    fabric_spec_id: int
    colour: str = Field(min_length=1, max_length=40)
    quantity: float = Field(gt=0)
    order_date: date
    promised_date: date
    priority: str = Field("normal", pattern="^(low|normal|high|urgent)$")
    notes: str = ""
    internal_notes: str = ""


class OrderPatch(BaseModel):
    buyer_id: int | None = None
    buyer_po: str | None = None
    fabric_spec_id: int | None = None
    colour: str | None = None
    quantity: float | None = Field(None, gt=0)
    order_date: date | None = None
    promised_date: date | None = None
    priority: str | None = Field(None, pattern="^(low|normal|high|urgent)$")
    notes: str | None = None
    internal_notes: str | None = None


class TransitionIn(BaseModel):
    action: str
    reason: str = ""


def _order(db: Session, oid: int) -> SalesOrder:
    o = db.get(SalesOrder, oid)
    if not o:
        raise NotFound("Order")
    return o


@router.get("/reference")
def reference(db: Session = Depends(get_db), _: User = Depends(require("orders.view"))):
    specs = db.scalars(select(FabricSpec).order_by(FabricSpec.code)).all()
    return {
        "buyers": [{"id": b.id, "code": b.code, "name": b.name, "city": b.city}
                   for b in db.scalars(select(Buyer).order_by(Buyer.name))],
        "fabric_specs": [{"id": s.id, "code": s.code, "name": s.name, "construction": s.construction, "gsm": s.gsm,
                          "width_cm": s.width_cm,
                          "materials": [{"sku": l.material.sku, "qty_per_m": l.qty_per_m, "uom": l.material.uom}
                                        for l in s.materials]} for s in specs],
    }


@router.get("/orders")
def list_orders(status: str | None = None, q: str | None = None, priority: str | None = None,
                buyer_id: int | None = None, include_closed: bool = True,
                db: Session = Depends(get_db), _: User = Depends(require("orders.view"))):
    stmt = select(SalesOrder).join(Buyer).join(FabricSpec).order_by(SalesOrder.promised_date, SalesOrder.id)
    if status:
        stmt = stmt.where(SalesOrder.status == OrderStatus(status))
    elif not include_closed:
        stmt = stmt.where(SalesOrder.status.notin_([OrderStatus.completed, OrderStatus.cancelled]))
    if priority:
        stmt = stmt.where(SalesOrder.priority == priority)
    if buyer_id:
        stmt = stmt.where(SalesOrder.buyer_id == buyer_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(SalesOrder.order_no.ilike(like), SalesOrder.buyer_po.ilike(like),
                              Buyer.name.ilike(like), FabricSpec.name.ilike(like), SalesOrder.colour.ilike(like)))
    risks = {a["order_id"]: a for a in risk.assess_all(db)}
    out = []
    for o in db.scalars(stmt):
        d = order_out(db, o)
        a = risks.get(o.id)
        d["risk"] = {"band": a["band"], "score": a["score"]} if a else None
        out.append(d)
    return out


@router.post("/orders", status_code=201)
def create_order(body: OrderIn, db: Session = Depends(get_db), user: User = Depends(require("orders.manage"))):
    o = svc.create_order(db, body.model_dump(), user)
    db.commit()
    return order_out(db, o, True)


@router.get("/orders/{oid}")
def get_order(oid: int, db: Session = Depends(get_db), user: User = Depends(require("orders.view"))):
    o = _order(db, oid)
    d = order_out(db, o, True)
    d["requirements"] = inventory.order_requirements(db, o)
    d["jobs"] = [job_out(j) for j in sorted(o.jobs, key=lambda j: j.id)]
    d["rolls"] = [roll_out(r) for r in sorted(o.rolls, key=lambda r: r.id)]
    d["risk"] = risk.assess_order(db, o)
    d["allowed_actions"] = sorted(svc.TRANSITIONS[o.status])
    d["events"] = [{"id": e.id, "type": e.event_type, "message": e.message, "severity": e.severity,
                    "user": e.user.full_name if e.user else None, "at": e.created_at.isoformat()}
                   for e in db.scalars(select(Event).where(Event.order_id == o.id).order_by(Event.id.desc()))]
    if user.role in PERMISSIONS["cost.view"]:
        d["cost"] = costing.order_cost(db, o)
    return d


@router.patch("/orders/{oid}")
def patch_order(oid: int, body: OrderPatch, db: Session = Depends(get_db), user: User = Depends(require("orders.manage"))):
    o = svc.update_order(db, _order(db, oid), body.model_dump(exclude_unset=True), user)
    db.commit()
    return order_out(db, o, True)


@router.post("/orders/{oid}/transition")
def transition(oid: int, body: TransitionIn, db: Session = Depends(get_db),
               user: User = Depends(require("orders.manage"))):
    o = _order(db, oid)
    info = svc.transition(db, o, body.action, user, body.reason)
    db.commit()
    return {"order": order_out(db, o, True), "info": info}


@router.get("/orders/{oid}/risk")
def order_risk(oid: int, db: Session = Depends(get_db), _: User = Depends(require("orders.view"))):
    return risk.assess_order(db, _order(db, oid))


@router.get("/orders/{oid}/availability")
def availability(oid: int, db: Session = Depends(get_db), _: User = Depends(require("orders.view"))):
    o = _order(db, oid)
    reqs = inventory.order_requirements(db, o)
    return {"order_no": o.order_no, "requirements": reqs,
            "fully_covered": all(r["shortage"] <= 1e-6 for r in reqs)}


@router.post("/orders/check-availability")
def check_new(body: OrderIn, db: Session = Depends(get_db), _: User = Depends(require("orders.view"))):
    """Availability check for an order that has not been saved yet (nothing is reserved)."""
    spec = db.get(FabricSpec, body.fabric_spec_id)
    if not spec:
        raise NotFound("Fabric spec")
    rows = []
    for l in spec.materials:
        summ = inventory.material_summary(db, l.material)
        need = round(body.quantity * l.qty_per_m, 3)
        rows.append({"sku": l.material.sku, "uom": l.material.uom, "required": need, "free_available": summ["available"],
                     "on_order": summ["on_order"], "shortage": round(max(0.0, need - summ["available"]), 3)})
    return {"requirements": rows, "fully_covered": all(r["shortage"] <= 1e-6 for r in rows)}


@router.get("/rolls/{rid}/impact")
def roll_impact(rid: int, db: Session = Depends(get_db), _: User = Depends(require("quality.view"))):
    return impact.chain_for_roll(db, rid)
