import importlib
import pytest
from fastapi.testclient import TestClient

from app.core.agent_custom_system_prompt import (
    CUSTOM_USER_SYSTEM_PROMPT_MAX_LENGTH,
    DEFAULT_CUSTOM_USER_SYSTEM_PROMPT,
)
from app.main import create_app
from app.schemas.auth import ClerkSession


@pytest.fixture(autouse=True)
def configure_settings(monkeypatch: pytest.MonkeyPatch):
    from app.core import database
    from app.core.config import get_settings

    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test")
    get_settings.cache_clear()
    importlib.reload(database)
    database._engine = None
    database._SessionLocal = None
    from app.models import Base

    engine = database.get_engine()
    Base.metadata.create_all(engine)
    try:
        yield
    finally:
        engine.dispose()


@pytest.fixture(autouse=True)
def stub_auth(monkeypatch: pytest.MonkeyPatch):
    session = ClerkSession(id="sess_1", user_id="user_1", status="active")
    monkeypatch.setattr("app.core.auth.verify_clerk_session", lambda token, forwarded_headers=None: session)
    return session


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as client:
        yield client


def auth_headers():
    return {"Authorization": "Bearer token"}


def test_agent_create_and_get_flow(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201
    agent = create.json()

    fetched = client.get("/agent", headers=auth_headers())
    assert fetched.status_code == 200
    assert fetched.json()["id"] == agent["id"]


def test_widget_components_crud(client: TestClient):
    payload = {
        "key": "invoice_summary",
        "version": "1",
        "displayName": "Invoice Summary",
        "description": "Short invoice summary output.",
        "framework": "react",
        "propsSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Max 60 characters."},
                "content": {"type": "string", "description": "Max 400 characters."},
            },
            "required": ["title", "content"],
        },
        "suitability": "Use for short invoice summaries only. Use markdown for long tables.",
        "constraints": {"maxTitleChars": 60, "maxContentChars": 400, "outputOnly": True},
        "active": True,
    }

    created = client.post("/widget-components", headers=auth_headers(), json=payload)
    assert created.status_code == 201
    created_body = created.json()
    assert created_body["key"] == "invoice_summary"
    assert created_body["propsSchema"]["required"] == ["title", "content"]

    listed = client.get("/widget-components", headers=auth_headers())
    assert listed.status_code == 200
    assert listed.json()["items"][0]["key"] == "invoice_summary"

    updated = client.put(
        f"/widget-components/{created_body['id']}",
        headers=auth_headers(),
        json={**payload, "active": False, "description": "Updated summary output."},
    )
    assert updated.status_code == 200
    assert updated.json()["active"] is False
    assert updated.json()["description"] == "Updated summary output."

    deleted = client.delete(f"/widget-components/{created_body['id']}", headers=auth_headers())
    assert deleted.status_code == 204
    assert client.get("/widget-components", headers=auth_headers()).json()["items"] == []


def test_widget_components_reject_builtin_key(client: TestClient):
    rejected = client.post(
        "/widget-components",
        headers=auth_headers(),
        json={
            "key": "summary_card",
            "version": "1",
            "displayName": "Bad",
            "description": "Bad key.",
            "framework": "react",
            "propsSchema": {"type": "object", "properties": {"content": {"type": "string"}}},
            "suitability": "Never.",
            "constraints": {},
            "active": True,
        },
    )
    assert rejected.status_code == 400


def test_agent_custom_system_prompt_get_and_update(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    fetched = client.get("/agent/custom-system-prompt", headers=auth_headers())
    assert fetched.status_code == 200
    assert fetched.json()["customUserSystemPrompt"] == DEFAULT_CUSTOM_USER_SYSTEM_PROMPT

    updated = client.put(
        "/agent/custom-system-prompt",
        headers=auth_headers(),
        json={"customUserSystemPrompt": "  Be extra concise.\r\nOffer next steps.\r\n  "},
    )
    assert updated.status_code == 200
    assert updated.json()["customUserSystemPrompt"] == "Be extra concise.\nOffer next steps."

    refetched = client.get("/agent/custom-system-prompt", headers=auth_headers())
    assert refetched.status_code == 200
    assert refetched.json()["customUserSystemPrompt"] == "Be extra concise.\nOffer next steps."


def test_agent_custom_system_prompt_blank_resets_to_default(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    updated = client.put(
        "/agent/custom-system-prompt",
        headers=auth_headers(),
        json={"customUserSystemPrompt": "   "},
    )
    assert updated.status_code == 200
    assert updated.json()["customUserSystemPrompt"] == DEFAULT_CUSTOM_USER_SYSTEM_PROMPT


def test_agent_custom_system_prompt_rejects_over_limit(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    invalid = client.put(
        "/agent/custom-system-prompt",
        headers=auth_headers(),
        json={"customUserSystemPrompt": "x" * (CUSTOM_USER_SYSTEM_PROMPT_MAX_LENGTH + 1)},
    )
    assert invalid.status_code == 422


def test_agent_widget_config_get_and_update(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    fetched = client.get("/agent/widget-config", headers=auth_headers())
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["widgetTitle"] == "Warpy"
    assert body["widgetIconUrl"] is None
    assert body["widgetAppearanceMode"] == "infer"
    assert body["widgetResponseMode"] == "warpy_components"
    assert body["widgetTheme"] is None
    assert body["widgetBehavior"] == "overlay"
    assert body["widgetEmptyTitle"] == "What would you like to do?"
    assert body["widgetEmptyDescription"] == "Ask a question, request help, or describe what you want to get done."
    assert body["widgetInputPlaceholder"] == "Ask Warpy…"
    assert body["widgetSuggestionsEnabled"] is False
    assert body["widgetStarterSuggestions"] == []

    updated = client.put(
        "/agent/widget-config",
        headers=auth_headers(),
        json={
            "widgetTitle": "Acme Assistant",
            "widgetIconUrl": "https://example.com/icon.png",
            "widgetAppearanceMode": "custom",
            "widgetResponseMode": "native_components",
            "widgetTheme": {
                "version": 1,
                "light": {
                    "colors": {
                        "text": "#111827",
                        "mutedText": "#4B5563",
                        "background": "#FFFFFF",
                        "surface": "#FFFFFF",
                        "surfaceStrong": "#F8FAFC",
                        "border": "#D1D5DB",
                        "borderStrong": "#9CA3AF",
                        "accent": "#2563EB",
                        "accentContrast": "#FFFFFF",
                        "accentSoft": "#DBEAFE",
                        "focusRing": "#93C5FD",
                        "scrim": "#00000038",
                        "launcherBackground": "#FFFFFF",
                        "launcherBorder": "#CBD5E1",
                        "launcherIcon": "#2563EB",
                        "headerIcon": "#4B5563",
                        "headerIconHover": "#111827",
                        "assistantBubble": "#F3F4F6",
                        "assistantText": "#111827",
                        "userBubble": "#E5E7EB",
                        "userText": "#111827",
                        "userBorder": "#D1D5DB",
                        "inputBackground": "#FFFFFF",
                        "inputText": "#111827",
                        "inputPlaceholder": "#6B7280",
                        "inputBorder": "#CBD5E1",
                        "suggestionBackground": "#F8FAFC",
                        "suggestionText": "#111827",
                        "suggestionBorder": "#CBD5E1",
                        "suggestionHoverBackground": "#DBEAFE",
                        "activityBackground": "#FFFFFF",
                        "activityText": "#111827",
                        "activityMuted": "#6B7280",
                        "warningBackground": "#EFF6FF",
                        "warningText": "#1D4ED8",
                        "warningBorder": "#BFDBFE",
                        "securityBackground": "#FFFFFF",
                        "securityText": "#111827",
                        "securityMuted": "#6B7280",
                        "codeBackground": "#F3F4F6",
                    },
                    "typography": {
                        "fontFamily": "system-ui, sans-serif",
                        "fontSize": 13,
                        "headingSize": 16,
                        "lineHeight": 1.55,
                        "letterSpacing": 0,
                        "fontWeight": 500,
                    },
                    "dimensions": {
                        "panelWidth": 440,
                        "launcherSize": 42,
                        "launcherRadius": 16,
                        "panelRadius": 18,
                        "bubbleRadius": 16,
                        "controlRadius": 12,
                        "inputHeight": 42,
                        "panelPadding": 14,
                        "messagePadding": 12,
                    },
                    "shadows": {
                        "panelY": 24,
                        "panelBlur": 60,
                        "panelSpread": 0,
                        "panelOpacity": 0.2,
                        "launcherY": 18,
                        "launcherBlur": 60,
                        "launcherSpread": 0,
                        "launcherOpacity": 0.2,
                    },
                },
                "dark": {
                    "colors": {
                        "text": "#F8FAFC",
                        "mutedText": "#CBD5E1",
                        "background": "#090A0B",
                        "surface": "#121416",
                        "surfaceStrong": "#1B1E22",
                        "border": "#2D3748",
                        "borderStrong": "#3F4A5A",
                        "accent": "#3B82F6",
                        "accentContrast": "#FFFFFF",
                        "accentSoft": "#1D4ED833",
                        "focusRing": "#60A5FA66",
                        "scrim": "#0000008C",
                        "launcherBackground": "#121416",
                        "launcherBorder": "#2D3748",
                        "launcherIcon": "#93C5FD",
                        "headerIcon": "#CBD5E1",
                        "headerIconHover": "#FFFFFF",
                        "assistantBubble": "#1B1E22",
                        "assistantText": "#F8FAFC",
                        "userBubble": "#23262B",
                        "userText": "#F8FAFC",
                        "userBorder": "#3F4A5A",
                        "inputBackground": "#1B1E22",
                        "inputText": "#F8FAFC",
                        "inputPlaceholder": "#94A3B8",
                        "inputBorder": "#334155",
                        "suggestionBackground": "#1B1E22",
                        "suggestionText": "#F8FAFC",
                        "suggestionBorder": "#334155",
                        "suggestionHoverBackground": "#1D4ED84D",
                        "activityBackground": "#121416",
                        "activityText": "#F8FAFC",
                        "activityMuted": "#CBD5E1",
                        "warningBackground": "#1E293B",
                        "warningText": "#E2E8F0",
                        "warningBorder": "#334155",
                        "securityBackground": "#090A0B",
                        "securityText": "#F8FAFC",
                        "securityMuted": "#CBD5E1",
                        "codeBackground": "#0F172A",
                    },
                    "typography": {
                        "fontFamily": "system-ui, sans-serif",
                        "fontSize": 13,
                        "headingSize": 16,
                        "lineHeight": 1.55,
                        "letterSpacing": 0,
                        "fontWeight": 500,
                    },
                    "dimensions": {
                        "panelWidth": 440,
                        "launcherSize": 42,
                        "launcherRadius": 16,
                        "panelRadius": 18,
                        "bubbleRadius": 16,
                        "controlRadius": 12,
                        "inputHeight": 42,
                        "panelPadding": 14,
                        "messagePadding": 12,
                    },
                    "shadows": {
                        "panelY": 24,
                        "panelBlur": 60,
                        "panelSpread": 0,
                        "panelOpacity": 0.62,
                        "launcherY": 18,
                        "launcherBlur": 60,
                        "launcherSpread": 0,
                        "launcherOpacity": 0.62,
                    },
                },
            },
            "widgetBehavior": "push",
            "widgetEmptyTitle": "How can we help?",
            "widgetEmptyDescription": "Ask a question or request help.",
            "widgetInputPlaceholder": "Ask Acme…",
            "widgetSuggestionsEnabled": True,
            "widgetStarterSuggestions": ["Show recent invoices", "Create a refund"],
        },
    )
    assert updated.status_code == 200
    updated_body = updated.json()
    assert updated_body["widgetTitle"] == "Acme Assistant"
    assert updated_body["widgetIconUrl"] == "https://example.com/icon.png"
    assert updated_body["widgetAppearanceMode"] == "custom"
    assert updated_body["widgetResponseMode"] == "native_components"
    assert updated_body["widgetTheme"]["version"] == 1
    assert updated_body["widgetBehavior"] == "push"
    assert updated_body["widgetSuggestionsEnabled"] is True
    assert updated_body["widgetStarterSuggestions"] == ["Show recent invoices", "Create a refund"]

    refetched = client.get("/agent/widget-config", headers=auth_headers())
    assert refetched.status_code == 200
    assert refetched.json()["widgetTitle"] == "Acme Assistant"
    assert refetched.json()["widgetAppearanceMode"] == "custom"
    assert refetched.json()["widgetResponseMode"] == "native_components"
    assert refetched.json()["widgetTheme"]["version"] == 1
    assert refetched.json()["widgetBehavior"] == "push"
    assert refetched.json()["widgetStarterSuggestions"] == ["Show recent invoices", "Create a refund"]


def test_agent_widget_config_icon_url_validation(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    invalid = client.put(
        "/agent/widget-config",
        headers=auth_headers(),
        json={
            "widgetTitle": "Acme Assistant",
            "widgetIconUrl": "not a url",
            "widgetBehavior": "overlay",
            "widgetEmptyTitle": "How can we help?",
            "widgetEmptyDescription": "Ask a question or request help.",
            "widgetInputPlaceholder": "Ask Acme…",
            "widgetSuggestionsEnabled": False,
            "widgetStarterSuggestions": [],
        },
    )
    assert invalid.status_code == 400


def test_agent_widget_config_rejects_blank_title(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    invalid = client.put(
        "/agent/widget-config",
        headers=auth_headers(),
        json={
            "widgetTitle": "   ",
            "widgetIconUrl": None,
            "widgetBehavior": "overlay",
            "widgetEmptyTitle": "How can we help?",
            "widgetEmptyDescription": "Ask a question or request help.",
            "widgetInputPlaceholder": "Ask Acme…",
            "widgetSuggestionsEnabled": False,
            "widgetStarterSuggestions": [],
        },
    )
    assert invalid.status_code == 400


def test_agent_widget_config_allows_blank_empty_state_fields(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    updated = client.put(
        "/agent/widget-config",
        headers=auth_headers(),
        json={
            "widgetTitle": "Acme Assistant",
            "widgetIconUrl": None,
            "widgetBehavior": "push",
            "widgetEmptyTitle": "   ",
            "widgetEmptyDescription": "   ",
            "widgetInputPlaceholder": "Ask Acme…",
            "widgetSuggestionsEnabled": True,
            "widgetStarterSuggestions": ["  Review approvals  ", "   "],
        },
    )
    assert updated.status_code == 200
    updated_body = updated.json()
    assert updated_body["widgetBehavior"] == "push"
    assert updated_body["widgetEmptyTitle"] == ""
    assert updated_body["widgetEmptyDescription"] == ""
    assert updated_body["widgetStarterSuggestions"] == ["Review approvals"]


def test_agent_widget_config_rejects_invalid_behavior(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    invalid = client.put(
        "/agent/widget-config",
        headers=auth_headers(),
        json={
            "widgetTitle": "Acme Assistant",
            "widgetIconUrl": None,
            "widgetBehavior": "sidecar",
            "widgetEmptyTitle": "How can we help?",
            "widgetEmptyDescription": "Ask a question or request help.",
            "widgetInputPlaceholder": "Ask Acme…",
            "widgetSuggestionsEnabled": False,
            "widgetStarterSuggestions": [],
        },
    )
    assert invalid.status_code == 422


def test_agent_widget_config_requires_starter_suggestion_when_enabled(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    invalid = client.put(
        "/agent/widget-config",
        headers=auth_headers(),
        json={
            "widgetTitle": "Acme Assistant",
            "widgetIconUrl": None,
            "widgetBehavior": "overlay",
            "widgetEmptyTitle": "How can we help?",
            "widgetEmptyDescription": "Ask a question or request help.",
            "widgetInputPlaceholder": "Ask Acme…",
            "widgetSuggestionsEnabled": True,
            "widgetStarterSuggestions": [],
        },
    )
    assert invalid.status_code == 400
    assert invalid.json()["detail"] == "Add at least one starter suggestion before enabling suggestions."


def test_agent_widget_config_rejects_more_than_three_starter_suggestions(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    invalid = client.put(
        "/agent/widget-config",
        headers=auth_headers(),
        json={
            "widgetTitle": "Acme Assistant",
            "widgetIconUrl": None,
            "widgetBehavior": "overlay",
            "widgetEmptyTitle": "How can we help?",
            "widgetEmptyDescription": "Ask a question or request help.",
            "widgetInputPlaceholder": "Ask Acme…",
            "widgetSuggestionsEnabled": True,
            "widgetStarterSuggestions": ["One", "Two", "Three", "Four"],
        },
    )
    assert invalid.status_code == 422


def test_agent_widget_install_preferences_get_and_update(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    fetched = client.get("/agent/widget-install", headers=auth_headers())
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["framework"] == "react"
    assert body["packageManager"] == "npm"

    updated = client.put(
        "/agent/widget-install",
        headers=auth_headers(),
        json={"framework": "vue", "packageManager": "pnpm"},
    )
    assert updated.status_code == 200
    updated_body = updated.json()
    assert updated_body["framework"] == "vue"
    assert updated_body["packageManager"] == "pnpm"

    refetched = client.get("/agent/widget-install", headers=auth_headers())
    assert refetched.status_code == 200
    refetched_body = refetched.json()
    assert refetched_body["framework"] == "vue"
    assert refetched_body["packageManager"] == "pnpm"


def test_agent_frontend_capability_get_and_update(client: TestClient):
    create = client.post("/agent", headers=auth_headers())
    assert create.status_code == 201

    fetched = client.get("/agent/frontend-capability", headers=auth_headers())
    assert fetched.status_code == 200
    assert fetched.json()["enabled"] is True

    updated = client.put(
        "/agent/frontend-capability",
        headers=auth_headers(),
        json={"enabled": False},
    )
    assert updated.status_code == 200
    assert updated.json()["enabled"] is False

    refetched = client.get("/agent/frontend-capability", headers=auth_headers())
    assert refetched.status_code == 200
    assert refetched.json()["enabled"] is False

    reenabled = client.put(
        "/agent/frontend-capability",
        headers=auth_headers(),
        json={"enabled": True},
    )
    assert reenabled.status_code == 200
    assert reenabled.json()["enabled"] is True
