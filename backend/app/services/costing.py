"""Order cost intelligence. Estimates and recorded actuals are kept apart and labelled.

Formulas (shown in the UI):
  estimated unit cost  = sum(qty_per_m x standard material cost) + labour rate + processing rate
  estimated total      = order quantity x estimated unit cost   (rework not planned => 0)
  actual recorded      = sum of CostEntry rows (material at lot cost on consumption, labour and
                         processing on job completion by stage share, rework on rework completion)
  cost per accepted m  = actual recorded total / accepted metres   (only when accepted > 0)
  cost embedded in rejected fabric = rejected m x (actual material+labour+processing / produced m)
      -> already INSIDE the actual total; shown for insight, never added again
  replacement estimate = quality shortfall m x estimated unit cost  (future estimate, not in totals)
"""
from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import CostEntry, SalesOrder
from .core import EPS, money
from .orders import order_metrics

CATEGORIES = ("material", "labour", "processing", "rework", "other")


def unit_estimate(order: SalesOrder) -> dict:
    spec = order.fabric_spec
    mat = sum(l.qty_per_m * l.material.standard_cost for l in spec.materials)
    return {"material": mat, "labour": spec.labour_cost_per_m, "processing": spec.processing_cost_per_m,
            "total": mat + spec.labour_cost_per_m + spec.processing_cost_per_m}


def order_cost(db: Session, order: SalesOrder, m: dict | None = None) -> dict:
    m = m or order_metrics(order)
    u = unit_estimate(order)
    est = {k: money(order.quantity * u[k]) for k in ("material", "labour", "processing")}
    est["rework"] = 0.0
    est["other"] = 0.0
    est_total = money(sum(est.values()))
    entries = list(db.scalars(select(CostEntry).where(CostEntry.order_id == order.id).order_by(CostEntry.id)))
    actual = defaultdict(float)
    for e in entries:
        actual[e.category] += e.amount
    actual = {k: money(actual.get(k, 0.0)) for k in CATEGORIES}
    actual_total = money(sum(actual.values()))
    base_actual = actual["material"] + actual["labour"] + actual["processing"]
    produced = m["produced_m"]
    embedded_rejected = money(m["rejected_m"] * base_actual / produced) if produced > EPS else 0.0
    replacement = money(m["quality_shortfall_m"] * u["total"])
    return {
        "currency": "INR",
        "unit_estimate": {k: money(v) for k, v in u.items()},
        "estimated": est, "estimated_total": est_total,
        "actual": actual, "actual_total": actual_total,
        "accepted_m": m["accepted_m"],
        "actual_cost_per_accepted_m": money(actual_total / m["accepted_m"]) if m["accepted_m"] > EPS else None,
        "estimated_cost_per_m": money(u["total"]),
        "quality": {
            "rework_cost_actual": actual["rework"],
            "cost_embedded_in_rejected": embedded_rejected,
            "replacement_estimate": replacement,
            "note": "Embedded cost of rejected fabric is already inside the actual total and is not added again. "
                    "Replacement estimate is a forward-looking estimate and is excluded from totals.",
        },
        "entries": [{"id": e.id, "category": e.category, "amount": e.amount, "source_type": e.source_type,
                     "source_id": e.source_id, "description": e.description, "created_at": e.created_at.isoformat()}
                    for e in entries],
    }
