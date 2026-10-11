"""Dashboard, cost intelligence, risk, simulator, reports, buyer portal, admin, auth."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (Buyer, Dispatch, DispatchStatus, Event, FabricSpec, FabricSpecMaterial, Inspection,
                      Machine, Material, OrderStatus, ProductionStage, Role, Roll, RollQuality,
                      SalesOrder, StockMovement, User)
from ..security import create_token, current_user, hash_password, permissions_for, require, verify_password
from ..serializers import dispatch_out, order_buyer_out, user_out
from ..services import costing, dashboard, risk, simulator
from ..services.core import BusinessError, NotFound, log_event, money, next_number, today, today_local
from ..services.orders import create_order as svc_create_order, order_metrics

router = APIRouter(prefix="/api", tags=["insights"])


# ---------------- auth ----------------
class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    username: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9._-]+$")
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="storekeeper",
                      pattern="^(production_manager|storekeeper|quality_inspector|dispatch_operator|finance|buyer)$")


@router.post("/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(User.username == form.username.strip().lower()))
    if not u or not u.is_active or not verify_password(form.password, u.password_hash):
        raise BusinessError("Incorrect username or password", 401, "auth_failed")
    return {"access_token": create_token(u), "token_type": "bearer", "user": user_out(u),
            "permissions": permissions_for(u.role)}


@router.post("/auth/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    """Self-registration — account is created and activated immediately."""
    if db.scalar(select(User.id).where(User.username == body.username)):
        raise BusinessError("Username already taken. Please choose a different one.", 409, "username_taken")
    role_map = {r.value: r for r in Role}
    role_enum = role_map.get(body.role)
    if role_enum is None:
        raise BusinessError("Invalid role selected.", 422, "invalid_role")
    new_user = User(
        username=body.username,
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        role=role_enum,
        is_active=True,   # active so user can log in immediately
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {
        "message": "Account created successfully.",
        "username": body.username,
        "access_token": create_token(new_user),
        "token_type": "bearer",
        "user": user_out(new_user),
        "permissions": permissions_for(new_user.role)
    }


@router.get("/auth/me")
def me(user: User = Depends(current_user)):
    return {"user": user_out(user), "permissions": permissions_for(user.role)}



# ---------------- dashboard ----------------
@router.get("/dashboard")
def get_dashboard(date_from: date | None = None, date_to: date | None = None, shift: str | None = None,
                  q: str | None = None, db: Session = Depends(get_db), _: User = Depends(require("dashboard.view"))):
    dt = date_to or today()
    df = date_from or dt - timedelta(days=13)
    if (dt - df).days > 366:
        raise BusinessError("Date range is limited to one year", 422)
    if shift and shift not in ("A", "B", "C"):
        raise BusinessError("Shift must be A, B or C", 422)
    return dashboard.overview(db, df, dt, shift, q)


@router.get("/events")
def events(limit: int = 50, db: Session = Depends(get_db), _: User = Depends(require("dashboard.view"))):
    return [{"id": e.id, "type": e.event_type, "message": e.message, "severity": e.severity,
             "entity_type": e.entity_type, "entity_id": e.entity_id, "order_id": e.order_id,
             "user": e.user.full_name if e.user else None, "at": e.created_at.isoformat()}
            for e in db.scalars(select(Event).order_by(Event.id.desc()).limit(min(limit, 200)))]


# ---------------- cost ----------------
@router.get("/cost/orders")
def cost_orders(db: Session = Depends(get_db), _: User = Depends(require("cost.view"))):
    out = []
    for o in db.scalars(select(SalesOrder).where(SalesOrder.status != OrderStatus.draft).order_by(SalesOrder.id.desc())):
        m = order_metrics(o)
        c = costing.order_cost(db, o, m)
        c.pop("entries")
        out.append({"order_id": o.id, "order_no": o.order_no, "buyer": o.buyer.name, "fabric": o.fabric_spec.name,
                    "status": o.status.value, "quantity": o.quantity, "produced_m": m["produced_m"],
                    "rejected_m": m["rejected_m"], **c})
    totals = {"estimated_total": money(sum(x["estimated_total"] for x in out)),
              "actual_total": money(sum(x["actual_total"] for x in out)),
              "rework_actual": money(sum(x["actual"]["rework"] for x in out)),
              "embedded_rejected": money(sum(x["quality"]["cost_embedded_in_rejected"] for x in out)),
              "replacement_estimate": money(sum(x["quality"]["replacement_estimate"] for x in out))}
    return {"orders": out, "totals": totals, "formulas": costing.__doc__}


@router.get("/cost/orders/{oid}")
def cost_order(oid: int, db: Session = Depends(get_db), _: User = Depends(require("cost.view"))):
    o = db.get(SalesOrder, oid)
    if not o:
        raise NotFound("Order")
    return {"order_no": o.order_no, **costing.order_cost(db, o), "formulas": costing.__doc__}


# ---------------- risk & simulation ----------------
@router.get("/insights/risk")
def risk_all(db: Session = Depends(get_db), _: User = Depends(require("orders.view"))):
    return {"method": risk.__doc__, "assessments": risk.assess_all(db)}


class ScenarioIn(BaseModel):
    machine_outage: dict | None = None        # {"machine_id": int, "shifts": int}
    po_delay: dict | None = None              # {"purchase_line_id": int, "days": int}
    rejection_rate: float | None = Field(None, ge=0, lt=0.9)
    prioritize_order_id: int | None = None


@router.post("/insights/simulate")
def simulate(body: ScenarioIn, db: Session = Depends(get_db), _: User = Depends(require("insights.view"))):
    sc = body.model_dump()
    if sc["machine_outage"]:
        mo = sc["machine_outage"]
        if not db.get(Machine, int(mo.get("machine_id", 0))):
            raise NotFound("Machine")
        if not 1 <= int(mo.get("shifts", 0)) <= 90:
            raise BusinessError("Outage must be 1-90 shifts", 422)
    if sc["po_delay"] and not 0 <= int(sc["po_delay"].get("days", -1)) <= 90:
        raise BusinessError("Delay must be 0-90 days", 422)
    try:
        return simulator.simulate(db, sc)
    finally:
        db.rollback()   # simulation is read-only by construction; belt-and-braces


@router.get("/insights/reports")
def reports(db: Session = Depends(get_db), _: User = Depends(require("insights.view"))):
    orders = list(db.scalars(select(SalesOrder)))
    by_fabric: dict = {}
    by_machine: dict = {}
    defects: dict = {}
    for o in orders:
        m = order_metrics(o)
        f = by_fabric.setdefault(o.fabric_spec.name, {"fabric": o.fabric_spec.name, "ordered_m": 0, "produced_m": 0,
                                                       "accepted_m": 0, "rejected_m": 0, "dispatched_m": 0})
        if o.status != OrderStatus.cancelled:
            f["ordered_m"] += o.quantity
        for k in ("produced_m", "accepted_m", "rejected_m", "dispatched_m"):
            f[k] += m[k]
        for r in o.rolls:
            if r.machine:
                mm = by_machine.setdefault(r.machine.code, {"machine": r.machine.code, "accepted_m": 0, "rejected_m": 0})
                if r.quality == RollQuality.accepted:
                    mm["accepted_m"] += r.length_m
                elif r.quality == RollQuality.rejected:
                    mm["rejected_m"] += r.length_m
    agree = disagree = 0
    for i in db.scalars(select(Inspection).where(Inspection.status == "reviewed")):
        if i.confirmed_defect:
            defects[i.confirmed_defect] = defects.get(i.confirmed_defect, 0) + 1
        if i.suggested_outcome:
            if (i.suggested_outcome == "pass") == (i.decision == "accept"):
                agree += 1
            else:
                disagree += 1
    for mm in by_machine.values():
        t = mm["accepted_m"] + mm["rejected_m"]
        mm["rejection_rate"] = round(mm["rejected_m"] / t, 4) if t else None
    on_time = late = 0
    for o in orders:
        if o.status == OrderStatus.completed:
            last = db.scalar(select(Dispatch.confirmed_at).where(Dispatch.order_id == o.id,
                                                                 Dispatch.status == DispatchStatus.confirmed)
                             .order_by(Dispatch.confirmed_at.desc()))
            if last and last.date() <= o.promised_date:
                on_time += 1
            elif last:
                late += 1
    return {
        "fabric_summary": [{k: (round(v, 3) if isinstance(v, float) else v) for k, v in f.items()} for f in by_fabric.values()],
        "machine_quality": sorted(by_machine.values(), key=lambda x: -(x["rejection_rate"] or 0)),
        "defect_pareto": sorted([{"defect": k, "count": v} for k, v in defects.items()], key=lambda x: -x["count"]),
        "baseline_vs_inspector": {"agreed": agree, "disagreed": disagree,
                                  "note": "Agreement of the CV baseline's pass/defect suggestion with the final "
                                          "inspector decision on this mill's own reviewed images. Not a validated "
                                          "accuracy figure (no labelled test set, small sample)."},
        "delivery": {"completed_on_time": on_time, "completed_late": late},
    }


# ---------------- buyer portal (server-side scoped to the buyer's own records) ----------------
def _buyer_order(db: Session, user: User, oid: int) -> SalesOrder:
    o = db.get(SalesOrder, oid)
    if not o or o.buyer_id != user.buyer_id or o.status == OrderStatus.draft:
        raise NotFound("Order")    # 404, not 403: do not reveal other buyers' order ids
    return o


@router.get("/portal/orders")
def portal_orders(db: Session = Depends(get_db), user: User = Depends(require("portal.view"))):
    if not user.buyer_id:
        return []
    return [order_buyer_out(db, o) for o in db.scalars(
        select(SalesOrder).where(SalesOrder.buyer_id == user.buyer_id, SalesOrder.status != OrderStatus.draft)
        .order_by(SalesOrder.promised_date))]


@router.get("/portal/orders/{oid}")
def portal_order(oid: int, db: Session = Depends(get_db), user: User = Depends(require("portal.view"))):
    o = _buyer_order(db, user, oid)
    d = order_buyer_out(db, o)
    d["timeline"] = [{"message": e.message, "at": e.created_at.isoformat()} for e in db.scalars(
        select(Event).where(Event.order_id == o.id, Event.buyer_visible.is_(True)).order_by(Event.id.desc()))]
    released = []
    for r in o.rolls:
        last = next((i for i in reversed(r.inspections) if i.status == "reviewed"), None)
        if r.quality == RollQuality.accepted:
            released.append({"roll_no": r.roll_no, "length_m": r.length_m,
                             "status": "dispatched" if r.stage.value == "dispatched" else "released",
                             "inspected_on": last.reviewed_at.date().isoformat() if last else None,
                             "note": last.buyer_visible_note if last else ""})
    d["quality"] = {"released_rolls": released, "inspected_m": sum(r["length_m"] for r in released)}
    d["dispatches"] = [{k: v for k, v in dispatch_out(x).items() if k in
                        ("id", "dispatch_no", "status", "planned_date", "confirmed_at", "vehicle_no", "total_m")}
                       | {"rolls": len(x.lines)}
                       for x in db.scalars(select(Dispatch).where(Dispatch.order_id == o.id,
                                                                  Dispatch.status != DispatchStatus.cancelled))]
    return d


# ---- buyer portal: reference data & order creation ----

class BuyerOrderIn(BaseModel):
    buyer_po: str = Field(min_length=1, max_length=40)
    fabric_spec_id: int
    colour: str = Field(min_length=1, max_length=40)
    quantity: float = Field(gt=0)
    promised_date: date
    notes: str = ""


def _ensure_buyer(db: Session, user: User) -> "Buyer":
    """Return the buyer linked to this user, auto-creating one if newly registered."""
    if user.buyer_id:
        b = db.get(Buyer, user.buyer_id)
        if b:
            return b
    # Auto-create a Buyer record for newly registered buyer accounts
    code_base = user.username.upper().replace(".", "").replace("_", "")[:10]
    existing_codes = {r for (r,) in db.execute(select(Buyer.code).where(Buyer.code.like(f"{code_base}%")))}
    code = code_base
    i = 2
    while code in existing_codes:
        code = f"{code_base}{i}"
        i += 1
    buyer = Buyer(code=code, name=user.full_name, city="", contact_email="")
    db.add(buyer)
    db.flush()
    user.buyer_id = buyer.id
    return buyer


@router.get("/portal/fabric-specs")
def portal_fabric_specs(db: Session = Depends(get_db), _: User = Depends(require("portal.view"))):
    """Fabric specs available for buyers to choose when creating an order."""
    return [{"id": s.id, "code": s.code, "name": s.name,
             "construction": s.construction, "gsm": s.gsm, "width_cm": s.width_cm}
            for s in db.scalars(select(FabricSpec).where(FabricSpec.is_active.is_(True)).order_by(FabricSpec.code))]


@router.post("/portal/orders", status_code=201)
def portal_create_order(body: BuyerOrderIn, db: Session = Depends(get_db),
                        user: User = Depends(require("portal.view"))):
    """Buyers create their own orders. buyer_id is always derived from the authenticated session."""
    from ..services.orders import create_order as svc_create_order
    buyer = _ensure_buyer(db, user)
    order_date = today_local()
    if body.promised_date <= order_date:
        raise BusinessError("Delivery date must be in the future", 422)
    data = {
        "buyer_id": buyer.id,
        "buyer_po": body.buyer_po,
        "fabric_spec_id": body.fabric_spec_id,
        "colour": body.colour,
        "quantity": body.quantity,
        "order_date": order_date,
        "promised_date": body.promised_date,
        "priority": "normal",
        "notes": body.notes,
        "internal_notes": "",
    }
    order = svc_create_order(db, data, user)
    db.commit()
    db.refresh(order)
    return order_buyer_out(db, order)


# ---------------- admin ----------------
class UserIn(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern="^[a-z0-9_.]+$")
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    role: Role
    buyer_id: int | None = None


class UserPatch(BaseModel):
    is_active: bool | None = None
    role: Role | None = None
    password: str | None = Field(None, min_length=8, max_length=128)


class StageIn(BaseModel):
    active: bool


@router.get("/admin/users")
def users(db: Session = Depends(get_db), _: User = Depends(require("admin.manage"))):
    return [user_out(u) for u in db.scalars(select(User).order_by(User.role, User.username))]


@router.post("/admin/users", status_code=201)
def create_user(body: UserIn, db: Session = Depends(get_db), _: User = Depends(require("admin.manage"))):
    if db.scalar(select(User.id).where(User.username == body.username)):
        raise BusinessError("Username already exists")
    if body.role == Role.buyer and not (body.buyer_id and db.get(Buyer, body.buyer_id)):
        raise BusinessError("Buyer users must be linked to a buyer", 422)
    u = User(username=body.username, full_name=body.full_name, password_hash=hash_password(body.password),
             role=body.role, buyer_id=body.buyer_id if body.role == Role.buyer else None)
    db.add(u)
    db.commit()
    return user_out(u)


@router.patch("/admin/users/{uid}")
def patch_user(uid: int, body: UserPatch, db: Session = Depends(get_db), me_: User = Depends(require("admin.manage"))):
    u = db.get(User, uid)
    if not u:
        raise NotFound("User")
    if u.id == me_.id and (body.is_active is False or (body.role and body.role != Role.admin)):
        raise BusinessError("You cannot deactivate or demote your own account")
    if body.is_active is not None:
        u.is_active = body.is_active
    if body.role:
        if body.role == Role.buyer and not u.buyer_id:
            raise BusinessError("Link a buyer before giving this user the buyer role", 422)
        u.role = body.role
    if body.password:
        u.password_hash = hash_password(body.password)
    db.commit()
    return user_out(u)


@router.delete("/admin/users/{uid}")
def delete_user(uid: int, db: Session = Depends(get_db), me_: User = Depends(require("admin.manage"))):
    """Safely remove a user: permanently if no audit/business dependencies exist, or deactivate/archive if referenced."""
    if uid == me_.id:
        raise BusinessError("You cannot remove your own account", 400)
    u = db.get(User, uid)
    if not u:
        raise NotFound("User")
    if u.role == Role.admin and u.is_active:
        active_admins = db.scalar(
            select(func.count(User.id)).where(User.role == Role.admin, User.is_active.is_(True), User.id != u.id)
        )
        if not active_admins or active_admins <= 0:
            raise BusinessError("Cannot remove the last active administrator", 400)

    # Check for historical references across the system
    has_events = db.scalar(select(func.count(Event.id)).where(Event.user_id == u.id)) or 0
    has_movements = db.scalar(select(func.count(StockMovement.id)).where(StockMovement.user_id == u.id)) or 0
    has_inspections = db.scalar(select(func.count(Inspection.id)).where(
        (Inspection.created_by_id == u.id) | (Inspection.reviewer_id == u.id)
    )) or 0
    has_dispatches = db.scalar(select(func.count(Dispatch.id)).where(Dispatch.created_by_id == u.id)) or 0
    has_orders = 0
    if u.buyer_id:
        has_orders = db.scalar(select(func.count(SalesOrder.id)).where(SalesOrder.buyer_id == u.buyer_id)) or 0

    has_history = (has_events + has_movements + has_inspections + has_dispatches + has_orders) > 0

    if has_history:
        u.is_active = False
        log_event(db, "user", u.id, "archived",
                  f"User {u.username} archived due to historical activity ({has_events} logs, {has_inspections} inspections, {has_movements} movements)",
                  user=me_)
        db.commit()
        return {
            "id": u.id,
            "action": "archived",
            "message": f"User '{u.username}' has historical business records and was safely archived and disabled to preserve audit integrity."
        }
    else:
        username = u.username
        db.delete(u)
        db.commit()
        return {
            "id": uid,
            "action": "deleted",
            "message": f"User '{username}' had no historical records and was permanently removed."
        }


@router.get("/admin/roles")
def roles(_: User = Depends(require("admin.manage"))):
    return [{"role": r.value, "permissions": permissions_for(r)} for r in Role]


@router.patch("/admin/stages/{sid}")
def patch_stage(sid: int, body: StageIn, db: Session = Depends(get_db), user: User = Depends(require("admin.manage"))):
    s = db.get(ProductionStage, sid)
    if not s:
        raise NotFound("Stage")
    if s.code in ("weaving", "inspection"):
        raise BusinessError(f"{s.name} is a mandatory stage and cannot be disabled")
    occupied = db.scalar(select(Roll.id).where(Roll.stage == s.code)) if not body.active and s.code != "spinning" else None
    if occupied:
        raise BusinessError(f"Rolls are currently waiting at {s.name}; finish them before disabling the stage")
    s.active = body.active
    db.commit()
    return {"id": s.id, "code": s.code, "active": s.active}


# ---- fabric specs management ----

class FabricSpecMaterialIn(BaseModel):
    material_id: int
    qty_per_m: float = Field(gt=0)


class FabricSpecIn(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    name: str = Field(min_length=1, max_length=120)
    construction: str = Field(default="", max_length=120)
    gsm: float = Field(ge=0, default=0)
    width_cm: float = Field(ge=0, default=0)
    labour_cost_per_m: float = Field(ge=0, default=0)
    processing_cost_per_m: float = Field(ge=0, default=0)
    rework_cost_per_m: float = Field(ge=0, default=0)
    materials: list[FabricSpecMaterialIn] = []


class FabricSpecPatch(BaseModel):
    is_active: bool | None = None


@router.get("/admin/fabric-specs")
def specs(db: Session = Depends(get_db), _: User = Depends(require("cost.view"))):
    return [{"id": s.id, "code": s.code, "name": s.name, "construction": s.construction, "gsm": s.gsm,
             "width_cm": s.width_cm, "labour_cost_per_m": s.labour_cost_per_m,
             "processing_cost_per_m": s.processing_cost_per_m, "rework_cost_per_m": s.rework_cost_per_m,
             "is_active": s.is_active,
             "materials": [{"material_id": l.material_id, "sku": l.material.sku, "name": l.material.name,
                            "qty_per_m": l.qty_per_m, "standard_cost": l.material.standard_cost, "uom": l.material.uom}
                           for l in s.materials]}
            for s in db.scalars(select(FabricSpec).order_by(FabricSpec.code))]


@router.post("/admin/fabric-specs", status_code=201)
def create_fabric_spec(body: FabricSpecIn, db: Session = Depends(get_db), _: User = Depends(require("admin.manage"))):
    code = body.code.strip().upper()
    name = body.name.strip()
    if not code:
        raise BusinessError("Specification code is required", 422)
    if not name:
        raise BusinessError("Fabric name is required", 422)

    existing = db.scalar(select(FabricSpec).where(FabricSpec.code == code))
    if existing:
        if not existing.is_active:
            raise BusinessError(f"A fabric specification with code '{code}' exists in archived state. Please restore or use a different code.", 409)
        raise BusinessError(f"Fabric specification '{code}' already exists", 409)

    spec = FabricSpec(
        code=code,
        name=name,
        construction=body.construction.strip(),
        gsm=body.gsm,
        width_cm=body.width_cm,
        labour_cost_per_m=body.labour_cost_per_m,
        processing_cost_per_m=body.processing_cost_per_m,
        rework_cost_per_m=body.rework_cost_per_m,
        is_active=True,
    )
    for m in body.materials:
        mat = db.get(Material, m.material_id)
        if not mat:
            raise NotFound(f"Material {m.material_id}")
        spec.materials.append(FabricSpecMaterial(material_id=m.material_id, qty_per_m=m.qty_per_m))

    db.add(spec)
    db.commit()
    db.refresh(spec)
    return {
        "id": spec.id, "code": spec.code, "name": spec.name, "construction": spec.construction,
        "gsm": spec.gsm, "width_cm": spec.width_cm, "labour_cost_per_m": spec.labour_cost_per_m,
        "processing_cost_per_m": spec.processing_cost_per_m, "rework_cost_per_m": spec.rework_cost_per_m,
        "is_active": spec.is_active,
        "materials": [{"material_id": l.material_id, "sku": l.material.sku, "name": l.material.name,
                       "qty_per_m": l.qty_per_m, "standard_cost": l.material.standard_cost, "uom": l.material.uom}
                      for l in spec.materials]
    }


@router.delete("/admin/fabric-specs/{sid}")
def delete_fabric_spec(sid: int, db: Session = Depends(get_db), _: User = Depends(require("admin.manage"))):
    spec = db.get(FabricSpec, sid)
    if not spec:
        raise NotFound("Fabric spec")

    order_count = db.scalar(select(func.count(SalesOrder.id)).where(SalesOrder.fabric_spec_id == spec.id)) or 0
    if order_count > 0:
        spec.is_active = False
        db.commit()
        return {
            "id": spec.id,
            "action": "archived",
            "message": f"Fabric specification '{spec.code}' is referenced by {order_count} order(s) and was safely archived. It is hidden from new order selection while preserving all historical records and costing."
        }
    else:
        code = spec.code
        name = spec.name
        db.delete(spec)
        db.commit()
        return {
            "id": sid,
            "action": "deleted",
            "message": f"Fabric specification '{code}' ({name}) had no order references and was permanently deleted."
        }


@router.patch("/admin/fabric-specs/{sid}")
def patch_fabric_spec(sid: int, body: FabricSpecPatch, db: Session = Depends(get_db), _: User = Depends(require("admin.manage"))):
    spec = db.get(FabricSpec, sid)
    if not spec:
        raise NotFound("Fabric spec")
    if body.is_active is not None:
        spec.is_active = body.is_active
    db.commit()
    return {"id": spec.id, "code": spec.code, "is_active": spec.is_active}
