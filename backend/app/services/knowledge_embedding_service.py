from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info
from ..models import KnowledgeChunk, KnowledgeEmbedding
from .embedding_service import _compute_hash, generate_embedding


def upsert_knowledge_embedding(session: Session, chunk_id: UUID, user_id: str) -> KnowledgeEmbedding | None:
    chunk = session.scalar(select(KnowledgeChunk).where(KnowledgeChunk.id == chunk_id))
    if not chunk:
        log_error("KBEmbeddingService", "upsert_knowledge_embedding", "Chunk not found", chunk_id=str(chunk_id))
        return None
    if chunk.user_id != user_id:
        log_error("KBEmbeddingService", "upsert_knowledge_embedding", "User mismatch", chunk_id=str(chunk_id))
        return None

    content_hash = _compute_hash(chunk.content)
    existing = session.scalar(select(KnowledgeEmbedding).where(KnowledgeEmbedding.chunk_id == chunk_id))
    if existing and existing.content_hash == content_hash:
        return existing

    try:
        embedding_vector = generate_embedding(chunk.content)
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


def search_knowledge_base(session: Session, user_id: str, query: str, top_k: int | None = None) -> list[dict]:
    if top_k is None:
        total = session.scalar(
            select(func.count()).select_from(KnowledgeChunk).where(KnowledgeChunk.user_id == user_id)
        ) or 0
        top_k = llm_config.calculate_kb_top_k(total)

    if top_k == 0:
        return []

    try:
        query_embedding = generate_embedding(query)
    except Exception as exc:
        log_error("KBEmbeddingService", "search_knowledge_base", "Query embedding failed", exc=exc)
        return []

    rows = session.execute(
        select(KnowledgeChunk.content, KnowledgeChunk.chunk_metadata)
        .join(KnowledgeEmbedding, KnowledgeEmbedding.chunk_id == KnowledgeChunk.id)
        .where(KnowledgeEmbedding.user_id == user_id)
        .order_by(KnowledgeEmbedding.embedding.cosine_distance(query_embedding))
        .limit(top_k)
    ).all()

    log_info("KBEmbeddingService", "search_knowledge_base", "Search done", user_id=user_id, results=len(rows))
    return [{"content": row.content, "metadata": _sanitize_metadata(row.chunk_metadata)} for row in rows]
