from fastapi import HTTPException, status
from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from ..core.logger import log_info
from ..models import AuthType, Environment, SessionHeader, StorageSource
from ..schemas.config import AuthConfigPayload, ConfigPayload, ConfigResponse, SessionHeaderPayload


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


def _build_auth_from_legacy_header(header: SessionHeaderPayload) -> AuthConfigPayload:
    return AuthConfigPayload(
        mode="header",
        source=header.source,
        key=header.key,
        authType=header.auth_type or AuthType.bearer,
    )


def _is_cookie_auth_request_credentials(source: StorageSource, key: str) -> bool:
    return source == StorageSource.cookies and not key.strip()


def _resolve_auth_payload(
    payload: ConfigPayload,
) -> tuple[AuthConfigPayload, bool, dict[str, SessionHeaderPayload]]:
    authorization_headers: list[SessionHeaderPayload] = []
    literal_headers: dict[str, SessionHeaderPayload] = {}
    for name, header in payload.headers.items():
        if name.strip().lower() == "authorization":
            authorization_headers.append(header)
            continue
        literal_headers[name] = header
    legacy_header_auth = next(
        (
            _build_auth_from_legacy_header(header)
            for header in authorization_headers
            if not _is_cookie_auth_request_credentials(header.source, header.key)
        ),
        AuthConfigPayload(),
    )
    send_cookies_with_requests = payload.send_cookies_with_requests or any(
        _is_cookie_auth_request_credentials(header.source, header.key) for header in authorization_headers
    )
    auth = payload.auth if payload.auth.mode != "none" else legacy_header_auth
    return auth, send_cookies_with_requests, literal_headers


def _build_auth_rows(user_id: str, auth: AuthConfigPayload, send_cookies_with_requests: bool) -> list[dict]:
    rows: list[dict] = []
    if auth.mode == "header":
        rows.append(
            {
                "user_id": user_id,
                "header_name": "Authorization",
                "source": auth.source,
                "key": auth.key,
                "auth_type": auth.auth_type or AuthType.bearer,
            }
        )
    if send_cookies_with_requests:
        rows.append(
            {
                "user_id": user_id,
                "header_name": "Authorization",
                "source": StorageSource.cookies,
                "key": "",
                "auth_type": None,
            }
        )
    return rows


def _replace_session_headers(
    session: Session,
    user_id: str,
    headers: dict[str, SessionHeaderPayload],
    auth: AuthConfigPayload,
    send_cookies_with_requests: bool,
) -> None:
    session.execute(delete(SessionHeader).where(SessionHeader.user_id == user_id))
    values = []
    for name, header in headers.items():
        if name.strip().lower() == "authorization":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Configure Authorization in auth settings")
        key = header.key.strip()
        if not key:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Header key is required")
        values.append(
            {
                "user_id": user_id,
                "header_name": name,
                "source": header.source,
                "key": key,
                "auth_type": None,
            }
        )
    values.extend(_build_auth_rows(user_id, auth, send_cookies_with_requests))
    if not values:
        return
    session.execute(insert(SessionHeader), values)


def get_config(session: Session, user_id: str) -> ConfigResponse:
    ensure_required_environments(session, user_id)
    environments = session.scalars(select(Environment).where(Environment.user_id == user_id)).all()
    headers = session.scalars(select(SessionHeader).where(SessionHeader.user_id == user_id)).all()
    base_urls = {environment.name: environment.base_url for environment in environments}
    header_map = {}
    auth = AuthConfigPayload()
    send_cookies_with_requests = False
    for header in headers:
        if header.header_name.lower() == "authorization":
            if _is_cookie_auth_request_credentials(header.source, header.key):
                send_cookies_with_requests = True
            else:
                auth = AuthConfigPayload(
                    mode="header",
                    source=header.source,
                    key=header.key,
                    authType=header.auth_type or AuthType.bearer,
                )
            continue
        header_map[header.header_name] = {"source": header.source, "key": header.key}
    return ConfigResponse(
        baseUrl=base_urls,
        auth=auth,
        sendCookiesWithRequests=send_cookies_with_requests,
        headers=header_map,
    )


def upsert_config(session: Session, user_id: str, payload: ConfigPayload) -> ConfigResponse:
    auth, send_cookies_with_requests, literal_headers = _resolve_auth_payload(payload)
    _upsert_environments(session, user_id, payload.baseUrl)
    _replace_session_headers(session, user_id, literal_headers, auth, send_cookies_with_requests)
    log_info("ConfigService", "upsert_config", "Config updated", user_id=user_id)
    return get_config(session, user_id)
