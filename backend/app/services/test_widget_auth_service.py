from uuid import uuid4

import pytest

from app.services.widget_auth_service import (
    WidgetJwtError,
    mint_widget_jwt,
    verify_widget_jwt,
)


def test_mint_and_verify_widget_jwt_success():
    agent_id = uuid4()
    secret = "secret"
    token = mint_widget_jwt(agent_id=agent_id, user_id="user_1", secret=secret, ttl_seconds=60)
    verify_widget_jwt(token=token, expected_agent_id=agent_id, secret=secret)


def test_verify_widget_jwt_rejects_agent_mismatch():
    agent_id = uuid4()
    secret = "secret"
    token = mint_widget_jwt(agent_id=agent_id, user_id="user_1", secret=secret, ttl_seconds=60)
    with pytest.raises(WidgetJwtError) as exc:
        verify_widget_jwt(token=token, expected_agent_id=uuid4(), secret=secret)
    assert exc.value.code == "WIDGET_AUTH_INVALID"


def test_verify_widget_jwt_rejects_expired():
    agent_id = uuid4()
    secret = "secret"
    token = mint_widget_jwt(agent_id=agent_id, user_id="user_1", secret=secret, ttl_seconds=0)
    with pytest.raises(WidgetJwtError) as exc:
        verify_widget_jwt(token=token, expected_agent_id=agent_id, secret=secret)
    assert exc.value.code == "WIDGET_AUTH_INVALID"


def test_verify_widget_jwt_rejects_invalid_signature():
    agent_id = uuid4()
    token = mint_widget_jwt(agent_id=agent_id, user_id="user_1", secret="a", ttl_seconds=60)
    with pytest.raises(WidgetJwtError) as exc:
        verify_widget_jwt(token=token, expected_agent_id=agent_id, secret="b")
    assert exc.value.code == "WIDGET_AUTH_INVALID"
