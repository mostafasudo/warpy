from __future__ import annotations

import re
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..models import Agent, Conversation, ConversationAction, Endpoint, Message


def resolve_activity_range(
    start_date: date | None,
    end_date: date | None,
    *,
    default_days: int = 30,
) -> tuple[datetime, datetime]:
    today = datetime.now(tz=UTC).date()
    start = start_date or (today - timedelta(days=default_days))
    end = end_date or today
    if start > end:
        raise ValueError("start_date must be on or before end_date")
    start_dt = datetime.combine(start, time.min, tzinfo=UTC)
    end_dt = datetime.combine(end + timedelta(days=1), time.min, tzinfo=UTC)
    return start_dt, end_dt


def _encode_cursor(timestamp: datetime, item_id: UUID) -> str:
    return f"{timestamp.isoformat()}|{item_id}"


def _decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    raw_ts, raw_id = cursor.split("|", maxsplit=1)
    return datetime.fromisoformat(raw_ts), UUID(raw_id)


def _is_safe_description(value: str) -> bool:
    trimmed = value.strip()
    if not trimmed:
        return False
    if re.match(r"^(GET|POST|PUT|PATCH|DELETE)\s+/", trimmed, flags=re.IGNORECASE):
        return False
    if "/" in trimmed or "{" in trimmed or "}" in trimmed:
        return False
    return True


def _humanize_action_from_name(value: str) -> str:
    raw = value.strip()
    if not raw:
        return "Performed an action"
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", raw).replace("_", " ")
    words = [word for word in spaced.split() if word]
    if not words:
        return "Performed an action"
    verb_map = {
        "get": "Fetch",
        "list": "List",
        "create": "Create",
        "update": "Update",
        "delete": "Delete",
        "remove": "Remove",
        "set": "Set",
    }
    first = words[0].lower()
    verb = verb_map.get(first, words[0].capitalize())
    rest = " ".join(word.lower() for word in words[1:])
    return f"{verb} {rest}".strip()


def action_label(endpoint: Endpoint) -> str:
    tool = endpoint.tool or {}
    function = tool.get("function") or {}
    description = str(function.get("description") or "").strip()
    if _is_safe_description(description):
        return description
    name = str(function.get("name") or "").strip()
    return _humanize_action_from_name(name)


def _get_agent(session: Session, user_id: str) -> Agent | None:
    return session.scalar(select(Agent).where(Agent.user_id == user_id))


def get_activity_summary(
    session: Session,
    user_id: str,
    *,
    start: datetime,
    end: datetime,
    top_actions_limit: int = 10,
) -> tuple[int, int, list[tuple[str, str, int]]]:
    agent = _get_agent(session, user_id)
    if not agent:
        return 0, 0, []

    conversation_count = int(session.scalar(
        select(func.count())
        .select_from(Conversation)
        .where(
            Conversation.agent_id == agent.id,
            Conversation.updated_at >= start,
            Conversation.updated_at < end,
        )
    ) or 0)

    action_count = int(session.scalar(
        select(func.count())
        .select_from(ConversationAction)
        .where(
            ConversationAction.user_id == user_id,
            ConversationAction.created_at >= start,
            ConversationAction.created_at < end,
        )
    ) or 0)

    top_rows = session.execute(
        select(ConversationAction.endpoint_id, func.count().label("count"))
        .where(
            ConversationAction.user_id == user_id,
            ConversationAction.created_at >= start,
            ConversationAction.created_at < end,
        )
        .group_by(ConversationAction.endpoint_id)
        .order_by(func.count().desc())
        .limit(top_actions_limit)
    ).all()

    endpoint_ids = [row.endpoint_id for row in top_rows]
    endpoints = session.scalars(
        select(Endpoint)
        .where(Endpoint.user_id == user_id, Endpoint.id.in_(endpoint_ids))
        .options(selectinload(Endpoint.feature))
    ).all()
    endpoint_map = {endpoint.id: endpoint for endpoint in endpoints}

    top_actions: list[tuple[str, str, int]] = []
    for row in top_rows:
        endpoint = endpoint_map.get(row.endpoint_id)
        if not endpoint:
            continue
        feature_name = getattr(endpoint.feature, "name", "") or ""
        top_actions.append((feature_name, action_label(endpoint), int(row.count)))

    return conversation_count, action_count, top_actions


def list_activity_conversations(
    session: Session,
    user_id: str,
    *,
    start: datetime,
    end: datetime,
    limit: int,
    cursor: str | None,
) -> tuple[list[Conversation], dict[UUID, int], dict[UUID, int], str | None]:
    agent = _get_agent(session, user_id)
    if not agent:
        return [], {}, {}, None

    query = select(Conversation).where(
        Conversation.agent_id == agent.id,
        Conversation.updated_at >= start,
        Conversation.updated_at < end,
    )
    if cursor:
        cursor_time, cursor_id = _decode_cursor(cursor)
        query = query.where(or_(
            Conversation.updated_at < cursor_time,
            and_(Conversation.updated_at == cursor_time, Conversation.id < cursor_id),
        ))

    conversations = list(session.scalars(
        query.order_by(Conversation.updated_at.desc(), Conversation.id.desc()).limit(limit + 1)
    ).all())

    next_cursor = None
    if len(conversations) > limit:
        conversations.pop()
        next_cursor = _encode_cursor(conversations[-1].updated_at, conversations[-1].id)

    conversation_ids = [conversation.id for conversation in conversations]
    if not conversation_ids:
        return [], {}, {}, next_cursor

    user_message_counts = dict(session.execute(
        select(Message.conversation_id, func.count())
        .where(
            Message.conversation_id.in_(conversation_ids),
            Message.role == "user",
        )
        .group_by(Message.conversation_id)
    ).all())

    action_counts = dict(session.execute(
        select(ConversationAction.conversation_id, func.count())
        .where(
            ConversationAction.user_id == user_id,
            ConversationAction.conversation_id.in_(conversation_ids),
        )
        .group_by(ConversationAction.conversation_id)
    ).all())

    return conversations, user_message_counts, action_counts, next_cursor


def get_activity_conversation_detail(
    session: Session,
    user_id: str,
    conversation_id: UUID,
    *,
    message_limit: int,
    message_cursor: str | None,
    action_limit: int,
    action_cursor: str | None,
) -> tuple[Conversation | None, list[Message], str | None, list[ConversationAction], str | None, dict[UUID, Endpoint]]:
    conversation = session.scalar(
        select(Conversation)
        .join(Agent)
        .where(Conversation.id == conversation_id, Agent.user_id == user_id)
    )
    if not conversation:
        return None, [], None, [], None, {}

    msg_query = select(Message).where(
        Message.conversation_id == conversation_id,
        Message.role.in_(("user", "assistant")),
    )
    if message_cursor:
        cursor_time, cursor_id = _decode_cursor(message_cursor)
        msg_query = msg_query.where(or_(
            Message.created_at < cursor_time,
            and_(Message.created_at == cursor_time, Message.id < cursor_id),
        ))
    messages = list(session.scalars(
        msg_query.order_by(Message.created_at.desc(), Message.id.desc()).limit(message_limit + 1)
    ).all())

    next_message_cursor = None
    if len(messages) > message_limit:
        messages.pop()
        next_message_cursor = _encode_cursor(messages[-1].created_at, messages[-1].id)
    messages.reverse()

    action_query = select(ConversationAction).where(
        ConversationAction.user_id == user_id,
        ConversationAction.conversation_id == conversation_id,
    )
    if action_cursor:
        cursor_time, cursor_id = _decode_cursor(action_cursor)
        action_query = action_query.where(or_(
            ConversationAction.created_at < cursor_time,
            and_(ConversationAction.created_at == cursor_time, ConversationAction.id < cursor_id),
        ))
    actions = list(session.scalars(
        action_query.order_by(ConversationAction.created_at.desc(), ConversationAction.id.desc()).limit(action_limit + 1)
    ).all())

    next_action_cursor = None
    if len(actions) > action_limit:
        actions.pop()
        next_action_cursor = _encode_cursor(actions[-1].created_at, actions[-1].id)
    actions.reverse()

    endpoint_ids = list({action.endpoint_id for action in actions})
    endpoints = session.scalars(
        select(Endpoint)
        .where(Endpoint.user_id == user_id, Endpoint.id.in_(endpoint_ids))
        .options(selectinload(Endpoint.feature))
    ).all()
    endpoint_map = {endpoint.id: endpoint for endpoint in endpoints}

    return conversation, messages, next_message_cursor, actions, next_action_cursor, endpoint_map
