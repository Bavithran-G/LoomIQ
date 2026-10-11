from __future__ import annotations

from datetime import date, datetime, timezone, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Event, ProductionStage, User

EPS = 1e-6

# --------------- timezone helpers ---------------
_IST = timezone(timedelta(hours=5, minutes=30))


def today_local() -> date:
    """Current date in IST (India/Kolkata, UTC+5:30) — the application's operational timezone."""
    return datetime.now(_IST).date()


def today() -> date:
    """Current operational business date."""
    return today_local()


# --------------- date-validation helpers ---------------
def validate_event_date(d: date, field: str = "date") -> None:
    """Raise BusinessError if *d* is in the future.

    Operational events (receipt, adjustment, inspection, downtime) cannot happen
    in the future.  Past dates are rejected too: we require today's date so the
    system reflects actual real-time events.
    """
    t = today_local()
    if d > t:
        raise BusinessError(
            f"{field.capitalize()} cannot be in the future "
            f"(submitted {d.isoformat()}, today is {t.isoformat()}).",
            422,
        )
    if d < t:
        raise BusinessError(
            f"{field.capitalize()} cannot be a past date "
            f"(submitted {d.isoformat()}, today is {t.isoformat()}). "
            "Record the event on the actual date it occurs.",
            422,
        )


def validate_planned_date(d: date, field: str = "date") -> None:
    """Raise BusinessError if *d* is strictly in the past.

    Planned activities (jobs, dispatch, purchase orders) may be today or future.
    """
    t = today_local()
    if d < t:
        raise BusinessError(
            f"{field.capitalize()} cannot be in the past "
            f"(submitted {d.isoformat()}, today is {t.isoformat()}). "
            "Planned activities must be scheduled for today or a future date.",
            422,
        )



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
