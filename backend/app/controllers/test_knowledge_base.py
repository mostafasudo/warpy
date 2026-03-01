import importlib
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

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
        monkeypatch.setattr("app.services.tool_service.enqueue_tool_embedding", lambda *_args, **_kwargs: None)
        monkeypatch.setattr("app.workers.knowledge_base_jobs.enqueue_document_processing", lambda *_args, **_kwargs: None)
        yield get_settings()
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


def create_agent():
    """Helper to ensure an agent exists for the user."""
    from app.core.database import session_scope
    from app.models import Agent
    with session_scope() as session:
        agent = Agent(user_id="user_1")
        session.add(agent)
        session.flush()
        return str(agent.id)


def test_get_status_returns_defaults(client: TestClient):
    response = client.get("/knowledge-base/status", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is False
    assert data["documentCount"] == 0
    assert data["readyDocumentCount"] == 0


def test_upload_document_success(client: TestClient):
    response = client.post(
        "/knowledge-base/documents",
        files={"file": ("test.pdf", b"fake pdf content", "application/pdf")},
        headers=auth_headers(),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["fileName"] == "test.pdf"
    assert data["fileType"] == ".pdf"
    assert data["status"] == "processing"


def test_upload_document_invalid_extension(client: TestClient):
    response = client.post(
        "/knowledge-base/documents",
        files={"file": ("test.exe", b"data", "application/octet-stream")},
        headers=auth_headers(),
    )
    assert response.status_code == 400
    assert "not supported" in response.json()["detail"]


def test_list_documents(client: TestClient):
    client.post(
        "/knowledge-base/documents",
        files={"file": ("a.pdf", b"data", "application/pdf")},
        headers=auth_headers(),
    )
    response = client.get("/knowledge-base/documents", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1


def test_delete_document(client: TestClient):
    upload = client.post(
        "/knowledge-base/documents",
        files={"file": ("b.pdf", b"data", "application/pdf")},
        headers=auth_headers(),
    )
    doc_id = upload.json()["id"]
    response = client.delete(f"/knowledge-base/documents/{doc_id}", headers=auth_headers())
    assert response.status_code == 204

    response = client.get("/knowledge-base/documents", headers=auth_headers())
    assert response.json()["total"] == 0


def test_delete_document_not_found(client: TestClient):
    fake_id = "00000000-0000-0000-0000-000000000099"
    response = client.delete(f"/knowledge-base/documents/{fake_id}", headers=auth_headers())
    assert response.status_code == 404


def test_toggle_requires_agent(client: TestClient):
    response = client.put(
        "/knowledge-base/toggle",
        json={"enabled": True},
        headers=auth_headers(),
    )
    assert response.status_code == 404


def test_toggle_requires_ready_docs(client: TestClient):
    create_agent()
    response = client.put(
        "/knowledge-base/toggle",
        json={"enabled": True},
        headers=auth_headers(),
    )
    assert response.status_code == 400


def test_documents_are_user_scoped(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    client.post(
        "/knowledge-base/documents",
        files={"file": ("c.pdf", b"data", "application/pdf")},
        headers=auth_headers(),
    )

    monkeypatch.setattr(
        "app.core.auth.verify_clerk_session",
        lambda token, forwarded_headers=None: ClerkSession(id="sess_2", user_id="user_2", status="active"),
    )

    response = client.get("/knowledge-base/documents", headers=auth_headers())
    assert response.json()["total"] == 0


def _insert_chunks(doc_id: str, user_id: str, contents: list[str]):
    from app.core.database import session_scope
    from app.models import DocumentStatus, KnowledgeChunk, KnowledgeDocument
    uid = UUID(doc_id)
    with session_scope() as session:
        doc = session.get(KnowledgeDocument, uid)
        if not doc:
            raise ValueError(f"Document {doc_id} not found")
        doc.status = DocumentStatus.ready
        doc.chunk_count = len(contents)
        for i, text in enumerate(contents):
            chunk = KnowledgeChunk(document_id=uid, user_id=user_id, content=text, chunk_index=i)
            session.add(chunk)


def test_get_document_content_success(client: TestClient):
    upload = client.post(
        "/knowledge-base/documents",
        files={"file": ("content.pdf", b"data", "application/pdf")},
        headers=auth_headers(),
    )
    doc_id = upload.json()["id"]
    _insert_chunks(doc_id, "user_1", ["Hello world", "Second section"])
    response = client.get(f"/knowledge-base/documents/{doc_id}/content", headers=auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["documentId"] == doc_id
    assert data["fileName"] == "content.pdf"
    assert data["totalChunks"] == 2
    assert len(data["chunks"]) == 2
    assert data["chunks"][0]["content"] == "Hello world"
    assert data["chunks"][0]["chunkIndex"] == 0
    assert data["chunks"][1]["content"] == "Second section"
    assert data["chunks"][1]["chunkIndex"] == 1


def test_upload_blocked_for_free_plan_with_no_actions(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    from app.services.billing_service import BillingActionsSummary
    from app.models import BillingPlan

    monkeypatch.setattr(
        "app.controllers.knowledge_base.get_billing_actions_summary",
        lambda session, user_id: BillingActionsSummary(
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
    response = client.post(
        "/knowledge-base/documents",
        files={"file": ("test.pdf", b"fake pdf content", "application/pdf")},
        headers=auth_headers(),
    )
    assert response.status_code == 403
    assert "Upgrade" in response.json()["detail"]


def test_upload_allowed_for_free_plan_with_actions(client: TestClient):
    response = client.post(
        "/knowledge-base/documents",
        files={"file": ("test.pdf", b"fake pdf content", "application/pdf")},
        headers=auth_headers(),
    )
    assert response.status_code == 201


def test_get_document_content_not_found(client: TestClient):
    fake_id = "00000000-0000-0000-0000-000000000099"
    response = client.get(f"/knowledge-base/documents/{fake_id}/content", headers=auth_headers())
    assert response.status_code == 404


def test_get_document_content_user_scoped(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    upload = client.post(
        "/knowledge-base/documents",
        files={"file": ("scoped.pdf", b"data", "application/pdf")},
        headers=auth_headers(),
    )
    doc_id = upload.json()["id"]
    _insert_chunks(doc_id, "user_1", ["Chunk A"])

    monkeypatch.setattr(
        "app.core.auth.verify_clerk_session",
        lambda token, forwarded_headers=None: ClerkSession(id="sess_2", user_id="user_2", status="active"),
    )

    response = client.get(f"/knowledge-base/documents/{doc_id}/content", headers=auth_headers())
    assert response.status_code == 404
