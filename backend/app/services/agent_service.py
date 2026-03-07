from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..core.agent_custom_system_prompt import DEFAULT_CUSTOM_USER_SYSTEM_PROMPT
from ..core.logger import log_info
from ..models import Agent, Conversation, Message
from .billing_service import get_or_create_billing_account


def create_agent(session: Session, user_id: str) -> Agent:
    existing = session.scalar(select(Agent).where(Agent.user_id == user_id))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Agent already exists")
    get_or_create_billing_account(session, user_id)
    agent = Agent(user_id=user_id)
    session.add(agent)
    session.flush()
    log_info("AgentService", "create_agent", "Agent created", user_id=user_id)
    return agent


def get_agent(session: Session, user_id: str) -> Agent | None:
    return session.scalar(select(Agent).where(Agent.user_id == user_id))


def build_agent_executor_config(agent: Agent | None) -> dict[str, bool | str]:
    return {
        "frontend_capability_enabled": agent.frontend_capability_enabled if agent else True,
        "knowledge_base_enabled": agent.knowledge_base_enabled if agent else False,
        "custom_user_system_prompt": (
            agent.custom_user_system_prompt if agent else DEFAULT_CUSTOM_USER_SYSTEM_PROMPT
        ),
    }


def create_conversation(session: Session, agent_id: UUID, participant: str) -> Conversation:
    conversation = Conversation(agent_id=agent_id, participant=participant)
    session.add(conversation)
    session.flush()
    log_info("AgentService", "create_conversation", "Conversation created", agent_id=str(agent_id))
    return conversation


def get_conversation(session: Session, conversation_id: UUID, user_id: str) -> Conversation | None:
    return session.scalar(
        select(Conversation)
        .join(Agent)
        .where(Conversation.id == conversation_id, Agent.user_id == user_id)
        .options(selectinload(Conversation.messages))
    )


def list_conversations(session: Session, agent_id: UUID) -> list[Conversation]:
    return list(session.scalars(
        select(Conversation)
        .where(Conversation.agent_id == agent_id)
        .order_by(Conversation.updated_at.desc())
    ).all())


def save_message(session: Session, conversation_id: UUID, role: str, content: str) -> Message:
    conversation = session.get(Conversation, conversation_id)
    if conversation:
        conversation.updated_at = func.now()
    next_seq = (session.scalar(
        select(func.coalesce(func.max(Message.sequence), 0))
        .where(Message.conversation_id == conversation_id)
    ) or 0) + 1
    message = Message(conversation_id=conversation_id, role=role, content=content, sequence=next_seq)
    session.add(message)
    session.flush()
    return message


def get_messages(session: Session, conversation_id: UUID) -> list[Message]:
    return list(session.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.sequence)
    ).all())


def update_frontend_capability(
    session: Session,
    user_id: str,
    enabled: bool,
) -> Agent:
    agent = get_agent(session, user_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    agent.frontend_capability_enabled = enabled
    session.commit()
    session.refresh(agent)
    log_info("AgentService", "update_frontend_capability", "Frontend capability updated", user_id=user_id)
    return agent


def update_user_rate_limits(
    session: Session,
    user_id: str,
    enabled: bool,
    daily_limit: int | None,
    monthly_limit: int | None,
) -> Agent:
    agent = get_agent(session, user_id)
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    
    agent.user_rate_limit_enabled = enabled
    agent.user_rate_limit_daily = daily_limit
    agent.user_rate_limit_monthly = monthly_limit
    session.commit()
    session.refresh(agent)
    log_info("AgentService", "update_user_rate_limits", "User rate limits updated", user_id=user_id)
    return agent
