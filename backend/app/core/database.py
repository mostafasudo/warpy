from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import get_settings

Base = declarative_base()

_engine = None
_SessionLocal = None


def get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        connect_args = {"options": "-c statement_timeout=180000"}
        pool_args = {}
        if settings.database_url.startswith("sqlite"):
            connect_args = {"check_same_thread": False}
            if ":memory:" in settings.database_url:
                pool_args["poolclass"] = StaticPool
        _engine = create_engine(
            settings.database_url,
            pool_pre_ping=True,
            future=True,
            connect_args=connect_args,
            **pool_args
        )
    return _engine


def _get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), autoflush=False, autocommit=False)
    return _SessionLocal


@contextmanager
def session_scope() -> Session:
    session = _get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session():
    with session_scope() as session:
        yield session
