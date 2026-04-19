import asyncio
import json
import time
from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from langchain_core.messages import messages_from_dict
from langsmith.run_helpers import trace as langsmith_trace
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.database import get_session, session_scope
from ..core.logger import log_error, log_info, log_warning
from ..core.llm_config import llm_config
from ..core.user_messages import ASSISTANT_UNAVAILABLE_MESSAGE
from ..models import Message, WidgetRunStatus
from ..schemas.widget import (
    TranscriptionResponse,
    ToolResultPayload,
    WidgetChatResponse,
    WidgetConfigResponse,
    WidgetSocketErrorEnvelope,
    WidgetSocketErrorPayload,
    WidgetSocketKeepaliveEnvelope,
    WidgetSocketRequestEnvelope,
    WidgetSocketResponseEnvelope,
    WidgetMessagePayload,
)
from ..services.agent_chain import AgentExecutor
from ..services.mcp_runtime import make_db_tool_ref
from ..services.openai_responses_ws import OpenAIResponsesTransportError, OpenAIResponsesWebSocketSession
from ..services.agent_service import build_agent_executor_config
from ..services.billing_service import consume_actions_for_tool_results, get_billing_actions_summary
from ..services.knowledge_website_service import has_retrievable_knowledge_sources
from ..services.transcription_service import transcribe_audio
from ..workers.queue import get_redis_connection
from ..services.widget_service import (
    clear_pending_state,
    claim_widget_run_for_request,
    clear_widget_run_owner,
    get_agent_by_id,
    get_pending_state,
    get_tool_context,
    get_widget_chat_history,
    get_widget_config,
    get_widget_conversation,
    get_widget_run,
    is_widget_run_owned,
    save_pending_state,
    save_tool_context,
    save_widget_message,
    supersede_other_widget_runs,
)
from ..services.conversation_actions_service import ToolCallForLog, record_screen_autopilot_action, record_widget_tool_results
from ..services.widget_auth_service import WidgetJwtError, verify_widget_jwt
from ..services.user_rate_limit_service import (
    extract_client_ip,
    increment_rate_limit_usage,
    is_rate_limited,
)

router = APIRouter(prefix="/widget", tags=["widget"])

INITIAL_SOCKET_REQUEST_TIMEOUT_SECONDS = 15
SOCKET_REQUEST_TIMEOUT_SECONDS = 300
MAX_WIDGET_TOOL_ITERATIONS = 25
RESPONSES_INPUT_ITEMS_VERSION = 2
RESPONSES_INPUT_ITEMS_FORMAT = "responses_input_items"


class WidgetAuthFailure(Exception):
    def __init__(self, code: str, message: str, status_code: int = status.HTTP_401_UNAUTHORIZED):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class WidgetRequestFailure(Exception):
    def __init__(self, code: str, message: str, *, retriable: bool = False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retriable = retriable


class WidgetStateDecodeError(Exception):
    pass


@dataclass(frozen=True)
class WidgetAgentRuntime:
    id: UUID
    user_id: str
    widget_auth_enabled: bool
    user_rate_limit_enabled: bool
    user_rate_limit_daily: int | None
    user_rate_limit_monthly: int | None
    executor_config: dict[str, Any]


@dataclass
class WidgetPreloadResult:
    agent: WidgetAgentRuntime
    conversation_id: UUID
    request_id: str
    owner_token: str
    history: list[dict[str, str]]
    pending_messages: list | None
    pending_input_items: list[dict[str, Any]] | None
    active_tool_ids: list[str] | None
    pending_tool_calls: list[dict[str, Any]]
    actions_remaining: int
    hidden_response: WidgetChatResponse | None = None
    resume_response: WidgetChatResponse | None = None


@dataclass(frozen=True)
class WidgetResponsesState:
    messages: list
    input_items: list[dict[str, Any]]
    active_tool_ids: list[str]
    tool_calls: list[dict[str, Any]]
    legacy: bool = False


def _serialize_responses_window(input_items: list[dict[str, Any]]) -> str:
    return json.dumps(
        jsonable_encoder(
            {
                "version": RESPONSES_INPUT_ITEMS_VERSION,
                "format": RESPONSES_INPUT_ITEMS_FORMAT,
                "input_items": input_items,
            }
        )
    )


def serialize_tool_call(call: Any) -> dict[str, Any]:
    if hasattr(call, "model_dump"):
        return call.model_dump(by_alias=True)
    if isinstance(call, dict):
        return dict(call)
    return {
        "id": getattr(call, "id", ""),
        "type": getattr(call, "tool_type", "backend"),
        "name": getattr(call, "name", ""),
        "toolId": str(getattr(call, "tool_id", "") or "") or None,
        "method": getattr(call, "method", None),
        "path": getattr(call, "path", None),
        "params": getattr(call, "params", {}) or {},
        "query": getattr(call, "query", {}) or {},
        "body": getattr(call, "body", {}) or {},
        "headers": getattr(call, "headers", {}) or {},
        "goal": getattr(call, "goal", None),
        "context": getattr(call, "context", None),
        "actions": getattr(call, "actions", []) or [],
        "readPageOptions": getattr(call, "read_page_options", None),
        "findQuery": getattr(call, "find_query", None),
        "jsCode": getattr(call, "js_code", None),
    }


def _serialize_pending_state(
    input_items: list[dict[str, Any]],
    active_tool_ids: list[str],
    tool_calls: list,
) -> str:
    return json.dumps(
        jsonable_encoder(
            {
                "version": RESPONSES_INPUT_ITEMS_VERSION,
                "format": RESPONSES_INPUT_ITEMS_FORMAT,
                "input_items": input_items,
                "tool_ids": [str(tool_id) for tool_id in active_tool_ids],
                "tool_calls": [serialize_tool_call(call) for call in tool_calls],
            }
        )
    )


def _parse_responses_input_items(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise WidgetStateDecodeError("Responses state input_items must be a list")
    input_items: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            raise WidgetStateDecodeError("Responses state input_items must contain objects")
        input_items.append(dict(item))
    return input_items


def _normalize_tool_ref(raw: Any) -> str:
    text = str(raw or "").strip()
    if not text:
        raise WidgetStateDecodeError("Pending state contains an invalid tool_id")
    if ":" in text:
        return text
    try:
        return make_db_tool_ref(UUID(text))
    except ValueError as exc:
        raise WidgetStateDecodeError("Pending state contains an invalid tool_id") from exc


def _parse_tool_ids(payload: Any) -> list[str]:
    if not isinstance(payload, list):
        raise WidgetStateDecodeError("Pending state tool_ids must be a list")
    tool_ids: list[str] = []
    for tool_id in payload:
        tool_ids.append(_normalize_tool_ref(tool_id))
    return tool_ids


def _parse_serialized_tool_calls(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        raise WidgetStateDecodeError("Pending state tool_calls must be a list")
    tool_calls: list[dict[str, Any]] = []
    for call in payload:
        if not isinstance(call, dict):
            raise WidgetStateDecodeError("Pending state tool_calls must contain objects")
        call_id = str(call.get("id") or "").strip()
        if not call_id:
            raise WidgetStateDecodeError("Pending state tool_calls must include id")
        tool_calls.append(dict(call))
    return tool_calls


def _deserialize_legacy_messages(data: Any) -> list:
    if not isinstance(data, list):
        raise WidgetStateDecodeError("Legacy widget state must be a message list")
    try:
        return messages_from_dict(data)
    except (TypeError, KeyError) as exc:
        raise WidgetStateDecodeError("Legacy widget state could not be deserialized") from exc


def deserialize_tool_context_state(data: str) -> WidgetResponsesState | None:
    try:
        payload = json.loads(data)
    except json.JSONDecodeError as exc:
        log_error("WidgetController", "deserialize_tool_context_state", "Failed to deserialize", exc=exc)
        return None

    try:
        if isinstance(payload, dict) and (
            payload.get("version") == RESPONSES_INPUT_ITEMS_VERSION
            or payload.get("format") == RESPONSES_INPUT_ITEMS_FORMAT
            or "input_items" in payload
        ):
            return WidgetResponsesState(
                messages=[],
                input_items=_parse_responses_input_items(payload.get("input_items")),
                active_tool_ids=[],
                tool_calls=[],
                legacy=False,
            )
        messages = _deserialize_legacy_messages(payload)
        return WidgetResponsesState(
            messages=messages,
            input_items=OpenAIResponsesWebSocketSession.messages_to_input_items(messages),
            active_tool_ids=[],
            tool_calls=[],
            legacy=True,
        )
    except WidgetStateDecodeError as exc:
        log_error("WidgetController", "deserialize_tool_context_state", "Failed to deserialize", exc=exc)
        return None


def deserialize_pending_state(state: str) -> WidgetResponsesState:
    try:
        payload = json.loads(state)
    except json.JSONDecodeError as exc:
        log_error("WidgetController", "deserialize_pending_state", "Failed to deserialize", exc=exc)
        return WidgetResponsesState(messages=[], input_items=[], active_tool_ids=[], tool_calls=[], legacy=True)

    try:
        if isinstance(payload, dict) and (
            payload.get("version") == RESPONSES_INPUT_ITEMS_VERSION
            or payload.get("format") == RESPONSES_INPUT_ITEMS_FORMAT
            or "input_items" in payload
        ):
            return WidgetResponsesState(
                messages=[],
                input_items=_parse_responses_input_items(payload.get("input_items")),
                active_tool_ids=_parse_tool_ids(payload.get("tool_ids")),
                tool_calls=_parse_serialized_tool_calls(payload.get("tool_calls")),
                legacy=False,
            )
        if not isinstance(payload, dict):
            raise WidgetStateDecodeError("Legacy pending state must be an object")
        messages = _deserialize_legacy_messages(payload.get("messages"))
        tool_calls: list[dict[str, Any]] = []
        for call in payload.get("tool_calls") or []:
            if not isinstance(call, dict):
                continue
            call_id = str(call.get("id") or "").strip()
            if not call_id:
                continue
            tool_calls.append(dict(call))
        return WidgetResponsesState(
            messages=messages,
            input_items=OpenAIResponsesWebSocketSession.messages_to_input_items(messages),
            active_tool_ids=[_normalize_tool_ref(tool_id) for tool_id in payload.get("tool_ids") or []],
            tool_calls=tool_calls,
            legacy=True,
        )
    except (KeyError, TypeError, ValueError) as exc:
        log_error("WidgetController", "deserialize_pending_state", "Failed to deserialize", exc=exc)
        return WidgetResponsesState(messages=[], input_items=[], active_tool_ids=[], tool_calls=[], legacy=True)


def validate_widget_auth_token(agent_id: UUID, enabled: bool, token: str | None) -> None:
    if not enabled:
        return
    credentials = str(token or "").strip()
    if not credentials:
        raise WidgetAuthFailure("WIDGET_AUTH_REQUIRED", "Signed widget token required")
    settings = get_settings()
    if not settings.widget_jwt_secret:
        raise WidgetAuthFailure(
            "WIDGET_AUTH_UNAVAILABLE",
            "Widget JWT secret missing",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    try:
        verify_widget_jwt(token=credentials, expected_agent_id=agent_id, secret=settings.widget_jwt_secret)
    except WidgetJwtError as exc:
        raise WidgetAuthFailure(exc.code, exc.message)


def require_widget_auth(request: Request, agent_id: UUID, enabled: bool) -> None:
    auth_header = request.headers.get("authorization") or ""
    if not auth_header:
        token = None
    else:
        scheme, _, credentials = auth_header.partition(" ")
        if scheme.lower() != "bearer" or not credentials.strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "WIDGET_AUTH_INVALID", "message": "Invalid authorization header"},
            )
        token = credentials.strip()
    try:
        validate_widget_auth_token(agent_id, enabled, token)
    except WidgetAuthFailure as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message})


def extract_websocket_client_ip(websocket: WebSocket) -> str:
    forwarded = websocket.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if websocket.client and websocket.client.host:
        return websocket.client.host
    return "unknown"


def get_widget_redis_client():
    try:
        return get_redis_connection()
    except Exception as error:
        log_warning("WidgetController", "get_widget_redis_client", "Redis unavailable for widget session", error=str(error))
        return None


def is_widget_rate_limited(agent, redis_client, client_ip: str) -> bool:
    return bool(
        agent.user_rate_limit_enabled
        and redis_client
        and (agent.user_rate_limit_daily or agent.user_rate_limit_monthly)
        and is_rate_limited(
            redis_client,
            agent.id,
            client_ip,
            agent.user_rate_limit_daily,
            agent.user_rate_limit_monthly,
        )
    )


def build_logged_tool_calls(tool_calls: list) -> list[ToolCallForLog]:
    logged_calls: list[ToolCallForLog] = []
    for call in tool_calls:
        if isinstance(call, dict):
            call_id = str(call.get("id") or "").strip()
            tool_type = str(call.get("type") or call.get("tool_type") or "backend")
            tool_id_raw = call.get("toolId") or call.get("tool_id")
            if tool_type in ("backend", "frontend"):
                if isinstance(tool_id_raw, UUID):
                    tool_id = tool_id_raw
                else:
                    try:
                        tool_id = UUID(tool_id_raw) if tool_id_raw else None
                    except (AttributeError, TypeError, ValueError):
                        tool_id = None
            else:
                tool_id = None
            params = call.get("params") or {}
            query = call.get("query") or {}
            body = call.get("body") or {}
        else:
            call_id = getattr(call, "id", "")
            tool_type = getattr(call, "tool_type", "backend")
            tool_id = getattr(call, "tool_id", None) if tool_type in ("backend", "frontend") else None
            params = getattr(call, "params", {}) or {}
            query = getattr(call, "query", {}) or {}
            body = getattr(call, "body", {}) or {}
        if not call_id or tool_type not in ("backend", "frontend", "js_exec"):
            continue
        logged_calls.append(ToolCallForLog(
            id=call_id,
            tool_type=tool_type,
            tool_id=tool_id,
            params=params,
            query=query,
            body=body,
        ))
    return logged_calls


def build_widget_agent_runtime(session: Session, agent) -> WidgetAgentRuntime:
    executor_config = dict(build_agent_executor_config(agent))
    executor_config["knowledge_base_enabled"] = (
        bool(executor_config.get("knowledge_base_enabled"))
        and has_retrievable_knowledge_sources(session, agent.user_id)
    )
    return WidgetAgentRuntime(
        id=agent.id,
        user_id=agent.user_id,
        widget_auth_enabled=agent.widget_auth_enabled,
        user_rate_limit_enabled=agent.user_rate_limit_enabled,
        user_rate_limit_daily=agent.user_rate_limit_daily,
        user_rate_limit_monthly=agent.user_rate_limit_monthly,
        executor_config=executor_config,
    )


def build_widget_hidden_response(conversation_id: UUID, actions_remaining: int, request_id: str | None = None) -> WidgetChatResponse:
    return WidgetChatResponse(
        conversationId=conversation_id,
        requestId=request_id,
        messages=[WidgetMessagePayload(role="assistant", content=ASSISTANT_UNAVAILABLE_MESSAGE)],
        toolCalls=[],
        suggestions=[],
        done=True,
        isWidgetHidden=True,
        actionsRemaining=actions_remaining,
    )

def build_widget_resume_response(
    *,
    conversation_id: UUID,
    request_id: str,
    actions_remaining: int,
    assistant_message: Message | None = None,
    tool_calls: list | None = None,
    done: bool | None = None,
) -> WidgetChatResponse:
    messages = []
    response_done = done if done is not None else assistant_message is not None
    is_hidden_response = assistant_message is not None and assistant_message.role == "assistant_hidden"
    if assistant_message is not None:
        messages.append(WidgetMessagePayload(role="assistant", content=assistant_message.content))
    return WidgetChatResponse(
        conversationId=conversation_id,
        requestId=request_id,
        messages=messages,
        toolCalls=tool_calls or [],
        suggestions=[],
        done=response_done,
        isWidgetHidden=is_hidden_response or actions_remaining <= 0,
        actionsRemaining=actions_remaining,
    )


def redact_owner_token(owner_token: str | None) -> str:
    token = str(owner_token or "").strip()
    if not token:
        return ""
    if len(token) <= 10:
        return f"{token[:4]}..."
    return f"{token[:6]}...{token[-4:]}"


def finalize_hidden_widget_run(
    session: Session,
    *,
    conversation_id: UUID,
    request_id: str,
    run,
    actions_remaining: int,
) -> WidgetChatResponse:
    if run.assistant_message_id is None:
        hidden_message = save_widget_message(session, conversation_id, "assistant_hidden", ASSISTANT_UNAVAILABLE_MESSAGE)
        run.assistant_message_id = hidden_message.id
    clear_pending_state(session, conversation_id)
    run.status = WidgetRunStatus.completed
    run.owner_token = None
    session.flush()
    return build_widget_hidden_response(conversation_id, actions_remaining, request_id)


def can_replay_pending_tool_calls(tool_calls: list[dict[str, Any]]) -> bool:
    if not tool_calls:
        return False
    for call in tool_calls:
        if not isinstance(call, dict):
            return False
        tool_type = str(call.get("type") or call.get("tool_type") or "").strip()
        if not str(call.get("id") or "").strip():
            return False
        if not tool_type:
            return False
        if tool_type in ("backend", "frontend") and not str(call.get("name") or "").strip():
            return False
    return True


def preload_widget_request(
    *,
    payload,
    widget_token: str | None,
    agent: WidgetAgentRuntime | None,
    conversation_id: UUID | None,
    request_id: str | None,
    owner_token: str | None,
    pending_messages,
    pending_input_items: list[dict[str, Any]] | None,
    active_tool_ids,
    pending_tool_calls: list[dict[str, Any]],
    redis_client,
    client_ip: str,
) -> WidgetPreloadResult:
    with session_scope() as session:
        resolved_agent = agent
        resolved_conversation_id = conversation_id
        incoming_request_id = str(payload.request_id or "").strip()
        if not incoming_request_id:
            raise WidgetRequestFailure("REQUEST_ID_REQUIRED", "Request id is required")
        resolved_request_id = request_id
        if resolved_request_id and incoming_request_id != resolved_request_id:
            raise WidgetRequestFailure("INVALID_REQUEST", "Invalid widget session request")
        resolved_request_id = incoming_request_id
        resolved_owner_token = owner_token or str(uuid4())
        if resolved_agent is None:
            agent_record = get_agent_by_id(session, payload.agent_id)
            if not agent_record:
                raise WidgetRequestFailure("AGENT_NOT_FOUND", "Agent not found")
            validate_widget_auth_token(payload.agent_id, agent_record.widget_auth_enabled, widget_token)
            if is_widget_rate_limited(agent_record, redis_client, client_ip):
                raise WidgetRequestFailure("RATE_LIMITED", "You've reached your usage limit. Please try again later.")
            if payload.conversation_id:
                conversation = get_widget_conversation(session, payload.conversation_id, payload.agent_id)
                if not conversation:
                    raise WidgetRequestFailure("CONVERSATION_NOT_FOUND", "Conversation not found")
                resolved_conversation_id = conversation.id
            resolved_agent = build_widget_agent_runtime(session, agent_record)
        else:
            if payload.agent_id != resolved_agent.id:
                raise WidgetRequestFailure("INVALID_REQUEST", "Invalid widget session request")
            if resolved_conversation_id is None:
                raise WidgetRequestFailure("INVALID_REQUEST", "Invalid widget session request")
            if payload.conversation_id and payload.conversation_id != resolved_conversation_id:
                raise WidgetRequestFailure("INVALID_REQUEST", "Invalid widget session request")
            if is_widget_rate_limited(resolved_agent, redis_client, client_ip):
                raise WidgetRequestFailure("RATE_LIMITED", "You've reached your usage limit. Please try again later.")

        run, _created = claim_widget_run_for_request(
            session,
            resolved_agent.id,
            resolved_request_id,
            resolved_owner_token,
            conversation_id=payload.conversation_id or resolved_conversation_id,
            message=payload.message,
        )
        resolved_conversation_id = run.conversation_id
        requested_conversation_id = payload.conversation_id or conversation_id
        if requested_conversation_id and requested_conversation_id != resolved_conversation_id:
            raise WidgetRequestFailure(
                "REQUEST_CONVERSATION_MISMATCH",
                "Request id belongs to a different conversation",
            )
        if run.status == WidgetRunStatus.superseded:
            raise WidgetRequestFailure("RUN_SUPERSEDED", "This request has been replaced by a newer one.")

        superseded_request_ids = supersede_other_widget_runs(
            session,
            resolved_conversation_id,
            resolved_request_id,
        )
        if superseded_request_ids:
            if payload.message and run.status != WidgetRunStatus.waiting_for_tools:
                clear_pending_state(session, resolved_conversation_id)
            log_info(
                "WidgetController",
                "preload_widget_request",
                "Superseded older widget runs",
                conversation_id=str(resolved_conversation_id),
                request_id=resolved_request_id,
                owner_token=redact_owner_token(resolved_owner_token),
                superseded_count=len(superseded_request_ids),
            )

        resolved_pending_messages = pending_messages
        resolved_pending_input_items = pending_input_items
        resolved_active_tool_ids = active_tool_ids
        resolved_pending_tool_calls = list(pending_tool_calls)
        exclude_message_id = run.user_message_id if payload.message and run.user_message_id else None

        if payload.message and run.user_message_id is not None:
            existing_user_message = session.get(Message, run.user_message_id)
            if existing_user_message is None or existing_user_message.content != payload.message:
                raise WidgetRequestFailure(
                    "REQUEST_PAYLOAD_MISMATCH",
                    "Request id belongs to a different user message",
                )

        if payload.tool_results and resolved_pending_input_items is None:
            pending_state = get_pending_state(session, resolved_conversation_id)
            if pending_state:
                try:
                    decoded_state = deserialize_pending_state(pending_state)
                except WidgetStateDecodeError as exc:
                    log_error("WidgetController", "preload_widget_request", "Invalid pending state", exc=exc)
                    run.status = WidgetRunStatus.failed
                    run.owner_token = None
                    session.flush()
                    raise WidgetRequestFailure(
                        "PENDING_STATE_INVALID",
                        "Couldn't resume this request. Please try again.",
                        retriable=True,
                    ) from exc
                resolved_pending_messages = decoded_state.messages or None
                resolved_pending_input_items = decoded_state.input_items
                resolved_active_tool_ids = decoded_state.active_tool_ids
                resolved_pending_tool_calls = decoded_state.tool_calls

        if payload.tool_results:
            if run.status == WidgetRunStatus.completed:
                assistant_message = session.get(Message, run.assistant_message_id) if run.assistant_message_id else None
                summary = get_billing_actions_summary(session, resolved_agent.user_id)
                return WidgetPreloadResult(
                    agent=resolved_agent,
                    conversation_id=resolved_conversation_id,
                    request_id=resolved_request_id,
                    owner_token=resolved_owner_token,
                    history=[],
                    pending_messages=resolved_pending_messages,
                    pending_input_items=resolved_pending_input_items,
                    active_tool_ids=resolved_active_tool_ids,
                    pending_tool_calls=resolved_pending_tool_calls,
                    actions_remaining=summary.total_remaining,
                    resume_response=build_widget_resume_response(
                        conversation_id=resolved_conversation_id,
                        request_id=resolved_request_id,
                        actions_remaining=summary.total_remaining,
                        assistant_message=assistant_message,
                        done=True,
                    ),
                )
            run.status = WidgetRunStatus.running
            actions_remaining = process_widget_tool_results(
                session,
                agent=resolved_agent,
                conversation_id=resolved_conversation_id,
                tool_results=payload.tool_results,
                pending_tool_calls=resolved_pending_tool_calls,
                redis_client=redis_client,
                client_ip=client_ip,
            )
            if actions_remaining <= 0:
                hidden_response = finalize_hidden_widget_run(
                    session,
                    conversation_id=resolved_conversation_id,
                    request_id=resolved_request_id,
                    run=run,
                    actions_remaining=actions_remaining,
                )
                return WidgetPreloadResult(
                    agent=resolved_agent,
                    conversation_id=resolved_conversation_id,
                    request_id=resolved_request_id,
                    owner_token=resolved_owner_token,
                    history=[],
                    pending_messages=resolved_pending_messages,
                    pending_input_items=resolved_pending_input_items,
                    active_tool_ids=resolved_active_tool_ids,
                    pending_tool_calls=resolved_pending_tool_calls,
                    actions_remaining=actions_remaining,
                    hidden_response=hidden_response,
                )
        else:
            summary = get_billing_actions_summary(session, resolved_agent.user_id)
            actions_remaining = summary.total_remaining
            if summary.is_widget_hidden:
                hidden_response = finalize_hidden_widget_run(
                    session,
                    conversation_id=resolved_conversation_id,
                    request_id=resolved_request_id,
                    run=run,
                    actions_remaining=actions_remaining,
                )
                return WidgetPreloadResult(
                    agent=resolved_agent,
                    conversation_id=resolved_conversation_id,
                    request_id=resolved_request_id,
                    owner_token=resolved_owner_token,
                    history=[],
                    pending_messages=resolved_pending_messages,
                    pending_input_items=resolved_pending_input_items,
                    active_tool_ids=resolved_active_tool_ids,
                    pending_tool_calls=resolved_pending_tool_calls,
                    actions_remaining=actions_remaining,
                    hidden_response=hidden_response,
                )
            if run.status == WidgetRunStatus.completed:
                assistant_message = session.get(Message, run.assistant_message_id) if run.assistant_message_id else None
                return WidgetPreloadResult(
                    agent=resolved_agent,
                    conversation_id=resolved_conversation_id,
                    request_id=resolved_request_id,
                    owner_token=resolved_owner_token,
                    history=[],
                    pending_messages=resolved_pending_messages,
                    pending_input_items=resolved_pending_input_items,
                    active_tool_ids=resolved_active_tool_ids,
                    pending_tool_calls=resolved_pending_tool_calls,
                    actions_remaining=actions_remaining,
                    resume_response=build_widget_resume_response(
                        conversation_id=resolved_conversation_id,
                        request_id=resolved_request_id,
                        actions_remaining=actions_remaining,
                        assistant_message=assistant_message,
                        done=True,
                    ),
                )
            if run.status == WidgetRunStatus.waiting_for_tools:
                pending_state = get_pending_state(session, resolved_conversation_id)
                if pending_state:
                    try:
                        decoded_state = deserialize_pending_state(pending_state)
                    except WidgetStateDecodeError as exc:
                        log_error("WidgetController", "preload_widget_request", "Invalid pending state", exc=exc)
                        run.status = WidgetRunStatus.failed
                        run.owner_token = None
                        session.flush()
                        raise WidgetRequestFailure(
                            "PENDING_STATE_INVALID",
                            "Couldn't resume this request. Please try again.",
                            retriable=True,
                        ) from exc
                    resolved_pending_messages = decoded_state.messages or None
                    resolved_pending_input_items = decoded_state.input_items
                    resolved_active_tool_ids = decoded_state.active_tool_ids
                    resolved_pending_tool_calls = decoded_state.tool_calls
                if can_replay_pending_tool_calls(resolved_pending_tool_calls):
                    return WidgetPreloadResult(
                        agent=resolved_agent,
                        conversation_id=resolved_conversation_id,
                        request_id=resolved_request_id,
                        owner_token=resolved_owner_token,
                        history=[],
                        pending_messages=resolved_pending_messages,
                        pending_input_items=resolved_pending_input_items,
                        active_tool_ids=resolved_active_tool_ids,
                        pending_tool_calls=resolved_pending_tool_calls,
                        actions_remaining=actions_remaining,
                        resume_response=build_widget_resume_response(
                            conversation_id=resolved_conversation_id,
                            request_id=resolved_request_id,
                            actions_remaining=actions_remaining,
                            tool_calls=resolved_pending_tool_calls,
                        ),
                    )

        if payload.message and run.user_message_id is None:
            user_message = save_widget_message(session, resolved_conversation_id, "user", payload.message)
            run.user_message_id = user_message.id
            exclude_message_id = user_message.id
            session.flush()
            log_info(
                "WidgetController",
                "preload_widget_request",
                "Persisted widget user message",
                conversation_id=str(resolved_conversation_id),
                request_id=resolved_request_id,
                owner_token=redact_owner_token(resolved_owner_token),
            )
        elif payload.message and run.user_message_id is not None:
            log_info(
                "WidgetController",
                "preload_widget_request",
                "Reused existing widget user message",
                conversation_id=str(resolved_conversation_id),
                request_id=resolved_request_id,
                owner_token=redact_owner_token(resolved_owner_token),
            )

        history = get_widget_chat_history(session, resolved_conversation_id, exclude_message_id=exclude_message_id)
        if not payload.message and not payload.tool_results:
            raise WidgetRequestFailure("INVALID_REQUEST", "Message or tool results required")

        if not payload.tool_results and resolved_pending_input_items is None:
            tool_context_data = get_tool_context(session, resolved_conversation_id)
            if tool_context_data:
                decoded_context = deserialize_tool_context_state(tool_context_data)
                if decoded_context is not None:
                    resolved_pending_messages = decoded_context.messages or None
                    resolved_pending_input_items = decoded_context.input_items

        return WidgetPreloadResult(
            agent=resolved_agent,
            conversation_id=resolved_conversation_id,
            request_id=resolved_request_id,
            owner_token=resolved_owner_token,
            history=history,
            pending_messages=resolved_pending_messages,
            pending_input_items=resolved_pending_input_items,
            active_tool_ids=resolved_active_tool_ids,
            pending_tool_calls=resolved_pending_tool_calls,
            actions_remaining=actions_remaining,
        )


def _build_result_input_items(result) -> list[dict[str, Any]]:
    if result.responses_input_items:
        return list(result.responses_input_items)
    if result.messages:
        return OpenAIResponsesWebSocketSession.messages_to_input_items(result.messages)
    return []


def persist_widget_result(
    *,
    conversation_id: UUID,
    request_id: str,
    owner_token: str,
    result,
) -> bool:
    with session_scope() as session:
        if not is_widget_run_owned(session, conversation_id, request_id, owner_token, for_update=True):
            log_info(
                "WidgetController",
                "persist_widget_result",
                "Dropped stale widget result after ownership loss",
                conversation_id=str(conversation_id),
                request_id=request_id,
                owner_token=redact_owner_token(owner_token),
            )
            return False
        run = get_widget_run(session, conversation_id, request_id, for_update=True)
        if not run:
            return False
        result_input_items = _build_result_input_items(result)
        if result.done and result.response:
            if run.assistant_message_id is None:
                assistant_message = save_widget_message(session, conversation_id, "assistant", result.response)
                run.assistant_message_id = assistant_message.id
            else:
                log_info(
                    "WidgetController",
                    "persist_widget_result",
                    "Skipped duplicate assistant persistence for widget run",
                    conversation_id=str(conversation_id),
                    request_id=request_id,
                    owner_token=redact_owner_token(owner_token),
                )
            clear_pending_state(session, conversation_id)
            save_tool_context(session, conversation_id, _serialize_responses_window(result_input_items))
            run.status = WidgetRunStatus.completed
            run.owner_token = None
            session.flush()
            return True
        if result.tool_calls:
            save_pending_state(
                session,
                conversation_id,
                _serialize_pending_state(result_input_items, result.active_tool_ids, result.tool_calls),
            )
            run.status = WidgetRunStatus.waiting_for_tools
            session.flush()
            return True
        save_tool_context(session, conversation_id, _serialize_responses_window(result_input_items))
        clear_pending_state(session, conversation_id)
        run.status = WidgetRunStatus.completed
        run.owner_token = None
        session.flush()
        return True


def process_widget_tool_results(
    session: Session,
    *,
    agent,
    conversation_id: UUID,
    tool_results: list[ToolResultPayload],
    pending_tool_calls: list[dict[str, Any]],
    redis_client,
    client_ip: str,
) -> int:
    logged_tool_calls = build_logged_tool_calls(pending_tool_calls)
    tool_call_type_map = {tc.id: tc.tool_type for tc in logged_tool_calls}
    billable_ids = [
        result.id
        for result in tool_results
        if tool_call_type_map.get(result.id) in ("backend", "frontend", "js_exec") and result.consume_action
    ]

    consume_result = consume_actions_for_tool_results(
        session,
        agent.user_id,
        conversation_id,
        billable_ids,
    )
    if consume_result.consumed > 0 and redis_client and agent.user_rate_limit_enabled:
        increment_rate_limit_usage(redis_client, agent.id, client_ip, consume_result.consumed)

    if logged_tool_calls:
        record_widget_tool_results(
            session,
            agent.user_id,
            conversation_id,
            tool_results=tool_results,
            tool_calls=logged_tool_calls,
        )
        for result in tool_results:
            tool_call = tool_call_type_map.get(result.id)
            if tool_call not in ("frontend", "js_exec") or not result.body:
                continue
            body = result.body if isinstance(result.body, dict) else {}
            if tool_call == "frontend" and body.get("kind") != "frontend_actions":
                continue
            record_screen_autopilot_action(
                session,
                agent.user_id,
                conversation_id,
                tool_call_id=result.id,
                goal=body.get("goal", "") if tool_call == "frontend" else "JavaScript execution",
                url=body.get("url", ""),
                actions=body.get("results", []),
                status_code=result.status_code,
                error=result.error or body.get("error"),
            )
    return consume_result.remaining


def mark_widget_run_failed(conversation_id: UUID | None, request_id: str | None, owner_token: str | None) -> None:
    if not conversation_id or not request_id or not owner_token:
        return
    with session_scope() as session:
        if not is_widget_run_owned(session, conversation_id, request_id, owner_token, for_update=True):
            return
        run = get_widget_run(session, conversation_id, request_id, for_update=True)
        if run:
            run.status = WidgetRunStatus.failed
            run.owner_token = None
            session.flush()


async def send_socket_json(websocket: WebSocket, send_lock: asyncio.Lock, payload: dict) -> None:
    async with send_lock:
        await websocket.send_json(jsonable_encoder(payload))


async def keepalive_loop(websocket: WebSocket, send_lock: asyncio.Lock, stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=20)
        except asyncio.TimeoutError:
            try:
                payload = WidgetSocketKeepaliveEnvelope().model_dump()
                await send_socket_json(websocket, send_lock, payload)
            except Exception:
                return


@router.get("/config/{agent_id}", response_model=WidgetConfigResponse)
def get_widget_config_route(
    request: Request,
    agent_id: UUID,
    session: Session = Depends(get_session)
) -> WidgetConfigResponse:
    try:
        agent = get_agent_by_id(session, agent_id)
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        
        # Get Redis and client IP for rate limit checking
        try:
            redis_client = get_redis_connection()
        except Exception:
            redis_client = None
        client_ip = extract_client_ip(request)
        
        config = get_widget_config(session, agent, redis_client, client_ip)
        log_info("WidgetController", "get_widget_config", "Config fetched", agent_id=str(agent_id))
        return config
    except HTTPException:
        raise
    except Exception as error:
        log_error("WidgetController", "get_widget_config", "Failed to fetch config", exc=error)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch config")


@router.websocket("/session")
async def widget_session(
    websocket: WebSocket,
) -> None:
    await websocket.accept()
    settings = get_settings()
    send_lock = asyncio.Lock()
    keepalive_stop = asyncio.Event()
    keepalive_task: asyncio.Task | None = None
    transport: OpenAIResponsesWebSocketSession | None = None
    executor: AgentExecutor | None = None
    pending_messages = None
    pending_input_items: list[dict[str, Any]] | None = None
    active_tool_ids = None
    pending_tool_calls: list[dict[str, Any]] = []
    conversation_id: UUID | None = None
    request_id: str | None = None
    owner_token: str | None = None
    agent: WidgetAgentRuntime | None = None
    redis_client = get_widget_redis_client()
    client_ip = extract_websocket_client_ip(websocket)
    run_started_at = time.perf_counter()
    iteration_count = 0
    tool_call_count = 0
    widget_trace_context = None
    widget_trace_run = None
    widget_trace_opened = False
    widget_trace_outputs: dict | None = None
    widget_trace_error: str | None = None

    def set_trace_outputs(outputs: dict) -> None:
        nonlocal widget_trace_outputs
        if widget_trace_outputs is None:
            widget_trace_outputs = outputs

    def set_trace_error(error: str) -> None:
        nonlocal widget_trace_error
        if widget_trace_error is None:
            widget_trace_error = error

    async def send_error(code: str, message: str, *, retriable: bool = False) -> None:
        set_trace_error(f"{code}: {message}")
        envelope = WidgetSocketErrorEnvelope(
            error=WidgetSocketErrorPayload(code=code, message=message, retriable=retriable)
        ).model_dump(by_alias=True)
        await send_socket_json(websocket, send_lock, envelope)

    try:
        while True:
            receive_timeout = INITIAL_SOCKET_REQUEST_TIMEOUT_SECONDS if agent is None else SOCKET_REQUEST_TIMEOUT_SECONDS
            try:
                raw_payload = await asyncio.wait_for(websocket.receive_json(), timeout=receive_timeout)
            except asyncio.TimeoutError:
                if agent is None:
                    log_info(
                        "WidgetController",
                        "widget_session",
                        "Closing idle widget session before first request",
                        timeout_seconds=receive_timeout,
                    )
                    await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Initial request timeout")
                else:
                    log_info(
                        "WidgetController",
                        "widget_session",
                        "Widget session timed out waiting for next client message",
                        conversation_id=str(conversation_id) if conversation_id else "",
                        timeout_seconds=receive_timeout,
                    )
                    await send_error("SESSION_TIMEOUT", "Widget session timed out", retriable=True)
                return
            envelope = WidgetSocketRequestEnvelope.model_validate(raw_payload)
            payload = envelope.request
            if payload.tool_results and iteration_count >= MAX_WIDGET_TOOL_ITERATIONS:
                log_warning(
                    "WidgetController",
                    "widget_session",
                    "Widget session exceeded tool iteration cap",
                    conversation_id=str(conversation_id) if conversation_id else "",
                    iteration_count=iteration_count,
                )
                await send_error(
                    "MAX_TOOL_ITERATIONS_EXCEEDED",
                    "Widget session exceeded the maximum number of tool iterations",
                )
                return

            preload_started_at = time.perf_counter()
            try:
                preload = preload_widget_request(
                    payload=payload,
                    widget_token=envelope.widget_token,
                    agent=agent,
                    conversation_id=conversation_id,
                    request_id=request_id,
                    owner_token=owner_token,
                    pending_messages=pending_messages,
                    pending_input_items=pending_input_items,
                    active_tool_ids=active_tool_ids,
                    pending_tool_calls=pending_tool_calls,
                    redis_client=redis_client,
                    client_ip=client_ip,
                )
            except WidgetAuthFailure as error:
                log_warning(
                    "WidgetController",
                    "widget_session",
                    "Widget auth failed during preload",
                    code=error.code,
                    conversation_id=str(conversation_id) if conversation_id else "",
                )
                await send_error(error.code, error.message)
                return
            except WidgetRequestFailure as error:
                await send_error(error.code, error.message, retriable=error.retriable)
                return
            except Exception as error:
                log_error("WidgetController", "widget_session", "Widget preload phase failed", exc=error)
                await send_error("SESSION_FAILED", "Failed to process chat request")
                return

            agent = preload.agent
            conversation_id = preload.conversation_id
            request_id = preload.request_id
            owner_token = preload.owner_token
            pending_messages = preload.pending_messages
            pending_input_items = preload.pending_input_items
            active_tool_ids = preload.active_tool_ids
            pending_tool_calls = preload.pending_tool_calls
            actions_remaining = preload.actions_remaining

            log_info(
                "WidgetController",
                "widget_session",
                "Widget frame preloaded",
                conversation_id=str(conversation_id),
                request_id=request_id,
                owner_token=redact_owner_token(owner_token),
                preload_ms=int((time.perf_counter() - preload_started_at) * 1000),
                has_tool_results=bool(payload.tool_results),
            )

            if preload.hidden_response is not None:
                await send_socket_json(
                    websocket,
                    send_lock,
                    WidgetSocketResponseEnvelope(response=preload.hidden_response).model_dump(by_alias=True),
                )
                log_info(
                    "WidgetController",
                    "widget_session",
                    "Widget hidden during preload",
                    conversation_id=str(conversation_id),
                    request_id=request_id,
                )
                set_trace_outputs({"status": "widget_hidden"})
                return

            if preload.resume_response is not None:
                await send_socket_json(
                    websocket,
                    send_lock,
                    WidgetSocketResponseEnvelope(response=preload.resume_response).model_dump(by_alias=True),
                )
                if preload.resume_response.done or not preload.resume_response.tool_calls:
                    log_info(
                        "WidgetController",
                        "widget_session",
                        "Replayed stored widget response",
                        conversation_id=str(conversation_id),
                        request_id=request_id,
                        owner_token=redact_owner_token(owner_token),
                    )
                    set_trace_outputs(
                        {
                            "status": "completed",
                            "response": preload.resume_response.messages[0].content if preload.resume_response.messages else "",
                            "suggestion_count": len(preload.resume_response.suggestions or []),
                        }
                    )
                    return
                log_info(
                    "WidgetController",
                    "widget_session",
                    "Replayed pending widget tool calls",
                    conversation_id=str(conversation_id),
                    request_id=request_id,
                    owner_token=redact_owner_token(owner_token),
                    tool_call_count=len(preload.resume_response.tool_calls),
                )
                continue

            if transport is None:
                transport = OpenAIResponsesWebSocketSession(
                    api_key=settings.openai_api_key,
                    model=llm_config.chat_model,
                    temperature=llm_config.temperature,
                )
                executor = AgentExecutor(
                    None,
                    agent.user_id,
                    conversation_id=conversation_id,
                    redis_client=redis_client,
                    responses_transport=transport,
                    session_provider=session_scope,
                    **agent.executor_config,
                )
                if settings.langsmith_tracing:
                    widget_trace_context = langsmith_trace(
                        "widget-session",
                        run_type="chain",
                        inputs={
                            "agent_id": str(agent.id),
                            "conversation_id": str(conversation_id),
                            "request_id": request_id,
                            "message": payload.message or "",
                            "has_tool_results": bool(payload.tool_results),
                        },
                        tags=["widget-session"],
                        metadata={
                            "agent_id": str(agent.id),
                            "conversation_id": str(conversation_id),
                            "request_id": request_id,
                            "user_id": agent.user_id,
                            "transport": "widget_websocket",
                            "model": llm_config.chat_model,
                        },
                    )
                    widget_trace_run = await widget_trace_context.__aenter__()
                    widget_trace_opened = True
                keepalive_task = asyncio.create_task(keepalive_loop(websocket, send_lock, keepalive_stop))
                log_info(
                    "WidgetController",
                    "widget_session",
                    "Widget run started",
                    conversation_id=str(conversation_id),
                    request_id=request_id,
                    owner_token=redact_owner_token(owner_token),
                    agent_id=str(agent.id),
                )

            try:
                if hasattr(executor, "set_mcp_auth_bundles"):
                    executor.set_mcp_auth_bundles(
                        {
                            connection_id: bundle.model_dump(by_alias=True)
                            for connection_id, bundle in (payload.mcp_auth_bundles or {}).items()
                        }
                    )
                execution_started_at = time.perf_counter()
                result = await executor.run_step(
                    user_message=payload.message,
                    conversation_history=preload.history,
                    tool_results=payload.tool_results,
                    pending_messages=pending_messages,
                    active_tool_ids=active_tool_ids,
                    pending_input_items=pending_input_items,
                )
            except OpenAIResponsesTransportError as error:
                mark_widget_run_failed(conversation_id, request_id, owner_token)
                log_error(
                    "WidgetController",
                    "widget_session",
                    "OpenAI responses websocket failed",
                    exc=error,
                    code=error.code,
                )
                await send_error(error.code, error.message, retriable=error.retriable)
                return
            except Exception as error:
                mark_widget_run_failed(conversation_id, request_id, owner_token)
                log_error("WidgetController", "widget_session", "Widget execution phase failed", exc=error)
                await send_error("SESSION_FAILED", "Failed to process chat request")
                return

            log_info(
                "WidgetController",
                "widget_session",
                "Widget frame executed",
                conversation_id=str(conversation_id),
                request_id=request_id,
                owner_token=redact_owner_token(owner_token),
                execution_ms=int((time.perf_counter() - execution_started_at) * 1000),
                done=result.done,
                tool_count=len(result.tool_calls),
            )

            response_messages: list[WidgetMessagePayload] = []
            persist_started_at = time.perf_counter()
            try:
                persisted = persist_widget_result(
                    conversation_id=conversation_id,
                    request_id=request_id,
                    owner_token=owner_token,
                    result=result,
                )
            except Exception as error:
                mark_widget_run_failed(conversation_id, request_id, owner_token)
                log_error("WidgetController", "widget_session", "Widget persist phase failed", exc=error)
                await send_error("SESSION_FAILED", "Failed to process chat request")
                return

            if not persisted:
                set_trace_outputs({"status": "superseded"})
                try:
                    await send_error("RUN_SUPERSEDED", "This request has been replaced by a newer one.")
                except Exception:
                    pass
                return

            log_info(
                "WidgetController",
                "widget_session",
                "Widget frame persisted",
                conversation_id=str(conversation_id),
                request_id=request_id,
                owner_token=redact_owner_token(owner_token),
                persist_ms=int((time.perf_counter() - persist_started_at) * 1000),
                done=result.done,
                tool_count=len(result.tool_calls),
            )

            if result.done and result.response:
                response_messages.append(WidgetMessagePayload(role="assistant", content=result.response))
                response = WidgetChatResponse(
                    conversationId=conversation_id,
                    requestId=request_id,
                    messages=response_messages,
                    toolCalls=[],
                    suggestions=result.suggestions,
                    done=True,
                    isWidgetHidden=actions_remaining <= 0,
                    actionsRemaining=actions_remaining,
                )
                await send_socket_json(
                    websocket,
                    send_lock,
                    WidgetSocketResponseEnvelope(response=response).model_dump(by_alias=True),
                )
                log_info(
                    "WidgetController",
                    "widget_session",
                    "Widget run completed",
                    conversation_id=str(conversation_id),
                    request_id=request_id,
                    duration_ms=int((time.perf_counter() - run_started_at) * 1000),
                    iteration_count=iteration_count,
                    tool_call_count=tool_call_count,
                )
                set_trace_outputs(
                    {
                        "status": "completed",
                        "response": result.response,
                        "suggestion_count": len(result.suggestions),
                    }
                )
                return

            if result.tool_calls:
                pending_messages = result.messages
                pending_input_items = result.responses_input_items
                active_tool_ids = result.active_tool_ids
                pending_tool_calls = [serialize_tool_call(call) for call in result.tool_calls]
                iteration_count += 1
                tool_call_count += len(result.tool_calls)
                response = WidgetChatResponse(
                    conversationId=conversation_id,
                    requestId=request_id,
                    messages=[],
                    toolCalls=result.tool_calls,
                    suggestions=[],
                    done=False,
                    isWidgetHidden=False,
                    actionsRemaining=actions_remaining,
                )
                await send_socket_json(
                    websocket,
                    send_lock,
                    WidgetSocketResponseEnvelope(response=response).model_dump(by_alias=True),
                )
                log_info(
                    "WidgetController",
                    "widget_session",
                    "Tool calls pending",
                    conversation_id=str(conversation_id),
                    request_id=request_id,
                    owner_token=redact_owner_token(owner_token),
                    iteration_count=iteration_count,
                    tool_count=len(result.tool_calls),
                    tool_call_count=tool_call_count,
                )
                continue

            pending_messages = result.messages
            pending_input_items = result.responses_input_items
            active_tool_ids = result.active_tool_ids
            pending_tool_calls = []
            response = WidgetChatResponse(
                conversationId=conversation_id,
                requestId=request_id,
                messages=[],
                toolCalls=[],
                suggestions=[],
                done=True,
                isWidgetHidden=actions_remaining <= 0,
                actionsRemaining=actions_remaining,
            )
            await send_socket_json(
                websocket,
                send_lock,
                WidgetSocketResponseEnvelope(response=response).model_dump(by_alias=True),
            )
            set_trace_outputs({"status": "completed", "response": "", "suggestion_count": 0})
            return

    except WebSocketDisconnect:
        set_trace_error("WebSocketDisconnect: Widget session disconnected")
        if conversation_id and request_id and owner_token:
            with session_scope() as session:
                clear_widget_run_owner(session, conversation_id, request_id, owner_token)
        log_info("WidgetController", "widget_session", "Widget session disconnected")
    except Exception as error:
        set_trace_error(f"{type(error).__name__}: {error}")
        mark_widget_run_failed(conversation_id, request_id, owner_token)
        log_error("WidgetController", "widget_session", "Failed to process websocket session", exc=error)
        try:
            await send_error("SESSION_FAILED", "Failed to process chat request")
        except Exception:
            pass
    finally:
        keepalive_stop.set()
        if keepalive_task:
            keepalive_task.cancel()
        if transport:
            await transport.close()
        duration_ms = int((time.perf_counter() - run_started_at) * 1000)
        if conversation_id:
            log_info(
                "WidgetController",
                "widget_session",
                "Widget run finished",
                conversation_id=str(conversation_id),
                request_id=request_id,
                duration_ms=duration_ms,
                iteration_count=iteration_count,
                tool_call_count=tool_call_count,
            )
        if widget_trace_run:
            if widget_trace_error:
                widget_trace_run.end(error=widget_trace_error)
            else:
                trace_outputs = dict(widget_trace_outputs or {})
                trace_outputs.setdefault("status", "finished")
                trace_outputs["duration_ms"] = duration_ms
                trace_outputs["iteration_count"] = iteration_count
                trace_outputs["tool_call_count"] = tool_call_count
                if conversation_id:
                    trace_outputs["conversation_id"] = str(conversation_id)
                if request_id:
                    trace_outputs["request_id"] = request_id
                widget_trace_run.end(outputs=trace_outputs)
        if widget_trace_context and widget_trace_opened:
            await widget_trace_context.__aexit__(None, None, None)


@router.post("/transcribe", response_model=TranscriptionResponse)
async def widget_transcribe(
    request: Request,
    agent_id: UUID = Query(..., alias="agentId"),
    session: Session = Depends(get_session)
) -> TranscriptionResponse:
    try:
        agent = get_agent_by_id(session, agent_id)
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        require_widget_auth(request, agent_id, agent.widget_auth_enabled)
        content_type = (request.headers.get("content-type") or "").lower()
        if not content_type.startswith("audio/"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid content type")
        max_bytes = llm_config.max_audio_bytes
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > max_bytes:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Audio too large")
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > max_bytes:
                raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Audio too large")
        if not data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio")
        raw_filename = request.headers.get("x-audio-filename", "audio.webm")
        filename = raw_filename.split("/")[-1].split("\\")[-1] or "audio.webm"
        text = await transcribe_audio(bytes(data), filename)
        log_info("WidgetController", "transcribe", "Transcription completed", agent_id=str(agent_id))
        return TranscriptionResponse(text=text)
    except HTTPException:
        raise
    except Exception as error:
        log_error("WidgetController", "transcribe", "Failed to transcribe", exc=error)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to transcribe audio")
