"""Explicit output shapes. Buyer/public serializers are whitelists: no costs, suppliers,
workers, internal notes or machine data."""
from __future__ import annotations

from sqlalchemy.orm import Session

from .models import (Dispatch, Inspection, Machine, MaterialLot, ProductionJob, Roll, SalesOrder, StockMovement,
                     User)
from .services.orders import dispatch_state, order_metrics, stage_progress
from .services.core import active_stages


def iso(d):
    return d.isoformat() if d else None


def user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "full_name": u.full_name, "role": u.role.value,
            "buyer_id": u.buyer_id, "buyer_name": u.buyer.name if u.buyer else None, "is_active": u.is_active}


def _stage_codes(db: Session) -> list[str]:
    return [s.code for s in active_stages(db) if s.code != "spinning"]


def order_out(db: Session, o: SalesOrder, detail: bool = False) -> dict:
    m = order_metrics(o)
    out = {
        "id": o.id, "order_no": o.order_no, "buyer_po": o.buyer_po, "buyer_id": o.buyer_id, "buyer": o.buyer.name,
        "fabric_spec_id": o.fabric_spec_id, "fabric": o.fabric_spec.name, "fabric_code": o.fabric_spec.code,
        "colour": o.colour, "quantity": o.quantity, "unit": o.unit, "order_date": iso(o.order_date),
        "promised_date": iso(o.promised_date), "priority": o.priority.value, "status": o.status.value,
        "hold_reason": o.hold_reason, "metrics": m, "dispatch_status": dispatch_state(db, o, m),
        "progress": stage_progress(o, _stage_codes(db)), "notes": o.notes,
    }
    if detail:
        out["internal_notes"] = o.internal_notes
    return out


def order_buyer_out(db: Session, o: SalesOrder) -> dict:
    m = order_metrics(o)
    return {
        "id": o.id, "order_no": o.order_no, "buyer_po": o.buyer_po, "fabric": o.fabric_spec.name,
        "colour": o.colour, "quantity": o.quantity, "unit": o.unit, "order_date": iso(o.order_date),
        "promised_date": iso(o.promised_date), "status": o.status.value,
        "progress": stage_progress(o, _stage_codes(db)), "dispatch_status": dispatch_state(db, o, m),
        "accepted_m": m["accepted_m"], "dispatched_m": m["dispatched_m"], "ready_m": m["ready_m"],
        "notes": o.notes,
    }


def lot_out(l: MaterialLot) -> dict:
    return {"id": l.id, "lot_number": l.lot_number, "material_id": l.material_id, "sku": l.material.sku,
            "supplier": l.supplier.name if l.supplier else None, "receipt_date": iso(l.receipt_date),
            "unit_cost": l.unit_cost, "qty_received": l.qty_received, "qty_available": l.qty_available,
            "qty_reserved": l.qty_reserved, "qty_consumed": l.qty_consumed, "intended_order_id": l.intended_order_id}


def movement_out(mv: StockMovement) -> dict:
    return {"id": mv.id, "sku": mv.material.sku, "lot": mv.lot.lot_number if mv.lot else None,
            "type": mv.movement_type, "qty": mv.qty, "order_id": mv.order_id, "reason": mv.reason,
            "user": mv.user.full_name if mv.user else None, "at": iso(mv.created_at)}


def job_out(j: ProductionJob) -> dict:
    return {"id": j.id, "job_no": j.job_no, "order_id": j.order_id, "order_no": j.order.order_no,
            "buyer": j.order.buyer.name, "fabric": j.order.fabric_spec.name, "colour": j.order.colour,
            "priority": j.order.priority.value, "promised_date": iso(j.order.promised_date),
            "stage_code": j.stage_code, "machine_id": j.machine_id, "machine": j.machine.code if j.machine else None,
            "shift": j.shift, "planned_date": iso(j.planned_date), "planned_qty": j.planned_qty,
            "actual_qty": j.actual_qty, "status": j.status.value, "operator": j.operator,
            "started_at": iso(j.started_at), "completed_at": iso(j.completed_at), "delay_reason": j.delay_reason,
            "downtime_min": sum(d.minutes for d in j.downtimes)}


def machine_out(m: Machine, runtime_status: str) -> dict:
    return {"id": m.id, "code": m.code, "name": m.name, "stage_code": m.stage_code,
            "capacity_per_shift": m.capacity_per_shift, "state": m.state.value, "state_note": m.state_note,
            "status": runtime_status, "status_source": "derived from job records (simulated, no IoT)"}


def inspection_out(i: Inspection) -> dict:
    labels = {"spot": "hole / spot", "colour": "stain / shade variation", "texture": "irregular weaving"}
    types = sorted({labels.get(d["type"], d["type"]) for d in (i.suggested_defects or [])})
    if i.method == "manual":
        expl = "Manual inspection - no image analysis was run."
    elif i.analysis_error:
        expl = i.analysis_error
    elif i.suggested_outcome == "pass":
        expl = ("No region deviated strongly from this fabric's own texture and colour. A pass from an "
                "unvalidated baseline is not proof of quality - inspector confirmation required.")
    else:
        expl = (f"{len(i.suggested_defects)} anomalous region(s): {', '.join(types)}. Highest deviation "
                f"{i.anomaly_score} robust units. Rule-based baseline - inspector confirmation required.")
    return {"id": i.id, "roll_id": i.roll_id, "roll_no": i.roll.roll_no, "order_no": i.roll.order.order_no,
            "method": i.method, "has_image": bool(i.image_path), "image_width": i.image_width,
            "image_height": i.image_height, "analysis_version": i.analysis_version, "inferred_at": iso(i.inferred_at),
            "suggested_outcome": i.suggested_outcome, "suggested_defects": i.suggested_defects or [],
            "suggested_types": types, "anomaly_score": i.anomaly_score, "model_confidence": i.model_confidence,
            "analysis_error": i.analysis_error, "explanation": expl, "status": i.status, "decision": i.decision,
            "confirmed_defect": i.confirmed_defect, "reviewer": i.reviewer.full_name if i.reviewer else None,
            "reviewed_at": iso(i.reviewed_at), "review_notes": i.review_notes,
            "buyer_visible_note": i.buyer_visible_note, "created_at": iso(i.created_at)}


def roll_out(r: Roll) -> dict:
    return {"id": r.id, "roll_no": r.roll_no, "order_id": r.order_id, "order_no": r.order.order_no,
            "buyer": r.order.buyer.name, "fabric": r.order.fabric_spec.name, "colour": r.order.colour,
            "length_m": r.length_m, "stage": r.stage.value, "quality": r.quality.value, "location": r.location,
            "machine": r.machine.code if r.machine else None, "weaving_job": r.weaving_job.job_no if r.weaving_job else None,
            "material_lots": r.material_lots or [], "produced_on": iso(r.produced_on)}


def roll_public_out(r: Roll, inspections: list[Inspection]) -> dict:
    last = next((i for i in reversed(inspections) if i.status == "reviewed"), None)
    return {"roll_no": r.roll_no, "order_no": r.order.order_no, "fabric": r.order.fabric_spec.name,
            "colour": r.order.colour, "length_m": r.length_m,
            "quality": r.quality.value if r.quality.value in ("accepted", "pending") else "not released",
            "dispatched": r.stage.value == "dispatched", "produced_on": iso(r.produced_on),
            "last_inspected": iso(last.reviewed_at) if last else None}


def dispatch_out(d: Dispatch, internal: bool = True) -> dict:
    out = {"id": d.id, "dispatch_no": d.dispatch_no, "order_id": d.order_id, "order_no": d.order.order_no,
           "buyer": d.order.buyer.name, "status": d.status.value, "planned_date": iso(d.planned_date),
           "vehicle_no": d.vehicle_no, "transporter": d.transporter, "confirmed_at": iso(d.confirmed_at),
           "rolls": [{"roll_id": ln.roll_id, "roll_no": ln.roll.roll_no, "length_m": ln.length_m} for ln in d.lines],
           "total_m": round(sum(ln.length_m for ln in d.lines), 3)}
    return out
