from sqlalchemy import case, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from ..models import Endpoint, UserStats


def _insert_factory(session: Session):
    dialect = getattr(getattr(session, "bind", None), "dialect", None)
    if dialect and dialect.name == "postgresql":
        return pg_insert
    return sqlite_insert


def _ensure_row(session: Session, user_id: str) -> None:
    insert_fn = _insert_factory(session)
    statement = insert_fn(UserStats).values(user_id=user_id, endpoint_count=0)
    session.execute(statement.on_conflict_do_nothing(index_elements=[UserStats.user_id]))


def _set_count(session: Session, user_id: str, value: int) -> int:
    _ensure_row(session, user_id)
    session.execute(
        update(UserStats)
        .where(UserStats.user_id == user_id)
        .values(endpoint_count=value, updated_at=func.now())
    )
    session.flush()
    return session.scalar(select(UserStats.endpoint_count).where(UserStats.user_id == user_id)) or 0


def adjust_endpoint_count(session: Session, user_id: str, delta: int) -> int:
    _ensure_row(session, user_id)
    session.execute(
        update(UserStats)
        .where(UserStats.user_id == user_id)
        .values(
            endpoint_count=case(
                (UserStats.endpoint_count + delta < 0, 0),
                else_=UserStats.endpoint_count + delta
            ),
            updated_at=func.now()
        )
    )
    session.flush()
    return session.scalar(select(UserStats.endpoint_count).where(UserStats.user_id == user_id)) or 0


def get_endpoint_count(session: Session, user_id: str) -> int:
    existing = session.scalar(select(UserStats.endpoint_count).where(UserStats.user_id == user_id))
    if existing is not None:
        return existing
    total = session.scalar(
        select(func.count()).select_from(Endpoint).where(Endpoint.user_id == user_id)
    ) or 0
    return _set_count(session, user_id, total)
