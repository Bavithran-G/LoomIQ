"""Fabric quality inspection: machine suggestion and human decision are stored separately.

A roll's quality status only changes on an authorised human review (or disposition action);
the CV baseline can suggest, never decide.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from ..models import CostEntry, Inspection, Roll, RollEvent, RollQuality, RollStage, User
from . import cv_inspect
from .core import EPS, STAGE_LOCATION, BusinessError, NotFound, log_event, next_stage_code
from .orders import order_metrics

DECISIONS = {"accept": RollQuality.accepted, "reject": RollQuality.rejected,
             "rework": RollQuality.rework, "hold": RollQuality.hold}
DEFECT_TYPES = ["none", "hole", "stain", "irregular weaving", "pattern inconsistency", "shade variation",
                "broken end", "float", "slub", "oil spot", "other"]


def _roll_for_inspection(db: Session, roll_id: int) -> Roll:
    roll = db.get(Roll, roll_id, with_for_update=True)
    if not roll:
        raise NotFound("Roll")
    if roll.stage != RollStage.inspection:
        raise BusinessError(f"{roll.roll_no} is at '{roll.stage.value}', not waiting for inspection")
    if roll.quality not in (RollQuality.pending, RollQuality.hold):
        raise BusinessError(f"{roll.roll_no} is already {roll.quality.value}; it cannot be re-inspected now")
    open_insp = db.scalar(select(Inspection).where(Inspection.roll_id == roll.id,
                                                   Inspection.status == "pending_review"))
    if open_insp:
        raise BusinessError(f"{roll.roll_no} already has inspection #{open_insp.id} awaiting review")
    return roll


def create_inspection(db: Session, roll_id: int, user: User, *, image: bytes | None,
                      content_type: str | None) -> Inspection:
    roll = _roll_for_inspection(db, roll_id)
    insp = Inspection(roll_id=roll.id, created_by_id=user.id, status="pending_review")
    if image is None:
        insp.method = "manual"
        insp.analysis_version = "manual inspection (no image analysis)"
    else:
        if content_type not in config.ALLOWED_IMAGE_TYPES:
            raise BusinessError("Only JPEG, PNG or WebP images are accepted", 415, "bad_file_type")
        if len(image) > config.MAX_UPLOAD_BYTES:
            raise BusinessError(f"Image exceeds {config.MAX_UPLOAD_BYTES // (1024 * 1024)} MB", 413, "too_large")
        if len(image) == 0:
            raise BusinessError("Empty file", 422)
        name = f"{uuid.uuid4().hex}{config.ALLOWED_IMAGE_TYPES[content_type]}"
        (config.STORAGE_DIR / "inspections" / name).write_bytes(image)
        insp.image_path = f"inspections/{name}"
        insp.method = "baseline_cv"
        insp.analysis_version = cv_inspect.ANALYSIS_VERSION
        try:
            res = cv_inspect.analyse(image)
            insp.suggested_outcome = res["outcome"]
            insp.suggested_defects = res["suggested_defects"]
            insp.anomaly_score = res["anomaly_score"]
            insp.image_width, insp.image_height = res["image_size"]
            insp.analysis_error = ""
        except Exception as e:  # analysis failure must not block the manual workflow
            insp.analysis_error = f"Analysis failed: {e}. Continue with manual inspection."
        insp.inferred_at = datetime.now(timezone.utc)
        insp.model_confidence = None   # baseline has no calibrated confidence - never fabricated
    db.add(insp)
    db.flush()
    db.add(RollEvent(roll_id=roll.id, event_type="inspection_started", stage="inspection",
                     detail=f"Inspection #{insp.id} ({insp.method})"
                            + (f": baseline suggests {insp.suggested_outcome}" if insp.suggested_outcome else "")))
    log_event(db, "roll", roll.id, "inspection", f"{roll.roll_no}: inspection #{insp.id} recorded ({insp.method})",
              order_id=roll.order_id, user=user)
    return insp


def review(db: Session, inspection_id: int, user: User, *, decision: str, confirmed_defect: str,
           notes: str, buyer_note: str = "") -> dict:
    insp = db.get(Inspection, inspection_id, with_for_update=True)
    if not insp:
        raise NotFound("Inspection")
    if insp.status != "pending_review":
        raise BusinessError("This inspection has already been reviewed; start a new inspection instead")
    if decision not in DECISIONS:
        raise BusinessError("Decision must be accept, reject, rework or hold", 422)
    if decision != "accept" and (not confirmed_defect or confirmed_defect == "none"):
        raise BusinessError("Name the confirmed defect type for a non-accept decision", 422)
    if decision in ("reject", "hold") and not notes.strip():
        raise BusinessError("A note is required when rejecting or holding a roll", 422)
    roll = db.get(Roll, insp.roll_id, with_for_update=True)
    before = order_metrics(roll.order)
    insp.status = "reviewed"
    insp.decision = decision
    insp.confirmed_defect = "" if decision == "accept" else confirmed_defect
    insp.reviewer_id = user.id
    insp.reviewed_at = datetime.now(timezone.utc)
    insp.review_notes = notes.strip()
    insp.buyer_visible_note = buyer_note.strip()[:200]

    roll.quality = DECISIONS[decision]
    if decision == "accept":
        nxt = next_stage_code(db, "inspection")
        roll.stage = RollStage(nxt)
        roll.location = STAGE_LOCATION.get(nxt, "FG warehouse")
    elif decision == "reject":
        roll.location = "Quarantine (rejected)"
    elif decision == "rework":
        roll.location = "Rework bay"
    else:
        roll.location = "Quarantine (hold)"
    agreed = None
    if insp.suggested_outcome:
        agreed = (insp.suggested_outcome == "pass") == (decision == "accept")
    db.add(RollEvent(roll_id=roll.id, event_type=f"quality_{decision}", stage="inspection",
                     detail=f"Inspector decision: {decision}"
                            + (f" ({insp.confirmed_defect})" if insp.confirmed_defect else "")
                            + (f"; baseline {'agreed' if agreed else 'disagreed'}" if agreed is not None else "")))
    db.flush()
    db.refresh(roll.order)
    after = order_metrics(roll.order)
    sev = {"accept": "success", "reject": "critical", "rework": "warning", "hold": "warning"}[decision]
    log_event(db, "roll", roll.id, f"quality_{decision}",
              f"{roll.roll_no} ({roll.length_m:g} m) {decision}ed by {user.full_name}"
              + (f": {insp.confirmed_defect}" if insp.confirmed_defect else ""),
              order_id=roll.order_id, severity=sev, buyer_visible=decision == "accept", user=user)
    if decision == "reject" and after["quality_shortfall_m"] > before["quality_shortfall_m"] + EPS:
        log_event(db, "order", roll.order_id, "shortfall",
                  f"{roll.order.order_no}: quality shortfall now {after['quality_shortfall_m']:g} m "
                  f"after {roll.roll_no} was rejected; replacement production needed for full dispatch",
                  order_id=roll.order_id, severity="critical" if decision == "reject" else "warning", user=user)
    return {"before": before, "after": after, "baseline_agreed": agreed}


def complete_rework(db: Session, roll_id: int, user: User, notes: str) -> Roll:
    """Authorised confirmation that rework is done. Charges documented rework cost once
    (unique per roll+inspection) and returns the roll to inspection - never straight to stock."""
    roll = db.get(Roll, roll_id, with_for_update=True)
    if not roll:
        raise NotFound("Roll")
    if roll.quality != RollQuality.rework:
        raise BusinessError(f"{roll.roll_no} is not in rework")
    last = db.scalar(select(Inspection).where(Inspection.roll_id == roll.id, Inspection.decision == "rework")
                     .order_by(Inspection.id.desc()))
    rate = roll.order.fabric_spec.rework_cost_per_m
    amount = round(roll.length_m * rate, 2)
    if amount > 0 and last:
        exists = db.scalar(select(CostEntry.id).where(CostEntry.source_type == "rework",
                                                      CostEntry.source_id == last.id))
        if not exists:
            db.add(CostEntry(order_id=roll.order_id, category="rework", amount=amount, source_type="rework",
                             source_id=last.id,
                             description=f"Rework {roll.roll_no}: {roll.length_m:g} m x {rate:g}/m"))
    roll.quality = RollQuality.pending
    roll.stage = RollStage.inspection
    roll.location = STAGE_LOCATION["inspection"]
    db.add(RollEvent(roll_id=roll.id, event_type="rework_done", stage="inspection",
                     detail=f"Rework completed, returned for re-inspection. {notes}".strip()))
    log_event(db, "roll", roll.id, "rework_done", f"{roll.roll_no} rework done; awaiting re-inspection",
              order_id=roll.order_id, user=user)
    return roll


def scrap_roll(db: Session, roll_id: int, user: User, reason: str) -> Roll:
    roll = db.get(Roll, roll_id, with_for_update=True)
    if not roll:
        raise NotFound("Roll")
    if roll.quality != RollQuality.rejected:
        raise BusinessError("Only rejected rolls can be scrapped")
    if not reason.strip():
        raise BusinessError("A disposition reason is required", 422)
    roll.stage = RollStage.scrapped
    roll.location = "Scrap / waste store"
    db.add(RollEvent(roll_id=roll.id, event_type="scrapped", stage="scrapped", detail=f"Scrapped: {reason.strip()}"))
    log_event(db, "roll", roll.id, "scrapped", f"{roll.roll_no} scrapped: {reason.strip()}",
              order_id=roll.order_id, severity="warning", user=user)
    return roll
