import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from langchain_core.messages import messages_from_dict, messages_to_dict
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..core.llm_config import llm_config
from ..core.user_messages import ASSISTANT_UNAVAILABLE_MESSAGE
from ..schemas.widget import (
    TranscriptionResponse,
    ToolResultPayload,
    WidgetChatRequest,
    WidgetChatResponse,
    WidgetConfigResponse,
    WidgetMessagePayload,
)
from ..services.agent_chain import AgentExecutor
from ..services.billing_service import consume_actions_for_tool_results, get_billing_actions_summary
from ..services.transcription_service import transcribe_audio
from ..workers.queue import get_redis_connection
from ..services.widget_service import (
    create_widget_conversation,
    get_agent_by_id,
    get_pending_state,
    get_tool_context,
    get_widget_config,
    get_widget_conversation,
    get_widget_messages,
    save_tool_context,
    save_widget_message,
)
from ..services.conversation_actions_service import ToolCallForLog, record_frontend_action, record_widget_tool_results
from ..services.widget_auth_service import WidgetJwtError, verify_widget_jwt
from ..services.user_rate_limit_service import (
    extract_client_ip,
    increment_rate_limit_usage,
    is_rate_limited,
)

router = APIRouter(prefix="/widget", tags=["widget"])


def serialize_messages(messages: list) -> str:
    return json.dumps(messages_to_dict(messages))


def deserialize_messages(data: str) -> list:
    try:
        return messages_from_dict(json.loads(data))
    except (json.JSONDecodeError, TypeError, KeyError) as exc:
        log_error("WidgetController", "deserialize_messages", "Failed to deserialize", exc=exc)
        return []


def serialize_state(messages: list, active_endpoint_ids: list[UUID], tool_calls: list[ToolCallForLog]) -> str:
    return json.dumps({
        "messages": messages_to_dict(messages),
        "endpoint_ids": [str(eid) for eid in active_endpoint_ids],
        "tool_calls": [
            {
                "id": call.id,
                "tool_type": call.tool_type,
                "endpoint_id": str(call.endpoint_id) if call.endpoint_id else None,
                "params": call.params,
                "query": call.query,
                "body": call.body,
            }
            for call in tool_calls
        ],
    })


def deserialize_state(state: str) -> tuple[list, list[UUID], list[ToolCallForLog]]:
    try:
        data = json.loads(state)
        messages = messages_from_dict(data["messages"])
        endpoint_ids = [UUID(eid) for eid in data["endpoint_ids"]]
        tool_calls: list[ToolCallForLog] = []
        for call in data.get("tool_calls") or []:
            try:
                if not isinstance(call, dict):
                    continue
                call_id = str(call.get("id") or "").strip()
                if not call_id:
                    continue
                tool_type = str(call.get("tool_type") or "backend")
                endpoint_id_str = call.get("endpoint_id")
                endpoint_id = UUID(endpoint_id_str) if endpoint_id_str else None
                tool_calls.append(ToolCallForLog(
                    id=call_id,
                    tool_type=tool_type,
                    endpoint_id=endpoint_id,
                    params=call.get("params") or {},
                    query=call.get("query") or {},
                    body=call.get("body") or {},
                ))
            except Exception:
                continue
        return messages, endpoint_ids, tool_calls
    except (json.JSONDecodeError, TypeError, KeyError, ValueError) as exc:
        log_error("WidgetController", "deserialize_state", "Failed to deserialize", exc=exc)
        return [], [], []


def require_widget_auth(request: Request, agent_id: UUID, enabled: bool) -> None:
    if not enabled:
        return
    auth_header = request.headers.get("authorization") or ""
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "WIDGET_AUTH_REQUIRED", "message": "Signed widget token required"}
        )
    scheme, _, credentials = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not credentials.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "WIDGET_AUTH_INVALID", "message": "Invalid authorization header"}
        )
    settings = get_settings()
    if not settings.widget_jwt_secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Widget JWT secret missing")
    try:
        verify_widget_jwt(token=credentials.strip(), expected_agent_id=agent_id, secret=settings.widget_jwt_secret)
    except WidgetJwtError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": exc.code, "message": exc.message})


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


@router.post("/chat", response_model=WidgetChatResponse)
async def widget_chat(
    request: Request,
    payload: WidgetChatRequest,
    session: Session = Depends(get_session)
) -> WidgetChatResponse:
    try:
        agent = get_agent_by_id(session, payload.agent_id)
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        require_widget_auth(request, payload.agent_id, agent.widget_auth_enabled)

        client_ip = extract_client_ip(request)
        try:
            redis_client = get_redis_connection()
        except Exception:
            redis_client = None

        if (
            agent.user_rate_limit_enabled
            and redis_client
            and (agent.user_rate_limit_daily or agent.user_rate_limit_monthly)
        ):
            if is_rate_limited(
                redis_client,
                agent.id,
                client_ip,
                agent.user_rate_limit_daily,
                agent.user_rate_limit_monthly,
            ):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="You've reached your usage limit. Please try again later."
                )

        if payload.conversation_id:
            conversation = get_widget_conversation(session, payload.conversation_id, payload.agent_id)
            if not conversation:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
        else:
            conversation = create_widget_conversation(session, payload.agent_id)

        pending_messages = None
        active_endpoint_ids = None
        pending_tool_calls: list[ToolCallForLog] = []
        tool_results: list[ToolResultPayload] | None = None

        if payload.tool_results:
            tool_results = payload.tool_results
            pending_state = get_pending_state(session, conversation.id)
            if pending_state:
                pending_messages, active_endpoint_ids, pending_tool_calls = deserialize_state(pending_state)

            tool_call_type_map = {tc.id: tc.tool_type for tc in pending_tool_calls}
            billable_ids = [
                result.id for result in payload.tool_results
                if tool_call_type_map.get(result.id) in ("backend", "frontend")
                and result.consume_action
            ]

            consume_result = consume_actions_for_tool_results(
                session,
                agent.user_id,
                conversation.id,
                billable_ids,
            )
            actions_remaining = consume_result.remaining
            if consume_result.consumed > 0 and redis_client and agent.user_rate_limit_enabled:
                increment_rate_limit_usage(redis_client, agent.id, client_ip, consume_result.consumed)

            if pending_tool_calls:
                record_widget_tool_results(
                    session,
                    agent.user_id,
                    conversation.id,
                    tool_results=tool_results,
                    tool_calls=pending_tool_calls,
                )
                for result in tool_results:
                    tool_call = tool_call_type_map.get(result.id)
                    if tool_call == "frontend" and result.body:
                        body = result.body if isinstance(result.body, dict) else {}
                        record_frontend_action(
                            session,
                            agent.user_id,
                            conversation.id,
                            tool_call_id=result.id,
                            goal=body.get("goal", ""),
                            url=body.get("url", ""),
                            actions=body.get("results", []),
                            status_code=result.status_code,
                            error=result.error,
                        )
        else:
            summary = get_billing_actions_summary(session, agent.user_id)
            actions_remaining = summary.total_remaining
            if summary.is_widget_hidden:
                message = ASSISTANT_UNAVAILABLE_MESSAGE
                log_info(
                    "WidgetController",
                    "widget_chat",
                    "Widget hidden due to action limit",
                    agent_id=str(payload.agent_id),
                )
                return WidgetChatResponse(
                    conversationId=conversation.id,
                    messages=[WidgetMessagePayload(role="assistant", content=message)],
                    toolCalls=[],
                    done=True,
                    isWidgetHidden=True,
                    actionsRemaining=actions_remaining,
                )

        db_messages = get_widget_messages(session, conversation.id)
        history = [
            {"role": m.role, "content": m.content}
            for m in db_messages
            if m.role in ("user", "assistant")
        ]

        if payload.message:
            save_widget_message(session, conversation.id, "user", payload.message)

        if payload.tool_results:
            if actions_remaining <= 0:
                message = ASSISTANT_UNAVAILABLE_MESSAGE
                log_info(
                    "WidgetController",
                    "widget_chat",
                    "Widget hidden after action consumption",
                    conversation_id=str(conversation.id),
                )
                session.commit()
                return WidgetChatResponse(
                    conversationId=conversation.id,
                    messages=[WidgetMessagePayload(role="assistant", content=message)],
                    toolCalls=[],
                    done=True,
                    isWidgetHidden=True,
                    actionsRemaining=actions_remaining,
                )
        else:
            tool_context_data = get_tool_context(session, conversation.id)
            if tool_context_data:
                pending_messages = deserialize_messages(tool_context_data)

        executor = AgentExecutor(
            session,
            agent.user_id,
            conversation_id=conversation.id,
            redis_client=redis_client,
            frontend_capability_enabled=agent.frontend_capability_enabled,
        )
        result = await executor.run_step(
            user_message=payload.message,
            conversation_history=history,
            tool_results=tool_results,
            pending_messages=pending_messages,
            active_endpoint_ids=active_endpoint_ids
        )

        response_messages: list[WidgetMessagePayload] = []

        if result.done and result.response:
            save_widget_message(session, conversation.id, "assistant", result.response)
            response_messages.append(WidgetMessagePayload(role="assistant", content=result.response))
            save_tool_context(session, conversation.id, serialize_messages(result.messages))
            session.commit()
            log_info("WidgetController", "widget_chat", "Chat completed", conversation_id=str(conversation.id))
            return WidgetChatResponse(
                conversationId=conversation.id,
                messages=response_messages,
                toolCalls=[],
                done=True,
                isWidgetHidden=actions_remaining <= 0,
                actionsRemaining=actions_remaining,
            )

        if result.tool_calls:
            state = serialize_state(
                result.messages,
                result.active_endpoint_ids,
                [
                    ToolCallForLog(
                        id=call.id,
                        tool_type=call.tool_type,
                        endpoint_id=call.endpoint_id if call.tool_type == "backend" else None,
                        params=call.params or {},
                        query=call.query or {},
                        body=call.body or {},
                    )
                    for call in result.tool_calls
                    if call.id and call.tool_type in ("backend", "frontend")
                ],
            )
            save_widget_message(session, conversation.id, "pending_state", state)
            session.commit()
            log_info("WidgetController", "widget_chat", "Tool calls pending", conversation_id=str(conversation.id), tool_count=len(result.tool_calls))
            return WidgetChatResponse(
                conversationId=conversation.id,
                messages=[],
                toolCalls=result.tool_calls,
                done=False,
                isWidgetHidden=False,
                actionsRemaining=actions_remaining,
            )

        if result.messages:
            save_tool_context(session, conversation.id, serialize_messages(result.messages))
        session.commit()
        return WidgetChatResponse(
            conversationId=conversation.id,
            messages=[],
            toolCalls=[],
            done=True,
            isWidgetHidden=actions_remaining <= 0,
            actionsRemaining=actions_remaining,
        )

    except HTTPException:
        raise
    except Exception as error:
        log_error("WidgetController", "widget_chat", "Failed to process chat", exc=error)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to process chat")


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
