"""Finance API routers for invoices and supplier bills.

Provides endpoints:
- POST /finance/invoices          (create invoice)
- GET  /finance/invoices/{id}     (retrieve invoice with lines & payments)
- POST /finance/invoices/{id}/payments   (add payment)
- POST /finance/invoices/payments/{id}/void (void payment)
- POST /finance/bills             (create supplier bill)
- POST /finance/bills/{id}/payments (add payment)
- POST /finance/bills/payments/{id}/void (void payment)
All endpoints are protected by `require('finance.manage')` in service layer.
"""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..services import finance as finance_srv
from ..models_finance import CustomerInvoice, SupplierBill

router = APIRouter(prefix="/api/finance", tags=["finance"])

# --- Invoice endpoints -----------------------------------------------------

@router.post("/invoices")
def create_invoice(payload: dict, db: Session = Depends(get_db)):
    # Expected keys: buyer_id, order_id (optional), issue_date, due_date, lines, notes
    try:
        inv = finance_srv.create_invoice(
            db,
            buyer_id=payload["buyer_id"],
            order_id=payload.get("order_id"),
            issue_date=date.fromisoformat(payload["issue_date"]),
            due_date=date.fromisoformat(payload["due_date"]),
            lines=payload["lines"],
            notes=payload.get("notes", ""),
        )
        db.commit()
        return inv
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    inv = db.get(CustomerInvoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv

@router.post("/invoices/{invoice_id}/payments")
def add_payment(invoice_id: int, payload: dict, db: Session = Depends(get_db)):
    try:
        payment = finance_srv.add_invoice_payment(
            db,
            invoice_id=invoice_id,
            amount=float(payload["amount"]),
            payment_date=date.fromisoformat(payload["payment_date"]),
            method=payload.get("method", "bank_transfer"),
            reference=payload.get("reference", ""),
            notes=payload.get("notes", ""),
            user_id=payload.get("user_id"),
        )
        db.commit()
        return payment
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/invoices/payments/{payment_id}/void")
def void_payment(payment_id: int, payload: dict, db: Session = Depends(get_db)):
    try:
        finance_srv.void_invoice_payment(
            db,
            payment_id=payment_id,
            reason=payload.get("reason", ""),
            user_id=payload.get("user_id"),
        )
        db.commit()
        return {"status": "voided"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

# --- Supplier bill endpoints -----------------------------------------------

@router.post("/bills")
def create_bill(payload: dict, db: Session = Depends(get_db)):
    try:
        bill = finance_srv.create_supplier_bill(
            db,
            supplier_id=payload["supplier_id"],
            bill_no=payload["bill_no"],
            issue_date=date.fromisoformat(payload["issue_date"]),
            due_date=date.fromisoformat(payload["due_date"]),
            total=float(payload["total"]),
            notes=payload.get("notes", ""),
        )
        db.commit()
        return bill
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/bills/{bill_id}/payments")
def add_bill_payment(bill_id: int, payload: dict, db: Session = Depends(get_db)):
    try:
        payment = finance_srv.add_bill_payment(
            db,
            bill_id=bill_id,
            amount=float(payload["amount"]),
            payment_date=date.fromisoformat(payload["payment_date"]),
            method=payload.get("method", "bank_transfer"),
            reference=payload.get("reference", ""),
            notes=payload.get("notes", ""),
            user_id=payload.get("user_id"),
        )
        db.commit()
        return payment
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/bills/payments/{payment_id}/void")
def void_bill_payment(payment_id: int, payload: dict, db: Session = Depends(get_db)):
    try:
        finance_srv.void_bill_payment(
            db,
            payment_id=payment_id,
            reason=payload.get("reason", ""),
            user_id=payload.get("user_id"),
        )
        db.commit()
        return {"status": "voided"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
