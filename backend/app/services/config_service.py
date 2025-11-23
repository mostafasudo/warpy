from fastapi import HTTPException, status
from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from ..core.logger import log_info
from ..models import Environment, SessionHeader
from ..schemas.config import ConfigPayload, ConfigResponse, SessionHeaderPayload


REQUIRED_ENVIRONMENTS = {"local", "production"}


def ensure_required_environments(session: Session) -> None:
    existing = {name for name in session.execute(select(Environment.name)).scalars().all()}
    missing = REQUIRED_ENVIRONMENTS - existing
    if not missing:
        return
    for name in missing:
        session.add(Environment(name=name, base_url=""))


def _upsert_environments(session: Session, base_urls: dict[str, str]) -> None:
    if not base_urls:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one environment is required")
    missing_required = REQUIRED_ENVIRONMENTS - set(base_urls.keys())
    if missing_required:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required environments: {', '.join(sorted(missing_required))}"
        )

    ensure_required_environments(session)

    dialect = session.bind.dialect.name if session.bind else ""
    values = [{"name": name, "base_url": url} for name, url in base_urls.items()]

    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        statement = pg_insert(Environment).values(values)
        statement = statement.on_conflict_do_update(
            index_elements=[Environment.name],
            set_={"base_url": statement.excluded.base_url, "updated_at": func.now()}
        )
        session.execute(statement)
    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert as sqlite_insert

        statement = sqlite_insert(Environment).values(values)
        statement = statement.on_conflict_do_update(
            index_elements=[Environment.name],
            set_={"base_url": statement.excluded.base_url, "updated_at": func.now()}
        )
        session.execute(statement)
    else:
        names = list(base_urls.keys())
        existing = {
            environment.name: environment for environment in session.scalars(
                select(Environment).where(Environment.name.in_(names))
            ).all()
        }
        for name, url in base_urls.items():
            environment = existing.get(name)
            if environment:
                environment.base_url = url
            else:
                session.add(Environment(name=name, base_url=url))

    removable = set(
        session.execute(
            select(Environment.name).where(~Environment.name.in_(list(base_urls.keys())))
        ).scalars().all()
    )
    deletable = [name for name in removable if name not in REQUIRED_ENVIRONMENTS]
    if deletable:
        session.execute(delete(Environment).where(Environment.name.in_(deletable)))


def _replace_session_headers(session: Session, headers: dict[str, SessionHeaderPayload]) -> None:
    session.execute(delete(SessionHeader))
    if not headers:
        return
    values = [
        {"header_name": name, "source": header.source, "key": header.key}
        for name, header in headers.items()
    ]
    session.execute(insert(SessionHeader), values)


def get_config(session: Session) -> ConfigResponse:
    ensure_required_environments(session)
    environments = session.scalars(select(Environment)).all()
    headers = session.scalars(select(SessionHeader)).all()
    base_urls = {environment.name: environment.base_url for environment in environments}
    header_map = {header.header_name: {"source": header.source, "key": header.key} for header in headers}
    return ConfigResponse(base_url=base_urls, headers=header_map)


def upsert_config(session: Session, payload: ConfigPayload) -> ConfigResponse:
    _upsert_environments(session, payload.base_url)
    _replace_session_headers(session, payload.headers)
    log_info("ConfigService", "upsert_config", "Config updated")
    return get_config(session)
