from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.logger import log_info
from ..models import Agent, AuthType, Conversation, Message, SessionHeader
from ..schemas.widget import SessionHeaderConfig, WidgetConfigResponse
from .billing_service import get_billing_actions_summary


def get_agent_by_id(session: Session, agent_id: UUID) -> Agent | None:
    return session.scalar(select(Agent).where(Agent.id == agent_id))


def get_widget_config(session: Session, agent: Agent) -> WidgetConfigResponse:
    summary = get_billing_actions_summary(session, agent.user_id)
    headers = session.scalars(select(SessionHeader).where(SessionHeader.user_id == agent.user_id)).all()
    header_map = {}
    for header in headers:
        auth_type = header.auth_type
        if header.header_name.lower() == "authorization":
            auth_type = auth_type or AuthType.bearer
        config_kwargs = {"source": header.source, "key": header.key}
        if auth_type:
            config_kwargs["auth_type"] = auth_type
        header_map[header.header_name] = SessionHeaderConfig(**config_kwargs)
    return WidgetConfigResponse(
        headers=header_map,
        is_widget_hidden=summary.is_widget_hidden,
        actions_remaining=summary.total_remaining,
        require_signed_widget_token=agent.widget_auth_enabled,
        widget_refresh_endpoint_path=agent.widget_refresh_endpoint_path,
        widget_title=agent.widget_title,
        widget_subtitle=agent.widget_subtitle,
        widget_icon_url=agent.widget_icon_url,
        widget_empty_title=agent.widget_empty_title,
        widget_empty_description=agent.widget_empty_description,
        widget_input_placeholder=agent.widget_input_placeholder,
        security_disclosure_enabled=agent.widget_security_disclosure_enabled,
    )


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
    conversation = session.get(Conversation, conversation_id)
    if conversation:
        conversation.updated_at = func.now()
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


def get_pending_state(session: Session, conversation_id: UUID) -> str | None:
    msg = session.scalar(
        select(Message).where(
            Message.conversation_id == conversation_id,
            Message.role == "pending_state"
        ).order_by(Message.created_at.desc())
    )
    return msg.content if msg else None


def save_tool_context(session: Session, conversation_id: UUID, content: str) -> None:
    existing = session.scalar(
        select(Message).where(
            Message.conversation_id == conversation_id,
            Message.role == "tool_context"
        ).with_for_update()
    )
    if existing:
        existing.content = content
    else:
        session.add(Message(conversation_id=conversation_id, role="tool_context", content=content))
    session.flush()


def get_tool_context(session: Session, conversation_id: UUID) -> str | None:
    msg = session.scalar(
        select(Message).where(
            Message.conversation_id == conversation_id,
            Message.role == "tool_context"
        )
    )
    return msg.content if msg else None
