from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from . import config


class Base(DeclarativeBase):
    pass


def make_engine(url: str):
    kwargs = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        # SQLite is a documented local-development fallback only.
        kwargs = {"connect_args": {"check_same_thread": False}}
    return create_engine(url, **kwargs)


engine = make_engine(config.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
