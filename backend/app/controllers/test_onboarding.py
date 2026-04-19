import importlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select

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
        monkeypatch.setattr("app.workers.knowledge_base_jobs.enqueue_website_processing", lambda *_args, **_kwargs: None)
        monkeypatch.setattr("app.controllers.onboarding.enqueue_website_processing", lambda *_args, **_kwargs: None)
        monkeypatch.setattr("app.controllers.onboarding.log_info", lambda *_args, **_kwargs: None)
        monkeypatch.setattr("app.main.ensure_website_refresh_sweep", lambda: None)
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


def _create_feature(user_id: str = "user_1"):
    from app.core.database import session_scope
    from app.models import Feature

    with session_scope() as session:
        session.add(Feature(user_id=user_id, name="Orders"))


def _create_mcp_connection(user_id: str = "user_1"):
    from app.core.database import session_scope
    from app.models import McpAuthMode, McpConnection

    with session_scope() as session:
        session.add(
            McpConnection(
                user_id=user_id,
                name="Stripe MCP",
                server_url="https://mcp.example.com",
                auth_mode=McpAuthMode.none,
            )
        )


def _save_config(user_id: str = "user_1", *, production_url: str = "https://api.example.com", auth_header: bool = True):
    from app.core.database import session_scope
    from app.schemas.config import ConfigPayload
    from app.services.config_service import upsert_config

    with session_scope() as session:
        upsert_config(
            session,
            user_id,
            ConfigPayload(
                baseUrl={"local": "", "production": production_url},
                auth={"mode": "none"},
                sendCookiesWithRequests=auth_header,
                headers={},
            ),
        )


def _create_agent(user_id: str = "user_1"):
    from app.core.database import session_scope
    from app.services.agent_service import create_agent

    with session_scope() as session:
        create_agent(session, user_id)


def _create_website(user_id: str = "user_1"):
    from app.core.database import session_scope
    from app.services.knowledge_website_service import create_website_record

    with session_scope() as session:
        create_website_record(session, user_id, "https://example.com", "https://example.com")


def _create_onboarding_state(user_id: str = "user_1"):
    from app.core.database import session_scope
    from app.models import UserOnboardingState
    from datetime import UTC, datetime

    with session_scope() as session:
        session.add(UserOnboardingState(user_id=user_id, started_at=datetime.now(tz=UTC)))


def _website_payload(
    website_id: str = "11111111-1111-1111-1111-111111111111",
    *,
    status: str = "processing",
    page_count: int = 0,
) -> dict:
    return {
        "id": website_id,
        "inputUrl": "https://example.com",
        "scopeUrl": "https://example.com",
        "status": status,
        "errorMessage": None,
        "pageCount": page_count,
        "readyPageCount": 0,
        "failedPageCount": 0,
        "searchablePageCount": 0,
        "lastCrawledAt": None,
        "lastSuccessfulCrawledAt": None,
        "nextRefreshAt": None,
        "createdAt": "2026-03-21T00:00:00Z",
        "updatedAt": "2026-03-21T00:00:00Z",
    }


def test_get_onboarding_state_for_pristine_user(client: TestClient):
    response = client.get("/onboarding/state", headers=auth_headers())
    assert response.status_code == 200
    assert response.json() == {
        "status": "not_started",
        "shouldShow": True,
        "nextStep": "website",
    }


def test_get_onboarding_state_for_existing_configured_user(client: TestClient):
    _save_config(auth_header=False)

    response = client.get("/onboarding/state", headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["status"] == "not_applicable"
    assert response.json()["shouldShow"] is False


def test_get_onboarding_state_treats_mcp_connection_as_meaningful_setup(client: TestClient):
    _create_mcp_connection()

    response = client.get("/onboarding/state", headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["status"] == "not_applicable"
    assert response.json()["shouldShow"] is False


def test_get_onboarding_state_skips_auth_step_when_mcp_connection_exists(client: TestClient):
    _create_onboarding_state()
    _create_website()
    _save_config(auth_header=False)
    _create_mcp_connection()

    response = client.get("/onboarding/state", headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    assert response.json()["nextStep"] == "agent"


def test_start_onboarding_is_idempotent(client: TestClient):
    first = client.post("/onboarding/start", headers=auth_headers())
    second = client.post("/onboarding/start", headers=auth_headers())

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == {
        "status": "in_progress",
        "shouldShow": True,
        "nextStep": "website",
    }
    assert second.json() == first.json()


def test_onboarding_website_adds_and_reuses_existing_record(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.core.database import session_scope
    from app.models import Agent

    monkeypatch.setattr("app.services.onboarding_service.resolve_website_scope", lambda raw_url: "https://example.com")
    enqueue_calls: list[tuple[object, str]] = []
    monkeypatch.setattr(
        "app.controllers.onboarding.enqueue_website_processing",
        lambda website_id, user_id: enqueue_calls.append((website_id, user_id)),
    )

    client.post("/onboarding/start", headers=auth_headers())
    first = client.post("/onboarding/website", headers=auth_headers(), json={"url": "example.com"})
    second = client.post("/onboarding/website", headers=auth_headers(), json={"url": "https://example.com"})

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["scopeUrl"] == "https://example.com"
    assert second.json()["id"] == first.json()["id"]
    assert len(enqueue_calls) == 2

    with session_scope() as session:
        agent = session.scalar(select(Agent).where(Agent.user_id == "user_1"))
        assert agent is not None
        assert agent.knowledge_base_enabled is True


def test_onboarding_website_retries_after_integrity_error(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.services.onboarding_service import OnboardingWebsiteResult

    attempts = {"count": 0}

    def fake_add_onboarding_website(_session, _user_id: str, _raw_url: str):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise IntegrityError("insert", {}, Exception("duplicate"))
        return OnboardingWebsiteResult(website=_website_payload(), created=False)

    enqueue_calls: list[tuple[object, str]] = []
    monkeypatch.setattr("app.controllers.onboarding.add_onboarding_website", fake_add_onboarding_website)
    monkeypatch.setattr(
        "app.controllers.onboarding.enqueue_website_processing",
        lambda website_id, user_id: enqueue_calls.append((website_id, user_id)),
    )

    response = client.post("/onboarding/website", headers=auth_headers(), json={"url": "example.com"})

    assert response.status_code == 201
    assert response.json()["id"] == "11111111-1111-1111-1111-111111111111"
    assert attempts["count"] == 2
    assert enqueue_calls == [("11111111-1111-1111-1111-111111111111", "user_1")]


def test_onboarding_website_requeues_existing_initial_processing_source(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.services.onboarding_service import OnboardingWebsiteResult

    enqueue_calls: list[tuple[object, str]] = []
    monkeypatch.setattr(
        "app.controllers.onboarding.add_onboarding_website",
        lambda _session, _user_id, _raw_url: OnboardingWebsiteResult(website=_website_payload(), created=False),
    )
    monkeypatch.setattr(
        "app.controllers.onboarding.enqueue_website_processing",
        lambda website_id, user_id: enqueue_calls.append((website_id, user_id)),
    )

    response = client.post("/onboarding/website", headers=auth_headers(), json={"url": "example.com"})

    assert response.status_code == 201
    assert enqueue_calls == [("11111111-1111-1111-1111-111111111111", "user_1")]


def test_onboarding_website_allows_first_source_when_standard_gate_would_block(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.models import BillingPlan

    monkeypatch.setattr("app.services.onboarding_service.resolve_website_scope", lambda raw_url: "https://blocked.example.com")

    from app.services.billing_service import BillingActionsSummary
    monkeypatch.setattr(
        "app.services.onboarding_service.get_billing_actions_summary",
        lambda *_args, **_kwargs: BillingActionsSummary(
            plan=BillingPlan.free,
            total_remaining=0,
            monthly_remaining=0,
            monthly_quota=0,
            topup_remaining=0,
            lifetime_remaining=0,
            is_widget_hidden=True,
            can_manage_subscription=False,
            subscription_status=None,
            subscription_renews_at=None,
        ),
    )

    client.post("/onboarding/start", headers=auth_headers())
    response = client.post("/onboarding/website", headers=auth_headers(), json={"url": "blocked.example.com"})

    assert response.status_code == 201
    assert response.json()["scopeUrl"] == "https://blocked.example.com"


def test_onboarding_website_blocks_additional_sources_when_gate_is_exhausted(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.models import BillingPlan

    monkeypatch.setattr("app.services.onboarding_service.resolve_website_scope", lambda raw_url: f"https://{raw_url.strip()}")

    from app.services.billing_service import BillingActionsSummary
    monkeypatch.setattr(
        "app.services.onboarding_service.get_billing_actions_summary",
        lambda *_args, **_kwargs: BillingActionsSummary(
            plan=BillingPlan.free,
            total_remaining=0,
            monthly_remaining=0,
            monthly_quota=0,
            topup_remaining=0,
            lifetime_remaining=0,
            is_widget_hidden=True,
            can_manage_subscription=False,
            subscription_status=None,
            subscription_renews_at=None,
        ),
    )

    client.post("/onboarding/start", headers=auth_headers())
    first = client.post("/onboarding/website", headers=auth_headers(), json={"url": "first.example.com"})
    second = client.post("/onboarding/website", headers=auth_headers(), json={"url": "second.example.com"})

    assert first.status_code == 201
    assert second.status_code == 403
    assert second.json()["detail"] == "Upgrade your plan to add knowledge sources"


def test_onboarding_website_rejects_over_quota_before_resolution(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.models import BillingPlan
    from app.services.billing_service import BillingActionsSummary

    _create_website()
    _create_onboarding_state()

    monkeypatch.setattr(
        "app.services.onboarding_service.get_billing_actions_summary",
        lambda *_args, **_kwargs: BillingActionsSummary(
            plan=BillingPlan.free,
            total_remaining=0,
            monthly_remaining=0,
            monthly_quota=0,
            topup_remaining=0,
            lifetime_remaining=0,
            is_widget_hidden=True,
            can_manage_subscription=False,
            subscription_status=None,
            subscription_renews_at=None,
        ),
    )
    monkeypatch.setattr(
        "app.services.onboarding_service.resolve_website_scope",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("should not resolve")),
    )

    response = client.post("/onboarding/website", headers=auth_headers(), json={"url": "second.example.com"})

    assert response.status_code == 403
    assert response.json()["detail"] == "Upgrade your plan to add knowledge sources"


def test_onboarding_website_reuses_existing_input_match_without_resolution_when_over_quota(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.models import BillingPlan
    from app.services.billing_service import BillingActionsSummary

    _create_website()
    _create_onboarding_state()

    monkeypatch.setattr(
        "app.services.onboarding_service.get_billing_actions_summary",
        lambda *_args, **_kwargs: BillingActionsSummary(
            plan=BillingPlan.free,
            total_remaining=0,
            monthly_remaining=0,
            monthly_quota=0,
            topup_remaining=0,
            lifetime_remaining=0,
            is_widget_hidden=True,
            can_manage_subscription=False,
            subscription_status=None,
            subscription_renews_at=None,
        ),
    )
    monkeypatch.setattr(
        "app.services.onboarding_service.resolve_website_scope",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("should not resolve")),
    )

    response = client.post("/onboarding/website", headers=auth_headers(), json={"url": "https://example.com"})

    assert response.status_code == 201
    assert response.json()["scopeUrl"] == "https://example.com"


def test_finalize_onboarding_creates_agent_and_marks_completion(client: TestClient):
    client.post("/onboarding/start", headers=auth_headers())
    response = client.post("/onboarding/finalize", headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["userId"] == "user_1"

    state = client.get("/onboarding/state", headers=auth_headers())
    assert state.status_code == 200
    assert state.json()["status"] == "completed"
    assert state.json()["shouldShow"] is False


def test_finalize_onboarding_is_idempotent_for_existing_agent(client: TestClient):
    client.post("/onboarding/start", headers=auth_headers())
    first = client.post("/onboarding/finalize", headers=auth_headers())
    second = client.post("/onboarding/finalize", headers=auth_headers())

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]


def test_start_does_not_force_existing_configured_users_into_onboarding(client: TestClient):
    _create_feature()

    response = client.post("/onboarding/start", headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["status"] == "not_applicable"
    assert response.json()["shouldShow"] is False
