from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.auth import require_clerk_session
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.agent import (
    AgentResponse,
    ChatRequest,
    ChatResponse,
    ConversationCreate,
    ConversationResponse,
    ConversationWithMessagesResponse,
    MessageResponse,
)
from ..schemas.auth import ClerkSession
from ..services.agent_chain import AgentExecutor
from ..services.agent_service import (
    create_agent,
    create_conversation,
    get_agent,
    get_conversation,
    get_messages,
    list_conversations,
    save_message,
)

router = APIRouter()


@router.post("/agent", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent_route(
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> AgentResponse:
    try:
        agent = create_agent(session, clerk_session.user_id)
        log_info("AgentController", "create_agent", "Agent created", user_id=clerk_session.user_id)
        return AgentResponse.model_validate(agent)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "create_agent", "Failed to create agent", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create agent")


@router.get("/agent", response_model=AgentResponse)
async def get_agent_route(
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> AgentResponse:
    try:
        agent = get_agent(session, clerk_session.user_id)
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        return AgentResponse.model_validate(agent)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "get_agent", "Failed to get agent", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to get agent")


@router.post("/agent/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation_route(
    payload: ConversationCreate,
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> ConversationResponse:
    try:
        agent = get_agent(session, clerk_session.user_id)
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found. Create an agent first.")
        conversation = create_conversation(session, agent.id, payload.participant)
        log_info("AgentController", "create_conversation", "Conversation created", user_id=clerk_session.user_id)
        return ConversationResponse.model_validate(conversation)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "create_conversation", "Failed to create conversation", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create conversation")


@router.get("/agent/conversations", response_model=list[ConversationResponse])
async def list_conversations_route(
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> list[ConversationResponse]:
    try:
        agent = get_agent(session, clerk_session.user_id)
        if not agent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        conversations = list_conversations(session, agent.id)
        return [ConversationResponse.model_validate(c) for c in conversations]
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "list_conversations", "Failed to list conversations", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to list conversations")


@router.get("/agent/conversations/{conversation_id}", response_model=ConversationWithMessagesResponse)
async def get_conversation_route(
    conversation_id: UUID,
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> ConversationWithMessagesResponse:
    try:
        conversation = get_conversation(session, conversation_id, clerk_session.user_id)
        if not conversation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
        return ConversationWithMessagesResponse(
            id=conversation.id,
            agent_id=conversation.agent_id,
            participant=conversation.participant,
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
            messages=[MessageResponse.model_validate(m) for m in conversation.messages]
        )
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "get_conversation", "Failed to get conversation", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to get conversation")


@router.post("/agent/conversations/{conversation_id}", response_model=ChatResponse)
async def chat_route(
    conversation_id: UUID,
    payload: ChatRequest,
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> ChatResponse:
    try:
        conversation = get_conversation(session, conversation_id, clerk_session.user_id)
        if not conversation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
        
        user_message = save_message(session, conversation_id, "user", payload.message)
        
        messages = get_messages(session, conversation_id)
        history = [{"role": m.role, "content": m.content} for m in messages[:-1]]
        
        executor = AgentExecutor(session, clerk_session.user_id)
        response_content = await executor.run(payload.message, history)
        
        assistant_message = save_message(session, conversation_id, "assistant", response_content)
        
        log_info("AgentController", "chat", "Chat completed", user_id=clerk_session.user_id, conversation_id=str(conversation_id))
        
        return ChatResponse(
            message=MessageResponse.model_validate(user_message),
            response=MessageResponse.model_validate(assistant_message)
        )
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "chat", "Failed to process chat", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to process chat")

