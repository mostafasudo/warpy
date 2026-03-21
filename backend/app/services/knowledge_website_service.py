from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import ipaddress
import socket
from typing import Any
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlparse, urlunparse

import httpx
from fastapi import HTTPException, status
from sqlalchemy import and_, case, exists, func, or_, select, text
from sqlalchemy.orm import Session

from ..core.logger import log_info
from ..models import Agent, DocumentStatus, KnowledgeChunk, KnowledgeDocument, KnowledgeWebsite, WebsiteStatus
from .knowledge_chunking_service import build_chunk_search_text, infer_content_language
from .knowledge_embedding_service import upsert_knowledge_embedding


SOURCE_KIND_FILE = "file"
SOURCE_KIND_WEBSITE_PAGE = "website_page"
WEBSITE_REFRESH_INTERVAL = timedelta(days=7)
WEBSITE_RESOLVE_TIMEOUT = httpx.Timeout(15.0, connect=5.0)
TRACKING_QUERY_KEYS = {
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "msclkid",
}
TRACKING_QUERY_PREFIXES = ("utm_",)
PATH_SEGMENT_SAFE_CHARS = "!$&'()*+,;=:@-._~"
STRICT_PATH_SEGMENT_SAFE_CHARS = "-._~"
BLOCKED_WEBSITE_HOSTS = {
    "localhost",
    "metadata",
    "metadata.google.internal",
}
BLOCKED_WEBSITE_HOST_SUFFIXES = (".internal", ".local", ".localhost")
WEBSITE_STALE_PROCESSING_INTERVAL = timedelta(minutes=45)


@dataclass(frozen=True)
class WebsiteCounts:
    page_count: int = 0
    ready_page_count: int = 0
    failed_page_count: int = 0
    searchable_page_count: int = 0


class UnsafeWebsiteTargetError(ValueError):
    pass


def _is_explicitly_blocked_host(host: str) -> bool:
    lowered_host = host.lower()
    return lowered_host in BLOCKED_WEBSITE_HOSTS or lowered_host.endswith(BLOCKED_WEBSITE_HOST_SUFFIXES)


def _resolve_host_addresses(host: str) -> tuple[str, ...]:
    addresses = {
        sockaddr[0]
        for _family, _type, _proto, _canonname, sockaddr in socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    }
    return tuple(sorted(addresses))


def ensure_public_website_url(raw_url: str, *, error_message: str = "Enter a public website") -> None:
    parsed = urlparse(raw_url.strip())
    scheme = (parsed.scheme or "").lower()
    if scheme not in {"http", "https"}:
        raise UnsafeWebsiteTargetError(error_message)

    host = (parsed.hostname or "").strip().lower()
    if not host or _is_explicitly_blocked_host(host):
        raise UnsafeWebsiteTargetError(error_message)

    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        try:
            resolved_addresses = _resolve_host_addresses(host)
        except OSError as exc:
            raise UnsafeWebsiteTargetError(error_message) from exc
        if not resolved_addresses:
            raise UnsafeWebsiteTargetError(error_message)
        if any(not ipaddress.ip_address(address).is_global for address in resolved_addresses):
            raise UnsafeWebsiteTargetError(error_message)
        return

    if not address.is_global:
        raise UnsafeWebsiteTargetError(error_message)


def _clean_query(raw_query: str) -> str:
    if not raw_query:
        return ""
    kept: list[tuple[str, str]] = []
    for key, value in parse_qsl(raw_query, keep_blank_values=True):
        lower_key = key.lower()
        if lower_key in TRACKING_QUERY_KEYS:
            continue
        if lower_key.startswith(TRACKING_QUERY_PREFIXES):
            continue
        kept.append((key, value))
    return urlencode(kept, doseq=True)


def _normalize_path(raw_path: str, *, safe_chars: str = PATH_SEGMENT_SAFE_CHARS) -> str:
    path = raw_path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")

    normalized_segments = [
        quote(unquote(segment), safe=safe_chars)
        for segment in path.split("/")
    ]
    normalized_path = "/".join(normalized_segments) or "/"
    if not normalized_path.startswith("/"):
        normalized_path = f"/{normalized_path}"
    return normalized_path or "/"


def _legacy_canonicalize_url(raw_url: str) -> str:
    parsed = urlparse(raw_url.strip())
    scheme = (parsed.scheme or "https").lower()
    host = (parsed.hostname or "").lower()
    if not host:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enter a valid website")

    port = _validated_port(parsed)
    if (scheme == "https" and port == 443) or (scheme == "http" and port == 80):
        port = None

    netloc = host if port is None else f"{host}:{port}"
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    query = _clean_query(parsed.query)

    return urlunparse((scheme, netloc, path or "/", "", query, ""))


def _strict_canonicalize_url(raw_url: str) -> str:
    parsed = urlparse(raw_url.strip())
    scheme = (parsed.scheme or "https").lower()
    host = (parsed.hostname or "").lower()
    if not host:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enter a valid website")

    port = _validated_port(parsed)
    if (scheme == "https" and port == 443) or (scheme == "http" and port == 80):
        port = None

    netloc = host if port is None else f"{host}:{port}"
    path = _normalize_path(parsed.path, safe_chars=STRICT_PATH_SEGMENT_SAFE_CHARS)
    query = _clean_query(parsed.query)

    return urlunparse((scheme, netloc, path or "/", "", query, ""))


def canonicalize_url(raw_url: str) -> str:
    parsed = urlparse(raw_url.strip())
    scheme = (parsed.scheme or "https").lower()
    host = (parsed.hostname or "").lower()
    if not host:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enter a valid website")

    port = _validated_port(parsed)
    if (scheme == "https" and port == 443) or (scheme == "http" and port == 80):
        port = None

    netloc = host if port is None else f"{host}:{port}"
    path = _normalize_path(parsed.path)
    query = _clean_query(parsed.query)

    return urlunparse((scheme, netloc, path or "/", "", query, ""))


def _validated_port(parsed) -> int | None:
    try:
        return parsed.port
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enter a valid website") from exc


def normalize_website_input(raw_url: str) -> str:
    stripped = raw_url.strip()
    if not stripped:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enter a website")

    if "://" not in stripped:
        stripped = f"https://{stripped}"

    return canonicalize_url(stripped)


def resolve_website_scope(raw_url: str) -> str:
    candidate = normalize_website_input(raw_url)
    fallback_candidate = candidate.replace("https://", "http://", 1) if candidate.startswith("https://") else candidate
    attempts = [candidate]
    if fallback_candidate != candidate:
        attempts.append(fallback_candidate)

    headers = {"User-Agent": "WarpyBot/1.0 (+https://warpy.ai)"}
    def validate_request(request: httpx.Request) -> None:
        ensure_public_website_url(str(request.url))

    with httpx.Client(
        follow_redirects=True,
        timeout=WEBSITE_RESOLVE_TIMEOUT,
        headers=headers,
        event_hooks={"request": [validate_request]},
    ) as client:
        for url in attempts:
            try:
                ensure_public_website_url(url)
                response = client.get(url)
                return canonicalize_url(str(response.url))
            except UnsafeWebsiteTargetError as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
            except httpx.RequestError:
                continue

    return candidate


def get_scope_parts(scope_url: str) -> tuple[str, str]:
    parsed = urlparse(scope_url)
    host = (parsed.hostname or "").lower()
    port = parsed.port
    if (parsed.scheme == "https" and port == 443) or (parsed.scheme == "http" and port == 80):
        port = None
    origin = f"{parsed.scheme.lower()}://{host}" if port is None else f"{parsed.scheme.lower()}://{host}:{port}"
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    return origin, path or "/"


def is_url_in_scope(candidate_url: str, scope_url: str) -> bool:
    candidate_origin, candidate_path = get_scope_parts(candidate_url)
    scope_origin, scope_path = get_scope_parts(scope_url)
    if candidate_origin != scope_origin:
        return False
    if scope_path == "/":
        return True
    return candidate_path == scope_path or candidate_path.startswith(f"{scope_path}/")


def scopes_overlap(left_scope_url: str, right_scope_url: str) -> bool:
    return is_url_in_scope(left_scope_url, right_scope_url) or is_url_in_scope(right_scope_url, left_scope_url)


def get_page_display_name(page_url: str, title: str | None = None) -> str:
    clean_title = (title or "").strip()
    if clean_title:
        return clean_title[:255]

    parsed = urlparse(page_url)
    path = parsed.path or "/"
    if path == "/":
        return parsed.netloc
    return path.rsplit("/", 1)[-1] or path


def _page_url_aliases(*raw_urls: str | None) -> set[str]:
    aliases: set[str] = set()
    for raw_url in raw_urls:
        if not raw_url:
            continue
        try:
            aliases.add(canonicalize_url(raw_url))
        except HTTPException:
            pass
        try:
            aliases.add(_legacy_canonicalize_url(raw_url))
        except HTTPException:
            pass
        try:
            aliases.add(_strict_canonicalize_url(raw_url))
        except HTTPException:
            pass
    return aliases


def _document_status_rank(document: KnowledgeDocument) -> int:
    status_value = document.status.value if hasattr(document.status, "value") else str(document.status)
    if status_value == DocumentStatus.ready.value:
        return 0
    if status_value == DocumentStatus.error.value:
        return 1
    return 2


def _pick_primary_document(
    documents: list[KnowledgeDocument],
    preferred_urls: set[str],
) -> KnowledgeDocument:
    return min(
        documents,
        key=lambda document: (
            0 if document.is_searchable else 1,
            0 if (document.source_url or "") in preferred_urls else 1,
            _document_status_rank(document),
            0 if int(document.chunk_count or 0) > 0 else 1,
            str(document.id),
        ),
    )


def _prune_duplicate_documents(
    session: Session,
    primary_document: KnowledgeDocument,
    duplicate_documents: list[KnowledgeDocument],
) -> None:
    for document in duplicate_documents:
        if document.id == primary_document.id:
            continue
        if document.is_searchable:
            continue
        session.delete(document)
    session.flush()


def _website_counts_by_id(session: Session, website_ids: list[Any]) -> dict[Any, WebsiteCounts]:
    if not website_ids:
        return {}

    rows = session.execute(
        select(
            KnowledgeDocument.website_id,
            func.count(KnowledgeDocument.id),
            func.coalesce(func.sum(case((KnowledgeDocument.status == DocumentStatus.ready, 1), else_=0)), 0),
            func.coalesce(func.sum(case((KnowledgeDocument.status == DocumentStatus.error, 1), else_=0)), 0),
            func.coalesce(func.sum(case((KnowledgeDocument.is_searchable.is_(True), 1), else_=0)), 0),
        )
        .where(
            KnowledgeDocument.website_id.in_(website_ids),
            KnowledgeDocument.source_kind == SOURCE_KIND_WEBSITE_PAGE,
        )
        .group_by(KnowledgeDocument.website_id)
    ).all()

    counts: dict[Any, WebsiteCounts] = {}
    for website_id, page_count, ready_page_count, failed_page_count, searchable_page_count in rows:
        counts[website_id] = WebsiteCounts(
            page_count=int(page_count or 0),
            ready_page_count=int(ready_page_count or 0),
            failed_page_count=int(failed_page_count or 0),
            searchable_page_count=int(searchable_page_count or 0),
        )
    return counts


def build_website_response(website: KnowledgeWebsite, counts: WebsiteCounts | None = None) -> dict[str, Any]:
    summary = counts or WebsiteCounts()
    return {
        "id": website.id,
        "inputUrl": website.input_url,
        "scopeUrl": website.scope_url,
        "status": website.status.value if hasattr(website.status, "value") else str(website.status),
        "pageCount": summary.page_count,
        "readyPageCount": summary.ready_page_count,
        "failedPageCount": summary.failed_page_count,
        "searchablePageCount": summary.searchable_page_count,
        "errorMessage": website.error_message,
        "lastCrawledAt": website.last_crawled_at,
        "lastSuccessfulCrawledAt": website.last_successful_crawled_at,
        "nextRefreshAt": website.next_refresh_at,
        "createdAt": website.created_at,
        "updatedAt": website.updated_at,
    }


def build_website_page_response(document: KnowledgeDocument) -> dict[str, Any]:
    return {
        "id": document.id,
        "pageName": document.file_name,
        "sourceUrl": document.source_url or "",
        "status": document.status.value if hasattr(document.status, "value") else str(document.status),
        "sectionCount": int(document.chunk_count or 0),
        "isSearchable": bool(document.is_searchable),
        "errorMessage": document.error_message,
        "updatedAt": document.updated_at,
    }


def list_websites(session: Session, user_id: str) -> tuple[list[dict[str, Any]], int]:
    websites = list(
        session.scalars(
            select(KnowledgeWebsite)
            .where(KnowledgeWebsite.user_id == user_id)
            .order_by(KnowledgeWebsite.created_at.desc())
        ).all()
    )
    counts = _website_counts_by_id(session, [website.id for website in websites])
    return [build_website_response(website, counts.get(website.id)) for website in websites], len(websites)


def _get_website(session: Session, website_id: Any, user_id: str) -> KnowledgeWebsite:
    website = session.scalar(
        select(KnowledgeWebsite).where(
            KnowledgeWebsite.id == website_id,
            KnowledgeWebsite.user_id == user_id,
        )
    )
    if not website:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Website not found")
    return website


def get_website_detail(session: Session, website_id: Any, user_id: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    website = _get_website(session, website_id, user_id)
    counts = _website_counts_by_id(session, [website.id])
    pages = list(
        session.scalars(
            select(KnowledgeDocument)
            .where(
                KnowledgeDocument.website_id == website.id,
                KnowledgeDocument.source_kind == SOURCE_KIND_WEBSITE_PAGE,
            )
            .order_by(KnowledgeDocument.source_url.asc())
        ).all()
    )
    return build_website_response(website, counts.get(website.id)), [build_website_page_response(page) for page in pages]


def create_website_record(session: Session, user_id: str, input_url: str, scope_url: str) -> KnowledgeWebsite:
    bind = session.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        session.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
            {"lock_key": f"knowledge-website-scope:{user_id}"},
        )

    existing_scopes = list(
        session.scalars(
            select(KnowledgeWebsite.scope_url).where(KnowledgeWebsite.user_id == user_id)
        ).all()
    )
    for existing_scope in existing_scopes:
        if scopes_overlap(existing_scope, scope_url):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This website or path overlaps with a website you already added",
            )

    website = KnowledgeWebsite(
        user_id=user_id,
        input_url=input_url.strip(),
        scope_url=scope_url,
        status=WebsiteStatus.processing,
        next_refresh_at=datetime.now(tz=UTC) + WEBSITE_REFRESH_INTERVAL,
    )
    session.add(website)
    session.flush()
    log_info("KBWebsiteService", "create_website_record", "Website created", website_id=str(website.id), scope_url=scope_url)
    return website


def delete_website(session: Session, website_id: Any, user_id: str) -> None:
    website = _get_website(session, website_id, user_id)
    session.delete(website)
    session.flush()
    log_info("KBWebsiteService", "delete_website", "Website deleted", website_id=str(website_id))


def mark_website_processing(session: Session, website_id: Any, user_id: str) -> KnowledgeWebsite:
    website = _get_website(session, website_id, user_id)
    website.status = WebsiteStatus.processing
    website.error_message = None
    session.flush()
    return website


def get_due_websites(session: Session, limit: int) -> list[tuple[Any, str]]:
    now = datetime.now(tz=UTC)
    stale_processing_before = now - WEBSITE_STALE_PROCESSING_INTERVAL
    rows = session.execute(
        select(KnowledgeWebsite.id, KnowledgeWebsite.user_id)
        .where(
            KnowledgeWebsite.next_refresh_at.is_not(None),
            or_(
                KnowledgeWebsite.next_refresh_at <= now,
                and_(
                    KnowledgeWebsite.status == WebsiteStatus.processing,
                    KnowledgeWebsite.updated_at <= stale_processing_before,
                ),
            ),
        )
        .order_by(KnowledgeWebsite.next_refresh_at.asc())
        .limit(limit)
    ).all()
    return [(website_id, website_user_id) for website_id, website_user_id in rows]


def _get_ready_knowledge_source_count(session: Session, user_id: str) -> int:
    ready_file_count = session.scalar(
        select(func.count()).select_from(KnowledgeDocument).where(
            KnowledgeDocument.user_id == user_id,
            KnowledgeDocument.source_kind == SOURCE_KIND_FILE,
            KnowledgeDocument.is_searchable.is_(True),
        )
    ) or 0
    ready_website_count = session.scalar(
        select(func.count()).select_from(KnowledgeWebsite).where(
            KnowledgeWebsite.user_id == user_id,
            exists(
                select(KnowledgeDocument.id).where(
                    KnowledgeDocument.website_id == KnowledgeWebsite.id,
                    KnowledgeDocument.is_searchable.is_(True),
                )
            ),
        )
    ) or 0
    return int(ready_file_count) + int(ready_website_count)


def has_retrievable_knowledge_sources(session: Session, user_id: str) -> bool:
    return _get_ready_knowledge_source_count(session, user_id) > 0


def get_knowledge_base_status(session: Session, user_id: str) -> dict[str, Any]:
    agent = session.scalar(select(Agent).where(Agent.user_id == user_id))
    enabled = agent.knowledge_base_enabled if agent else False

    file_count = session.scalar(
        select(func.count()).select_from(KnowledgeDocument).where(
            KnowledgeDocument.user_id == user_id,
            KnowledgeDocument.source_kind == SOURCE_KIND_FILE,
        )
    ) or 0
    website_count = session.scalar(
        select(func.count()).select_from(KnowledgeWebsite).where(KnowledgeWebsite.user_id == user_id)
    ) or 0
    ready_count = _get_ready_knowledge_source_count(session, user_id)
    total_count = int(file_count) + int(website_count)

    return {"enabled": enabled, "document_count": total_count, "ready_document_count": ready_count}


def get_visible_document(session: Session, document_id: Any, user_id: str) -> KnowledgeDocument:
    document = session.scalar(
        select(KnowledgeDocument).where(
            KnowledgeDocument.id == document_id,
            KnowledgeDocument.user_id == user_id,
            KnowledgeDocument.source_kind == SOURCE_KIND_FILE,
        )
    )
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


def get_website_for_worker(session: Session, website_id: Any, user_id: str) -> KnowledgeWebsite | None:
    return session.scalar(
        select(KnowledgeWebsite).where(
            KnowledgeWebsite.id == website_id,
            KnowledgeWebsite.user_id == user_id,
        )
    )


def update_website_state(
    session: Session,
    website_id: Any,
    user_id: str,
    website_status: WebsiteStatus,
    *,
    error_message: str | None = None,
    last_crawled_at: datetime | None = None,
    last_successful_crawled_at: datetime | None = None,
    next_refresh_at: datetime | None = None,
) -> None:
    website = get_website_for_worker(session, website_id, user_id)
    if not website:
        return
    website.status = website_status
    website.error_message = error_message
    if last_crawled_at is not None:
        website.last_crawled_at = last_crawled_at
    if last_successful_crawled_at is not None:
        website.last_successful_crawled_at = last_successful_crawled_at
    if next_refresh_at is not None:
        website.next_refresh_at = next_refresh_at
    session.flush()


def get_website_page_document(
    session: Session,
    website_id: Any,
    page_url: str,
    alternate_url: str | None = None,
) -> KnowledgeDocument | None:
    aliases = _page_url_aliases(page_url, alternate_url)
    if not aliases:
        return None

    documents = list(
        session.scalars(
            select(KnowledgeDocument).where(
                KnowledgeDocument.website_id == website_id,
                KnowledgeDocument.source_kind == SOURCE_KIND_WEBSITE_PAGE,
                KnowledgeDocument.source_url.in_(aliases),
            )
        ).all()
    )
    if not documents:
        return None

    primary_document = _pick_primary_document(documents, aliases)
    _prune_duplicate_documents(session, primary_document, documents)
    return primary_document


def upsert_website_page_processing(
    session: Session,
    website_id: Any,
    user_id: str,
    page_url: str,
    page_name: str,
) -> KnowledgeDocument:
    document = get_website_page_document(session, website_id, page_url)
    if not document:
        document = KnowledgeDocument(
            user_id=user_id,
            file_name=page_name,
            file_type=".html",
            file_size=0,
            source_kind=SOURCE_KIND_WEBSITE_PAGE,
            website_id=website_id,
            source_url=page_url,
            status=DocumentStatus.processing,
            chunk_count=0,
        )
        session.add(document)
    else:
        document.file_name = page_name
        document.status = DocumentStatus.processing
        document.error_message = None
    session.flush()
    return document


def persist_website_page(
    session: Session,
    website_id: Any,
    user_id: str,
    original_url: str,
    page_url: str,
    page_name: str,
    file_size: int,
    source_hash: str,
    chunks: list[dict[str, Any]],
) -> KnowledgeDocument:
    document = get_website_page_document(session, website_id, original_url, alternate_url=page_url)
    content_language = infer_content_language("\n".join(chunk["content"] for chunk in chunks))
    if not document:
        document = KnowledgeDocument(
            user_id=user_id,
            file_name=page_name,
            file_type=".html",
            file_size=file_size,
            source_kind=SOURCE_KIND_WEBSITE_PAGE,
            website_id=website_id,
            source_url=page_url,
            source_hash=source_hash,
            content_language=content_language,
            status=DocumentStatus.ready,
            chunk_count=len(chunks),
            is_searchable=True,
        )
        session.add(document)
        session.flush()
    else:
        existing_chunks = list(
            session.scalars(
                select(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id)
            ).all()
        )
        for chunk in existing_chunks:
            session.delete(chunk)
        session.flush()

        document.file_name = page_name
        document.file_size = file_size
        document.file_type = ".html"
        document.source_url = page_url
        document.source_hash = source_hash
        document.content_language = content_language
        document.status = DocumentStatus.ready
        document.chunk_count = len(chunks)
        document.error_message = None
        document.is_searchable = True
        session.flush()

    for index, chunk_data in enumerate(chunks):
        section_title = chunk_data.get("section_title")
        chunk = KnowledgeChunk(
            document_id=document.id,
            user_id=user_id,
            content=chunk_data["content"],
            section_title=section_title,
            search_text=build_chunk_search_text(
                chunk_data["content"],
                document_title=page_name,
                section_title=section_title,
                source_url=page_url,
            ),
            chunk_index=index,
            chunk_metadata=chunk_data.get("metadata"),
        )
        session.add(chunk)
        session.flush()
        upsert_knowledge_embedding(session, chunk.id, user_id)

    document.source_hash = source_hash
    document.content_language = content_language
    document.is_searchable = True
    document.status = DocumentStatus.ready
    document.error_message = None
    document.chunk_count = len(chunks)
    session.flush()
    return document


def mark_website_page_error(
    session: Session,
    website_id: Any,
    user_id: str,
    original_url: str,
    page_url: str,
    page_name: str,
    error_message: str,
) -> KnowledgeDocument:
    document = get_website_page_document(session, website_id, original_url, alternate_url=page_url)
    if not document:
        document = KnowledgeDocument(
            user_id=user_id,
            file_name=page_name,
            file_type=".html",
            file_size=0,
            source_kind=SOURCE_KIND_WEBSITE_PAGE,
            website_id=website_id,
            source_url=page_url,
            status=DocumentStatus.error,
            error_message=error_message,
            chunk_count=0,
            is_searchable=False,
        )
        session.add(document)
    else:
        document.file_name = page_name
        document.source_url = page_url
        document.status = DocumentStatus.error
        document.error_message = error_message
    session.flush()
    return document


def discard_website_page_processing(
    session: Session,
    website_id: Any,
    page_url: str,
    alternate_url: str | None = None,
) -> None:
    document = get_website_page_document(session, website_id, page_url, alternate_url=alternate_url)
    if not document:
        return
    if document.is_searchable:
        document.status = DocumentStatus.ready
        document.error_message = None
        session.flush()
        return
    session.delete(document)
    session.flush()


def delete_missing_website_pages(session: Session, website_id: Any, seen_urls: set[str]) -> None:
    documents = list(
        session.scalars(
            select(KnowledgeDocument).where(
                KnowledgeDocument.website_id == website_id,
                KnowledgeDocument.source_kind == SOURCE_KIND_WEBSITE_PAGE,
            )
        ).all()
    )
    for document in documents:
        if (document.source_url or "") not in seen_urls:
            session.delete(document)
    session.flush()
