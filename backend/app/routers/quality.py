"""Quality inspection, roll passport/QR, dispatch."""
import io
from datetime import date

import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..models import (Dispatch, DispatchLine, DispatchStatus, Inspection, Roll, RollEvent, RollQuality, RollStage,
                      SalesOrder, User)
from ..security import PERMISSIONS, current_user, require
from ..serializers import dispatch_out, inspection_out, roll_out, roll_public_out
from ..services import dispatch as dsp, quality
from ..services.core import BusinessError, NotFound
from ..services.orders import order_metrics

router = APIRouter(prefix="/api", tags=["quality"])


# ---------------- inspection ----------------
class ReviewIn(BaseModel):
    decision: str = Field(pattern="^(accept|reject|rework|hold)$")
    confirmed_defect: str = ""
    notes: str = ""
    buyer_note: str = ""


class DispositionIn(BaseModel):
    action: str = Field(pattern="^(rework_done|scrap)$")
    notes: str = ""


@router.get("/quality/queue")
def queue(db: Session = Depends(get_db), _: User = Depends(require("quality.view"))):
    rolls = db.scalars(select(Roll).where(Roll.stage == RollStage.inspection,
                                          Roll.quality.in_([RollQuality.pending, RollQuality.hold]))
                       .order_by(Roll.id)).all()
    pending = {i.roll_id: i.id for i in db.scalars(select(Inspection).where(Inspection.status == "pending_review"))}
    return [{**roll_out(r), "open_inspection_id": pending.get(r.id)} for r in rolls]


@router.get("/quality/defect-types")
def defect_types(_: User = Depends(require("quality.view"))):
    return quality.DEFECT_TYPES


@router.get("/quality/inspections")
def inspections(status: str | None = None, roll_id: int | None = None, db: Session = Depends(get_db),
                _: User = Depends(require("quality.view"))):
    q = select(Inspection).order_by(Inspection.id.desc()).limit(200)
    if status:
        q = q.where(Inspection.status == status)
    if roll_id:
        q = q.where(Inspection.roll_id == roll_id)
    return [inspection_out(i) for i in db.scalars(q)]


@router.post("/quality/inspections", status_code=201)
async def create_inspection(roll_id: int = Form(...), image: UploadFile | None = File(None),
                            db: Session = Depends(get_db), user: User = Depends(require("quality.inspect"))):
    data = None
    ctype = None
    if image is not None and image.filename:
        # bounded read: never pull more than limit+1 bytes into memory
        data = await image.read(config.MAX_UPLOAD_BYTES + 1)
        ctype = image.content_type
    insp = quality.create_inspection(db, roll_id, user, image=data, content_type=ctype)
    db.commit()
    return inspection_out(insp)


@router.get("/quality/inspections/{iid}")
def get_inspection(iid: int, db: Session = Depends(get_db), _: User = Depends(require("quality.view"))):
    i = db.get(Inspection, iid)
    if not i:
        raise NotFound("Inspection")
    return inspection_out(i)


@router.get("/quality/inspections/{iid}/image")
def inspection_image(iid: int, db: Session = Depends(get_db), _: User = Depends(require("quality.view"))):
    i = db.get(Inspection, iid)
    if not i or not i.image_path:
        raise NotFound("Image")
    path = (config.STORAGE_DIR / i.image_path).resolve()
    if config.STORAGE_DIR.resolve() not in path.parents or not path.exists():
        raise NotFound("Image")
    return FileResponse(path)


@router.post("/quality/inspections/{iid}/review")
def review(iid: int, body: ReviewIn, db: Session = Depends(get_db), user: User = Depends(require("quality.review"))):
    res = quality.review(db, iid, user, decision=body.decision, confirmed_defect=body.confirmed_defect,
                         notes=body.notes, buyer_note=body.buyer_note)
    db.commit()
    return {"inspection": inspection_out(db.get(Inspection, iid)), **res}


@router.post("/rolls/{rid}/disposition")
def disposition(rid: int, body: DispositionIn, db: Session = Depends(get_db),
                user: User = Depends(require("quality.disposition"))):
    r = quality.complete_rework(db, rid, user, body.notes) if body.action == "rework_done" \
        else quality.scrap_roll(db, rid, user, body.notes)
    db.commit()
    return roll_out(r)


# ---------------- rolls / passport ----------------
def _public_base(request: Request) -> str:
    if config.FRONTEND_URL:
        return config.FRONTEND_URL.rstrip("/")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost:8000"
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    return f"{proto}://{host}"

@router.get("/rolls")
def rolls(q: str | None = None, quality_status: str | None = None, stage: str | None = None,
          order_id: int | None = None, db: Session = Depends(get_db), _: User = Depends(require("rolls.view"))):
    stmt = select(Roll).join(SalesOrder).order_by(Roll.id.desc()).limit(500)
    if q:
        stmt = stmt.where(or_(Roll.roll_no.ilike(f"%{q}%"), SalesOrder.order_no.ilike(f"%{q}%")))
    if quality_status:
        stmt = stmt.where(Roll.quality == RollQuality(quality_status))
    if stage:
        stmt = stmt.where(Roll.stage == RollStage(stage))
    if order_id:
        stmt = stmt.where(Roll.order_id == order_id)
    return [roll_out(r) for r in db.scalars(stmt)]


def _roll_by_ref(db: Session, ref: str) -> Roll:
    r = db.scalar(select(Roll).where(Roll.roll_no == ref.strip().upper()))
    if not r and ref.isdigit():
        r = db.get(Roll, int(ref))
    if not r:
        raise NotFound(f"Roll {ref}")
    return r


@router.get("/rolls/{ref}/passport")
def passport(ref: str, request: Request, db: Session = Depends(get_db), user: User = Depends(require("rolls.view"))):
    r = _roll_by_ref(db, ref)
    events = db.scalars(select(RollEvent).where(RollEvent.roll_id == r.id).order_by(RollEvent.id)).all()
    disp = db.scalars(select(Dispatch).join(DispatchLine).where(DispatchLine.roll_id == r.id)).all()
    block = dsp.roll_block_reason(db, r, r.order)
    return {**roll_out(r), "public_url": f"{_public_base(request)}/r/{r.roll_no}?t={r.public_token}",
            "events": [{"type": e.event_type, "detail": e.detail, "stage": e.stage, "machine": e.machine_code,
                        "at": e.created_at.isoformat()} for e in events],
            "inspections": [inspection_out(i) for i in r.inspections],
            "dispatches": [{"dispatch_no": d.dispatch_no, "status": d.status.value, "vehicle_no": d.vehicle_no,
                            "confirmed_at": d.confirmed_at.isoformat() if d.confirmed_at else None} for d in disp],
            "dispatch_eligible": block is None, "dispatch_block_reason": block,
            "can_view_impact": user.role in PERMISSIONS["quality.view"]}


@router.get("/rolls/{ref}/qr.svg")
def roll_qr(ref: str, request: Request, db: Session = Depends(get_db), _: User = Depends(require("rolls.view"))):
    r = _roll_by_ref(db, ref)
    img = qrcode.make(f"{_public_base(request)}/r/{r.roll_no}?t={r.public_token}",
                      image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=2)
    buf = io.BytesIO()
    img.save(buf)
    return Response(buf.getvalue(), media_type="image/svg+xml")


@router.get("/public/rolls/{roll_no}")
def public_roll(roll_no: str, t: str, db: Session = Depends(get_db)):
    """Unauthenticated verification for a scanned QR. Requires the roll's secret token; returns
    only non-sensitive fields (no costs, workers, suppliers, machines or internal notes)."""
    r = db.scalar(select(Roll).where(Roll.roll_no == roll_no.upper()))
    if not r or not t or r.public_token != t:
        raise NotFound("Roll")
    return roll_public_out(r, r.inspections)


# ---------------- dispatch ----------------
class DispatchIn(BaseModel):
    order_id: int
    roll_ids: list[int]
    planned_date: date
    vehicle_no: str = ""
    transporter: str = ""


class DispatchPatch(BaseModel):
    vehicle_no: str = Field(min_length=1, max_length=30)
    transporter: str = ""


@router.get("/dispatch/ready")
def ready(db: Session = Depends(get_db), _: User = Depends(require("dispatch.view"))):
    """Orders with dispatch-eligible rolls, plus blocked rolls and why."""
    out = []
    for o in db.scalars(select(SalesOrder).order_by(SalesOrder.promised_date)):
        if o.status.value in ("cancelled", "draft"):
            continue
        elig = dsp.eligible_rolls(db, o)
        blocked = [{"roll_no": r.roll_no, "reason": dsp.roll_block_reason(db, r, o)} for r in o.rolls
                   if r.stage not in (RollStage.dispatched, RollStage.scrapped) and r not in elig]
        if not elig and not blocked:
            continue
        m = order_metrics(o)
        out.append({"order_id": o.id, "order_no": o.order_no, "buyer": o.buyer.name, "status": o.status.value,
                    "quantity": o.quantity, "dispatched_m": m["dispatched_m"], "accepted_m": m["accepted_m"],
                    "promised_date": o.promised_date.isoformat(), "order_block": dsp.order_block_reason(o),
                    "eligible": [roll_out(r) for r in elig], "blocked": blocked})
    return out


@router.get("/dispatch")
def list_dispatches(db: Session = Depends(get_db), _: User = Depends(require("dispatch.view"))):
    return [dispatch_out(d) for d in db.scalars(select(Dispatch).order_by(Dispatch.id.desc()))]


@router.post("/dispatch", status_code=201)
def create_dispatch(body: DispatchIn, db: Session = Depends(get_db), user: User = Depends(require("dispatch.manage"))):
    d = dsp.create_dispatch(db, user=user, **body.model_dump())
    db.commit()
    return dispatch_out(d)


@router.patch("/dispatch/{did}")
def patch_dispatch(did: int, body: DispatchPatch, db: Session = Depends(get_db),
                   user: User = Depends(require("dispatch.manage"))):
    d = db.get(Dispatch, did)
    if not d:
        raise NotFound("Dispatch")
    if d.status != DispatchStatus.planned:
        raise BusinessError("Only planned dispatches can be edited")
    d.vehicle_no, d.transporter = body.vehicle_no.strip(), body.transporter.strip()
    db.commit()
    return dispatch_out(d)


@router.post("/dispatch/{did}/confirm")
def confirm(did: int, db: Session = Depends(get_db), user: User = Depends(require("dispatch.manage"))):
    res = dsp.confirm_dispatch(db, did, user)
    db.commit()
    return {"dispatch": dispatch_out(db.get(Dispatch, did)), **res}


@router.post("/dispatch/{did}/cancel")
def cancel(did: int, db: Session = Depends(get_db), user: User = Depends(require("dispatch.manage"))):
    d = dsp.cancel_dispatch(db, did, user)
    db.commit()
    return dispatch_out(d)


@router.get("/dispatch/{did}/packing-list")
def packing_list(did: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    d = db.get(Dispatch, did)
    if not d:
        raise NotFound("Dispatch")
    # buyers may read packing lists for their own orders only
    if user.role.value == "buyer":
        if d.order.buyer_id != user.buyer_id or d.status != DispatchStatus.confirmed:
            raise NotFound("Dispatch")
    elif user.role not in PERMISSIONS["dispatch.view"]:
        raise NotFound("Dispatch")
    o = d.order
    return {"dispatch_no": d.dispatch_no, "status": d.status.value, "order_no": o.order_no, "buyer_po": o.buyer_po,
            "buyer": o.buyer.name, "buyer_city": o.buyer.city, "fabric": o.fabric_spec.name,
            "construction": o.fabric_spec.construction, "colour": o.colour, "planned_date": d.planned_date.isoformat(),
            "confirmed_at": d.confirmed_at.isoformat() if d.confirmed_at else None, "vehicle_no": d.vehicle_no,
            "transporter": d.transporter,
            "rolls": [{"roll_no": ln.roll.roll_no, "length_m": ln.length_m, "produced_on": ln.roll.produced_on.isoformat()}
                      for ln in d.lines],
            "total_rolls": len(d.lines), "total_m": round(sum(ln.length_m for ln in d.lines), 3),
            "mill": "Everest Textile Mills"}
