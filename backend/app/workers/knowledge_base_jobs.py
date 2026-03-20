from collections import deque
from datetime import UTC, datetime
from uuid import UUID

import httpx
from rq import Repeat, Retry
from rq.job import Job
from sqlalchemy import exists, or_, select

from ..core.database import session_scope
from ..core.logger import log_error, log_info
from ..models import DocumentStatus, KnowledgeChunk, KnowledgeDocument, KnowledgeWebsite, WebsiteStatus
from ..services.knowledge_base_service import update_document_status
from ..services.knowledge_chunking_service import build_chunk_search_text, chunk_elements, infer_content_language
from ..services.knowledge_website_crawler import (
    BrowserRenderer,
    WebsiteCrawlError,
    build_http_client,
    crawl_page,
    discover_sitemap_urls,
)
from ..services.knowledge_website_service import (
    SOURCE_KIND_FILE,
    SOURCE_KIND_WEBSITE_PAGE,
    WEBSITE_REFRESH_INTERVAL,
    UnsafeWebsiteTargetError,
    delete_missing_website_pages,
    discard_website_page_processing,
    get_due_websites,
    get_page_display_name,
    get_website_for_worker,
    mark_website_page_error,
    persist_website_page,
    update_website_state,
    upsert_website_page_processing,
)
from ..services.knowledge_embedding_service import upsert_knowledge_embedding
from ..services.unstructured_service import parse_document
from .queue import get_queue


retry_policy = Retry(max=3, interval=[10, 60, 300])
website_retry_policy = Retry(max=2, interval=[30, 120])

SAFE_ERROR_MESSAGES = {
    "HTTPStatusError": "The document could not be processed by the parsing service. Please try again or use a different file format.",
    "ConnectError": "Could not reach the document parsing service. Please try again later.",
    "TimeoutException": "Document processing timed out. Try uploading a smaller file.",
    "ConnectionError": "Could not reach the document parsing service. Please try again later.",
}
WEBSITE_SAFE_ERROR_MESSAGES = {
    401: "This page is not publicly accessible",
    403: "This page is not publicly accessible",
    404: "This page could not be found",
}
DEFAULT_ERROR_MESSAGE = "Something went wrong while processing this document. Please try again or contact support."
DEFAULT_WEBSITE_ERROR_MESSAGE = "We couldn't read this page."
WEBSITE_ROOT_ERROR_MESSAGE = "We couldn't read this website. Make sure it is publicly accessible and try again."
WEBSITE_PARTIAL_ERROR_MESSAGE = "Some pages couldn't be read. We're still using the pages that worked."
WEBSITE_LIMIT_ERROR_MESSAGE = "We read part of this website, but there are more pages than we could finish."
WEBSITE_NO_CONTENT_ERROR_MESSAGE = "We couldn't find any readable content on this website."
WEBSITE_PAGE_LIMIT = 2000
WEBSITE_JOB_TIMEOUT = 1800
WEBSITE_SWEEP_JOB_ID = "knowledge-base-website-refresh-sweep"
WEBSITE_SWEEP_INTERVAL_SECONDS = 3600
WEBSITE_SWEEP_REPEAT_TIMES = 24 * 365 * 5
WEBSITE_SWEEP_BATCH_SIZE = 10
WEBSITE_ENQUEUE_LOCK_TIMEOUT_SECONDS = 30
WEBSITE_ENQUEUE_LOCK_BLOCKING_TIMEOUT_SECONDS = 5
KB_RETRIEVAL_BACKFILL_JOB_ID = "knowledge-base-retrieval-backfill"


def _sanitize_error(exc: Exception) -> str:
    exc_name = type(exc).__name__
    for parent in type(exc).__mro__:
        if parent.__name__ in SAFE_ERROR_MESSAGES:
            return SAFE_ERROR_MESSAGES[parent.__name__]
    for key, message in SAFE_ERROR_MESSAGES.items():
        if key in exc_name:
            return message
    return DEFAULT_ERROR_MESSAGE


def _sanitize_website_error(exc: Exception) -> str:
    if isinstance(exc, WebsiteCrawlError):
        return str(exc)
    if isinstance(exc, UnsafeWebsiteTargetError):
        return str(exc)
    if isinstance(exc, httpx.HTTPStatusError):
        message = WEBSITE_SAFE_ERROR_MESSAGES.get(exc.response.status_code)
        if message:
            return message
    if isinstance(exc, httpx.TimeoutException):
        return "This page took too long to load"
    if "TimeoutError" in type(exc).__name__:
        return "This page took too long to load"
    if isinstance(exc, httpx.ConnectError):
        return "We couldn't reach this page"
    if isinstance(exc, httpx.RequestError):
        return "We couldn't reach this page"
    return DEFAULT_WEBSITE_ERROR_MESSAGE


def _fetch_job(job_id: str):
    try:
        return Job.fetch(job_id, connection=get_queue().connection)
    except Exception:
        return None


def _job_is_active(job: Job | None) -> bool:
    if not job:
        return False
    try:
        return job.get_status(refresh=False) in {"queued", "started", "scheduled", "deferred"}
    except Exception:
        return False


def _website_job_id(website_id: UUID) -> str:
    return f"knowledge-base-website-{website_id}"


def _website_enqueue_lock_key(website_id: UUID) -> str:
    return f"knowledge-base-website-enqueue-{website_id}"


def ensure_website_refresh_sweep() -> None:
    queue = get_queue()
    existing = _fetch_job(WEBSITE_SWEEP_JOB_ID)
    if _job_is_active(existing):
        return
    if existing:
        existing.delete()
    queue.enqueue(
        process_website_refresh_sweep,
        job_id=WEBSITE_SWEEP_JOB_ID,
        repeat=Repeat(times=WEBSITE_SWEEP_REPEAT_TIMES, interval=WEBSITE_SWEEP_INTERVAL_SECONDS),
        retry=retry_policy,
        job_timeout=600,
        result_ttl=0,
    )


def _file_documents_needing_backfill(session) -> list[KnowledgeDocument]:
    return list(
        session.scalars(
            select(KnowledgeDocument).where(
                KnowledgeDocument.source_kind == SOURCE_KIND_FILE,
                or_(
                    KnowledgeDocument.content_language.is_(None),
                    exists(
                        select(KnowledgeChunk.id).where(
                            KnowledgeChunk.document_id == KnowledgeDocument.id,
                            or_(
                                KnowledgeChunk.search_text.is_(None),
                                KnowledgeChunk.search_text == "",
                            ),
                        )
                    ),
                ),
            )
        ).all()
    )


def _has_file_documents_needing_backfill(session) -> bool:
    return bool(
        session.scalar(
            select(KnowledgeDocument.id).where(
                KnowledgeDocument.source_kind == SOURCE_KIND_FILE,
                or_(
                    KnowledgeDocument.content_language.is_(None),
                    exists(
                        select(KnowledgeChunk.id).where(
                            KnowledgeChunk.document_id == KnowledgeDocument.id,
                            or_(
                                KnowledgeChunk.search_text.is_(None),
                                KnowledgeChunk.search_text == "",
                            ),
                        )
                    ),
                ),
            ).limit(1)
        )
    )


def _website_sources_needing_backfill(session) -> list[tuple[UUID, str]]:
    rows = session.execute(
        select(KnowledgeWebsite.id, KnowledgeWebsite.user_id).where(
            exists(
                select(KnowledgeDocument.id).where(
                    KnowledgeDocument.website_id == KnowledgeWebsite.id,
                    KnowledgeDocument.source_kind == SOURCE_KIND_WEBSITE_PAGE,
                    or_(
                        KnowledgeDocument.content_language.is_(None),
                        exists(
                            select(KnowledgeChunk.id).where(
                                KnowledgeChunk.document_id == KnowledgeDocument.id,
                                or_(
                                    KnowledgeChunk.search_text.is_(None),
                                    KnowledgeChunk.search_text == "",
                                ),
                            )
                        ),
                    ),
                )
            )
        )
    ).all()
    return [(website_id, website_user_id) for website_id, website_user_id in rows]


def _has_website_sources_needing_backfill(session) -> bool:
    return bool(
        session.scalar(
            select(KnowledgeWebsite.id).where(
                exists(
                    select(KnowledgeDocument.id).where(
                        KnowledgeDocument.website_id == KnowledgeWebsite.id,
                        KnowledgeDocument.source_kind == SOURCE_KIND_WEBSITE_PAGE,
                        or_(
                            KnowledgeDocument.content_language.is_(None),
                            exists(
                                select(KnowledgeChunk.id).where(
                                    KnowledgeChunk.document_id == KnowledgeDocument.id,
                                    or_(
                                        KnowledgeChunk.search_text.is_(None),
                                        KnowledgeChunk.search_text == "",
                                    ),
                                )
                            ),
                        ),
                    )
                )
            ).limit(1)
        )
    )


def ensure_knowledge_base_retrieval_backfill() -> None:
    existing = _fetch_job(KB_RETRIEVAL_BACKFILL_JOB_ID)
    if _job_is_active(existing):
        return

    with session_scope() as session:
        if not _has_file_documents_needing_backfill(session) and not _has_website_sources_needing_backfill(session):
            return

    queue = get_queue()
    if existing:
        existing.delete()
    queue.enqueue(
        process_knowledge_base_retrieval_backfill,
        job_id=KB_RETRIEVAL_BACKFILL_JOB_ID,
        retry=retry_policy,
        job_timeout=WEBSITE_JOB_TIMEOUT,
        result_ttl=0,
    )


def enqueue_document_processing(document_id: UUID, user_id: str, file_bytes: bytes, file_name: str) -> None:
    try:
        queue = get_queue()
        queue.enqueue(
            process_document,
            str(document_id),
            user_id,
            file_bytes,
            file_name,
            retry=retry_policy,
            job_timeout=600,
        )
        log_info("KBWorker", "enqueue_document_processing", "Job enqueued", document_id=str(document_id))
    except Exception as exc:
        log_error("KBWorker", "enqueue_document_processing", "Failed to enqueue", exc=exc, document_id=str(document_id))
        try:
            with session_scope() as session:
                update_document_status(session, document_id, DocumentStatus.error, error_message="Failed to queue document for processing. Please try again.")
        except Exception as status_exc:
            log_error("KBWorker", "enqueue_document_processing", "Failed to update error status", exc=status_exc, document_id=str(document_id))


def enqueue_website_processing(website_id: UUID, user_id: str) -> None:
    try:
        ensure_website_refresh_sweep()
        queue = get_queue()
        connection = queue.connection
        lock_factory = getattr(connection, "lock", None)
        lock = None
        lock_acquired = True
        if callable(lock_factory):
            lock = lock_factory(
                _website_enqueue_lock_key(website_id),
                timeout=WEBSITE_ENQUEUE_LOCK_TIMEOUT_SECONDS,
                blocking_timeout=WEBSITE_ENQUEUE_LOCK_BLOCKING_TIMEOUT_SECONDS,
            )
            lock_acquired = bool(lock.acquire())
            if not lock_acquired:
                log_info("KBWorker", "enqueue_website_processing", "Enqueue already in progress", website_id=str(website_id))
                return

        try:
            job_id = _website_job_id(website_id)
            existing = _fetch_job(job_id)
            if _job_is_active(existing):
                return
            if existing:
                existing.delete()
            queue.enqueue(
                process_website,
                str(website_id),
                user_id,
                job_id=job_id,
                retry=website_retry_policy,
                job_timeout=WEBSITE_JOB_TIMEOUT,
            )
        finally:
            if lock is not None and lock_acquired:
                try:
                    lock.release()
                except Exception:
                    pass
        log_info("KBWorker", "enqueue_website_processing", "Job enqueued", website_id=str(website_id))
    except Exception as exc:
        log_error("KBWorker", "enqueue_website_processing", "Failed to enqueue", exc=exc, website_id=str(website_id))
        try:
            with session_scope() as session:
                update_website_state(
                    session,
                    website_id,
                    user_id,
                    WebsiteStatus.error,
                    error_message="Failed to queue this website. Please try again.",
                    next_refresh_at=datetime.now(tz=UTC),
                )
        except Exception as status_exc:
            log_error("KBWorker", "enqueue_website_processing", "Failed to update website error status", exc=status_exc, website_id=str(website_id))


def process_document(document_id: str, user_id: str, file_bytes: bytes, file_name: str) -> None:
    try:
        parsed_id = UUID(document_id)
    except ValueError as exc:
        log_error("KBWorker", "process_document", "Invalid document id", exc=exc, document_id=document_id)
        return

    try:
        elements = parse_document(file_bytes, file_name)
        chunks = chunk_elements(elements)
        content_language = infer_content_language("\n".join(chunk["content"] for chunk in chunks))

        if not chunks:
            with session_scope() as session:
                update_document_status(session, parsed_id, DocumentStatus.error, error_message="No content could be extracted from this file")
            return

        with session_scope() as session:
            document = session.get(KnowledgeDocument, parsed_id)
            for index, chunk_data in enumerate(chunks):
                section_title = chunk_data.get("section_title")
                chunk = KnowledgeChunk(
                    document_id=parsed_id,
                    user_id=user_id,
                    content=chunk_data["content"],
                    section_title=section_title,
                    search_text=build_chunk_search_text(
                        chunk_data["content"],
                        document_title=file_name,
                        section_title=section_title,
                    ),
                    chunk_index=index,
                    chunk_metadata=chunk_data.get("metadata"),
                )
                session.add(chunk)
                session.flush()
                upsert_knowledge_embedding(session, chunk.id, user_id)
            if document is not None:
                document.content_language = content_language
            update_document_status(session, parsed_id, DocumentStatus.ready, chunk_count=len(chunks))

        log_info("KBWorker", "process_document", "Document processed", document_id=document_id, chunks=len(chunks))
    except Exception as exc:
        log_error("KBWorker", "process_document", "Failed to process", exc=exc, document_id=document_id)
        try:
            with session_scope() as session:
                update_document_status(session, parsed_id, DocumentStatus.error, error_message=_sanitize_error(exc))
        except Exception as status_exc:
            log_error("KBWorker", "process_document", "Failed to update error status", exc=status_exc, document_id=document_id)
        raise


def process_website_refresh_sweep() -> None:
    enqueued = 0
    try:
        with session_scope() as session:
            websites = get_due_websites(session, WEBSITE_SWEEP_BATCH_SIZE)
        for website_id, website_user_id in websites:
            enqueue_website_processing(website_id, website_user_id)
            enqueued += 1
        log_info("KBWorker", "process_website_refresh_sweep", "Sweep completed", enqueued=enqueued)
    except Exception as exc:
        log_error("KBWorker", "process_website_refresh_sweep", "Sweep failed", exc=exc)
        raise


def process_knowledge_base_retrieval_backfill() -> None:
    website_jobs: list[tuple[UUID, str]] = []
    file_backfilled = 0

    with session_scope() as session:
        for document in _file_documents_needing_backfill(session):
            chunks = list(
                session.scalars(
                    select(KnowledgeChunk)
                    .where(KnowledgeChunk.document_id == document.id)
                    .order_by(KnowledgeChunk.chunk_index.asc())
                ).all()
            )
            if not chunks:
                continue
            document.content_language = infer_content_language("\n".join(chunk.content for chunk in chunks))
            for chunk in chunks:
                chunk.search_text = build_chunk_search_text(
                    chunk.content,
                    document_title=document.file_name,
                    section_title=chunk.section_title,
                    source_url=document.source_url,
                )
                upsert_knowledge_embedding(session, chunk.id, document.user_id)
            file_backfilled += 1

        website_jobs = _website_sources_needing_backfill(session)

    for website_id, website_user_id in website_jobs:
        enqueue_website_processing(website_id, website_user_id)

    log_info(
        "KBWorker",
        "process_knowledge_base_retrieval_backfill",
        "Backfill completed",
        file_documents=file_backfilled,
        websites=len(website_jobs),
    )


def process_website(website_id: str, user_id: str) -> None:
    try:
        parsed_id = UUID(website_id)
    except ValueError as exc:
        log_error("KBWorker", "process_website", "Invalid website id", exc=exc, website_id=website_id)
        return

    started_at = datetime.now(tz=UTC)
    pending = deque()
    queued_urls: set[str] = set()
    successful_urls: set[str] = set()
    success_count = 0
    failure_count = 0
    hit_limit = False
    sitemap_truncated = False
    root_error_message: str | None = None
    root_url: str | None = None

    with session_scope() as session:
        website = get_website_for_worker(session, parsed_id, user_id)
        if not website:
            return
        pending.append(website.scope_url)
        queued_urls.add(website.scope_url)
        root_url = website.scope_url
        update_website_state(
            session,
            parsed_id,
            user_id,
            WebsiteStatus.processing,
            error_message=None,
            next_refresh_at=started_at + WEBSITE_REFRESH_INTERVAL,
        )

    client = None
    browser = None

    try:
        client = build_http_client()
        browser = BrowserRenderer()
        sitemap_discovery = discover_sitemap_urls(client, root_url or "")
        discovered_from_sitemap = getattr(sitemap_discovery, "urls", sitemap_discovery)
        sitemap_truncated = bool(getattr(sitemap_discovery, "truncated", False))

        def enqueue_links(urls: set[str]) -> None:
            nonlocal hit_limit
            for link in sorted(urls):
                if link in queued_urls or link in successful_urls:
                    continue
                if len(queued_urls) >= WEBSITE_PAGE_LIMIT:
                    hit_limit = True
                    continue
                pending.append(link)
                queued_urls.add(link)

        enqueue_links(discovered_from_sitemap)
        while pending:
            current_url = pending.popleft()
            with session_scope() as session:
                website = get_website_for_worker(session, parsed_id, user_id)
                if not website:
                    return
                scope_url = website.scope_url
                upsert_website_page_processing(
                    session,
                    parsed_id,
                    user_id,
                    current_url,
                    get_page_display_name(current_url),
                )

            try:
                page = crawl_page(client, browser, current_url, scope_url)
                enqueue_links(page.links)
                chunks = chunk_elements(page.elements)
                is_discovery_only_page = not chunks and (
                    bool(page.links) or (current_url == root_url and bool(discovered_from_sitemap))
                )
                if is_discovery_only_page:
                    with session_scope() as session:
                        website = get_website_for_worker(session, parsed_id, user_id)
                        if not website:
                            return
                        discard_website_page_processing(
                            session,
                            parsed_id,
                            current_url,
                            alternate_url=page.page_url,
                        )
                    continue
                if not chunks:
                    raise WebsiteCrawlError("We couldn't read any useful content from this page")
                with session_scope() as session:
                    website = get_website_for_worker(session, parsed_id, user_id)
                    if not website:
                        return
                    persist_website_page(
                        session,
                        parsed_id,
                        user_id,
                        current_url,
                        page.page_url,
                        page.page_name,
                        page.file_size,
                        page.source_hash,
                        chunks,
                    )
                success_count += 1
                successful_urls.add(page.page_url)
            except Exception as exc:
                failure_count += 1
                friendly_error = _sanitize_website_error(exc)
                if current_url == root_url:
                    root_error_message = friendly_error
                with session_scope() as session:
                    website = get_website_for_worker(session, parsed_id, user_id)
                    if not website:
                        return
                    mark_website_page_error(
                        session,
                        parsed_id,
                        user_id,
                        current_url,
                        current_url,
                        get_page_display_name(current_url),
                        friendly_error,
                    )
                log_error("KBWorker", "process_website", "Page failed", exc=exc, website_id=website_id, page_url=current_url)

        finished_at = datetime.now(tz=UTC)
        with session_scope() as session:
            website = get_website_for_worker(session, parsed_id, user_id)
            if not website:
                return

            if success_count == 0 and failure_count > 0:
                update_website_state(
                    session,
                    parsed_id,
                    user_id,
                    WebsiteStatus.error,
                    error_message=root_error_message or WEBSITE_ROOT_ERROR_MESSAGE,
                    last_crawled_at=finished_at,
                    next_refresh_at=finished_at + WEBSITE_REFRESH_INTERVAL,
                )
                return

            if success_count == 0 and failure_count == 0:
                update_website_state(
                    session,
                    parsed_id,
                    user_id,
                    WebsiteStatus.error,
                    error_message=WEBSITE_NO_CONTENT_ERROR_MESSAGE,
                    last_crawled_at=finished_at,
                    next_refresh_at=finished_at + WEBSITE_REFRESH_INTERVAL,
                )
                return

            if hit_limit or sitemap_truncated:
                update_website_state(
                    session,
                    parsed_id,
                    user_id,
                    WebsiteStatus.partial,
                    error_message=WEBSITE_LIMIT_ERROR_MESSAGE,
                    last_crawled_at=finished_at,
                    next_refresh_at=finished_at + WEBSITE_REFRESH_INTERVAL,
                )
                return

            if failure_count > 0:
                update_website_state(
                    session,
                    parsed_id,
                    user_id,
                    WebsiteStatus.partial,
                    error_message=WEBSITE_PARTIAL_ERROR_MESSAGE,
                    last_crawled_at=finished_at,
                    next_refresh_at=finished_at + WEBSITE_REFRESH_INTERVAL,
                )
                return

            delete_missing_website_pages(session, parsed_id, successful_urls)
            update_website_state(
                session,
                parsed_id,
                user_id,
                WebsiteStatus.ready,
                error_message=None,
                last_crawled_at=finished_at,
                last_successful_crawled_at=finished_at,
                next_refresh_at=finished_at + WEBSITE_REFRESH_INTERVAL,
            )
        log_info("KBWorker", "process_website", "Website processed", website_id=website_id, pages=success_count, failures=failure_count)
    except Exception as exc:
        log_error("KBWorker", "process_website", "Failed to process website", exc=exc, website_id=website_id)
        try:
            with session_scope() as session:
                update_website_state(
                    session,
                    parsed_id,
                    user_id,
                    WebsiteStatus.error,
                    error_message=WEBSITE_ROOT_ERROR_MESSAGE,
                    last_crawled_at=datetime.now(tz=UTC),
                    next_refresh_at=datetime.now(tz=UTC) + WEBSITE_REFRESH_INTERVAL,
                )
        except Exception as status_exc:
            log_error("KBWorker", "process_website", "Failed to update website error status", exc=status_exc, website_id=website_id)
        raise
    finally:
        if client is not None:
            client.close()
        if browser is not None:
            browser.close()
