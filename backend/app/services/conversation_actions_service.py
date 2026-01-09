from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.logger import log_error
from ..core.constants import SENSITIVE_KEY_FRAGMENTS
from ..models import ConversationAction, Endpoint
from ..schemas.widget import ToolResultPayload


def _is_sensitive_key(key: str) -> bool:
    lowered = key.strip().lower()
    return any(fragment in lowered for fragment in SENSITIVE_KEY_FRAGMENTS)


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
    endpoint_id: UUID
    params: dict[str, Any]
    query: dict[str, Any]
    body: dict[str, Any]


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
    endpoint_ids = list({call_map[item_id].endpoint_id for item_id in tool_call_ids if item_id in call_map})
    if not endpoint_ids:
        return

    endpoint_rows = session.scalars(
        select(Endpoint).where(
            Endpoint.user_id == user_id,
            Endpoint.id.in_(endpoint_ids),
        )
    ).all()
    endpoints = {endpoint.id: endpoint for endpoint in endpoint_rows}

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
        endpoint = endpoints.get(call.endpoint_id)
        if not endpoint:
            continue
        try:
            session.add(ConversationAction(
                user_id=user_id,
                conversation_id=conversation_id,
                endpoint_id=endpoint.id,
                feature_id=endpoint.feature_id,
                tool_call_id=tool_call_id,
                request={
                    "params": _sanitize(call.params or {}),
                    "query": _sanitize(call.query or {}),
                    "body": _sanitize(call.body or {}),
                },
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
