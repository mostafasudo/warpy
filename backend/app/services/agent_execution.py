import re
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.logger import log_error, log_info
from ..core.constants import SENSITIVE_KEY_FRAGMENTS
from ..core.user_messages import ASSISTANT_UNAVAILABLE_MESSAGE
from ..models import ConversationAction, Tool, Environment
from .billing_service import consume_action_for_server_execution


def substitute_path_params(path: str, params: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    remaining = dict(params)
    pattern = r"\{(\w+)\}"

    def replace_param(match: re.Match[str]) -> str:
        name = match.group(1)
        if name in remaining:
            value = remaining.pop(name)
            return str(value)
        return match.group(0)

    return re.sub(pattern, replace_param, path), remaining


def _sanitize_request(value: Any) -> Any:

    def is_sensitive(key: str) -> bool:
        lowered = key.strip().lower()
        return any(fragment in lowered for fragment in SENSITIVE_KEY_FRAGMENTS)

    if isinstance(value, dict):
        return {
            str(key): ("***" if is_sensitive(str(key)) else _sanitize_request(item))
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_sanitize_request(item) for item in value]
    return value


def _record_action(
    session: Session,
    user_id: str,
    conversation_id: UUID,
    tool: Tool,
    *,
    tool_call_id: str,
    request: dict[str, Any],
    response_body: Any,
    status_code: int | None,
    error: str | None,
) -> None:
    try:
        session.add(ConversationAction(
            user_id=user_id,
            conversation_id=conversation_id,
            tool_type="backend",
            tool_id=tool.id,
            feature_id=tool.feature_id,
            tool_call_id=tool_call_id,
            request=request,
            response_body=response_body,
            status_code=status_code,
            error=error,
        ))
    except Exception as exc:
        log_error("AgentChain", "execute_backend_tool", "Failed to record action", exc=exc, tool_id=str(tool.id))


def get_enabled_tool(session: Session, user_id: str, tool_id: UUID) -> Tool | None:
    return session.scalar(
        select(Tool).where(
            Tool.id == tool_id,
            Tool.user_id == user_id,
            Tool.agent_enabled.is_(True),
        )
    )


def execute_backend_tool(
    session: Session,
    user_id: str,
    tool: Tool,
    args: dict[str, Any],
    *,
    enforce_billing: bool = True,
    conversation_id: UUID | None = None,
    tool_call_id: str | None = None,
) -> dict[str, Any]:
    def record_action(request: dict[str, Any], response_body: Any, status_code: int | None, error: str | None) -> None:
        if not conversation_id or not tool_call_id:
            return
        _record_action(
            session,
            user_id,
            conversation_id,
            tool,
            tool_call_id=tool_call_id,
            request=request,
            response_body=response_body,
            status_code=status_code,
            error=error,
        )

    environment = session.scalar(select(Environment).where(Environment.user_id == user_id).limit(1))
    if not environment:
        error = "No environment configured. Please set up an environment with a base URL first."
        record_action({"params": {}, "query": {}, "body": {}}, None, None, error)
        return {"error": error}

    path_params = args.get("params", {})
    query_params = args.get("query", {})
    body_data = args.get("body", {})
    header_data = args.get("headers", {})

    path, remaining_path_params = substitute_path_params(tool.path or "", path_params)
    if remaining_path_params:
        log_info(
            "AgentChain",
            "execute_backend_tool",
            "Unused path parameters",
            unused=list(remaining_path_params.keys()),
            tool_id=str(tool.id)
        )

    url = f"{environment.base_url.rstrip('/')}/{path.lstrip('/')}"
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        error = f"Invalid URL scheme: {parsed.scheme}. Only http and https are allowed."
        record_action(
            {
                "params": _sanitize_request(path_params),
                "query": _sanitize_request(query_params),
                "body": _sanitize_request(body_data),
            },
            None,
            None,
            error,
        )
        return {"error": error}

    method = (tool.method.value if tool.method else "GET").upper()
    if method == "GET" and body_data:
        log_error("AgentChain", "execute_backend_tool", "GET request cannot include a body", tool_id=str(tool.id))
        error = "GET requests cannot include a body"
        record_action(
            {
                "params": _sanitize_request(path_params),
                "query": _sanitize_request(query_params),
                "body": _sanitize_request(body_data),
            },
            None,
            None,
            error,
        )
        return {"error": error}
    request_kwargs: dict[str, Any] = {"timeout": 30.0}
    if query_params:
        request_kwargs["params"] = query_params
    if body_data:
        request_kwargs["json"] = body_data
    if header_data:
        request_kwargs["headers"] = header_data

    if enforce_billing:
        try:
            consume_result = consume_action_for_server_execution(session, user_id)
            if consume_result.consumed <= 0:
                return {"error": ASSISTANT_UNAVAILABLE_MESSAGE}
        except Exception as error:
            log_error("AgentChain", "execute_backend_tool", "Failed to consume action", exc=error, tool_id=str(tool.id))
            return {"error": ASSISTANT_UNAVAILABLE_MESSAGE}

    try:
        with httpx.Client() as client:
            response = client.request(method, url, **request_kwargs)
            try:
                body = response.json()
            except Exception:
                body = response.text
            log_info(
                "AgentChain",
                "execute_backend_tool",
                "Tool executed",
                tool_id=str(tool.id),
                status=response.status_code
            )
            record_action(
                {
                    "params": _sanitize_request(path_params),
                    "query": _sanitize_request(query_params),
                    "body": _sanitize_request(body_data),
                },
                _sanitize_request(body),
                response.status_code,
                None,
            )
            return {"status_code": response.status_code, "body": body}
    except httpx.TimeoutException:
        log_error("AgentChain", "execute_backend_tool", "Request timeout", tool_id=str(tool.id))
        error = "Request timed out"
        record_action(
            {
                "params": _sanitize_request(path_params),
                "query": _sanitize_request(query_params),
                "body": _sanitize_request(body_data),
            },
            None,
            None,
            error,
        )
        return {"error": error}
    except Exception as error:
        log_error("AgentChain", "execute_backend_tool", "Request failed", exc=error, tool_id=str(tool.id))
        error_text = str(error)
        record_action(
            {
                "params": _sanitize_request(path_params),
                "query": _sanitize_request(query_params),
                "body": _sanitize_request(body_data),
            },
            None,
            None,
            error_text,
        )
        return {"error": error_text}
