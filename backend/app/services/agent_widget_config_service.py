from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.logger import log_info
from ..models import Agent
from ..schemas.agent import AgentWidgetConfigResponse, AgentWidgetConfigUpdate


def get_agent_widget_config(session: Session, user_id: str) -> AgentWidgetConfigResponse:
    agent = session.scalar(select(Agent).where(Agent.user_id == user_id))
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return AgentWidgetConfigResponse(
        widget_title=agent.widget_title,
        widget_icon_url=agent.widget_icon_url,
        widget_empty_title=agent.widget_empty_title,
        widget_empty_description=agent.widget_empty_description,
        widget_input_placeholder=agent.widget_input_placeholder,
        widget_security_disclosure_enabled=agent.widget_security_disclosure_enabled,
    )


def update_agent_widget_config(
    session: Session,
    user_id: str,
    payload: AgentWidgetConfigUpdate,
) -> AgentWidgetConfigResponse:
    agent = session.scalar(select(Agent).where(Agent.user_id == user_id).with_for_update())
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    agent.widget_title = _strip_required(payload.widget_title, "Widget name")
    agent.widget_icon_url = _normalize_widget_icon_url(payload.widget_icon_url)
    agent.widget_empty_title = _strip_optional(payload.widget_empty_title)
    agent.widget_empty_description = _strip_optional(payload.widget_empty_description)
    agent.widget_input_placeholder = _strip_required(payload.widget_input_placeholder, "Input placeholder")
    agent.widget_security_disclosure_enabled = payload.widget_security_disclosure_enabled

    session.flush()
    log_info("AgentWidgetConfigService", "update", "Widget config updated", user_id=user_id)
    return AgentWidgetConfigResponse(
        widget_title=agent.widget_title,
        widget_icon_url=agent.widget_icon_url,
        widget_empty_title=agent.widget_empty_title,
        widget_empty_description=agent.widget_empty_description,
        widget_input_placeholder=agent.widget_input_placeholder,
        widget_security_disclosure_enabled=agent.widget_security_disclosure_enabled,
    )


def _normalize_widget_icon_url(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    if any(c.isspace() for c in trimmed):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Icon URL must not contain spaces.")
    if not (trimmed.startswith("https://") or trimmed.startswith("http://")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Icon URL must start with http:// or https://.")
    return trimmed


def _strip_required(value: str, label: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} is required.")
    return trimmed


def _strip_optional(value: str) -> str:
    return value.strip()
