from datetime import date
from uuid import uuid4

import pytest

from app.models import Endpoint, HttpMethod
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
    endpoint = Endpoint(
        user_id="user_1",
        path="/users",
        method=HttpMethod.get,
        tool={
            "type": "function",
            "function": {"name": "getUser", "description": "Fetch user", "parameters": {"type": "object", "properties": {}}},
        },
        feature_id=uuid4(),
    )
    assert action_label(endpoint) == "Fetch user"


def test_action_label_humanizes_when_description_is_technical():
    endpoint = Endpoint(
        user_id="user_1",
        path="/users",
        method=HttpMethod.get,
        tool={
            "type": "function",
            "function": {"name": "getUser", "description": "GET /users", "parameters": {"type": "object", "properties": {}}},
        },
        feature_id=uuid4(),
    )
    assert action_label(endpoint) == "Fetch user"


def test_action_label_falls_back_when_name_is_missing():
    endpoint = Endpoint(
        user_id="user_1",
        path="/users",
        method=HttpMethod.get,
        tool={"type": "function", "function": {"description": "GET /users", "parameters": {"type": "object", "properties": {}}}},
        feature_id=uuid4(),
    )
    assert action_label(endpoint) == "Performed an action"


def test_message_cursor_encode_decode_roundtrip():
    seq = 42
    encoded = _encode_message_cursor(seq)
    decoded = _decode_message_cursor(encoded)
    assert decoded == seq


def test_message_cursor_encodes_to_string():
    encoded = _encode_message_cursor(123)
    assert encoded == "123"
