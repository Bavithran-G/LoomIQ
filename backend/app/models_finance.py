"""Finance models: customer invoices, supplier bills, payments, audit log.

Design rules (consistent with models.py):
- Monetary values stored as Float (same as CostEntry/MaterialLot); money() rounds to 2dp.
- (source_type, source_id) uniqueness prevents double-counting across ledgers.
- Paid/outstanding amounts are DERIVED from payment rows, never stored twice.
- Status is derived server-side; a stored status_cache is updated on every write.
"""
from __future__ import annotations

import enum
from datetime import date, datetime, timezone

from sqlalchemy import (Boolean, Date, DateTime, Enum, Float, ForeignKey,
                        Integer, String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .models import utcnow, _enum


class InvoiceStatus(str, enum.Enum):
    draft          = "draft"
    issued         = "issued"
    partially_paid = "partially_paid"
    paid           = "paid"
    overdue        = "overdue"
    cancelled      = "cancelled"


class BillStatus(str, enum.Enum):
    draft          = "draft"
    received       = "received"
    partially_paid = "partially_paid"
    paid           = "paid"
    overdue        = "overdue"
    cancelled      = "cancelled"


class CustomerInvoice(Base):
    __tablename__ = "customer_invoices"

    id:             Mapped[int]      = mapped_column(primary_key=True)
    invoice_no:     Mapped[str]      = mapped_column(String(30), unique=True, index=True)
    order_id:       Mapped[int|None] = mapped_column(ForeignKey("sales_orders.id"), nullable=True, index=True)
    buyer_id:       Mapped[int]      = mapped_column(ForeignKey("buyers.id"), index=True)
    issue_date:     Mapped[date]     = mapped_column(Date)
    due_date:       Mapped[date]     = mapped_column(Date)
    # Line items stored as per-column totals (full detail lives in InvoiceLine)
    subtotal:       Mapped[float]    = mapped_column(Float)          # sum of lines
    discount:       Mapped[float]    = mapped_column(Float, default=0.0)
    tax_amount:     Mapped[float]    = mapped_column(Float, default=0.0)
    total:          Mapped[float]    = mapped_column(Float)          # subtotal - discount + tax
    currency:       Mapped[str]      = mapped_column(String(3), default="INR")
    status:         Mapped[InvoiceStatus] = mapped_column(_enum(InvoiceStatus), default=InvoiceStatus.draft, index=True)
    notes:          Mapped[str]      = mapped_column(Text, default="")
    internal_notes: Mapped[str]      = mapped_column(Text, default="")
    created_by_id:  Mapped[int|None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at:     Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at:     Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    order        = relationship("SalesOrder")
    buyer        = relationship("Buyer")
    created_by   = relationship("User")
    lines:       Mapped[list["InvoiceLine"]]   = relationship(back_populates="invoice", cascade="all, delete-orphan")
    payments:    Mapped[list["InvoicePayment"]] = relationship(back_populates="invoice", order_by="InvoicePayment.id")

    @property
    def paid_amount(self) -> float:
        return round(sum(p.amount for p in self.payments if not p.voided), 2)

    @property
    def outstanding(self) -> float:
        return round(max(0.0, self.total - self.paid_amount), 2)


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id:          Mapped[int]   = mapped_column(primary_key=True)
    invoice_id:  Mapped[int]   = mapped_column(ForeignKey("customer_invoices.id"), index=True)
    description: Mapped[str]   = mapped_column(String(240))
    quantity:    Mapped[float] = mapped_column(Float)
    unit:        Mapped[str]   = mapped_column(String(10), default="m")
    unit_price:  Mapped[float] = mapped_column(Float)
    line_total:  Mapped[float] = mapped_column(Float)   # quantity × unit_price

    invoice: Mapped[CustomerInvoice] = relationship(back_populates="lines")


class InvoicePayment(Base):
    __tablename__ = "invoice_payments"
    __table_args__ = (UniqueConstraint("reference", name="uq_inv_payment_ref"),)

    id:          Mapped[int]      = mapped_column(primary_key=True)
    invoice_id:  Mapped[int]      = mapped_column(ForeignKey("customer_invoices.id"), index=True)
    payment_date: Mapped[date]    = mapped_column(Date)
    amount:      Mapped[float]    = mapped_column(Float)
    method:      Mapped[str]      = mapped_column(String(40), default="bank_transfer")
    reference:   Mapped[str]      = mapped_column(String(80), default="")   # bank ref / cheque no
    notes:       Mapped[str]      = mapped_column(String(240), default="")
    voided:      Mapped[bool]     = mapped_column(Boolean, default=False)
    void_reason: Mapped[str]      = mapped_column(String(200), default="")
    recorded_by_id: Mapped[int|None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    invoice:     Mapped[CustomerInvoice] = relationship(back_populates="payments")
    recorded_by  = relationship("User")


class SupplierBill(Base):
    __tablename__ = "supplier_bills"
    __table_args__ = (UniqueConstraint("supplier_id", "bill_no", name="uq_bill_supplier_no"),)

    id:             Mapped[int]      = mapped_column(primary_key=True)
    bill_no:        Mapped[str]      = mapped_column(String(60), index=True)
    supplier_id:    Mapped[int]      = mapped_column(ForeignKey("suppliers.id"), index=True)
    # Optional link to the lot/PO that generated this bill
    lot_id:         Mapped[int|None] = mapped_column(ForeignKey("material_lots.id"), nullable=True)
    issue_date:     Mapped[date]     = mapped_column(Date)
    due_date:       Mapped[date]     = mapped_column(Date)
    total:          Mapped[float]    = mapped_column(Float)
    currency:       Mapped[str]      = mapped_column(String(3), default="INR")
    status:         Mapped[BillStatus] = mapped_column(_enum(BillStatus), default=BillStatus.received, index=True)
    description:    Mapped[str]      = mapped_column(Text, default="")
    notes:          Mapped[str]      = mapped_column(Text, default="")
    created_by_id:  Mapped[int|None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at:     Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at:     Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    supplier     = relationship("Supplier")
    lot          = relationship("MaterialLot")
    created_by   = relationship("User")
    payments:    Mapped[list["BillPayment"]] = relationship(back_populates="bill", order_by="BillPayment.id")

    @property
    def paid_amount(self) -> float:
        return round(sum(p.amount for p in self.payments if not p.voided), 2)

    @property
    def outstanding(self) -> float:
        return round(max(0.0, self.total - self.paid_amount), 2)


class BillPayment(Base):
    __tablename__ = "bill_payments"
    __table_args__ = (UniqueConstraint("reference", name="uq_bill_payment_ref"),)

    id:           Mapped[int]      = mapped_column(primary_key=True)
    bill_id:      Mapped[int]      = mapped_column(ForeignKey("supplier_bills.id"), index=True)
    payment_date: Mapped[date]     = mapped_column(Date)
    amount:       Mapped[float]    = mapped_column(Float)
    method:       Mapped[str]      = mapped_column(String(40), default="bank_transfer")
    reference:    Mapped[str]      = mapped_column(String(80), default="")
    notes:        Mapped[str]      = mapped_column(String(240), default="")
    voided:       Mapped[bool]     = mapped_column(Boolean, default=False)
    void_reason:  Mapped[str]      = mapped_column(String(200), default="")
    recorded_by_id: Mapped[int|None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    bill:         Mapped[SupplierBill] = relationship(back_populates="payments")
    recorded_by   = relationship("User")


class FinanceAuditLog(Base):
    """Immutable audit trail for financial operations."""
    __tablename__ = "finance_audit_log"

    id:           Mapped[int]      = mapped_column(primary_key=True)
    entity_type:  Mapped[str]      = mapped_column(String(30), index=True)   # invoice, bill, payment
    entity_id:    Mapped[int]      = mapped_column(Integer, index=True)
    action:       Mapped[str]      = mapped_column(String(40))               # created, issued, cancelled, payment_added, payment_voided
    detail:       Mapped[str]      = mapped_column(String(400), default="")
    user_id:      Mapped[int|None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    user = relationship("User")
