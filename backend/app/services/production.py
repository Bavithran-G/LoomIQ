"""Production jobs on the shop floor: capacity-aware planning and job lifecycle.

Machine status shown in LoomIQ is DERIVED from job records and manual state changes.
It is not read from physical sensors / IoT.
"""
from __future__ import annotations

import math
import secrets
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (CostEntry, Downtime, JobStatus, Machine, MachineState, OrderStatus, ProductionJob,
                      ProductionStage, Roll, RollEvent, RollQuality, RollStage, SalesOrder, User)
from . import inventory, orders as order_svc
from .core import (EPS, STAGE_COST_SHARE, STAGE_LOCATION, BusinessError, NotFound, log_event,
                   next_number, next_stage_code, r3, validate_planned_date)

SHIFTS = ("A", "B", "C")
OPEN_JOB = (JobStatus.planned, JobStatus.running, JobStatus.paused)


def machine_load(db: Session, machine_id: int, on: date, shift: str, exclude_job: int | None = None) -> float:
    q = select(func.coalesce(func.sum(ProductionJob.planned_qty), 0)).where(
        ProductionJob.machine_id == machine_id, ProductionJob.planned_date == on, ProductionJob.shift == shift,
        ProductionJob.status.in_(OPEN_JOB))
    if exclude_job:
        q = q.where(ProductionJob.id != exclude_job)
    return float(db.scalar(q))


def machine_runtime_status(db: Session, m: Machine) -> str:
    if m.state != MachineState.available:
        return m.state.value
    running = db.scalar(select(ProductionJob.id).where(ProductionJob.machine_id == m.id,
                                                       ProductionJob.status == JobStatus.running))
    return "running" if running else "idle"


def get_available_material_m(db: Session, order_id: int, stage_code: str) -> float:
    """Returns total metres of material waiting at this stage for this order."""
    if stage_code == "weaving":
        return 0.0
    elif stage_code == "dyeing":
        return float(db.scalar(
            select(func.coalesce(func.sum(Roll.length_m), 0.0)).where(
                Roll.order_id == order_id,
                Roll.stage == RollStage.dyeing,
                Roll.quality.in_([RollQuality.pending, RollQuality.accepted]),
            )
        ) or 0.0)
    elif stage_code == "finishing":
        return float(db.scalar(
            select(func.coalesce(func.sum(Roll.length_m), 0.0)).where(
                Roll.order_id == order_id,
                Roll.stage == RollStage.finishing,
                Roll.quality == RollQuality.accepted,
            )
        ) or 0.0)
    return 0.0


def create_job(db: Session, data: dict, user: User) -> ProductionJob:
    # 1. Planned date validation (cannot be in past)
    validate_planned_date(data["planned_date"], "Planned date")

    # 2. Lock order to serialize concurrent job creations
    order = db.get(SalesOrder, data["order_id"], with_for_update=True)
    if not order:
        raise NotFound("Order")
    if order.status not in (OrderStatus.confirmed, OrderStatus.in_production):
        raise BusinessError(f"Jobs can only be planned for confirmed or in-production orders "
                            f"({order.order_no} is {order.status.value})")

    stage = db.scalar(select(ProductionStage).where(ProductionStage.code == data["stage_code"]))
    if not stage or not stage.active or not stage.job_based:
        raise BusinessError(f"Stage '{data['stage_code']}' is not an active machine stage", 422)
    if data["shift"] not in SHIFTS:
        raise BusinessError("Shift must be A, B or C", 422)

    qty = float(data["planned_qty"])
    if qty <= 0:
        raise BusinessError("Planned quantity must be greater than zero", 422)

    # 3. Prevent duplicate processing / overlapping schedule on multiple looms or machines
    conflicting = db.scalar(
        select(ProductionJob).where(
            ProductionJob.order_id == order.id,
            ProductionJob.stage_code == stage.code,
            ProductionJob.planned_date == data["planned_date"],
            ProductionJob.shift == data["shift"],
            ProductionJob.status.in_(OPEN_JOB),
        ).with_for_update()
    )
    if conflicting:
        conflicting_mach = conflicting.machine.code if conflicting.machine else "another machine"
        raise BusinessError(
            f"This order already has a {stage.name.lower()} job ({conflicting.job_no}) scheduled on "
            f"{conflicting_mach} for Shift {conflicting.shift}. Complete or cancel the existing job "
            f"before scheduling the same quantity on another loom."
        )

    # 4. Total scheduled quantity must not exceed remaining order quantity for this stage
    completed_qty = float(db.scalar(
        select(func.coalesce(func.sum(ProductionJob.actual_qty), 0.0)).where(
            ProductionJob.order_id == order.id,
            ProductionJob.stage_code == stage.code,
            ProductionJob.status == JobStatus.completed,
        )
    ) or 0.0)
    open_qty = float(db.scalar(
        select(func.coalesce(func.sum(ProductionJob.planned_qty), 0.0)).where(
            ProductionJob.order_id == order.id,
            ProductionJob.stage_code == stage.code,
            ProductionJob.status.in_(OPEN_JOB),
        )
    ) or 0.0)
    max_allowed = order.quantity * 1.1
    remaining_schedulable = max(0.0, max_allowed - completed_qty - open_qty)
    if qty > remaining_schedulable + EPS:
        raise BusinessError(
            f"Planned quantity {qty:g} m exceeds remaining unscheduled quantity ({remaining_schedulable:g} m) "
            f"for {order.order_no} at {stage.name} (order total: {order.quantity:g} m plus 10% allowance)",
            422,
        )

    # 5. Machine validation and capacity check with row lock
    machine = None
    if data.get("machine_id"):
        machine = db.get(Machine, data["machine_id"], with_for_update=True)
        if not machine:
            raise NotFound("Machine")
        if machine.stage_code != stage.code:
            raise BusinessError(f"{machine.code} is a {machine.stage_code} machine, not {stage.code}", 422)
        if machine.state != MachineState.available:
            raise BusinessError(f"{machine.code} is under {machine.state.value} and cannot be scheduled")
        load = machine_load(db, machine.id, data["planned_date"], data["shift"])
        if load + qty > machine.capacity_per_shift + EPS:
            free = max(0.0, machine.capacity_per_shift - load)
            raise BusinessError(f"Capacity exceeded on {machine.code} shift {data['shift']} "
                                f"{data['planned_date']}: {free:g} m free of {machine.capacity_per_shift:g} m. "
                                f"Split the job or choose another machine/shift.")
    elif stage.code != "spinning":
        raise BusinessError("A machine must be assigned", 422)

    job = ProductionJob(job_no=next_number(db, ProductionJob, ProductionJob.job_no, "JOB", 5),
                        order_id=order.id, stage_code=stage.code, machine_id=machine.id if machine else None,
                        shift=data["shift"], planned_date=data["planned_date"], planned_qty=r3(qty),
                        operator=data.get("operator", ""), status=JobStatus.planned)
    db.add(job)
    db.flush()
    log_event(db, "job", job.id, "planned",
              f"{job.job_no}: {stage.name} {qty:g} m for {order.order_no} on "
              f"{machine.code if machine else '-'} shift {job.shift} {job.planned_date}",
              order_id=order.id, user=user)
    return job


def _get_job(db: Session, job_id: int) -> ProductionJob:
    job = db.get(ProductionJob, job_id, with_for_update=True)
    if not job:
        raise NotFound("Job")
    return job


def start_job(db: Session, job_id: int, user: User) -> ProductionJob:
    job = _get_job(db, job_id)
    if job.status != JobStatus.planned:
        raise BusinessError(f"Only planned jobs can be started ({job.job_no} is {job.status.value})")
    _check_can_run(db, job)
    job.status = JobStatus.running
    job.started_at = datetime.now(timezone.utc)
    order_svc.mark_in_production(db, job.order, user)
    db.flush()
    log_event(db, "job", job.id, "started", f"{job.job_no} started on {job.machine.code if job.machine else '-'}",
              order_id=job.order_id, user=user)
    return job


def _check_can_run(db: Session, job: ProductionJob):
    if job.order.status == OrderStatus.on_hold:
        raise BusinessError(f"{job.order.order_no} is on hold: {job.order.hold_reason}")
    if job.order.status in (OrderStatus.cancelled, OrderStatus.completed):
        raise BusinessError(f"{job.order.order_no} is {job.order.status.value}")
    if job.machine:
        if job.machine.state != MachineState.available:
            raise BusinessError(f"{job.machine.code} is under {job.machine.state.value}")
        other = db.scalar(select(ProductionJob).where(ProductionJob.machine_id == job.machine_id,
                                                      ProductionJob.status == JobStatus.running,
                                                      ProductionJob.id != job.id))
        if other:
            raise BusinessError(f"{job.machine.code} is already running {other.job_no}")

    # Exclusivity: Only one active job may process a given order-stage at a time
    active_stage_job = db.scalar(
        select(ProductionJob).where(
            ProductionJob.order_id == job.order_id,
            ProductionJob.stage_code == job.stage_code,
            ProductionJob.status == JobStatus.running,
            ProductionJob.id != job.id,
        )
    )
    if active_stage_job:
        mach = active_stage_job.machine.code if active_stage_job.machine else "another machine"
        raise BusinessError(
            f"Order {job.order.order_no} already has an active {job.stage_code} job "
            f"({active_stage_job.job_no}) running on {mach}. "
            f"Only one active job may process a given order-stage at a time."
        )

    # Downstream prerequisites: material must have arrived from preceding stage
    if job.stage_code == "dyeing":
        waiting_m = get_available_material_m(db, job.order_id, "dyeing")
        if waiting_m < job.planned_qty - EPS:
            if waiting_m <= EPS:
                raise BusinessError(
                    f"Cannot start dyeing: {job.planned_qty:g} m of this order have not completed the "
                    f"required previous stage. The job will remain queued until eligible material arrives."
                )
            else:
                raise BusinessError(
                    f"Cannot start dyeing: only {waiting_m:g} m of {job.planned_qty:g} m have arrived from "
                    f"weaving. The job will remain queued until eligible material arrives."
                )

    elif job.stage_code == "finishing":
        waiting_m = get_available_material_m(db, job.order_id, "finishing")
        if waiting_m < job.planned_qty - EPS:
            if waiting_m <= EPS:
                raise BusinessError(
                    f"Cannot start finishing: {job.planned_qty:g} m of this order have not completed the "
                    f"required previous stage. The job will remain queued until eligible material arrives."
                )
            else:
                raise BusinessError(
                    f"Cannot start finishing: only {waiting_m:g} m of {job.planned_qty:g} m have completed "
                    f"dyeing and inspection. The job will remain queued until eligible material arrives."
                )

    elif job.stage_code == "weaving":
        for line in job.order.fabric_spec.materials:
            need = r3(job.planned_qty * line.qty_per_m)
            m = line.material
            summ = inventory.material_summary(db, m)
            avail = summ["available"] + summ["reserved"]
            if avail < need - EPS:
                short = round(need - avail, 3)
                raise BusinessError(
                    f"Cannot start weaving: insufficient yarn {m.sku} ({m.name}) in stock "
                    f"(short by {short:g} {m.uom}). The job will remain queued until materials arrive."
                )


def pause_job(db: Session, job_id: int, user: User, reason: str) -> ProductionJob:
    job = _get_job(db, job_id)
    if job.status != JobStatus.running:
        raise BusinessError("Only running jobs can be paused")
    job.status = JobStatus.paused
    if reason:
        job.delay_reason = reason
    log_event(db, "job", job.id, "paused", f"{job.job_no} paused{': ' + reason if reason else ''}",
              order_id=job.order_id, severity="warning", user=user)
    return job


def resume_job(db: Session, job_id: int, user: User) -> ProductionJob:
    job = _get_job(db, job_id)
    if job.status != JobStatus.paused:
        raise BusinessError("Only paused jobs can be resumed")
    _check_can_run(db, job)
    job.status = JobStatus.running
    log_event(db, "job", job.id, "resumed", f"{job.job_no} resumed", order_id=job.order_id, user=user)
    return job


def cancel_job(db: Session, job_id: int, user: User, reason: str) -> ProductionJob:
    job = _get_job(db, job_id)
    if job.status not in (JobStatus.planned, JobStatus.paused):
        raise BusinessError("Only planned or paused jobs can be cancelled")
    job.status = JobStatus.cancelled
    job.delay_reason = reason or job.delay_reason
    db.flush()
    log_event(db, "job", job.id, "cancelled", f"{job.job_no} cancelled {('- ' + reason) if reason else ''}",
              order_id=job.order_id, severity="warning", user=user)
    return job


def record_downtime(db: Session, *, machine_id: int, minutes: int, reason: str, job_id: int | None,
                    occurred_on: date, user: User) -> Downtime:
    m = db.get(Machine, machine_id)
    if not m:
        raise NotFound("Machine")
    if minutes <= 0 or minutes > 24 * 60:
        raise BusinessError("Downtime minutes must be between 1 and 1440", 422)
    if not reason.strip():
        raise BusinessError("A downtime reason is required", 422)
    job = None
    if job_id:
        job = db.get(ProductionJob, job_id)
        if not job or job.machine_id != machine_id:
            raise BusinessError("Job does not belong to this machine", 422)
        job.delay_reason = f"Downtime: {reason.strip()} ({minutes} min)"
    dt = Downtime(machine_id=machine_id, job_id=job_id, minutes=minutes, reason=reason.strip(),
                  occurred_on=occurred_on)
    db.add(dt)
    log_event(db, "machine", m.id, "downtime", f"{m.code} down {minutes} min: {reason.strip()}",
              order_id=job.order_id if job else None, severity="warning", user=user)
    return dt


def set_machine_state(db: Session, machine_id: int, state: str, note: str, user: User) -> Machine:
    m = db.get(Machine, machine_id, with_for_update=True)
    if not m:
        raise NotFound("Machine")
    new = MachineState(state)
    if new != MachineState.available:
        running = db.scalar(select(ProductionJob).where(ProductionJob.machine_id == m.id,
                                                        ProductionJob.status == JobStatus.running))
        if running:
            running.status = JobStatus.paused
            running.delay_reason = f"Machine {new.value}: {note}"
            log_event(db, "job", running.id, "paused", f"{running.job_no} paused - {m.code} {new.value}",
                      order_id=running.order_id, severity="warning", user=user)
    m.state = new
    m.state_note = note
    log_event(db, "machine", m.id, "state", f"{m.code} set to {new.value}{': ' + note if note else ''}",
              severity="info" if new == MachineState.available else "warning", user=user)
    return m


def _roll_event(db, roll: Roll, etype: str, detail: str, stage: str, machine_code: str = ""):
    db.add(RollEvent(roll_id=roll.id, event_type=etype, detail=detail, stage=stage, machine_code=machine_code))


def complete_job(db: Session, job_id: int, actual_qty: float, user: User, roll_length: float = 100.0,
                 delay_reason: str = "") -> dict:
    """Complete a job. Effects depend on stage:
    - weaving: consume yarn (the defined consumption event), create rolls, charge labour/processing
    - other machine stages: move whole rolls waiting at this stage to the next active stage
    The whole operation is one transaction; any failure leaves nothing changed."""
    job = _get_job(db, job_id)
    if job.status not in (JobStatus.running, JobStatus.paused):
        raise BusinessError(f"Only running or paused jobs can be completed ({job.job_no} is {job.status.value})")
    if actual_qty < 0:
        raise BusinessError("Actual output cannot be negative", 422)
    if actual_qty > job.planned_qty * 1.25 + EPS:
        raise BusinessError("Actual output is more than 125% of plan; check the entry", 422)
    order = job.order
    spec = order.fabric_spec
    machine_code = job.machine.code if job.machine else ""
    result: dict = {"rolls_created": [], "rolls_moved": [], "lots": []}
    credited = actual_qty

    if job.stage_code == "weaving" and actual_qty > EPS:
        if not (10 <= roll_length <= 500):
            raise BusinessError("Roll length must be between 10 and 500 m", 422)
        lots, _cost = inventory.consume_for_production(db, order, actual_qty, job.id, user)
        result["lots"] = lots
        n = math.ceil(actual_qty / roll_length - EPS)
        remaining = actual_qty
        nxt = next_stage_code(db, "weaving")
        for i in range(n):
            length = r3(min(roll_length, remaining))
            remaining = r3(remaining - length)
            roll = Roll(roll_no=next_number(db, Roll, Roll.roll_no, "RL", 5), public_token=secrets.token_urlsafe(16),
                        order_id=order.id, weaving_job_id=job.id, machine_id=job.machine_id, length_m=length,
                        stage=RollStage(nxt), quality=RollQuality.pending,
                        location=STAGE_LOCATION.get(nxt, "Shop floor"), material_lots=lots,
                        produced_on=job.planned_date)
            db.add(roll)
            db.flush()
            db.add(RollEvent(roll_id=roll.id, event_type="woven", stage="weaving", machine_code=machine_code,
                             detail=f"Woven {length:g} m on {machine_code} ({job.job_no}, shift {job.shift}); "
                                    f"yarn lots {', '.join(lots)}"))
            result["rolls_created"].append(roll.roll_no)
    elif job.stage_code != "spinning" and actual_qty > EPS:
        stage = RollStage(job.stage_code)
        waiting = list(db.scalars(select(Roll).where(Roll.order_id == order.id, Roll.stage == stage)
                                  .where(Roll.quality.in_([RollQuality.pending, RollQuality.accepted]))
                                  .order_by(Roll.id).with_for_update()))
        if job.stage_code == "finishing":
            waiting = [r for r in waiting if r.quality == RollQuality.accepted]
        if not waiting:
            if job.stage_code == "finishing":
                raise BusinessError(
                    f"No eligible rolls of {order.order_no} are waiting at finishing with accepted quality. "
                    f"Ensure rolls have completed dyeing and passed quality inspection before completing finishing."
                )
            else:
                raise BusinessError(
                    f"No rolls of {order.order_no} are waiting at {job.stage_code}. "
                    f"Ensure the previous stage has produced rolls before completing this job."
                )

        moved = 0.0
        nxt = next_stage_code(db, job.stage_code)
        for r in waiting:
            if moved + r.length_m > actual_qty + 0.5:
                break
            r.stage = RollStage(nxt)
            r.location = STAGE_LOCATION.get(nxt, "Shop floor")
            moved += r.length_m
            _roll_event(db, r, f"{job.stage_code}_done",
                        f"{job.stage_code.title()} completed on {machine_code} ({job.job_no}, shift {job.shift}); "
                        f"moved to {STAGE_LOCATION.get(nxt, nxt)}", job.stage_code, machine_code)
            result["rolls_moved"].append(r.roll_no)

        if moved <= EPS:
            raise BusinessError(f"No eligible whole rolls could be moved for {actual_qty:g} m entered. "
                                f"Enter output in whole rolls.")
        if moved + EPS < actual_qty * 0.5:
            raise BusinessError(f"Only {moved:g} m of whole rolls can be moved for {actual_qty:g} m entered. "
                                f"Enter output in whole rolls.")
        credited = r3(moved)

    job.actual_qty = r3(credited)
    job.status = JobStatus.completed
    job.completed_at = datetime.now(timezone.utc)
    if delay_reason:
        job.delay_reason = delay_reason
    share = STAGE_COST_SHARE.get(job.stage_code, 0.0)
    if credited > EPS and share > 0:
        for cat, rate in (("labour", spec.labour_cost_per_m), ("processing", spec.processing_cost_per_m)):
            amt = round(credited * rate * share, 2)
            if amt > 0:
                db.add(CostEntry(order_id=order.id, category=cat, amount=amt, source_type="job", source_id=job.id,
                                 description=f"{job.stage_code.title()} {cat} {credited:g} m x {rate:g}/m x {share:.0%}"))
    if credited + EPS < job.planned_qty:
        log_event(db, "job", job.id, "under_plan",
                  f"{job.job_no} produced {credited:g} m vs {job.planned_qty:g} m planned"
                  f"{' - ' + job.delay_reason if job.delay_reason else ''}",
                  order_id=order.id, severity="warning", user=user)
    log_event(db, "job", job.id, "completed",
              f"{job.job_no} completed: {credited:g} m {job.stage_code}"
              + (f", {len(result['rolls_created'])} rolls created" if result["rolls_created"] else ""),
              order_id=order.id, severity="success", buyer_visible=True, user=user)
    result["credited_qty"] = credited
    db.flush()
    return result


def get_job_queue_info(db: Session, job: ProductionJob) -> dict:
    """Calculates lifecycle queue state, readiness, waiting reason, and completion info for a job."""
    info = {
        "queue_state": job.status.value,
        "can_start": False,
        "can_complete": False,
        "waiting_reason": "",
        "available_material_m": 0.0,
        "is_conflicting": False,
        "expected_completion": None,
    }

    if job.status == JobStatus.completed:
        info["queue_state"] = "completed"
        info["available_material_m"] = job.actual_qty
        if job.completed_at:
            info["expected_completion"] = job.completed_at.isoformat()
        return info

    if job.status == JobStatus.cancelled:
        info["queue_state"] = "cancelled"
        info["waiting_reason"] = job.delay_reason or "Job cancelled"
        return info

    if job.status == JobStatus.running:
        info["queue_state"] = "running"
        info["can_complete"] = True
        if job.stage_code in ("dyeing", "finishing"):
            avail = get_available_material_m(db, job.order_id, job.stage_code)
            info["available_material_m"] = avail
            if avail <= EPS:
                info["can_complete"] = False
                info["waiting_reason"] = (
                    f"No eligible rolls waiting at {job.stage_code} to complete"
                )
        else:
            info["available_material_m"] = job.planned_qty

        if job.started_at and job.machine and job.machine.capacity_per_shift > 0:
            rate_per_hour = job.machine.capacity_per_shift / 8.0
            hours_needed = max(0.0, (job.planned_qty - job.actual_qty) / rate_per_hour)
            exp = job.started_at + timedelta(hours=hours_needed)
            info["expected_completion"] = exp.isoformat()
        return info

    if job.status == JobStatus.paused:
        info["queue_state"] = "paused"
        info["can_complete"] = True
        info["waiting_reason"] = job.delay_reason or "Job paused"
        if job.stage_code in ("dyeing", "finishing"):
            avail = get_available_material_m(db, job.order_id, job.stage_code)
            info["available_material_m"] = avail
            if avail <= EPS:
                info["can_complete"] = False
        return info

    # job.status == JobStatus.planned
    # 1. Check duplicate / conflicting bookings on same date and shift
    conflict = db.scalar(
        select(ProductionJob).where(
            ProductionJob.order_id == job.order_id,
            ProductionJob.stage_code == job.stage_code,
            ProductionJob.planned_date == job.planned_date,
            ProductionJob.shift == job.shift,
            ProductionJob.status.in_(OPEN_JOB),
            ProductionJob.id != job.id,
        )
    )
    if conflict:
        info["is_conflicting"] = True

    # 2. Check if another job for this order-stage is currently running
    active_stage_job = db.scalar(
        select(ProductionJob).where(
            ProductionJob.order_id == job.order_id,
            ProductionJob.stage_code == job.stage_code,
            ProductionJob.status == JobStatus.running,
            ProductionJob.id != job.id,
        )
    )
    if active_stage_job:
        info["queue_state"] = "queued"
        mach_name = active_stage_job.machine.code if active_stage_job.machine else "another machine"
        info["waiting_reason"] = (
            f"Active job {active_stage_job.job_no} is currently running on {mach_name}"
        )
        return info

    # 3. Check machine state and concurrency
    if job.machine:
        if job.machine.state != MachineState.available:
            info["queue_state"] = "queued"
            info["waiting_reason"] = f"Machine {job.machine.code} is under {job.machine.state.value}"
            return info
        mach_running = db.scalar(
            select(ProductionJob).where(
                ProductionJob.machine_id == job.machine_id,
                ProductionJob.status == JobStatus.running,
                ProductionJob.id != job.id,
            )
        )
        if mach_running:
            info["queue_state"] = "queued"
            info["waiting_reason"] = f"Machine {job.machine.code} is currently running {mach_running.job_no}"
            return info

    # 4. Check order status
    if job.order.status == OrderStatus.on_hold:
        info["queue_state"] = "queued"
        info["waiting_reason"] = f"Order {job.order.order_no} is on hold"
        return info
    if job.order.status in (OrderStatus.cancelled, OrderStatus.completed):
        info["queue_state"] = "queued"
        info["waiting_reason"] = f"Order {job.order.order_no} is {job.order.status.value}"
        return info

    # 5. Check stage material prerequisites
    if job.stage_code == "dyeing":
        waiting_m = get_available_material_m(db, job.order_id, "dyeing")
        info["available_material_m"] = waiting_m
        if waiting_m < job.planned_qty - EPS:
            info["queue_state"] = "waiting_for_material"
            if waiting_m <= EPS:
                info["waiting_reason"] = (
                    f"Cannot start dyeing: {job.planned_qty:g} m of this order have not completed the required previous stage."
                )
            else:
                info["waiting_reason"] = (
                    f"Waiting for material: only {waiting_m:g} m of {job.planned_qty:g} m arrived from weaving."
                )
            return info

    elif job.stage_code == "finishing":
        waiting_m = get_available_material_m(db, job.order_id, "finishing")
        info["available_material_m"] = waiting_m
        if waiting_m < job.planned_qty - EPS:
            info["queue_state"] = "waiting_for_material"
            if waiting_m <= EPS:
                info["waiting_reason"] = (
                    f"Cannot start finishing: {job.planned_qty:g} m of this order have not completed the required previous stage."
                )
            else:
                info["waiting_reason"] = (
                    f"Waiting for material: only {waiting_m:g} m of {job.planned_qty:g} m accepted and ready for finishing."
                )
            return info

    elif job.stage_code == "weaving":
        for line in job.order.fabric_spec.materials:
            need = r3(job.planned_qty * line.qty_per_m)
            m = line.material
            summ = inventory.material_summary(db, m)
            avail = summ["available"] + summ["reserved"]
            if avail < need - EPS:
                short = round(need - avail, 3)
                info["queue_state"] = "waiting_for_material"
                info["waiting_reason"] = (
                    f"Waiting for yarn: {m.name} short by {short:g} {m.uom}"
                )
                return info

    # All checks passed: Job is ready to run!
    info["queue_state"] = "ready"
    info["can_start"] = True
    info["waiting_reason"] = ""
    return info
