import importlib
from datetime import UTC, datetime, timedelta
import socket

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.core.database import session_scope
from app.models import Agent, DocumentStatus, KnowledgeDocument, KnowledgeWebsite, WebsiteStatus
from app.services.knowledge_website_service import (
    SOURCE_KIND_WEBSITE_PAGE,
    WEBSITE_STALE_PROCESSING_INTERVAL,
    UnsafeWebsiteTargetError,
    canonicalize_url,
    create_website_record,
    delete_missing_website_pages,
    ensure_public_website_url,
    get_due_websites,
    get_knowledge_base_status,
    is_url_in_scope,
    mark_website_page_error,
    persist_website_page,
    scopes_overlap,
    upsert_website_page_processing,
)


@pytest.fixture(autouse=True)
def configure_settings(monkeypatch: pytest.MonkeyPatch):
    from app.core import database
    from app.core.config import get_settings

    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
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


def test_canonicalize_url_strips_tracking_params_and_fragments():
    result = canonicalize_url(
        "HTTPS://Knowledge.Example.com/docs/page/?utm_source=newsletter&id=1#section",
    )

    assert result == "https://knowledge.example.com/docs/page?id=1"


def test_canonicalize_url_normalizes_percent_encoded_path_segments():
    assert canonicalize_url(
        "https://knowledge.example.com/collections/4360760505-troubleshooting-%26-other-questions/",
    ) == "https://knowledge.example.com/collections/4360760505-troubleshooting-&-other-questions"


def test_ensure_public_website_url_blocks_local_targets():
    with pytest.raises(UnsafeWebsiteTargetError):
        ensure_public_website_url("http://localhost/docs")

    with pytest.raises(UnsafeWebsiteTargetError):
        ensure_public_website_url("http://127.0.0.1/docs")

    with pytest.raises(UnsafeWebsiteTargetError):
        ensure_public_website_url("http://169.254.169.254/latest/meta-data")


def test_ensure_public_website_url_allows_public_hosts(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        "app.services.knowledge_website_service.socket.getaddrinfo",
        lambda host, port, proto=0: [
            (0, 0, proto, "", ("93.184.216.34", 0)),
        ],
    )

    ensure_public_website_url("https://example.com/docs")


def test_ensure_public_website_url_re_resolves_hosts_each_time(monkeypatch: pytest.MonkeyPatch):
    responses = iter([
        [(0, 0, socket.IPPROTO_TCP, "", ("93.184.216.34", 0))],
        [(0, 0, socket.IPPROTO_TCP, "", ("127.0.0.1", 0))],
    ])

    monkeypatch.setattr(
        "app.services.knowledge_website_service.socket.getaddrinfo",
        lambda host, port, proto=0: next(responses),
    )

    ensure_public_website_url("https://example.com/docs")
    with pytest.raises(UnsafeWebsiteTargetError):
        ensure_public_website_url("https://example.com/docs")


def test_ensure_public_website_url_rejects_unresolved_hosts(monkeypatch: pytest.MonkeyPatch):
    def raise_gaierror(host, port, proto=0):
        raise socket.gaierror("dns failed")

    monkeypatch.setattr("app.services.knowledge_website_service.socket.getaddrinfo", raise_gaierror)

    with pytest.raises(UnsafeWebsiteTargetError):
        ensure_public_website_url("https://missing.example/docs")


def test_canonicalize_url_rejects_invalid_ports():
    with pytest.raises(HTTPException) as exc:
        canonicalize_url("https://knowledge.example.com:99999/docs")

    assert exc.value.status_code == 400


def test_is_url_in_scope_respects_path_subtrees():
    assert is_url_in_scope(
        "https://knowledge.example.com/docs/page-1",
        "https://knowledge.example.com/docs",
    )
    assert not is_url_in_scope(
        "https://knowledge.example.com/blog/post-1",
        "https://knowledge.example.com/docs",
    )


def test_scopes_overlap_detects_nested_paths():
    assert scopes_overlap(
        "https://knowledge.example.com/docs",
        "https://knowledge.example.com/docs/getting-started",
    )
    assert not scopes_overlap(
        "https://knowledge.example.com/docs",
        "https://knowledge.example.com/blog",
    )


def test_create_website_record_rejects_overlapping_scopes():
    with session_scope() as session:
        create_website_record(
            session,
            "user_1",
            "knowledge.example.com/docs",
            "https://knowledge.example.com/docs",
        )

    with session_scope() as session:
        with pytest.raises(HTTPException) as exc:
            create_website_record(
                session,
                "user_1",
                "knowledge.example.com/docs/page-1",
                "https://knowledge.example.com/docs/page-1",
            )

    assert exc.value.status_code == 409


def test_get_due_websites_includes_stale_processing_rows():
    with session_scope() as session:
        due_website = create_website_record(
            session,
            "user_1",
            "knowledge.example.com/docs",
            "https://knowledge.example.com/docs",
        )
        due_website.status = WebsiteStatus.ready
        due_website.next_refresh_at = datetime.now(tz=UTC) - timedelta(minutes=5)

        stale_processing_website = create_website_record(
            session,
            "user_1",
            "knowledge.example.com/help",
            "https://knowledge.example.com/help",
        )
        stale_processing_website.next_refresh_at = datetime.now(tz=UTC) + timedelta(days=7)
        stale_processing_website.updated_at = datetime.now(tz=UTC) - WEBSITE_STALE_PROCESSING_INTERVAL - timedelta(minutes=5)

        fresh_processing_website = create_website_record(
            session,
            "user_1",
            "knowledge.example.com/blog",
            "https://knowledge.example.com/blog",
        )
        fresh_processing_website.next_refresh_at = datetime.now(tz=UTC) + timedelta(days=7)
        fresh_processing_website.updated_at = datetime.now(tz=UTC)
        due_website_id = due_website.id
        stale_processing_website_id = stale_processing_website.id
        fresh_processing_website_id = fresh_processing_website.id

    with session_scope() as session:
        due_websites = get_due_websites(session, limit=10)

    assert (due_website_id, "user_1") in due_websites
    assert (stale_processing_website_id, "user_1") in due_websites
    assert (fresh_processing_website_id, "user_1") not in due_websites


def test_get_knowledge_base_status_counts_searchable_website_sources():
    with session_scope() as session:
        agent = Agent(user_id="user_1", knowledge_base_enabled=True)
        session.add(agent)
        website = create_website_record(
            session,
            "user_1",
            "knowledge.example.com/docs",
            "https://knowledge.example.com/docs",
        )
        session.add(
            KnowledgeDocument(
                user_id="user_1",
                file_name="Page",
                file_type=".html",
                file_size=120,
                source_kind=SOURCE_KIND_WEBSITE_PAGE,
                website_id=website.id,
                source_url="https://knowledge.example.com/docs/page-1",
                status=DocumentStatus.ready,
                chunk_count=2,
                is_searchable=True,
            )
        )

    with session_scope() as session:
        status = get_knowledge_base_status(session, "user_1")

    assert status == {
        "enabled": True,
        "document_count": 1,
        "ready_document_count": 1,
    }


def test_mark_website_page_error_keeps_last_good_page_searchable():
    with session_scope() as session:
        website = create_website_record(
            session,
            "user_1",
            "knowledge.example.com/docs",
            "https://knowledge.example.com/docs",
        )
        document = KnowledgeDocument(
            user_id="user_1",
            file_name="Page",
            file_type=".html",
            file_size=120,
            source_kind=SOURCE_KIND_WEBSITE_PAGE,
            website_id=website.id,
            source_url="https://knowledge.example.com/docs/page-1",
            status=DocumentStatus.ready,
            chunk_count=2,
            is_searchable=True,
        )
        session.add(document)

    with session_scope() as session:
        website = session.scalar(select(KnowledgeWebsite))
        mark_website_page_error(
            session,
            website.id,
            "user_1",
            "https://knowledge.example.com/docs/page-1",
            "https://knowledge.example.com/docs/page-1",
            "Page",
            "This page is not publicly accessible",
        )
        page = session.scalar(
            select(KnowledgeDocument).where(KnowledgeDocument.website_id == website.id)
        )
        page_status = page.status
        page_searchable = page.is_searchable
        page_error = page.error_message

    assert page_status == DocumentStatus.error
    assert page_searchable is True
    assert page_error == "This page is not publicly accessible"


def test_persist_website_page_rewrites_chunks_even_when_hash_is_unchanged(monkeypatch: pytest.MonkeyPatch):
    embedding_calls = []

    monkeypatch.setattr(
        "app.services.knowledge_website_service.upsert_knowledge_embedding",
        lambda session, chunk_id, user_id: embedding_calls.append(chunk_id),
    )

    with session_scope() as session:
        website = create_website_record(
            session,
            "user_1",
            "knowledge.example.com/docs",
            "https://knowledge.example.com/docs",
        )
        persist_website_page(
            session,
            website.id,
            "user_1",
            "https://knowledge.example.com/docs/page-1",
            "https://knowledge.example.com/docs/page-1",
            "Page",
            120,
            "same-hash",
            [{"content": "hello", "metadata": {}}],
        )

    with session_scope() as session:
        website = session.scalar(select(KnowledgeWebsite))
        existing_document = session.scalar(
            select(KnowledgeDocument).where(KnowledgeDocument.website_id == website.id)
        )
        existing_chunk_count = existing_document.chunk_count
        persist_website_page(
            session,
            website.id,
            "user_1",
            "https://knowledge.example.com/docs/page-1",
            "https://knowledge.example.com/docs/page-1",
            "Page",
            120,
            "same-hash",
            [{"content": "hello", "metadata": {}}],
        )
        refreshed_document = session.scalar(
            select(KnowledgeDocument).where(KnowledgeDocument.website_id == website.id)
        )
        refreshed_chunk_count = refreshed_document.chunk_count

    assert len(embedding_calls) == 2
    assert refreshed_chunk_count == existing_chunk_count


def test_refresh_collapses_alias_rows_into_one_searchable_page(monkeypatch: pytest.MonkeyPatch):
    embedding_calls = []

    monkeypatch.setattr(
        "app.services.knowledge_website_service.upsert_knowledge_embedding",
        lambda session, chunk_id, user_id: embedding_calls.append(chunk_id),
    )

    with session_scope() as session:
        website = create_website_record(
            session,
            "user_1",
            "knowledge.example.com/docs",
            "https://knowledge.example.com/docs",
        )
        session.add(
            KnowledgeDocument(
                user_id="user_1",
                file_name="Troubleshooting",
                file_type=".html",
                file_size=120,
                source_kind=SOURCE_KIND_WEBSITE_PAGE,
                website_id=website.id,
                source_url="https://knowledge.example.com/collections/4360760505-troubleshooting-%26-other-questions",
                source_hash="old-hash",
                status=DocumentStatus.ready,
                chunk_count=1,
                is_searchable=True,
            )
        )
        session.add(
            KnowledgeDocument(
                user_id="user_1",
                file_name="4360760505-troubleshooting-&-other-questions",
                file_type=".html",
                file_size=0,
                source_kind=SOURCE_KIND_WEBSITE_PAGE,
                website_id=website.id,
                source_url="https://knowledge.example.com/collections/4360760505-troubleshooting-&-other-questions",
                status=DocumentStatus.processing,
                chunk_count=0,
                is_searchable=False,
            )
        )

    with session_scope() as session:
        website = session.scalar(select(KnowledgeWebsite))
        document = upsert_website_page_processing(
            session,
            website.id,
            "user_1",
            "https://knowledge.example.com/collections/4360760505-troubleshooting-&-other-questions",
            "Troubleshooting",
        )

        assert document.status == DocumentStatus.processing
        assert document.is_searchable is True

        persist_website_page(
            session,
            website.id,
            "user_1",
            "https://knowledge.example.com/collections/4360760505-troubleshooting-&-other-questions",
            "https://knowledge.example.com/collections/4360760505-troubleshooting-&-other-questions",
            "Troubleshooting",
            240,
            "new-hash",
            [{"content": "hello", "metadata": {}}],
        )

    with session_scope() as session:
        website = session.scalar(select(KnowledgeWebsite))
        documents = list(
            session.scalars(
                select(KnowledgeDocument).where(KnowledgeDocument.website_id == website.id)
            ).all()
        )
        rows = [
            (
                document.source_url,
                document.status,
                document.is_searchable,
                document.chunk_count,
            )
            for document in documents
        ]

    assert len(rows) == 1
    assert rows[0][0] == "https://knowledge.example.com/collections/4360760505-troubleshooting-&-other-questions"
    assert rows[0][1] == DocumentStatus.ready
    assert rows[0][2] is True
    assert rows[0][3] == 1
    assert len(embedding_calls) == 1


def test_delete_missing_website_pages_removes_only_unseen_pages():
    with session_scope() as session:
        website = create_website_record(
            session,
            "user_1",
            "knowledge.example.com/docs",
            "https://knowledge.example.com/docs",
        )
        session.add_all(
            [
                KnowledgeDocument(
                    user_id="user_1",
                    file_name="Page 1",
                    file_type=".html",
                    file_size=100,
                    source_kind=SOURCE_KIND_WEBSITE_PAGE,
                    website_id=website.id,
                    source_url="https://knowledge.example.com/docs/page-1",
                    status=DocumentStatus.ready,
                    is_searchable=True,
                ),
                KnowledgeDocument(
                    user_id="user_1",
                    file_name="Page 2",
                    file_type=".html",
                    file_size=100,
                    source_kind=SOURCE_KIND_WEBSITE_PAGE,
                    website_id=website.id,
                    source_url="https://knowledge.example.com/docs/page-2",
                    status=DocumentStatus.ready,
                    is_searchable=True,
                ),
            ]
        )

    with session_scope() as session:
        website = session.scalar(select(KnowledgeWebsite))
        delete_missing_website_pages(
            session,
            website.id,
            {"https://knowledge.example.com/docs/page-1"},
        )
        remaining = list(
            session.scalars(
                select(KnowledgeDocument).where(
                    KnowledgeDocument.website_id == website.id
                )
            ).all()
        )
        remaining_urls = [document.source_url for document in remaining]

    assert len(remaining_urls) == 1
    assert remaining_urls[0] == "https://knowledge.example.com/docs/page-1"
