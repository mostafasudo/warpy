from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.auth import require_clerk_session
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.agent import (
    AgentResponse,
    AgentWidgetConfigResponse,
    AgentWidgetConfigUpdate,
    ChatRequest,
    ChatResponse,
    ConversationCreate,
    ConversationResponse,
    ConversationWithMessagesResponse,
    MessageResponse,
    WidgetApiKeyCreateResponse,
    WidgetSecurityDraftUpdate,
    WidgetSecurityResponse,
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
from ..services.agent_widget_security_service import (
    create_widget_api_key_draft,
    deploy_widget_security_draft,
    discard_widget_security_draft,
    get_widget_security_state,
    update_widget_security_draft,
)
from ..services.agent_widget_config_service import (
    get_agent_widget_config,
    update_agent_widget_config,
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

        messages = get_messages(session, conversation_id)
        history = [{"role": m.role, "content": m.content} for m in messages]

        user_message = save_message(session, conversation_id, "user", payload.message)

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


@router.get("/agent/widget-security", response_model=WidgetSecurityResponse)
async def get_widget_security_route(
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> WidgetSecurityResponse:
    try:
        return get_widget_security_state(session, clerk_session.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "get_widget_security", "Failed to fetch widget security", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch widget security")


@router.patch("/agent/widget-security/draft", response_model=WidgetSecurityResponse)
async def update_widget_security_draft_route(
    payload: WidgetSecurityDraftUpdate,
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> WidgetSecurityResponse:
    try:
        require_set = "require_signed_widget_token" in payload.model_fields_set
        refresh_set = "widget_refresh_endpoint_path" in payload.model_fields_set
        return update_widget_security_draft(
            session,
            clerk_session.user_id,
            require_signed_widget_token=payload.require_signed_widget_token if require_set and payload.require_signed_widget_token is not None else None,
            widget_refresh_endpoint_path=payload.widget_refresh_endpoint_path if refresh_set and payload.widget_refresh_endpoint_path is not None else None,
            clear_require_signed_widget_token=require_set and payload.require_signed_widget_token is None,
            clear_widget_refresh_endpoint_path=refresh_set and payload.widget_refresh_endpoint_path is None,
        )
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "update_widget_security_draft", "Failed to update widget security draft", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update widget security draft")


@router.post("/agent/widget-security/api-key", response_model=WidgetApiKeyCreateResponse)
async def create_widget_api_key_route(
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> WidgetApiKeyCreateResponse:
    try:
        _state, api_key, last4 = create_widget_api_key_draft(session, clerk_session.user_id)
        return WidgetApiKeyCreateResponse(apiKey=api_key, apiKeyLast4=last4)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "create_widget_api_key", "Failed to create widget API key", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create widget API key")


@router.post("/agent/widget-security/deploy", response_model=WidgetSecurityResponse)
async def deploy_widget_security_route(
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> WidgetSecurityResponse:
    try:
        return deploy_widget_security_draft(session, clerk_session.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "deploy_widget_security", "Failed to deploy widget security draft", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to deploy widget security draft")


@router.post("/agent/widget-security/discard", response_model=WidgetSecurityResponse)
async def discard_widget_security_route(
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> WidgetSecurityResponse:
    try:
        return discard_widget_security_draft(session, clerk_session.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "discard_widget_security", "Failed to discard widget security draft", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to discard widget security draft")


@router.get("/agent/widget-config", response_model=AgentWidgetConfigResponse)
async def get_agent_widget_config_route(
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> AgentWidgetConfigResponse:
    try:
        return get_agent_widget_config(session, clerk_session.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "get_widget_config", "Failed to fetch widget config", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch widget config")


@router.put("/agent/widget-config", response_model=AgentWidgetConfigResponse)
async def update_agent_widget_config_route(
    payload: AgentWidgetConfigUpdate,
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> AgentWidgetConfigResponse:
    try:
        return update_agent_widget_config(session, clerk_session.user_id, payload)
    except HTTPException:
        raise
    except Exception as error:
        log_error("AgentController", "update_widget_config", "Failed to update widget config", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update widget config")
