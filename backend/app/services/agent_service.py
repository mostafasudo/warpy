from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..core.logger import log_info
from ..models import Agent, Conversation, Message


def create_agent(session: Session, user_id: str) -> Agent:
    existing = session.scalar(select(Agent).where(Agent.user_id == user_id))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Agent already exists")
    agent = Agent(user_id=user_id)
    session.add(agent)
    session.flush()
    log_info("AgentService", "create_agent", "Agent created", user_id=user_id)
    return agent


def get_agent(session: Session, user_id: str) -> Agent | None:
    return session.scalar(select(Agent).where(Agent.user_id == user_id))


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
    message = Message(conversation_id=conversation_id, role=role, content=content)
    session.add(message)
    session.flush()
    return message


def get_messages(session: Session, conversation_id: UUID) -> list[Message]:
    return list(session.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    ).all())

