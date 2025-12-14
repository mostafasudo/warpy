from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.logger import log_info
from ..models import Agent
from ..schemas.agent import WidgetSecurityActive, WidgetSecurityDraft, WidgetSecurityResponse
from .widget_auth_service import generate_widget_api_key, hash_widget_api_key


DEFAULT_WIDGET_REFRESH_ENDPOINT_PATH = "/widget-token"


def get_widget_security_state(session: Session, user_id: str) -> WidgetSecurityResponse:
    agent = session.scalar(select(Agent).where(Agent.user_id == user_id))
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return _to_widget_security_response(agent)


def update_widget_security_draft(
    session: Session,
    user_id: str,
    *,
    require_signed_widget_token: bool | None = None,
    widget_refresh_endpoint_path: str | None = None,
    clear_require_signed_widget_token: bool = False,
    clear_widget_refresh_endpoint_path: bool = False,
) -> WidgetSecurityResponse:
    agent = session.scalar(
        select(Agent).where(Agent.user_id == user_id).with_for_update()
    )
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    if clear_require_signed_widget_token:
        agent.widget_auth_enabled_draft = None
    elif require_signed_widget_token is not None:
        agent.widget_auth_enabled_draft = None if require_signed_widget_token == agent.widget_auth_enabled else require_signed_widget_token

    if clear_widget_refresh_endpoint_path:
        agent.widget_refresh_endpoint_path_draft = None
    elif widget_refresh_endpoint_path is not None:
        normalized = _normalize_widget_refresh_path(widget_refresh_endpoint_path)
        agent.widget_refresh_endpoint_path_draft = None if normalized == agent.widget_refresh_endpoint_path else normalized

    session.flush()
    log_info("AgentWidgetSecurityService", "update_draft", "Draft updated", user_id=user_id)
    return _to_widget_security_response(agent)


def create_widget_api_key_draft(session: Session, user_id: str) -> tuple[WidgetSecurityResponse, str, str]:
    agent = session.scalar(
        select(Agent).where(Agent.user_id == user_id).with_for_update()
    )
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    api_key, last4 = generate_widget_api_key()
    agent.widget_api_key_hash_draft = hash_widget_api_key(api_key)
    agent.widget_api_key_last4_draft = last4
    session.flush()
    log_info("AgentWidgetSecurityService", "create_api_key_draft", "Draft API key created", user_id=user_id)
    return _to_widget_security_response(agent), api_key, last4


def deploy_widget_security_draft(session: Session, user_id: str) -> WidgetSecurityResponse:
    agent = session.scalar(
        select(Agent).where(Agent.user_id == user_id).with_for_update()
    )
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    has_draft = _has_draft_changes(agent)
    if not has_draft:
        return _to_widget_security_response(agent)

    next_auth_enabled = agent.widget_auth_enabled_draft if agent.widget_auth_enabled_draft is not None else agent.widget_auth_enabled
    next_refresh_path = (
        agent.widget_refresh_endpoint_path_draft
        if agent.widget_refresh_endpoint_path_draft is not None
        else agent.widget_refresh_endpoint_path or DEFAULT_WIDGET_REFRESH_ENDPOINT_PATH
    )
    next_key_hash = agent.widget_api_key_hash_draft if agent.widget_api_key_hash_draft is not None else agent.widget_api_key_hash
    next_key_last4 = agent.widget_api_key_last4_draft if agent.widget_api_key_last4_draft is not None else agent.widget_api_key_last4

    if next_auth_enabled and not next_key_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Generate a widget API key before enabling signed widget tokens."
        )

    agent.widget_auth_enabled = next_auth_enabled
    agent.widget_refresh_endpoint_path = next_refresh_path
    agent.widget_api_key_hash = next_key_hash
    agent.widget_api_key_last4 = next_key_last4
    agent.widget_auth_enabled_draft = None
    agent.widget_refresh_endpoint_path_draft = None
    agent.widget_api_key_hash_draft = None
    agent.widget_api_key_last4_draft = None

    session.flush()
    log_info("AgentWidgetSecurityService", "deploy", "Draft deployed", user_id=user_id)
    return _to_widget_security_response(agent)


def _normalize_widget_refresh_path(value: str) -> str:
    trimmed = value.strip()
    if not trimmed.startswith("/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Refresh endpoint must start with '/'.")
    if "://" in trimmed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Refresh endpoint must be a path.")
    return trimmed


def _has_draft_changes(agent: Agent) -> bool:
    return any([
        agent.widget_auth_enabled_draft is not None,
        agent.widget_refresh_endpoint_path_draft is not None,
        agent.widget_api_key_hash_draft is not None,
    ])


def _to_widget_security_response(agent: Agent) -> WidgetSecurityResponse:
    active = WidgetSecurityActive(
        require_signed_widget_token=agent.widget_auth_enabled,
        widget_refresh_endpoint_path=agent.widget_refresh_endpoint_path or DEFAULT_WIDGET_REFRESH_ENDPOINT_PATH,
        has_api_key=bool(agent.widget_api_key_hash),
        api_key_last4=agent.widget_api_key_last4,
    )
    draft = None
    if _has_draft_changes(agent):
        draft = WidgetSecurityDraft(
            require_signed_widget_token=agent.widget_auth_enabled_draft,
            widget_refresh_endpoint_path=agent.widget_refresh_endpoint_path_draft,
            api_key_last4=agent.widget_api_key_last4_draft,
        )
    return WidgetSecurityResponse(active=active, draft=draft, has_staged_changes=_has_draft_changes(agent))

