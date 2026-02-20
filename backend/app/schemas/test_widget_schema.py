import pytest
from pydantic import ValidationError

from app.schemas.widget import FrontendActionPayload


def test_frontend_action_payload_allows_up_to_three_alternatives():
    payload = FrontendActionPayload.model_validate(
        {
            "action": "click",
            "selectorAlternatives": ["text=One", "role=menuitem", "[data-testid='x']"],
            "scopeAlternatives": ["[role='menu']", ".popover", "#modal"],
        }
    )
    assert len(payload.selector_alternatives) == 3
    assert len(payload.scope_alternatives) == 3


def test_frontend_action_payload_rejects_more_than_three_alternatives():
    with pytest.raises(ValidationError):
        FrontendActionPayload.model_validate(
            {
                "action": "click",
                "selectorAlternatives": ["a", "b", "c", "d"],
            }
        )
    with pytest.raises(ValidationError):
        FrontendActionPayload.model_validate(
            {
                "action": "click",
                "scopeAlternatives": ["a", "b", "c", "d"],
            }
        )
