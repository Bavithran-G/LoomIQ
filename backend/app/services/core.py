from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Event, ProductionStage, User

EPS = 1e-6


class BusinessError(Exception):
    """A rule violation that should be reported to the user (HTTP 409/422)."""

    def __init__(self, message: str, status_code: int = 409, code: str = "business_rule"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


class NotFound(BusinessError):
    def __init__(self, what: str):
        super().__init__(f"{what} not found", 404, "not_found")


def r3(x: float) -> float:
    return round(float(x) + 0.0, 3)


def money(x: float) -> float:
    return round(float(x) + 0.0, 2)


def today() -> date:
    return datetime.now(timezone.utc).date()


def log_event(db: Session, entity_type: str, entity_id: int, event_type: str, message: str, *,
              order_id: int | None = None, severity: str = "info", buyer_visible: bool = False,
              user: User | None = None) -> Event:
    ev = Event(entity_type=entity_type, entity_id=entity_id, event_type=event_type, message=message,
               order_id=order_id, severity=severity, buyer_visible=buyer_visible,
               user_id=user.id if user else None)
    db.add(ev)
    return ev


def next_number(db: Session, model, column, prefix: str, width: int = 4) -> str:
    """Sequential human-readable numbers, e.g. SO-2026-0012. Unique constraint is the backstop."""
    year = today().year
    full_prefix = f"{prefix}-{year}-"
    last = db.scalar(select(func.max(column)).where(column.like(f"{full_prefix}%")))
    n = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{full_prefix}{n:0{width}d}"


def active_stages(db: Session) -> list[ProductionStage]:
    return list(db.scalars(select(ProductionStage).where(ProductionStage.active.is_(True))
                           .order_by(ProductionStage.sequence)))


def next_stage_code(db: Session, after: str) -> str:
    """Next active stage after `after` for a roll; 'packed' once the route is finished.

    Spinning produces yarn, not fabric, so rolls never sit at the spinning stage."""
    codes = [s.code for s in active_stages(db) if s.code != "spinning"]
    if after in codes:
        idx = codes.index(after)
        return codes[idx + 1] if idx + 1 < len(codes) else "packed"
    return "packed"


STAGE_LOCATION = {
    "weaving": "Weaving shed", "dyeing": "Dye house", "inspection": "Inspection bay",
    "finishing": "Finishing & packing", "packed": "FG warehouse",
}

# Share of a fabric spec's labour/processing rate charged when each stage's job completes.
# Documented assumption; shares sum to 1.0 across the default weaving->dyeing->finishing route.
STAGE_COST_SHARE = {"spinning": 0.0, "weaving": 0.5, "dyeing": 0.35, "finishing": 0.15}
