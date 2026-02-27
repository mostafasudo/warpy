import hashlib
import json
from uuid import UUID

from openai import OpenAI
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..core.config import get_settings
from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info
from ..models import Tool, ToolEmbedding


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

    try:
        query_embedding = generate_embedding(query)
    except Exception as e:
        log_error("EmbeddingService", "search_similar_tools", "Failed to generate query embedding", exc=e)
        return []

    results = session.scalars(
        select(ToolEmbedding.tool_id)
        .join(Tool, Tool.id == ToolEmbedding.tool_id)
        .where(
            Tool.user_id == user_id,
            Tool.agent_enabled.is_(True)
        )
        .order_by(ToolEmbedding.embedding.cosine_distance(query_embedding))
        .limit(top_k)
    ).all()

    log_info("EmbeddingService", "search_similar_tools", "Search completed", user_id=user_id, results=len(results))
    return list(results)
