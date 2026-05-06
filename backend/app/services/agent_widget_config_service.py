from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.logger import log_info
from ..models import Agent
from ..schemas.agent import AgentWidgetConfigResponse, AgentWidgetConfigUpdate
from ..schemas.widget import WIDGET_SUGGESTION_MAX_COUNT, WIDGET_SUGGESTION_MAX_LENGTH


def get_agent_widget_config(session: Session, user_id: str) -> AgentWidgetConfigResponse:
    agent = session.scalar(select(Agent).where(Agent.user_id == user_id))
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return AgentWidgetConfigResponse(
        widget_title=agent.widget_title,
        widget_icon_url=agent.widget_icon_url,
        widget_appearance_mode=_normalize_widget_appearance_mode(agent.widget_appearance_mode),
        widget_response_mode=_normalize_widget_response_mode(agent.widget_response_mode),
        widget_theme=agent.widget_theme,
        widget_behavior=agent.widget_behavior,
        widget_empty_title=agent.widget_empty_title,
        widget_empty_description=agent.widget_empty_description,
        widget_input_placeholder=agent.widget_input_placeholder,
        widget_suggestions_enabled=agent.widget_suggestions_enabled,
        widget_starter_suggestions=_normalize_widget_starter_suggestions(agent.widget_starter_suggestions)[:WIDGET_SUGGESTION_MAX_COUNT],
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
    agent.widget_appearance_mode = _normalize_widget_appearance_mode(payload.widget_appearance_mode)
    agent.widget_response_mode = _normalize_widget_response_mode(payload.widget_response_mode)
    agent.widget_theme = payload.widget_theme.model_dump(mode="json", by_alias=True) if payload.widget_theme else None
    agent.widget_behavior = payload.widget_behavior
    agent.widget_empty_title = _strip_optional(payload.widget_empty_title)
    agent.widget_empty_description = _strip_optional(payload.widget_empty_description)
    agent.widget_input_placeholder = _strip_required(payload.widget_input_placeholder, "Input placeholder")
    agent.widget_suggestions_enabled = payload.widget_suggestions_enabled
    agent.widget_starter_suggestions = _validate_widget_starter_suggestions(
        payload.widget_starter_suggestions,
        enabled=payload.widget_suggestions_enabled,
    )
    agent.widget_security_disclosure_enabled = payload.widget_security_disclosure_enabled

    session.flush()
    log_info("AgentWidgetConfigService", "update", "Widget config updated", user_id=user_id)
    return AgentWidgetConfigResponse(
        widget_title=agent.widget_title,
        widget_icon_url=agent.widget_icon_url,
        widget_appearance_mode=agent.widget_appearance_mode,
        widget_response_mode=agent.widget_response_mode,
        widget_theme=agent.widget_theme,
        widget_behavior=agent.widget_behavior,
        widget_empty_title=agent.widget_empty_title,
        widget_empty_description=agent.widget_empty_description,
        widget_input_placeholder=agent.widget_input_placeholder,
        widget_suggestions_enabled=agent.widget_suggestions_enabled,
        widget_starter_suggestions=_normalize_widget_starter_suggestions(agent.widget_starter_suggestions)[:WIDGET_SUGGESTION_MAX_COUNT],
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


def _normalize_widget_appearance_mode(value: str | None) -> str:
    return "custom" if value == "custom" else "infer"


def _normalize_widget_response_mode(value: str | None) -> str:
    if value in {"markdown", "warpy_components", "native_components"}:
        return value
    return "warpy_components"


def _normalize_widget_starter_suggestions(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        trimmed = " ".join(item.split()).strip()
        if not trimmed:
            continue
        normalized.append(trimmed[:WIDGET_SUGGESTION_MAX_LENGTH])
    return normalized


def _validate_widget_starter_suggestions(values: list[str], *, enabled: bool) -> list[str]:
    normalized = _normalize_widget_starter_suggestions(values)
    if len(normalized) > WIDGET_SUGGESTION_MAX_COUNT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can save up to three starter suggestions.",
        )
    if enabled and not normalized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add at least one starter suggestion before enabling suggestions.",
        )
    return normalized
