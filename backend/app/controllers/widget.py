import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from langchain_core.messages import messages_from_dict, messages_to_dict
from sqlalchemy.orm import Session

from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..core.llm_config import llm_config
from ..schemas.widget import (
    TranscriptionResponse,
    ToolResultPayload,
    WidgetChatRequest,
    WidgetChatResponse,
    WidgetConfigResponse,
    WidgetMessagePayload,
)
from ..services.agent_chain import AgentExecutor
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

router = APIRouter(prefix="/widget", tags=["widget"])


def serialize_messages(messages: list) -> str:
    return json.dumps(messages_to_dict(messages))


def deserialize_messages(data: str) -> list:
    try:
        return messages_from_dict(json.loads(data))
    except (json.JSONDecodeError, TypeError, KeyError) as exc:
        log_error("WidgetController", "deserialize_messages", "Failed to deserialize", exc=exc)
        return []


def serialize_state(messages: list, active_endpoint_ids: list[UUID]) -> str:
    return json.dumps({
        "messages": messages_to_dict(messages),
        "endpoint_ids": [str(eid) for eid in active_endpoint_ids]
    })


def deserialize_state(state: str) -> tuple[list, list[UUID]]:
    try:
        data = json.loads(state)
        messages = messages_from_dict(data["messages"])
        endpoint_ids = [UUID(eid) for eid in data["endpoint_ids"]]
        return messages, endpoint_ids
    except (json.JSONDecodeError, TypeError, KeyError) as exc:
        log_error("WidgetController", "deserialize_state", "Failed to deserialize", exc=exc)
        return [], []


@router.get("/config/{agent_id}", response_model=WidgetConfigResponse)
def get_widget_config_route(
    agent_id: UUID,
    session: Session = Depends(get_session)
) -> WidgetConfigResponse:
    try:
        agent = get_agent_by_id(session, agent_id)
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        config = get_widget_config(session, agent.user_id)
        log_info("WidgetController", "get_widget_config", "Config fetched", agent_id=str(agent_id))
        return config
    except HTTPException:
        raise
    except Exception as error:
        log_error("WidgetController", "get_widget_config", "Failed to fetch config", exc=error)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch config")


@router.post("/chat", response_model=WidgetChatResponse)
async def widget_chat(
    payload: WidgetChatRequest,
    session: Session = Depends(get_session)
) -> WidgetChatResponse:
    try:
        agent = get_agent_by_id(session, payload.agent_id)
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

        if payload.conversation_id:
            conversation = get_widget_conversation(session, payload.conversation_id, payload.agent_id)
            if not conversation:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
        else:
            conversation = create_widget_conversation(session, payload.agent_id)

        db_messages = get_widget_messages(session, conversation.id)
        history = [
            {"role": m.role, "content": m.content}
            for m in db_messages
            if m.role in ("user", "assistant")
        ]

        pending_messages = None
        active_endpoint_ids = None
        tool_results: list[ToolResultPayload] | None = None

        if payload.message:
            save_widget_message(session, conversation.id, "user", payload.message)

        if payload.tool_results:
            tool_results = payload.tool_results
            pending_state = get_pending_state(session, conversation.id)
            if pending_state:
                pending_messages, active_endpoint_ids = deserialize_state(pending_state)
        else:
            tool_context_data = get_tool_context(session, conversation.id)
            if tool_context_data:
                pending_messages = deserialize_messages(tool_context_data)

        try:
            redis_client = get_redis_connection()
        except Exception:
            redis_client = None
        executor = AgentExecutor(
            session,
            agent.user_id,
            conversation_id=conversation.id,
            redis_client=redis_client
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
                done=True
            )

        if result.tool_calls:
            state = serialize_state(result.messages, result.active_endpoint_ids)
            save_widget_message(session, conversation.id, "pending_state", state)
            session.commit()
            log_info("WidgetController", "widget_chat", "Tool calls pending", conversation_id=str(conversation.id), tool_count=len(result.tool_calls))
            return WidgetChatResponse(
                conversationId=conversation.id,
                messages=[],
                toolCalls=result.tool_calls,
                done=False
            )

        if result.messages:
            save_tool_context(session, conversation.id, serialize_messages(result.messages))
        session.commit()
        return WidgetChatResponse(
            conversationId=conversation.id,
            messages=[],
            toolCalls=[],
            done=True
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
