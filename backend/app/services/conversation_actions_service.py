from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.constants import SENSITIVE_KEY_FRAGMENTS
from ..core.logger import log_error
from ..models import ConversationAction, Tool
from ..schemas.widget import ToolResultPayload


def _is_sensitive_key(key: str) -> bool:
    lowered = key.strip().lower()
    return any(fragment in lowered for fragment in SENSITIVE_KEY_FRAGMENTS)


def _is_sensitive_selector(selector: str) -> bool:
    lowered = selector.lower()
    return (
        "password" in lowered
        or 'type="password"' in lowered
        or "[type=password]" in lowered
        or "secret" in lowered
        or "token" in lowered
    )


def _sanitize_frontend_action(action: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(action, dict):
        return action
    selector = str(action.get("selector") or "")
    if _is_sensitive_selector(selector) and "text" in action:
        return {**action, "text": "***"}
    return action


def _sanitize(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, item in value.items():
            if _is_sensitive_key(str(key)):
                sanitized[str(key)] = "***"
            else:
                sanitized[str(key)] = _sanitize(item)
        return sanitized
    if isinstance(value, list):
        return [_sanitize(item) for item in value]
    return value


@dataclass(frozen=True)
class ToolCallForLog:
    id: str
    tool_type: str
    tool_id: UUID | None = None
    params: dict[str, Any] | None = None
    query: dict[str, Any] | None = None
    body: dict[str, Any] | None = None


def _tool_call_map(tool_calls: list[ToolCallForLog]) -> dict[str, ToolCallForLog]:
    return {tool_call.id: tool_call for tool_call in tool_calls if tool_call.id}


def record_widget_tool_results(
    session: Session,
    user_id: str,
    conversation_id: UUID,
    *,
    tool_results: list[ToolResultPayload],
    tool_calls: list[ToolCallForLog],
) -> None:
    tool_call_ids = [item.id for item in tool_results if item.id]
    if not tool_call_ids:
        return

    call_map = _tool_call_map(tool_calls)
    tool_ids = [tool_id for tool_id in {call_map[item_id].tool_id for item_id in tool_call_ids if item_id in call_map} if tool_id]
    if not tool_ids:
        return

    tool_rows = session.scalars(
        select(Tool).where(
            Tool.user_id == user_id,
            Tool.id.in_(tool_ids),
        )
    ).all()
    tools = {tool.id: tool for tool in tool_rows}

    existing = set(session.scalars(
        select(ConversationAction.tool_call_id).where(
            ConversationAction.user_id == user_id,
            ConversationAction.conversation_id == conversation_id,
            ConversationAction.tool_call_id.in_(tool_call_ids),
        )
    ).all())

    added = False
    for result in tool_results:
        tool_call_id = result.id
        if not tool_call_id or tool_call_id in existing:
            continue
        call = call_map.get(tool_call_id)
        if not call:
            continue
        tool = tools.get(call.tool_id)
        if not tool:
            continue
        try:
            session.add(ConversationAction(
                user_id=user_id,
                conversation_id=conversation_id,
                tool_type=call.tool_type or "backend",
                tool_id=tool.id,
                feature_id=tool.feature_id,
                tool_call_id=tool_call_id,
                request={
                    "params": _sanitize(call.params or {}),
                    "query": _sanitize(call.query or {}),
                    "body": _sanitize(call.body or {}),
                },
                response_body=_sanitize(result.body),
                status_code=result.status_code,
                error=result.error,
            ))
            added = True
        except Exception as exc:
            log_error(
                "ConversationActionsService",
                "record_widget_tool_results",
                "Failed to record tool result",
                exc=exc,
                conversation_id=str(conversation_id),
                tool_call_id=tool_call_id,
            )
    if added:
        session.flush()


def record_screen_autopilot_action(
    session: Session,
    user_id: str,
    conversation_id: UUID,
    tool_call_id: str,
    goal: str,
    url: str,
    actions: list[dict[str, Any]],
    status_code: int,
    error: str | None,
) -> None:
    existing = session.scalar(
        select(ConversationAction.id).where(
            ConversationAction.user_id == user_id,
            ConversationAction.conversation_id == conversation_id,
            ConversationAction.tool_call_id == tool_call_id,
        )
    )
    if existing:
        return

    try:
        session.add(ConversationAction(
            user_id=user_id,
            conversation_id=conversation_id,
            tool_type="screen_autopilot",
            frontend_goal=goal,
            frontend_url=url,
            frontend_actions=[_sanitize_frontend_action(a) for a in actions],
            tool_call_id=tool_call_id,
            request={},
            status_code=status_code,
            error=error,
        ))
        session.flush()
    except Exception as exc:
        log_error(
            "ConversationActionsService",
            "record_screen_autopilot_action",
            "Failed to record screen autopilot action",
            exc=exc,
            conversation_id=str(conversation_id),
            tool_call_id=tool_call_id,
        )
