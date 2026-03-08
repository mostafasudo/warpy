import hashlib
import json
import re
from uuid import UUID

from openai import OpenAI
from pgvector.sqlalchemy import HALFVEC, HalfVector
from sqlalchemy import String, and_, case, cast, func, literal, or_, select
from sqlalchemy.orm import Session, selectinload

from ..core.config import get_settings
from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info, log_warning
from ..models import Feature, Tool, ToolEmbedding


COMMON_QUERY_TERMS = {
    "a",
    "an",
    "and",
    "can",
    "fetch",
    "for",
    "from",
    "get",
    "give",
    "i",
    "in",
    "list",
    "me",
    "my",
    "of",
    "on",
    "please",
    "show",
    "the",
    "to",
    "u",
    "with",
    "you",
}


def _get_openai_client() -> OpenAI:
    settings = get_settings()
    return OpenAI(api_key=settings.openai_api_key)


def _tool_to_text(tool_record: Tool) -> str:
    tool = tool_record.tool or {}
    function = tool.get("function", {})
    name = function.get("name", "")
    description = function.get("description", "")
    parameters = json.dumps(function.get("parameters", {}), sort_keys=True)
    feature_name = tool_record.feature.name if tool_record.feature else ""
    if tool_record.tool_type == "frontend":
        target = "frontend handler"
    else:
        method = tool_record.method.value if tool_record.method else "GET"
        path = tool_record.path or "/"
        target = f"{method} {path}"
    return f"{target}\nFeature: {feature_name}\n{name}: {description}\nParameters: {parameters}"


def _compute_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def generate_embedding(text: str) -> list[float]:
    client = _get_openai_client()
    response = client.embeddings.create(
        model=llm_config.embedding_model,
        input=text,
        dimensions=llm_config.embedding_dimensions
    )
    return response.data[0].embedding


def upsert_tool_embedding(session: Session, tool_id: UUID, user_id: str) -> ToolEmbedding | None:
    tool_record = session.scalar(
        select(Tool)
        .where(Tool.id == tool_id)
        .options(selectinload(Tool.feature))
    )
    if not tool_record:
        log_error("EmbeddingService", "upsert_tool_embedding", "Tool not found", tool_id=str(tool_id))
        return None
    if tool_record.user_id != user_id:
        log_error("EmbeddingService", "upsert_tool_embedding", "User ID mismatch", tool_id=str(tool_id), user_id=user_id, owner=tool_record.user_id)
        return None
    if not tool_record.agent_enabled:
        delete_tool_embedding(session, tool_id)
        log_info("EmbeddingService", "upsert_tool_embedding", "Skipped disabled tool", tool_id=str(tool_id))
        return None

    text = _tool_to_text(tool_record)
    content_hash = _compute_hash(text)
    owner_id = tool_record.user_id

    existing = session.scalar(select(ToolEmbedding).where(ToolEmbedding.tool_id == tool_id))
    if existing and existing.content_hash == content_hash:
        log_info("EmbeddingService", "upsert_tool_embedding", "Embedding unchanged", tool_id=str(tool_id))
        return existing

    try:
        embedding_vector = generate_embedding(text)
    except Exception as e:
        log_error("EmbeddingService", "upsert_tool_embedding", "Failed to generate embedding", exc=e, tool_id=str(tool_id))
        return None

    if existing:
        existing.embedding = embedding_vector
        existing.content_hash = content_hash
        existing.user_id = owner_id
        session.flush()
        log_info("EmbeddingService", "upsert_tool_embedding", "Embedding updated", tool_id=str(tool_id))
        return existing

    embedding = ToolEmbedding(
        tool_id=tool_id,
        user_id=owner_id,
        embedding=embedding_vector,
        content_hash=content_hash
    )
    session.add(embedding)
    session.flush()
    log_info("EmbeddingService", "upsert_tool_embedding", "Embedding created", tool_id=str(tool_id))
    return embedding


def delete_tool_embedding(session: Session, tool_id: UUID) -> None:
    existing = session.scalar(select(ToolEmbedding).where(ToolEmbedding.tool_id == tool_id))
    if existing:
        session.delete(existing)
        session.flush()
        log_info("EmbeddingService", "delete_tool_embedding", "Embedding deleted", tool_id=str(tool_id))


def _is_postgresql_session(session: Session) -> bool:
    dialect = getattr(getattr(session, "bind", None), "dialect", None)
    return bool(dialect and dialect.name == "postgresql")


def _search_embedded_tools_exact(session: Session, user_id: str, query_embedding: list[float], top_k: int) -> list[UUID]:
    if not _is_postgresql_session(session):
        return []
    candidates = (
        select(
            ToolEmbedding.tool_id.label("tool_id"),
            ToolEmbedding.embedding.label("embedding"),
        )
        .join(Tool, Tool.id == ToolEmbedding.tool_id)
        .where(
            ToolEmbedding.user_id == user_id,
            Tool.user_id == user_id,
            Tool.agent_enabled.is_(True),
        )
        .cte("candidates")
        .prefix_with("MATERIALIZED")
    )
    distance_expr = cast(candidates.c.embedding, HALFVEC(llm_config.embedding_dimensions)).cosine_distance(
        HalfVector(query_embedding)
    )
    rows = session.execute(
        select(candidates.c.tool_id)
        .order_by(distance_expr)
        .limit(top_k)
    ).all()
    return [row[0] for row in rows]


def _normalize_query_terms(query: str) -> list[str]:
    return [
        term
        for term in re.findall(r"[a-z0-9_/-]+", query.lower())
        if term and not term.isdigit() and term not in COMMON_QUERY_TERMS
    ]


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _tool_text_sql_parts():
    feature_name = func.lower(func.coalesce(Feature.name, ""))
    tool_name = func.lower(func.coalesce(cast(Tool.tool["function"]["name"], String), ""))
    tool_description = func.lower(func.coalesce(cast(Tool.tool["function"]["description"], String), ""))
    normalized_path = func.lower(func.coalesce(Tool.path, ""))
    parameters = func.lower(func.coalesce(cast(Tool.tool["function"]["parameters"], String), ""))
    return tool_name, tool_description, normalized_path, feature_name, parameters


def _lexical_search_condition(query: str):
    terms = _normalize_query_terms(query)
    if not terms:
        normalized_query = query.strip().lower()
        if not normalized_query:
            return None
        terms = [normalized_query]
    tool_name, tool_description, normalized_path, feature_name, parameters = _tool_text_sql_parts()
    predicates = []
    for term in terms:
        pattern = f"%{_escape_like(term)}%"
        predicates.append(
            or_(
                normalized_path.like(pattern, escape="\\"),
                tool_name.like(pattern, escape="\\"),
                tool_description.like(pattern, escape="\\"),
                feature_name.like(pattern, escape="\\"),
                parameters.like(pattern, escape="\\"),
            )
        )
    return and_(*predicates)


def _lexical_score_expression(query: str):
    normalized_query = query.strip().lower()
    terms = _normalize_query_terms(query)
    tool_name, tool_description, normalized_path, feature_name, parameters = _tool_text_sql_parts()
    score = literal(0)
    if normalized_query:
        pattern = f"%{_escape_like(normalized_query)}%"
        score += case((tool_name.like(pattern, escape="\\"), 12), else_=0)
        score += case((normalized_path.like(pattern, escape="\\"), 10), else_=0)
        score += case((feature_name.like(pattern, escape="\\"), 8), else_=0)
        score += case((tool_description.like(pattern, escape="\\"), 6), else_=0)
    for term in terms:
        pattern = f"%{_escape_like(term)}%"
        score += case((tool_name.like(pattern, escape="\\"), 5), else_=0)
        score += case((normalized_path.like(pattern, escape="\\"), 4), else_=0)
        score += case((feature_name.like(pattern, escape="\\"), 3), else_=0)
        score += case((tool_description.like(pattern, escape="\\"), 2), else_=0)
        score += case((parameters.like(pattern, escape="\\"), 1), else_=0)
    return score


def _search_tools_lexically(
    session: Session,
    user_id: str,
    query: str,
    top_k: int,
    exclude_ids: set[UUID] | None = None,
) -> list[UUID]:
    score_expr = _lexical_score_expression(query)
    stmt = (
        select(Tool.id)
        .outerjoin(Feature, Feature.id == Tool.feature_id)
        .where(
            Tool.user_id == user_id,
            Tool.agent_enabled.is_(True),
            score_expr > 0,
        )
    )
    condition = _lexical_search_condition(query)
    if condition is not None:
        stmt = stmt.where(condition)
    if exclude_ids:
        stmt = stmt.where(Tool.id.notin_(list(exclude_ids)))
    rows = session.execute(
        stmt
        .order_by(score_expr.desc(), Tool.created_at.desc())
        .limit(top_k)
    ).all()
    return [row[0] for row in rows]


def search_similar_tools(session: Session, user_id: str, query: str, top_k: int | None = None) -> list[UUID]:
    if top_k is None:
        total = session.scalar(
            select(func.count()).select_from(Tool).where(
                Tool.user_id == user_id,
                Tool.agent_enabled.is_(True)
            )
        ) or 0
        top_k = llm_config.calculate_top_k(total)

    if top_k == 0:
        return []

    vector_ids: list[UUID] = []
    lexical_ids: list[UUID] = []
    fallback_reason: str | None = None
    if not _is_postgresql_session(session):
        fallback_reason = "vector_unsupported"
    else:
        try:
            query_embedding = generate_embedding(query)
        except Exception as e:
            log_error("EmbeddingService", "search_similar_tools", "Failed to generate query embedding", exc=e)
            fallback_reason = "embedding_error"
        else:
            try:
                vector_ids = _search_embedded_tools_exact(session, user_id, query_embedding, top_k)
            except Exception as e:
                log_error("EmbeddingService", "search_similar_tools", "Vector search failed", exc=e, user_id=user_id)
                fallback_reason = "vector_error"
            else:
                if len(vector_ids) < top_k:
                    fallback_reason = "vector_backfill"

    if len(vector_ids) < top_k:
        lexical_ids = _search_tools_lexically(
            session,
            user_id,
            query,
            top_k - len(vector_ids),
            exclude_ids=set(vector_ids),
        )
        if lexical_ids and fallback_reason:
            log_warning(
                "EmbeddingService",
                "search_similar_tools",
                "Using lexical fallback",
                user_id=user_id,
                reason=fallback_reason,
                fallback_results=len(lexical_ids),
            )

    tool_ids = vector_ids + lexical_ids
    log_info(
        "EmbeddingService",
        "search_similar_tools",
        "Search completed",
        user_id=user_id,
        results=len(tool_ids),
        vector_results=len(vector_ids),
        lexical_results=len(lexical_ids),
    )
    return tool_ids
