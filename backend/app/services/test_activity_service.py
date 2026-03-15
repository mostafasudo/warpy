from datetime import UTC, date, datetime
from uuid import UUID, uuid4

import pytest

from app.models import Tool, HttpMethod
from app.services.activity_service import (
    _decode_message_cursor,
    _encode_message_cursor,
    action_label,
    resolve_activity_range,
)


def test_resolve_activity_range_requires_start_before_end():
    with pytest.raises(ValueError):
        resolve_activity_range(date(2026, 1, 2), date(2026, 1, 1))


def test_action_label_uses_safe_description():
    tool_record = Tool(
        user_id="user_1",
        path="/users",
        method=HttpMethod.get,
        tool={
            "type": "function",
            "function": {"name": "getUser", "description": "Fetch user", "parameters": {"type": "object", "properties": {}}},
        },
        feature_id=uuid4(),
    )
    assert action_label(tool_record) == "Fetch user"


def test_action_label_humanizes_when_description_is_technical():
    tool_record = Tool(
        user_id="user_1",
        path="/users",
        method=HttpMethod.get,
        tool={
            "type": "function",
            "function": {"name": "getUser", "description": "GET /users", "parameters": {"type": "object", "properties": {}}},
        },
        feature_id=uuid4(),
    )
    assert action_label(tool_record) == "Fetch user"


def test_action_label_falls_back_when_name_is_missing():
    tool_record = Tool(
        user_id="user_1",
        path="/users",
        method=HttpMethod.get,
        tool={"type": "function", "function": {"description": "GET /users", "parameters": {"type": "object", "properties": {}}}},
        feature_id=uuid4(),
    )
    assert action_label(tool_record) == "Performed an action"


def test_message_cursor_encode_decode_roundtrip():
    seq = 42
    created_at = datetime(2026, 3, 15, 12, 0, tzinfo=UTC)
    item_id = uuid4()
    encoded = _encode_message_cursor(seq, created_at, item_id)
    decoded = _decode_message_cursor(encoded)
    assert decoded == (seq, created_at, item_id)


def test_message_cursor_encodes_to_string():
    encoded = _encode_message_cursor(123, datetime(2026, 3, 15, 12, 0, tzinfo=UTC), uuid4())
    assert encoded.count("|") == 2


def test_message_cursor_decodes_legacy_sequence_only_format():
    sequence, created_at, item_id = _decode_message_cursor("123")

    assert sequence == 123
    assert created_at == datetime.max.replace(tzinfo=UTC)
    assert item_id == UUID(int=(1 << 128) - 1)
