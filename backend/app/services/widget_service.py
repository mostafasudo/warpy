from uuid import UUID

from redis import Redis
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.logger import log_info, log_warning
from ..models import Agent, AuthType, Conversation, Message, SessionHeader, StorageSource, WidgetRun, WidgetRunStatus
from ..schemas.widget import (
    SessionHeaderConfig,
    WidgetAuthConfig,
    WIDGET_SUGGESTION_MAX_COUNT,
    WIDGET_SUGGESTION_MAX_LENGTH,
    WidgetConfigResponse,
)
from .billing_service import get_billing_actions_summary
from .user_rate_limit_service import is_rate_limited


def get_agent_by_id(session: Session, agent_id: UUID) -> Agent | None:
    return session.scalar(select(Agent).where(Agent.id == agent_id))


def _is_cookie_auth_request_credentials(header: SessionHeader) -> bool:
    return header.source == StorageSource.cookies and not header.key.strip()


def get_widget_config(
    session: Session,
    agent: Agent,
    redis_client: Redis | None = None,
    client_ip: str | None = None,
) -> WidgetConfigResponse:
    summary = get_billing_actions_summary(session, agent.user_id)
    
    # Check user rate limits (per IP)
    is_user_rate_limited = False
    if (
        agent.user_rate_limit_enabled
        and client_ip
        and redis_client
        and (agent.user_rate_limit_daily or agent.user_rate_limit_monthly)
    ):
        try:
            is_user_rate_limited = is_rate_limited(
                redis_client,
                agent.id,
                client_ip,
                agent.user_rate_limit_daily,
                agent.user_rate_limit_monthly,
            )
        except Exception as e:
            log_warning(
                "WidgetService",
                "get_widget_config",
                f"Rate limit check failed: {e}",
                agent_id=str(agent.id)
            )
            # Fail-open: allow request if rate limit check fails
            is_user_rate_limited = False
    elif agent.user_rate_limit_enabled:
        log_warning(
            "WidgetService",
            "get_widget_config",
            "Rate limiting enabled but missing redis_client or client_ip",
            agent_id=str(agent.id),
            has_redis_client=redis_client is not None,
            has_client_ip=client_ip is not None
        )
    
    headers = session.scalars(select(SessionHeader).where(SessionHeader.user_id == agent.user_id)).all()
    header_map = {}
    auth_config = WidgetAuthConfig()
    send_cookies_with_requests = False
    for header in headers:
        if header.header_name.lower() == "authorization":
            if _is_cookie_auth_request_credentials(header):
                send_cookies_with_requests = True
            else:
                auth_config = WidgetAuthConfig(
                    mode="header",
                    source=header.source,
                    key=header.key,
                    authType=header.auth_type or AuthType.bearer,
                )
            continue
        header_map[header.header_name] = SessionHeaderConfig(source=header.source, key=header.key)
    return WidgetConfigResponse(
        auth=auth_config,
        send_cookies_with_requests=send_cookies_with_requests,
        headers=header_map,
        is_widget_hidden=summary.is_widget_hidden or is_user_rate_limited,
        actions_remaining=summary.total_remaining,
        require_signed_widget_token=agent.widget_auth_enabled,
        widget_refresh_endpoint_path=agent.widget_refresh_endpoint_path,
        widget_title=agent.widget_title,
        widget_icon_url=agent.widget_icon_url,
        widget_behavior=agent.widget_behavior,
        widget_empty_title=agent.widget_empty_title,
        widget_empty_description=agent.widget_empty_description,
        widget_input_placeholder=agent.widget_input_placeholder,
        widget_suggestions_enabled=agent.widget_suggestions_enabled,
        widget_starter_suggestions=_normalize_widget_starter_suggestions(agent.widget_starter_suggestions),
        security_disclosure_enabled=agent.widget_security_disclosure_enabled,
    )


def create_widget_conversation(
    session: Session,
    agent_id: UUID,
    participant: str = "widget",
    *,
    log_creation: bool = True,
) -> Conversation:
    conversation = Conversation(agent_id=agent_id, participant=participant)
    session.add(conversation)
    session.flush()
    if log_creation:
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
    _lock_and_touch_conversation(session, conversation_id)
    next_seq = _next_message_sequence(session, conversation_id)
    message = Message(conversation_id=conversation_id, role=role, content=content, sequence=next_seq)
    session.add(message)
    session.flush()
    return message


def get_widget_chat_history(
    session: Session,
    conversation_id: UUID,
    *,
    exclude_message_id: UUID | None = None,
) -> list[dict[str, str]]:
    query = (
        select(Message.role, Message.content)
        .where(
            Message.conversation_id == conversation_id,
            Message.role.in_(("user", "assistant")),
        )
        .order_by(Message.sequence, Message.created_at, Message.id)
    )
    if exclude_message_id:
        query = query.where(Message.id != exclude_message_id)
    rows = session.execute(query).all()
    return [{"role": role, "content": content} for role, content in rows]


def get_pending_state(session: Session, conversation_id: UUID) -> str | None:
    msg = session.scalar(
        select(Message).where(
            Message.conversation_id == conversation_id,
            Message.role == "pending_state"
        ).order_by(Message.sequence.desc())
    )
    return msg.content if msg else None


def save_pending_state(session: Session, conversation_id: UUID, content: str) -> None:
    _save_single_role_message(session, conversation_id, "pending_state", content)


def clear_pending_state(session: Session, conversation_id: UUID) -> None:
    _clear_role_messages(session, conversation_id, "pending_state")


def save_tool_context(session: Session, conversation_id: UUID, content: str) -> None:
    _save_single_role_message(session, conversation_id, "tool_context", content)


def get_tool_context(session: Session, conversation_id: UUID) -> str | None:
    msg = session.scalar(
        select(Message).where(
            Message.conversation_id == conversation_id,
            Message.role == "tool_context"
        )
    )
    return msg.content if msg else None


def get_widget_run(
    session: Session,
    conversation_id: UUID,
    request_id: str,
    *,
    for_update: bool = False,
) -> WidgetRun | None:
    query = select(WidgetRun).where(
        WidgetRun.conversation_id == conversation_id,
        WidgetRun.request_id == request_id,
    )
    if for_update:
        query = query.with_for_update()
    return session.scalar(query)


def get_widget_run_by_agent_request(
    session: Session,
    agent_id: UUID,
    request_id: str,
    *,
    for_update: bool = False,
) -> WidgetRun | None:
    query = select(WidgetRun).where(
        WidgetRun.agent_id == agent_id,
        WidgetRun.request_id == request_id,
    )
    if for_update:
        query = query.with_for_update()
    return session.scalar(query)


def _reclaim_widget_run(run: WidgetRun, owner_token: str) -> None:
    if run.status == WidgetRunStatus.failed:
        run.status = WidgetRunStatus.running
        run.owner_token = owner_token
        return
    if run.status in (WidgetRunStatus.running, WidgetRunStatus.waiting_for_tools):
        run.owner_token = owner_token
        return
    run.owner_token = None


def claim_widget_run(
    session: Session,
    agent_id: UUID,
    conversation_id: UUID,
    request_id: str,
    owner_token: str,
) -> tuple[WidgetRun, bool]:
    run = get_widget_run_by_agent_request(session, agent_id, request_id, for_update=True)
    if run is not None:
        if run.conversation_id != conversation_id:
            return run, False
        _reclaim_widget_run(run, owner_token)
        session.flush()
        return run, False

    savepoint = session.begin_nested()
    try:
        run = WidgetRun(
            agent_id=agent_id,
            conversation_id=conversation_id,
            request_id=request_id,
            owner_token=owner_token,
            status=WidgetRunStatus.running,
        )
        session.add(run)
        session.flush()
        savepoint.commit()
        return run, True
    except IntegrityError:
        savepoint.rollback()
        run = get_widget_run_by_agent_request(session, agent_id, request_id, for_update=True)
        if run is None:
            raise
        if run.conversation_id != conversation_id:
            return run, False
        _reclaim_widget_run(run, owner_token)
        session.flush()
        return run, False


def claim_widget_run_for_request(
    session: Session,
    agent_id: UUID,
    request_id: str,
    owner_token: str,
    *,
    conversation_id: UUID | None = None,
    message: str | None = None,
    participant: str = "widget",
) -> tuple[WidgetRun, bool]:
    run = get_widget_run_by_agent_request(session, agent_id, request_id, for_update=True)
    if run is not None:
        if conversation_id is not None and run.conversation_id != conversation_id:
            return run, False
        if message and run.user_message_id is not None:
            user_message = session.get(Message, run.user_message_id)
            if user_message is None or user_message.content != message:
                return run, False
        _reclaim_widget_run(run, owner_token)
        session.flush()
        return run, False

    savepoint = session.begin_nested()
    created_conversation = False
    try:
        resolved_conversation_id = conversation_id
        if resolved_conversation_id is None:
            conversation = create_widget_conversation(
                session,
                agent_id,
                participant=participant,
                log_creation=False,
            )
            resolved_conversation_id = conversation.id
            created_conversation = True
        run = WidgetRun(
            agent_id=agent_id,
            conversation_id=resolved_conversation_id,
            request_id=request_id,
            owner_token=owner_token,
            status=WidgetRunStatus.running,
        )
        session.add(run)
        session.flush()
        savepoint.commit()
    except IntegrityError:
        savepoint.rollback()
        run = get_widget_run_by_agent_request(session, agent_id, request_id, for_update=True)
        if run is None:
            raise
        if conversation_id is not None and run.conversation_id != conversation_id:
            return run, False
        if message and run.user_message_id is not None:
            user_message = session.get(Message, run.user_message_id)
            if user_message is None or user_message.content != message:
                return run, False
        _reclaim_widget_run(run, owner_token)
        session.flush()
        return run, False

    if created_conversation:
        log_info("WidgetService", "create_widget_conversation", "Conversation created", agent_id=str(agent_id))
    return run, True


def supersede_other_widget_runs(
    session: Session,
    conversation_id: UUID,
    request_id: str,
) -> list[str]:
    runs = list(session.scalars(
        select(WidgetRun)
        .where(
            WidgetRun.conversation_id == conversation_id,
            WidgetRun.request_id != request_id,
            WidgetRun.status.in_((WidgetRunStatus.running, WidgetRunStatus.waiting_for_tools)),
        )
        .with_for_update()
    ).all())
    superseded: list[str] = []
    for run in runs:
        run.status = WidgetRunStatus.superseded
        run.owner_token = None
        superseded.append(run.request_id)
    if superseded:
        session.flush()
    return superseded


def clear_widget_run_owner(session: Session, conversation_id: UUID, request_id: str, owner_token: str | None) -> None:
    if not owner_token:
        return
    run = get_widget_run(session, conversation_id, request_id, for_update=True)
    if run and run.owner_token == owner_token:
        run.owner_token = None
        session.flush()


def is_widget_run_owned(
    session: Session,
    conversation_id: UUID,
    request_id: str,
    owner_token: str | None,
    *,
    for_update: bool = False,
) -> bool:
    if not owner_token:
        return False
    run = get_widget_run(session, conversation_id, request_id, for_update=for_update)
    return bool(
        run
        and run.owner_token == owner_token
        and run.status in (WidgetRunStatus.running, WidgetRunStatus.waiting_for_tools, WidgetRunStatus.completed)
    )


def _normalize_widget_starter_suggestions(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        trimmed = " ".join(item.split()).strip()
        if not trimmed:
            continue
        normalized.append(trimmed[:WIDGET_SUGGESTION_MAX_LENGTH])
        if len(normalized) == WIDGET_SUGGESTION_MAX_COUNT:
            break
    return normalized


def _save_single_role_message(session: Session, conversation_id: UUID, role: str, content: str) -> None:
    _lock_and_touch_conversation(session, conversation_id)
    existing_messages = list(
        session.scalars(
            select(Message)
            .where(
                Message.conversation_id == conversation_id,
                Message.role == role,
            )
            .order_by(Message.sequence.desc())
        ).all()
    )
    if existing_messages:
        existing_messages[0].content = content
        for message in existing_messages[1:]:
            session.delete(message)
    else:
        next_seq = _next_message_sequence(session, conversation_id)
        session.add(Message(conversation_id=conversation_id, role=role, content=content, sequence=next_seq))
    session.flush()


def _clear_role_messages(session: Session, conversation_id: UUID, role: str) -> None:
    _lock_and_touch_conversation(session, conversation_id)
    messages = list(
        session.scalars(
            select(Message).where(
                Message.conversation_id == conversation_id,
                Message.role == role,
            )
        ).all()
    )
    for message in messages:
        session.delete(message)
    session.flush()


def _next_message_sequence(session: Session, conversation_id: UUID) -> int:
    return (session.scalar(
        select(func.coalesce(func.max(Message.sequence), 0))
        .where(Message.conversation_id == conversation_id)
    ) or 0) + 1


def _lock_and_touch_conversation(session: Session, conversation_id: UUID) -> None:
    conversation = session.scalar(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .with_for_update()
    )
    if conversation:
        conversation.updated_at = func.now()
