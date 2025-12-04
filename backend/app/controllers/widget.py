import json
import pickle
from base64 import b64decode, b64encode
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.widget import (
    ToolResultPayload,
    WidgetChatRequest,
    WidgetChatResponse,
    WidgetConfigResponse,
    WidgetMessagePayload,
)
from ..services.agent_chain import AgentExecutor
from ..services.widget_service import (
    create_widget_conversation,
    get_agent_by_id,
    get_widget_config,
    get_widget_conversation,
    get_widget_messages,
    save_widget_message,
)

router = APIRouter(prefix="/widget", tags=["widget"])


def serialize_state(messages: list, active_endpoint_ids: list[UUID]) -> str:
    data = {
        "messages": pickle.dumps(messages),
        "endpoint_ids": [str(eid) for eid in active_endpoint_ids]
    }
    return b64encode(json.dumps({
        "messages": b64encode(data["messages"]).decode(),
        "endpoint_ids": data["endpoint_ids"]
    }).encode()).decode()


def deserialize_state(state: str) -> tuple[list, list[UUID]]:
    try:
        data = json.loads(b64decode(state))
        messages = pickle.loads(b64decode(data["messages"]))
        endpoint_ids = [UUID(eid) for eid in data["endpoint_ids"]]
        return messages, endpoint_ids
    except Exception:
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
        history = [{"role": m.role, "content": m.content} for m in db_messages]

        pending_messages = None
        active_endpoint_ids = None
        tool_results: list[ToolResultPayload] | None = None

        if payload.message:
            save_widget_message(session, conversation.id, "user", payload.message)

        if payload.tool_results:
            tool_results = payload.tool_results
            last_msg = db_messages[-1] if db_messages else None
            if last_msg and last_msg.role == "pending_state":
                pending_messages, active_endpoint_ids = deserialize_state(last_msg.content)

        executor = AgentExecutor(session, agent.user_id)
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

