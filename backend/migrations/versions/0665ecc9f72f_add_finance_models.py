"""add finance models

Revision ID: 0665ecc9f72f
Revises: 0d5de93d5cae
Create Date: 2026-10-10 16:32:25.786663
"""
from alembic import op
import sqlalchemy as sa


revision = '0665ecc9f72f'
down_revision = '0d5de93d5cae'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "customer_invoices",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("invoice_no", sa.String(30), nullable=False, unique=True),
        sa.Column("order_id", sa.Integer, sa.ForeignKey("sales_orders.id"), nullable=True),
        sa.Column("buyer_id", sa.Integer, sa.ForeignKey("buyers.id"), nullable=False),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("due_date", sa.Date, nullable=False),
        sa.Column("subtotal", sa.Float, nullable=False),
        sa.Column("discount", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("tax_amount", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("total", sa.Float, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("status", sa.Enum('draft','issued','partially_paid','paid','overdue','cancelled', name='invoice_status'), nullable=False, server_default='draft'),
        sa.Column("notes", sa.Text, nullable=False, server_default=""),
        sa.Column("internal_notes", sa.Text, nullable=False, server_default=""),
        sa.Column("created_by_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_table(
        "invoice_lines",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("invoice_id", sa.Integer, sa.ForeignKey("customer_invoices.id"), nullable=False),
        sa.Column("description", sa.String(240), nullable=False),
        sa.Column("quantity", sa.Float, nullable=False),
        sa.Column("unit", sa.String(10), nullable=False, server_default="m"),
        sa.Column("unit_price", sa.Float, nullable=False),
        sa.Column("line_total", sa.Float, nullable=False),
    )
    op.create_table(
        "invoice_payments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("invoice_id", sa.Integer, sa.ForeignKey("customer_invoices.id"), nullable=False),
        sa.Column("payment_date", sa.Date, nullable=False),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column("method", sa.String(40), nullable=False, server_default="bank_transfer"),
        sa.Column("reference", sa.String(80), nullable=False, default=""),
        sa.Column("notes", sa.String(240), nullable=False, server_default=""),
        sa.Column("voided", sa.Boolean, nullable=False, server_default=sa.text('0')),
        sa.Column("void_reason", sa.String(200), nullable=False, server_default=""),
        sa.Column("recorded_by_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint("reference", name="uq_inv_payment_ref"),
    )
    op.create_table(
        "supplier_bills",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("bill_no", sa.String(60), nullable=False, index=True),
        sa.Column("supplier_id", sa.Integer, sa.ForeignKey("suppliers.id"), nullable=False),
        sa.Column("lot_id", sa.Integer, sa.ForeignKey("material_lots.id"), nullable=True),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("due_date", sa.Date, nullable=False),
        sa.Column("total", sa.Float, nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("status", sa.Enum('draft','received','partially_paid','paid','overdue','cancelled', name='bill_status'), nullable=False, server_default='received'),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("notes", sa.Text, nullable=False, server_default=""),
        sa.Column("created_by_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint("supplier_id", "bill_no", name="uq_bill_supplier_no"),
    )
    op.create_table(
        "bill_payments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("bill_id", sa.Integer, sa.ForeignKey("supplier_bills.id"), nullable=False),
        sa.Column("payment_date", sa.Date, nullable=False),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column("method", sa.String(40), nullable=False, server_default="bank_transfer"),
        sa.Column("reference", sa.String(80), nullable=False, default=""),
        sa.Column("notes", sa.String(240), nullable=False, server_default=""),
        sa.Column("voided", sa.Boolean, nullable=False, server_default=sa.text('0')),
        sa.Column("void_reason", sa.String(200), nullable=False, server_default=""),
        sa.Column("recorded_by_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint("reference", name="uq_bill_payment_ref"),
    )
    op.create_table(
        "finance_audit_log",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("entity_type", sa.String(30), nullable=False),
        sa.Column("entity_id", sa.Integer, nullable=False),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("detail", sa.String(400), nullable=False, server_default=""),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )



def downgrade():
    op.drop_table("finance_audit_log")
    op.drop_table("bill_payments")
    op.drop_table("supplier_bills")
    op.drop_table("invoice_payments")
    op.drop_table("invoice_lines")
    op.drop_table("customer_invoices")

