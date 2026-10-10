"""LoomIQ data model.

Design rules:
- Order quantities (accepted / rejected / rework / pending) are DERIVED from fabric rolls,
  never stored twice, so one inspection decision updates every downstream view.
- Stock is held per material lot with explicit available / reserved / consumed columns;
  every change writes a StockMovement row.
- Costs are CostEntry rows tied to the source event (unique per source), which prevents
  double-counting when an event is re-processed.
"""
from __future__ import annotations

import enum
from datetime import date, datetime, timezone

from sqlalchemy import (JSON, Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer,
                        String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _enum(e):
    return Enum(e, native_enum=False, length=32, validate_strings=True,
                values_callable=lambda x: [m.value for m in x])


class Role(str, enum.Enum):
    admin = "admin"
    production_manager = "production_manager"
    storekeeper = "storekeeper"
    quality_inspector = "quality_inspector"
    dispatch_operator = "dispatch_operator"
    finance = "finance"
    buyer = "buyer"


class OrderStatus(str, enum.Enum):
    draft = "draft"
    confirmed = "confirmed"            # materials reserved
    in_production = "in_production"
    completed = "completed"            # fully dispatched
    on_hold = "on_hold"
    cancelled = "cancelled"


class Priority(str, enum.Enum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class JobStatus(str, enum.Enum):
    planned = "planned"
    running = "running"
    paused = "paused"
    completed = "completed"
    cancelled = "cancelled"


class RollQuality(str, enum.Enum):
    pending = "pending"        # not yet inspected
    accepted = "accepted"
    rejected = "rejected"
    rework = "rework"          # sent for authorised rework, must be re-inspected
    hold = "hold"


class RollStage(str, enum.Enum):
    weaving = "weaving"
    dyeing = "dyeing"
    inspection = "inspection"
    finishing = "finishing"
    packed = "packed"
    dispatched = "dispatched"
    scrapped = "scrapped"


class DispatchStatus(str, enum.Enum):
    planned = "planned"
    confirmed = "confirmed"
    cancelled = "cancelled"


class MachineState(str, enum.Enum):
    available = "available"
    maintenance = "maintenance"
    breakdown = "breakdown"


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[Role] = mapped_column(_enum(Role))
    buyer_id: Mapped[int | None] = mapped_column(ForeignKey("buyers.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    buyer: Mapped["Buyer | None"] = relationship()


class Buyer(Base):
    __tablename__ = "buyers"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(80), default="")
    contact_email: Mapped[str] = mapped_column(String(120), default="")


class Supplier(Base):
    __tablename__ = "suppliers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    city: Mapped[str] = mapped_column(String(80), default="")


class Material(Base):
    __tablename__ = "materials"
    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    material_type: Mapped[str] = mapped_column(String(40))   # yarn, dye, chemical, packing
    colour: Mapped[str] = mapped_column(String(40), default="")
    uom: Mapped[str] = mapped_column(String(10), default="kg")
    reorder_threshold: Mapped[float] = mapped_column(Float, default=0)
    standard_cost: Mapped[float] = mapped_column(Float, default=0)   # per uom, used for estimates
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    supplier: Mapped[Supplier | None] = relationship()
    lots: Mapped[list["MaterialLot"]] = relationship(back_populates="material", order_by="MaterialLot.receipt_date")


class MaterialLot(Base):
    __tablename__ = "material_lots"
    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"), index=True)
    lot_number: Mapped[str] = mapped_column(String(40), unique=True)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    receipt_date: Mapped[date] = mapped_column(Date)
    unit_cost: Mapped[float] = mapped_column(Float)
    qty_received: Mapped[float] = mapped_column(Float)
    qty_available: Mapped[float] = mapped_column(Float)   # free, unreserved
    qty_reserved: Mapped[float] = mapped_column(Float, default=0)
    qty_consumed: Mapped[float] = mapped_column(Float, default=0)
    intended_order_id: Mapped[int | None] = mapped_column(ForeignKey("sales_orders.id"), nullable=True)
    material: Mapped[Material] = relationship(back_populates="lots")
    supplier: Mapped[Supplier | None] = relationship()


class PurchaseLine(Base):
    """Yarn on order from a supplier (feeds the 'on-order' quantity)."""
    __tablename__ = "purchase_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    po_number: Mapped[str] = mapped_column(String(30), index=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"))
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    qty: Mapped[float] = mapped_column(Float)
    unit_cost: Mapped[float] = mapped_column(Float)
    expected_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="open")   # open, received, cancelled
    material: Mapped[Material] = relationship()
    supplier: Mapped[Supplier | None] = relationship()


class OrderReservation(Base):
    """Material reserved from a specific lot for a specific order."""
    __tablename__ = "order_reservations"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("sales_orders.id"), index=True)
    lot_id: Mapped[int] = mapped_column(ForeignKey("material_lots.id"))
    qty_reserved: Mapped[float] = mapped_column(Float)    # still reserved (not yet consumed)
    lot: Mapped[MaterialLot] = relationship()


class StockMovement(Base):
    __tablename__ = "stock_movements"
    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"), index=True)
    lot_id: Mapped[int | None] = mapped_column(ForeignKey("material_lots.id"), nullable=True)
    movement_type: Mapped[str] = mapped_column(String(20))  # receipt, reserve, release, consume, adjust
    qty: Mapped[float] = mapped_column(Float)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("sales_orders.id"), nullable=True)
    reason: Mapped[str] = mapped_column(String(240), default="")
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    material: Mapped[Material] = relationship()
    lot: Mapped[MaterialLot | None] = relationship()
    user: Mapped[User | None] = relationship()


class FabricSpec(Base):
    __tablename__ = "fabric_specs"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    construction: Mapped[str] = mapped_column(String(120), default="")
    gsm: Mapped[float] = mapped_column(Float, default=0)
    width_cm: Mapped[float] = mapped_column(Float, default=0)
    labour_cost_per_m: Mapped[float] = mapped_column(Float, default=0)
    processing_cost_per_m: Mapped[float] = mapped_column(Float, default=0)
    rework_cost_per_m: Mapped[float] = mapped_column(Float, default=0)
    materials: Mapped[list["FabricSpecMaterial"]] = relationship(cascade="all, delete-orphan")


class FabricSpecMaterial(Base):
    __tablename__ = "fabric_spec_materials"
    id: Mapped[int] = mapped_column(primary_key=True)
    spec_id: Mapped[int] = mapped_column(ForeignKey("fabric_specs.id"))
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"))
    qty_per_m: Mapped[float] = mapped_column(Float)
    material: Mapped[Material] = relationship()


class SalesOrder(Base):
    __tablename__ = "sales_orders"
    __table_args__ = (UniqueConstraint("buyer_id", "buyer_po", name="uq_order_buyer_po"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    order_no: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("buyers.id"), index=True)
    buyer_po: Mapped[str] = mapped_column(String(40))     # buyer's PO reference; unique per buyer
    fabric_spec_id: Mapped[int] = mapped_column(ForeignKey("fabric_specs.id"))
    colour: Mapped[str] = mapped_column(String(40))
    quantity: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(8), default="m")
    order_date: Mapped[date] = mapped_column(Date)
    promised_date: Mapped[date] = mapped_column(Date)
    priority: Mapped[Priority] = mapped_column(_enum(Priority), default=Priority.normal)
    status: Mapped[OrderStatus] = mapped_column(_enum(OrderStatus), default=OrderStatus.draft)
    hold_reason: Mapped[str] = mapped_column(String(240), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    internal_notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    buyer: Mapped[Buyer] = relationship()
    fabric_spec: Mapped[FabricSpec] = relationship()
    rolls: Mapped[list["Roll"]] = relationship(back_populates="order")
    jobs: Mapped[list["ProductionJob"]] = relationship(back_populates="order")


class Event(Base):
    """Operational event log (order history + recent activity feed)."""
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(20), index=True)   # order, roll, job, machine, stock, dispatch
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("sales_orders.id"), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(40))
    message: Mapped[str] = mapped_column(String(400))
    severity: Mapped[str] = mapped_column(String(10), default="info")   # info, success, warning, critical
    buyer_visible: Mapped[bool] = mapped_column(Boolean, default=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    user: Mapped[User | None] = relationship()


class ProductionStage(Base):
    __tablename__ = "production_stages"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(60))
    sequence: Mapped[int] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    job_based: Mapped[bool] = mapped_column(Boolean, default=True)   # inspection is roll-based, not a machine job


class Machine(Base):
    __tablename__ = "machines"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    stage_code: Mapped[str] = mapped_column(String(20))
    capacity_per_shift: Mapped[float] = mapped_column(Float)    # metres per 8h shift
    state: Mapped[MachineState] = mapped_column(_enum(MachineState), default=MachineState.available)
    state_note: Mapped[str] = mapped_column(String(200), default="")


class ProductionJob(Base):
    __tablename__ = "production_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_no: Mapped[str] = mapped_column(String(30), unique=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("sales_orders.id"), index=True)
    stage_code: Mapped[str] = mapped_column(String(20))
    machine_id: Mapped[int | None] = mapped_column(ForeignKey("machines.id"), nullable=True)
    shift: Mapped[str] = mapped_column(String(2))   # A, B, C
    planned_date: Mapped[date] = mapped_column(Date)
    planned_qty: Mapped[float] = mapped_column(Float)
    actual_qty: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[JobStatus] = mapped_column(_enum(JobStatus), default=JobStatus.planned)
    operator: Mapped[str] = mapped_column(String(80), default="")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delay_reason: Mapped[str] = mapped_column(String(240), default="")
    order: Mapped[SalesOrder] = relationship(back_populates="jobs")
    machine: Mapped[Machine | None] = relationship()
    downtimes: Mapped[list["Downtime"]] = relationship(back_populates="job")


class Downtime(Base):
    __tablename__ = "downtimes"
    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(ForeignKey("machines.id"), index=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("production_jobs.id"), nullable=True)
    reason: Mapped[str] = mapped_column(String(120))
    minutes: Mapped[int] = mapped_column(Integer)
    occurred_on: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    machine: Mapped[Machine] = relationship()
    job: Mapped[ProductionJob | None] = relationship(back_populates="downtimes")


class Roll(Base):
    __tablename__ = "rolls"
    id: Mapped[int] = mapped_column(primary_key=True)
    roll_no: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    public_token: Mapped[str] = mapped_column(String(40), unique=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("sales_orders.id"), index=True)
    weaving_job_id: Mapped[int | None] = mapped_column(ForeignKey("production_jobs.id"), nullable=True)
    machine_id: Mapped[int | None] = mapped_column(ForeignKey("machines.id"), nullable=True)
    length_m: Mapped[float] = mapped_column(Float)
    stage: Mapped[RollStage] = mapped_column(_enum(RollStage), default=RollStage.weaving)
    quality: Mapped[RollQuality] = mapped_column(_enum(RollQuality), default=RollQuality.pending)
    location: Mapped[str] = mapped_column(String(60), default="Weaving shed")
    material_lots: Mapped[list] = mapped_column(JSON, default=list)   # lot numbers consumed for this roll's job
    produced_on: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    order: Mapped[SalesOrder] = relationship(back_populates="rolls")
    machine: Mapped[Machine | None] = relationship()
    weaving_job: Mapped[ProductionJob | None] = relationship()
    inspections: Mapped[list["Inspection"]] = relationship(back_populates="roll", order_by="Inspection.id")


class RollEvent(Base):
    __tablename__ = "roll_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    roll_id: Mapped[int] = mapped_column(ForeignKey("rolls.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(40))
    detail: Mapped[str] = mapped_column(String(300))
    stage: Mapped[str] = mapped_column(String(20), default="")
    machine_code: Mapped[str] = mapped_column(String(20), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Inspection(Base):
    __tablename__ = "inspections"
    id: Mapped[int] = mapped_column(primary_key=True)
    roll_id: Mapped[int] = mapped_column(ForeignKey("rolls.id"), index=True)
    method: Mapped[str] = mapped_column(String(20))   # baseline_cv, manual
    image_path: Mapped[str | None] = mapped_column(String(200), nullable=True)
    image_width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    analysis_version: Mapped[str] = mapped_column(String(60), default="")
    inferred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # --- machine suggestion (immutable once written) ---
    suggested_outcome: Mapped[str | None] = mapped_column(String(20), nullable=True)   # pass, defect_suspected
    suggested_defects: Mapped[list] = mapped_column(JSON, default=list)   # [{type, bbox, area_px, score, explanation}]
    anomaly_score: Mapped[float | None] = mapped_column(Float, nullable=True)   # heuristic, NOT a probability
    model_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)  # only set by a real calibrated model
    analysis_error: Mapped[str] = mapped_column(String(300), default="")
    # --- human decision (stored separately) ---
    status: Mapped[str] = mapped_column(String(20), default="pending_review")   # pending_review, reviewed
    decision: Mapped[str | None] = mapped_column(String(20), nullable=True)      # accept, reject, rework, hold
    confirmed_defect: Mapped[str] = mapped_column(String(40), default="")
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str] = mapped_column(String(400), default="")
    buyer_visible_note: Mapped[str] = mapped_column(String(200), default="")
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    roll: Mapped[Roll] = relationship(back_populates="inspections")
    reviewer: Mapped[User | None] = relationship(foreign_keys=[reviewer_id])


class Dispatch(Base):
    __tablename__ = "dispatches"
    id: Mapped[int] = mapped_column(primary_key=True)
    dispatch_no: Mapped[str] = mapped_column(String(30), unique=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("sales_orders.id"), index=True)
    status: Mapped[DispatchStatus] = mapped_column(_enum(DispatchStatus), default=DispatchStatus.planned)
    planned_date: Mapped[date] = mapped_column(Date)
    vehicle_no: Mapped[str] = mapped_column(String(30), default="")
    transporter: Mapped[str] = mapped_column(String(80), default="")
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    order: Mapped[SalesOrder] = relationship()
    lines: Mapped[list["DispatchLine"]] = relationship(back_populates="dispatch", cascade="all, delete-orphan")


class DispatchLine(Base):
    __tablename__ = "dispatch_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    dispatch_id: Mapped[int] = mapped_column(ForeignKey("dispatches.id"), index=True)
    roll_id: Mapped[int] = mapped_column(ForeignKey("rolls.id"), index=True)
    length_m: Mapped[float] = mapped_column(Float)
    dispatch: Mapped[Dispatch] = relationship(back_populates="lines")
    roll: Mapped[Roll] = relationship()


class CostEntry(Base):
    """Traceable cost line. (source_type, source_id, category) is unique => no double charge."""
    __tablename__ = "cost_entries"
    __table_args__ = (UniqueConstraint("source_type", "source_id", "category", name="uq_cost_source"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("sales_orders.id"), index=True)
    category: Mapped[str] = mapped_column(String(20))   # material, labour, processing, rework, other
    amount: Mapped[float] = mapped_column(Float)
    source_type: Mapped[str] = mapped_column(String(20))   # job, inspection, stock_movement, manual
    source_id: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String(240))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
