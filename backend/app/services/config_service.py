from fastapi import HTTPException, status
from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from ..core.logger import log_info
from ..models import Environment, SessionHeader
from ..schemas.config import ConfigPayload, ConfigResponse, SessionHeaderPayload


REQUIRED_ENVIRONMENTS = {"local", "production"}


def _dialect_name(session: Session) -> str:
    return session.bind.dialect.name if session.bind else ""


def _conflict_insert(model, dialect: str):
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        return pg_insert(model)
    if dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert as sqlite_insert
        return sqlite_insert(model)
    return None


def ensure_required_environments(session: Session, user_id: str) -> None:
    dialect = _dialect_name(session)
    values = [{"user_id": user_id, "name": name, "base_url": ""} for name in REQUIRED_ENVIRONMENTS]
    statement = _conflict_insert(Environment, dialect)
    if statement is not None:
        session.execute(
            statement.values(values).on_conflict_do_nothing(index_elements=[Environment.user_id, Environment.name])
        )
    else:
        existing = set(session.execute(select(Environment.name).where(Environment.user_id == user_id)).scalars().all())
        for name in REQUIRED_ENVIRONMENTS - existing:
            session.add(Environment(user_id=user_id, name=name, base_url=""))
    session.flush()


def _upsert_environments(session: Session, user_id: str, base_urls: dict[str, str]) -> None:
    if not base_urls:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one environment is required")
    missing_required = REQUIRED_ENVIRONMENTS - set(base_urls.keys())
    if missing_required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required environments: {', '.join(sorted(missing_required))}"
        )

    ensure_required_environments(session, user_id)

    dialect = _dialect_name(session)
    values = [{"user_id": user_id, "name": name, "base_url": url} for name, url in base_urls.items()]
    statement = _conflict_insert(Environment, dialect)
    if statement is not None:
        session.execute(
            statement.values(values).on_conflict_do_update(
                index_elements=[Environment.user_id, Environment.name],
                set_={"base_url": statement.excluded.base_url, "updated_at": func.now()}
            )
        )
    else:
        names = list(base_urls.keys())
        existing = {
            environment.name: environment for environment in session.scalars(
                select(Environment).where(
                    Environment.user_id == user_id,
                    Environment.name.in_(names)
                )
            ).all()
        }
        for name, url in base_urls.items():
            environment = existing.get(name)
            if environment:
                environment.base_url = url
            else:
                session.add(Environment(user_id=user_id, name=name, base_url=url))

    removable = set(
        session.execute(
            select(Environment.name).where(
                Environment.user_id == user_id,
                ~Environment.name.in_(list(base_urls.keys()))
            )
        ).scalars().all()
    )
    deletable = [name for name in removable if name not in REQUIRED_ENVIRONMENTS]
    if deletable:
        session.execute(delete(Environment).where(Environment.user_id == user_id, Environment.name.in_(deletable)))


def _replace_session_headers(session: Session, user_id: str, headers: dict[str, SessionHeaderPayload]) -> None:
    session.execute(delete(SessionHeader).where(SessionHeader.user_id == user_id))
    if not headers:
        return
    values = [
        {"user_id": user_id, "header_name": name, "source": header.source, "key": header.key}
        for name, header in headers.items()
    ]
    session.execute(insert(SessionHeader), values)


def get_config(session: Session, user_id: str) -> ConfigResponse:
    ensure_required_environments(session, user_id)
    environments = session.scalars(select(Environment).where(Environment.user_id == user_id)).all()
    headers = session.scalars(select(SessionHeader).where(SessionHeader.user_id == user_id)).all()
    base_urls = {environment.name: environment.base_url for environment in environments}
    header_map = {header.header_name: {"source": header.source, "key": header.key} for header in headers}
    return ConfigResponse(baseUrl=base_urls, headers=header_map)


def upsert_config(session: Session, user_id: str, payload: ConfigPayload) -> ConfigResponse:
    _upsert_environments(session, user_id, payload.baseUrl)
    _replace_session_headers(session, user_id, payload.headers)
    log_info("ConfigService", "upsert_config", "Config updated", user_id=user_id)
    return get_config(session, user_id)
