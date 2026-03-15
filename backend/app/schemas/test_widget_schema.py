import pytest
from pydantic import ValidationError

from app.schemas.widget import (
    FrontendActionPayload,
    ToolCallPayload,
    WidgetChatResponse,
    WidgetSocketErrorEnvelope,
    WidgetSocketRequestEnvelope,
)


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


def test_frontend_action_payload_accepts_ref_field():
    payload = FrontendActionPayload.model_validate(
        {"action": "click", "ref": "ref_5"}
    )
    assert payload.ref == "ref_5"
    assert payload.selector is None


def test_tool_call_payload_read_page_options():
    payload = ToolCallPayload.model_validate(
        {
            "id": "tc_1",
            "type": "read_page",
            "name": "read_page",
            "readPageOptions": {"filter": "interactive", "depth": 10},
        }
    )
    assert payload.tool_type == "read_page"
    assert payload.read_page_options == {"filter": "interactive", "depth": 10}


def test_tool_call_payload_find_query():
    payload = ToolCallPayload.model_validate(
        {
            "id": "tc_2",
            "type": "find_elements",
            "name": "find_elements",
            "findQuery": "save button",
        }
    )
    assert payload.tool_type == "find_elements"
    assert payload.find_query == "save button"


def test_tool_call_payload_js_code():
    payload = ToolCallPayload.model_validate(
        {
            "id": "tc_3",
            "type": "js_exec",
            "name": "js_exec",
            "jsCode": "document.title",
        }
    )
    assert payload.tool_type == "js_exec"
    assert payload.js_code == "document.title"


def test_tool_call_payload_defaults_new_fields_to_none():
    payload = ToolCallPayload.model_validate(
        {
            "id": "tc_4",
            "type": "backend",
            "name": "get_user",
        }
    )
    assert payload.read_page_options is None
    assert payload.find_query is None
    assert payload.js_code is None


def test_widget_chat_response_accepts_up_to_three_suggestions():
    payload = WidgetChatResponse.model_validate(
        {
            "conversationId": "11111111-1111-1111-1111-111111111111",
            "messages": [],
            "toolCalls": [],
            "suggestions": ["One", "Two", "Three"],
            "done": True,
            "isWidgetHidden": False,
            "actionsRemaining": 5,
        }
    )
    assert payload.suggestions == ["One", "Two", "Three"]


def test_widget_chat_response_rejects_more_than_three_suggestions():
    with pytest.raises(ValidationError):
        WidgetChatResponse.model_validate(
            {
                "conversationId": "11111111-1111-1111-1111-111111111111",
                "messages": [],
                "toolCalls": [],
                "suggestions": ["One", "Two", "Three", "Four"],
                "done": True,
                "isWidgetHidden": False,
                "actionsRemaining": 5,
            }
        )


def test_widget_socket_request_envelope_accepts_widget_token():
    payload = WidgetSocketRequestEnvelope.model_validate(
        {
            "type": "chat.request",
            "widgetToken": "jwt",
            "request": {
                "agentId": "11111111-1111-1111-1111-111111111111",
                "message": "hello",
            },
        }
    )
    assert payload.widget_token == "jwt"
    assert payload.request.message == "hello"


def test_widget_socket_request_and_response_accept_request_id():
    request = WidgetSocketRequestEnvelope.model_validate(
        {
            "type": "chat.request",
            "request": {
                "agentId": "11111111-1111-1111-1111-111111111111",
                "conversationId": "22222222-2222-2222-2222-222222222222",
                "requestId": "req_123",
                "message": "hello",
            },
        }
    )
    response = WidgetChatResponse.model_validate(
        {
            "conversationId": "22222222-2222-2222-2222-222222222222",
            "requestId": "req_123",
            "messages": [],
            "toolCalls": [],
            "suggestions": [],
            "done": True,
            "isWidgetHidden": False,
            "actionsRemaining": 5,
        }
    )

    assert request.request.request_id == "req_123"
    assert response.request_id == "req_123"


def test_widget_socket_error_envelope_shape():
    payload = WidgetSocketErrorEnvelope.model_validate(
        {
            "type": "chat.error",
            "error": {
                "code": "WIDGET_AUTH_REQUIRED",
                "message": "Signed widget token required",
                "retriable": False,
            },
        }
    )
    assert payload.error.code == "WIDGET_AUTH_REQUIRED"
