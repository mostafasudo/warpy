from __future__ import annotations

import json
import re
from dataclasses import dataclass
from uuid import UUID

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langsmith.run_helpers import trace as langsmith_trace
from pgvector.sqlalchemy import HALFVEC, HalfVector
from sqlalchemy import case, cast, func, literal, select
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info, log_warning
from ..models import KnowledgeChunk, KnowledgeDocument, KnowledgeEmbedding
from .embedding_service import _compute_hash, generate_embedding
from .knowledge_chunking_service import infer_content_language


# HYBRID KB RETRIEVAL
# query -> variants -> dense + lexical + field matches -> fusion -> rerank -> evidence
WEBSITE_SOURCE_KIND = "website_page"
FINAL_RESULT_LIMIT = 6
DENSE_CANDIDATES_PER_QUERY = 8
LEXICAL_CANDIDATES_PER_QUERY = 8
FIELD_CANDIDATES_LIMIT = 6
CANDIDATE_POOL_LIMIT = 24
MODEL_RERANK_LIMIT = 12
RRF_K = 20
COMMON_QUERY_TERMS = {
    "a",
    "an",
    "and",
    "are",
    "can",
    "cost",
    "do",
    "does",
    "for",
    "from",
    "get",
    "give",
    "how",
    "i",
    "in",
    "is",
    "it",
    "me",
    "my",
    "of",
    "on",
    "or",
    "please",
    "show",
    "tell",
    "that",
    "the",
    "their",
    "them",
    "to",
    "u",
    "us",
    "what",
    "with",
    "you",
    "your",
}
QUERY_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9]+(?:[._/-][A-Za-z0-9]+)*|[\u0600-\u06FF]+")
INTENT_KEYWORDS = {
    "pricing": {"pricing", "price", "prices", "plan", "plans", "cost", "costs", "subscription", "billing", "tier", "tiers"},
    "policy": {"policy", "policies", "terms", "privacy", "refund", "refunds", "cancel", "cancellation", "security", "compliance"},
    "integration": {"integration", "integrations", "api", "apis", "webhook", "shopify", "salesforce", "hubspot", "zapier"},
    "limits": {"limit", "limits", "quota", "quotas", "credits", "credit", "seat", "seats", "usage"},
    "support": {"support", "sla", "response", "handover", "help", "contact"},
}
INTENT_EXPANSIONS = {
    "pricing": ["pricing", "price", "plan", "subscription", "billing"],
    "policy": ["policy", "terms", "privacy", "refund", "cancellation"],
    "integration": ["integration", "api", "webhook", "shopify"],
    "limits": ["credits", "limits", "seats", "usage"],
    "support": ["support", "sla", "response"],
}
LEGAL_TERMS = {"terms", "privacy", "policy", "security", "legal", "refund", "gdpr", "compliance"}
PRICING_SECTION_TERMS = {"pricing", "plans", "billing", "subscription", "credits"}
POLICY_SECTION_TERMS = {"terms", "privacy", "policy", "refund", "security", "compliance"}
LIMIT_SECTION_TERMS = {"limits", "usage", "credits", "quota", "seats"}
INTEGRATION_SECTION_TERMS = {"integrations", "integration", "api", "webhook", "shopify"}
SUPPORT_SECTION_TERMS = {"support", "sla", "handover", "help"}


def upsert_knowledge_embedding(session: Session, chunk_id: UUID, user_id: str) -> KnowledgeEmbedding | None:
    chunk = session.scalar(select(KnowledgeChunk).where(KnowledgeChunk.id == chunk_id))
    if not chunk:
        log_error("KBEmbeddingService", "upsert_knowledge_embedding", "Chunk not found", chunk_id=str(chunk_id))
        return None
    if chunk.user_id != user_id:
        log_error("KBEmbeddingService", "upsert_knowledge_embedding", "User mismatch", chunk_id=str(chunk_id))
        return None

    embedding_text = chunk.search_text or chunk.content
    content_hash = _compute_hash(embedding_text)
    existing = session.scalar(select(KnowledgeEmbedding).where(KnowledgeEmbedding.chunk_id == chunk_id))
    if existing and existing.content_hash == content_hash:
        return existing

    try:
        embedding_vector = generate_embedding(embedding_text)
    except Exception as exc:
        log_error("KBEmbeddingService", "upsert_knowledge_embedding", "Embedding failed", exc=exc, chunk_id=str(chunk_id))
        return None

    if existing:
        existing.embedding = embedding_vector
        existing.content_hash = content_hash
        existing.user_id = user_id
        session.flush()
        log_info("KBEmbeddingService", "upsert_knowledge_embedding", "Updated", chunk_id=str(chunk_id))
        return existing

    embedding = KnowledgeEmbedding(
        chunk_id=chunk_id,
        user_id=user_id,
        embedding=embedding_vector,
        content_hash=content_hash,
    )
    session.add(embedding)
    session.flush()
    log_info("KBEmbeddingService", "upsert_knowledge_embedding", "Created", chunk_id=str(chunk_id))
    return embedding


SAFE_METADATA_KEYS = {"element_types", "page_numbers"}


def _sanitize_metadata(meta: dict | None) -> dict:
    if not meta:
        return {}
    return {k: v for k, v in meta.items() if k in SAFE_METADATA_KEYS}


@dataclass
class RetrievedChunk:
    chunk_id: UUID
    document_id: UUID
    content: str
    chunk_metadata: dict | None
    section_title: str | None
    title: str
    source_url: str | None
    source_kind: str
    source_hash: str | None
    content_language: str | None
    chunk_index: int


def _is_postgresql_session(session: Session) -> bool:
    dialect = getattr(getattr(session, "bind", None), "dialect", None)
    return bool(dialect and dialect.name == "postgresql")


def _normalize_query_terms(query: str) -> list[str]:
    terms: list[str] = []
    seen: set[str] = set()
    for token in QUERY_TOKEN_PATTERN.findall(query.lower()):
        normalized = token.strip(" .,:;!?()[]{}\"'")
        if not normalized or normalized.isdigit() or normalized in COMMON_QUERY_TERMS:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        terms.append(normalized)
    return terms


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _detect_query_intents(query: str, terms: list[str]) -> set[str]:
    lowered_query = query.lower()
    intents: set[str] = set()
    for label, keywords in INTENT_KEYWORDS.items():
        if any(keyword in lowered_query for keyword in keywords) or any(term in keywords for term in terms):
            intents.add(label)
    return intents


def _build_query_variants(query: str) -> list[str]:
    original = " ".join(query.split()).strip()
    if not original:
        return []

    terms = _normalize_query_terms(original)
    intents = _detect_query_intents(original, terms)
    variants: list[str] = []

    def add_variant(value: str) -> None:
        normalized = " ".join(value.split()).strip()
        if not normalized:
            return
        lowered = normalized.lower()
        if lowered in {item.lower() for item in variants}:
            return
        variants.append(normalized)

    add_variant(original)
    if terms:
        add_variant(" ".join(terms[:12]))
    entity_terms = [term for term in terms if "." in term or "/" in term][:4]
    if not entity_terms:
        entity_terms = terms[:4]
    if entity_terms:
        add_variant(" ".join(entity_terms))
    if intents:
        expanded_terms = list(entity_terms or terms[:3])
        for intent in sorted(intents):
            expanded_terms.extend(INTENT_EXPANSIONS.get(intent, []))
        add_variant(" ".join(expanded_terms[:10]))

    return variants[:4]


def _kb_text_sql_parts():
    search_text = func.lower(func.coalesce(KnowledgeChunk.search_text, KnowledgeChunk.content))
    title = func.lower(func.coalesce(KnowledgeDocument.file_name, ""))
    section_title = func.lower(func.coalesce(KnowledgeChunk.section_title, ""))
    source_url = func.lower(func.coalesce(KnowledgeDocument.source_url, ""))
    return search_text, title, section_title, source_url


def _kb_like_score_expression(query: str):
    normalized_query = query.strip().lower()
    terms = _normalize_query_terms(query)
    search_text, title, section_title, source_url = _kb_text_sql_parts()
    score = literal(0)
    if normalized_query:
        pattern = f"%{_escape_like(normalized_query)}%"
        score += case((section_title.like(pattern, escape="\\"), 18), else_=0)
        score += case((title.like(pattern, escape="\\"), 14), else_=0)
        score += case((source_url.like(pattern, escape="\\"), 12), else_=0)
        score += case((search_text.like(pattern, escape="\\"), 10), else_=0)
    for term in terms:
        pattern = f"%{_escape_like(term)}%"
        score += case((section_title.like(pattern, escape="\\"), 7), else_=0)
        score += case((title.like(pattern, escape="\\"), 5), else_=0)
        score += case((source_url.like(pattern, escape="\\"), 5), else_=0)
        score += case((search_text.like(pattern, escape="\\"), 3), else_=0)
    return score


def _search_embedded_chunks_exact(session: Session, user_id: str, query_embedding: list[float], top_k: int) -> list[UUID]:
    if not _is_postgresql_session(session):
        return []
    candidates = (
        select(
            KnowledgeChunk.id.label("chunk_id"),
            KnowledgeEmbedding.embedding.label("embedding"),
        )
        .join(KnowledgeEmbedding, KnowledgeEmbedding.chunk_id == KnowledgeChunk.id)
        .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
        .where(
            KnowledgeEmbedding.user_id == user_id,
            KnowledgeChunk.user_id == user_id,
            KnowledgeDocument.is_searchable.is_(True),
        )
        .cte("kb_candidates")
        .prefix_with("MATERIALIZED")
    )
    distance_expr = cast(candidates.c.embedding, HALFVEC(llm_config.embedding_dimensions)).cosine_distance(
        HalfVector(query_embedding)
    )
    rows = session.execute(
        select(candidates.c.chunk_id)
        .order_by(distance_expr)
        .limit(top_k)
    ).all()
    return [row[0] for row in rows]


def _search_chunks_lexically(session: Session, user_id: str, query: str, top_k: int) -> list[UUID]:
    if _is_postgresql_session(session):
        normalized_query = " ".join(_normalize_query_terms(query))
        if normalized_query:
            search_vector = func.to_tsvector("simple", func.coalesce(KnowledgeChunk.search_text, KnowledgeChunk.content))
            tsquery = func.websearch_to_tsquery("simple", normalized_query)
            fts_score = func.ts_rank_cd(search_vector, tsquery)
            rows = session.execute(
                select(KnowledgeChunk.id)
                .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
                .where(
                    KnowledgeChunk.user_id == user_id,
                    KnowledgeDocument.is_searchable.is_(True),
                    search_vector.op("@@")(tsquery),
                )
                .order_by(fts_score.desc(), KnowledgeChunk.chunk_index.asc())
                .limit(top_k)
            ).all()
            return [row[0] for row in rows]

    like_score = _kb_like_score_expression(query)
    stmt = (
        select(KnowledgeChunk.id, like_score.label("score"))
        .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
        .where(
            KnowledgeChunk.user_id == user_id,
            KnowledgeDocument.is_searchable.is_(True),
        )
    )
    rows = session.execute(
        stmt.where(like_score > 0)
        .order_by(like_score.desc(), KnowledgeChunk.chunk_index.asc())
        .limit(top_k)
    ).all()
    return [row[0] for row in rows]


def _search_chunk_fields(session: Session, user_id: str, query: str, top_k: int) -> list[UUID]:
    normalized_query = query.strip().lower()
    terms = _normalize_query_terms(query)
    title = func.lower(func.coalesce(KnowledgeDocument.file_name, ""))
    section_title = func.lower(func.coalesce(KnowledgeChunk.section_title, ""))
    source_url = func.lower(func.coalesce(KnowledgeDocument.source_url, ""))

    score = literal(0)
    if normalized_query:
        pattern = f"%{_escape_like(normalized_query)}%"
        score += case((section_title.like(pattern, escape="\\"), 20), else_=0)
        score += case((title.like(pattern, escape="\\"), 16), else_=0)
        score += case((source_url.like(pattern, escape="\\"), 16), else_=0)
    for term in terms:
        exact_pattern = f"%{_escape_like(term)}%"
        score += case((section_title.like(exact_pattern, escape="\\"), 8), else_=0)
        score += case((title.like(exact_pattern, escape="\\"), 6), else_=0)
        score += case((source_url.like(exact_pattern, escape="\\"), 6), else_=0)

    rows = session.execute(
        select(KnowledgeChunk.id)
        .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
        .where(
            KnowledgeChunk.user_id == user_id,
            KnowledgeDocument.is_searchable.is_(True),
            score > 0,
        )
        .order_by(score.desc(), KnowledgeChunk.chunk_index.asc())
        .limit(top_k)
    ).all()
    return [row[0] for row in rows]


def _fetch_retrieved_chunks(session: Session, chunk_ids: list[UUID]) -> dict[UUID, RetrievedChunk]:
    if not chunk_ids:
        return {}
    rows = session.execute(
        select(
            KnowledgeChunk.id,
            KnowledgeChunk.document_id,
            KnowledgeChunk.content,
            KnowledgeChunk.chunk_metadata,
            KnowledgeChunk.section_title,
            KnowledgeChunk.chunk_index,
            KnowledgeDocument.file_name,
            KnowledgeDocument.source_url,
            KnowledgeDocument.source_kind,
            KnowledgeDocument.source_hash,
            KnowledgeDocument.content_language,
        )
        .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
        .where(KnowledgeChunk.id.in_(chunk_ids))
    ).all()
    return {
        row[0]: RetrievedChunk(
            chunk_id=row[0],
            document_id=row[1],
            content=row[2],
            chunk_metadata=row[3],
            section_title=row[4],
            chunk_index=row[5],
            title=row[6],
            source_url=row[7],
            source_kind=row[8],
            source_hash=row[9],
            content_language=row[10],
        )
        for row in rows
    }


def _looks_legal(candidate: RetrievedChunk) -> bool:
    haystack = " ".join(
        part.lower()
        for part in (candidate.title, candidate.section_title or "", candidate.source_url or "")
        if part
    )
    return any(term in haystack for term in LEGAL_TERMS)


def _section_term_match(section_title: str | None, terms: set[str]) -> bool:
    lowered = (section_title or "").lower()
    return bool(lowered and any(term in lowered for term in terms))


def _deterministic_rerank(
    candidates: list[RetrievedChunk],
    *,
    fusion_scores: dict[UUID, float],
    query: str,
) -> list[RetrievedChunk]:
    terms = _normalize_query_terms(query)
    lowered_query = query.lower().strip()
    query_language = infer_content_language(query)
    intents = _detect_query_intents(query, terms)
    is_legal_query = "policy" in intents or any(term in lowered_query for term in LEGAL_TERMS)

    def score(candidate: RetrievedChunk) -> float:
        title = (candidate.title or "").lower()
        section_title = (candidate.section_title or "").lower()
        source_url = (candidate.source_url or "").lower()
        search_text = candidate.content.lower()
        total = fusion_scores.get(candidate.chunk_id, 0.0)

        if lowered_query:
            if lowered_query in section_title:
                total += 10
            if lowered_query in title:
                total += 7
            if lowered_query in source_url:
                total += 6

        for term in terms:
            if term in section_title:
                total += 2.5
            if term in title:
                total += 2
            if term in source_url:
                total += 2
            if term in search_text:
                total += 0.5

        if query_language and candidate.content_language == query_language:
            total += 3
        elif query_language == "english" and candidate.content_language == "arabic":
            total -= 4

        if "pricing" in intents:
            if _section_term_match(candidate.section_title, PRICING_SECTION_TERMS):
                total += 7
            if "$" in candidate.content or "per month" in search_text or "credits" in search_text:
                total += 2
        if "policy" in intents and (_looks_legal(candidate) or _section_term_match(candidate.section_title, POLICY_SECTION_TERMS)):
            total += 7
        if "integration" in intents and _section_term_match(candidate.section_title, INTEGRATION_SECTION_TERMS):
            total += 5
        if "limits" in intents and _section_term_match(candidate.section_title, LIMIT_SECTION_TERMS):
            total += 5
        if "support" in intents and _section_term_match(candidate.section_title, SUPPORT_SECTION_TERMS):
            total += 4

        if not is_legal_query and _looks_legal(candidate):
            total -= 6

        return total

    return sorted(
        candidates,
        key=lambda candidate: (
            score(candidate),
            -(candidate.chunk_index),
            candidate.title.lower(),
            str(candidate.chunk_id),
        ),
        reverse=True,
    )


def _parse_model_rerank_ids(raw_content: str) -> list[UUID] | None:
    try:
        payload = json.loads(raw_content)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", raw_content)
        if not match:
            return None
        try:
            payload = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    raw_ids = payload.get("orderedIds")
    if not isinstance(raw_ids, list):
        return None
    parsed_ids: list[UUID] = []
    for value in raw_ids:
        try:
            parsed_ids.append(UUID(str(value)))
        except (TypeError, ValueError):
            continue
    return parsed_ids


def _model_rerank_candidates(query: str, candidates: list[RetrievedChunk]) -> list[UUID] | None:
    settings = get_settings()
    if not settings.openai_api_key or len(candidates) < 2:
        return None

    model = ChatOpenAI(
        model=llm_config.chat_model,
        temperature=0,
        timeout=8,
        max_retries=0,
        api_key=settings.openai_api_key,
    )
    lines = []
    for candidate in candidates[:MODEL_RERANK_LIMIT]:
        lines.append(
            json.dumps(
                {
                    "id": str(candidate.chunk_id),
                    "title": candidate.title,
                    "sectionTitle": candidate.section_title,
                    "sourceUrl": candidate.source_url,
                    "sourceKind": "website" if candidate.source_kind == WEBSITE_SOURCE_KIND else "document",
                    "snippet": candidate.content[:900],
                },
                ensure_ascii=False,
            )
        )
    prompt = (
        "Rank the evidence passages that best answer the user's knowledge-base question.\n"
        "Prefer direct answer-bearing passages, product/pricing/help sections, and the same language as the question.\n"
        "Downrank legal boilerplate unless the user is clearly asking about policy, privacy, refunds, or terms.\n"
        'Return valid JSON only in the form {"orderedIds":["uuid", "..."]}.\n\n'
        f"Question:\n{query}\n\nCandidates:\n" + "\n".join(lines)
    )
    try:
        response = model.invoke(
            [
                SystemMessage(content="You rank knowledge-base evidence for accuracy."),
                HumanMessage(content=prompt),
            ],
            config={"tags": ["kb-model-rerank"]},
        )
    except Exception as exc:
        log_warning("KBEmbeddingService", "_model_rerank_candidates", "Model rerank failed", error=type(exc).__name__)
        return None
    return _parse_model_rerank_ids(str(response.content or ""))


def _apply_model_rerank(candidates: list[RetrievedChunk], ordered_ids: list[UUID] | None) -> list[RetrievedChunk]:
    if not ordered_ids:
        return candidates
    rank = {chunk_id: index for index, chunk_id in enumerate(ordered_ids)}
    listed = [candidate for candidate in candidates if candidate.chunk_id in rank]
    listed.sort(key=lambda candidate: rank[candidate.chunk_id])
    remaining = [candidate for candidate in candidates if candidate.chunk_id not in rank]
    return listed + remaining


def _dedupe_and_diversify(candidates: list[RetrievedChunk], *, limit: int) -> list[RetrievedChunk]:
    selected: list[RetrievedChunk] = []
    document_counts: dict[UUID, int] = {}
    source_hash_documents: dict[str, UUID] = {}

    for candidate in candidates:
        current_doc_count = document_counts.get(candidate.document_id, 0)
        if current_doc_count >= 2:
            continue

        if candidate.source_hash:
            existing_document = source_hash_documents.get(candidate.source_hash)
            if existing_document is not None and existing_document != candidate.document_id:
                continue
            source_hash_documents[candidate.source_hash] = candidate.document_id

        selected.append(candidate)
        document_counts[candidate.document_id] = current_doc_count + 1
        if len(selected) == limit:
            break

    return selected


def _format_evidence(candidate: RetrievedChunk) -> dict:
    metadata = _sanitize_metadata(candidate.chunk_metadata)
    evidence = {
        "snippet": candidate.content,
        "title": candidate.title,
        "sectionTitle": candidate.section_title,
        "sourceUrl": candidate.source_url,
        "sourceKind": "website" if candidate.source_kind == WEBSITE_SOURCE_KIND else "document",
    }
    if "page_numbers" in metadata:
        evidence["pageNumbers"] = metadata["page_numbers"]
    if "element_types" in metadata:
        evidence["elementTypes"] = metadata["element_types"]
    return evidence


def search_knowledge_base(session: Session, user_id: str, query: str, top_k: int | None = None) -> list[dict]:
    if top_k is None:
        total = session.scalar(
            select(func.count()).select_from(KnowledgeChunk).where(KnowledgeChunk.user_id == user_id)
        ) or 0
        if total <= 0:
            return []
        result_limit = FINAL_RESULT_LIMIT
    else:
        result_limit = min(FINAL_RESULT_LIMIT, max(int(top_k), 0))
    if result_limit == 0:
        return []

    query_variants = _build_query_variants(query)
    if not query_variants:
        return []

    fusion_scores: dict[UUID, float] = {}
    dense_candidate_ids: list[UUID] = []
    lexical_candidate_ids: list[UUID] = []
    field_candidate_ids: list[UUID] = []

    try:
        trace_enabled = get_settings().langsmith_tracing
    except Exception:
        trace_enabled = False

    def run_search() -> list[dict]:
        for variant in query_variants:
            vector_ids: list[UUID] = []
            if _is_postgresql_session(session):
                try:
                    query_embedding = generate_embedding(variant)
                except Exception as exc:
                    log_warning(
                        "KBEmbeddingService",
                        "search_knowledge_base",
                        "Dense query embedding failed",
                        error=type(exc).__name__,
                    )
                else:
                    try:
                        vector_ids = _search_embedded_chunks_exact(session, user_id, query_embedding, DENSE_CANDIDATES_PER_QUERY)
                    except Exception as exc:
                        log_warning(
                            "KBEmbeddingService",
                            "search_knowledge_base",
                            "Dense retrieval failed",
                            error=type(exc).__name__,
                        )
            dense_candidate_ids.extend(vector_ids)
            for rank, chunk_id in enumerate(vector_ids, start=1):
                fusion_scores[chunk_id] = fusion_scores.get(chunk_id, 0.0) + (1.0 / (RRF_K + rank))

            lexical_ids = _search_chunks_lexically(session, user_id, variant, LEXICAL_CANDIDATES_PER_QUERY)
            lexical_candidate_ids.extend(lexical_ids)
            for rank, chunk_id in enumerate(lexical_ids, start=1):
                fusion_scores[chunk_id] = fusion_scores.get(chunk_id, 0.0) + (1.0 / (RRF_K + rank))

        field_ids = _search_chunk_fields(session, user_id, query, FIELD_CANDIDATES_LIMIT)
        field_candidate_ids.extend(field_ids)
        for rank, chunk_id in enumerate(field_ids, start=1):
            fusion_scores[chunk_id] = fusion_scores.get(chunk_id, 0.0) + (1.0 / (RRF_K + rank))

        if not fusion_scores:
            return []

        fused_ids = [chunk_id for chunk_id, _score in sorted(fusion_scores.items(), key=lambda item: item[1], reverse=True)]
        fused_ids = fused_ids[:CANDIDATE_POOL_LIMIT]
        candidates_by_id = _fetch_retrieved_chunks(session, fused_ids)
        deterministic_ranked = _deterministic_rerank(
            [candidates_by_id[chunk_id] for chunk_id in fused_ids if chunk_id in candidates_by_id],
            fusion_scores=fusion_scores,
            query=query,
        )
        model_ranked = _apply_model_rerank(deterministic_ranked, _model_rerank_candidates(query, deterministic_ranked[:MODEL_RERANK_LIMIT]))
        final_candidates = _dedupe_and_diversify(model_ranked, limit=result_limit)
        return [_format_evidence(candidate) for candidate in final_candidates]

    if not trace_enabled:
        results = run_search()
    else:
        with langsmith_trace(
            "knowledge-base-search",
            run_type="tool",
            inputs={"query": query, "user_id": user_id},
            tags=["knowledge-base-search"],
            metadata={"queryVariants": query_variants},
        ) as run:
            results = run_search()
            run.end(
                outputs={
                    "queryVariants": query_variants,
                    "denseCandidateCount": len(dense_candidate_ids),
                    "lexicalCandidateCount": len(lexical_candidate_ids),
                    "fieldCandidateCount": len(field_candidate_ids),
                    "resultCount": len(results),
                    "results": [
                        {
                            "title": result["title"],
                            "sectionTitle": result["sectionTitle"],
                            "sourceUrl": result["sourceUrl"],
                        }
                        for result in results
                    ],
                }
            )

    log_info(
        "KBEmbeddingService",
        "search_knowledge_base",
        "Hybrid search completed",
        user_id=user_id,
        results=len(results),
        query_variants=len(query_variants),
        dense_candidates=len(dense_candidate_ids),
        lexical_candidates=len(lexical_candidate_ids),
        field_candidates=len(field_candidate_ids),
    )
    return results
