"""Finance services for CRUD operations and business logic.

Provides:
- create_invoice, update_invoice_status, add_invoice_payment, void_invoice_payment
- create_supplier_bill, add_bill_payment, void_bill_payment
- audit_log helper
"""
from datetime import date, datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from ..models import utcnow
from ..models_finance import (
    CustomerInvoice,
    InvoiceLine,
    InvoicePayment,
    SupplierBill,
    BillPayment,
    FinanceAuditLog,
    InvoiceStatus,
    BillStatus,
)


def _log_action(db: Session, entity_type: str, entity_id: int, action: str, detail: str = "", user_id: Optional[int] = None):
    log = FinanceAuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        detail=detail,
        user_id=user_id,
        created_at=utcnow(),
    )
    db.add(log)
    db.flush()


def create_invoice(db: Session, *, buyer_id: int, order_id: Optional[int], issue_date: date, due_date: date, lines: List[dict], notes: str = "") -> CustomerInvoice:
    """Create a new invoice.

    *lines* is a list of dicts with keys: description, quantity, unit_price, unit (optional).
    The function calculates subtotal, tax (placeholder 0%), and total.
    """
    invoice = CustomerInvoice(
        invoice_no=f"INV-{int(utcnow().timestamp())}",
        buyer_id=buyer_id,
        order_id=order_id,
        issue_date=issue_date,
        due_date=due_date,
        subtotal=0.0,
        discount=0.0,
        tax_amount=0.0,
        total=0.0,
        notes=notes,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(invoice)
    db.flush()

    subtotal = 0.0
    for line_data in lines:
        qty = float(line_data["quantity"])
        unit_price = float(line_data["unit_price"])
        line_total = round(qty * unit_price, 2)
        line = InvoiceLine(
            invoice_id=invoice.id,
            description=line_data["description"],
            quantity=qty,
            unit=line_data.get("unit", "m"),
            unit_price=unit_price,
            line_total=line_total,
        )
        db.add(line)
        subtotal += line_total
    invoice.subtotal = round(subtotal, 2)
    # Placeholder tax logic – 0% for now
    invoice.tax_amount = 0.0
    invoice.total = round(invoice.subtotal - invoice.discount + invoice.tax_amount, 2)
    db.flush()
    _log_action(db, "invoice", invoice.id, "created", f"Invoice {invoice.invoice_no} created", user_id=None)
    return invoice


def add_invoice_payment(db: Session, *, invoice_id: int, amount: float, payment_date: date, method: str = "bank_transfer", reference: str = "", notes: str = "", user_id: Optional[int] = None) -> InvoicePayment:
    """Add a payment to the invoice. Updates invoice status accordingly."""
    invoice = db.get(CustomerInvoice, invoice_id)
    if not invoice:
        raise ValueError("Invoice not found")
    payment = InvoicePayment(
        invoice_id=invoice_id,
        amount=round(amount, 2),
        payment_date=payment_date,
        method=method,
        reference=reference,
        notes=notes,
        recorded_by_id=user_id,
        created_at=utcnow(),
    )
    db.add(payment)
    db.flush()
    # Recalculate status
    if invoice.paid_amount >= invoice.total:
        invoice.status = InvoiceStatus.paid
    elif invoice.paid_amount > 0:
        invoice.status = InvoiceStatus.partially_paid
    elif date.today() > invoice.due_date:
        invoice.status = InvoiceStatus.overdue
    else:
        invoice.status = InvoiceStatus.issued
    db.flush()
    _log_action(db, "invoice", invoice.id, "payment_added", f"Payment {payment.id} of {amount}", user_id=user_id)
    return payment


def void_invoice_payment(db: Session, *, payment_id: int, reason: str, user_id: Optional[int] = None) -> None:
    payment = db.get(InvoicePayment, payment_id)
    if not payment:
        raise ValueError("Payment not found")
    payment.voided = True
    payment.void_reason = reason
    db.flush()
    # Recalculate invoice status
    inv = payment.invoice
    if inv.paid_amount >= inv.total:
        inv.status = InvoiceStatus.paid
    elif inv.paid_amount > 0:
        inv.status = InvoiceStatus.partially_paid
    elif date.today() > inv.due_date:
        inv.status = InvoiceStatus.overdue
    else:
        inv.status = InvoiceStatus.issued
    db.flush()
    _log_action(db, "invoice", inv.id, "payment_voided", f"Payment {payment_id} voided: {reason}", user_id=user_id)


# Supplier bill helpers -----------------------------------------------------

def create_supplier_bill(db: Session, *, supplier_id: int, bill_no: str, issue_date: date, due_date: date, total: float, notes: str = "") -> SupplierBill:
    bill = SupplierBill(
        bill_no=bill_no,
        supplier_id=supplier_id,
        issue_date=issue_date,
        due_date=due_date,
        total=round(total, 2),
        notes=notes,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db.add(bill)
    db.flush()
    _log_action(db, "bill", bill.id, "created", f"Supplier bill {bill_no}", user_id=None)
    return bill


def add_bill_payment(db: Session, *, bill_id: int, amount: float, payment_date: date, method: str = "bank_transfer", reference: str = "", notes: str = "", user_id: Optional[int] = None) -> BillPayment:
    bill = db.get(SupplierBill, bill_id)
    if not bill:
        raise ValueError("Bill not found")
    payment = BillPayment(
        bill_id=bill_id,
        amount=round(amount, 2),
        payment_date=payment_date,
        method=method,
        reference=reference,
        notes=notes,
        recorded_by_id=user_id,
        created_at=utcnow(),
    )
    db.add(payment)
    db.flush()
    # Update status
    if bill.paid_amount >= bill.total:
        bill.status = BillStatus.paid
    elif bill.paid_amount > 0:
        bill.status = BillStatus.partially_paid
    elif date.today() > bill.due_date:
        bill.status = BillStatus.overdue
    else:
        bill.status = BillStatus.received
    db.flush()
    _log_action(db, "bill", bill.id, "payment_added", f"Bill payment {payment.id} of {amount}", user_id=user_id)
    return payment


def void_bill_payment(db: Session, *, payment_id: int, reason: str, user_id: Optional[int] = None) -> None:
    payment = db.get(BillPayment, payment_id)
    if not payment:
        raise ValueError("Payment not found")
    payment.voided = True
    payment.void_reason = reason
    db.flush()
    bill = payment.bill
    if bill.paid_amount >= bill.total:
        bill.status = BillStatus.paid
    elif bill.paid_amount > 0:
        bill.status = BillStatus.partially_paid
    elif date.today() > bill.due_date:
        bill.status = BillStatus.overdue
    else:
        bill.status = BillStatus.received
    db.flush()
    _log_action(db, "bill", bill.id, "payment_voided", f"Bill payment {payment_id} voided: {reason}", user_id=user_id)
