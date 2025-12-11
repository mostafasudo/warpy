from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.logger import log_info
from ..models import Agent, AuthType, Conversation, Message, SessionHeader
from ..schemas.widget import SessionHeaderConfig, WidgetConfigResponse


def get_agent_by_id(session: Session, agent_id: UUID) -> Agent | None:
    return session.scalar(select(Agent).where(Agent.id == agent_id))


def get_widget_config(session: Session, user_id: str) -> WidgetConfigResponse:
    headers = session.scalars(select(SessionHeader).where(SessionHeader.user_id == user_id)).all()
    header_map = {}
    for header in headers:
        auth_type = header.auth_type
        if header.header_name.lower() == "authorization":
            auth_type = auth_type or AuthType.bearer
        config_kwargs = {"source": header.source, "key": header.key}
        if auth_type:
            config_kwargs["auth_type"] = auth_type
        header_map[header.header_name] = SessionHeaderConfig(**config_kwargs)
    return WidgetConfigResponse(headers=header_map)


def create_widget_conversation(session: Session, agent_id: UUID, participant: str = "widget") -> Conversation:
    conversation = Conversation(agent_id=agent_id, participant=participant)
    session.add(conversation)
    session.flush()
    log_info("WidgetService", "create_widget_conversation", "Conversation created", agent_id=str(agent_id))
    return conversation


def get_widget_conversation(session: Session, conversation_id: UUID, agent_id: UUID) -> Conversation | None:
    return session.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.agent_id == agent_id
        )
    )


def save_widget_message(session: Session, conversation_id: UUID, role: str, content: str) -> Message:
    message = Message(conversation_id=conversation_id, role=role, content=content)
    session.add(message)
    session.flush()
    return message


def get_widget_messages(session: Session, conversation_id: UUID) -> list[Message]:
    return list(session.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    ).all())



