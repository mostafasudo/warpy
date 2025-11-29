import hashlib
import json
from uuid import UUID

from openai import OpenAI
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info
from ..models import Endpoint, EndpointEmbedding


def _get_openai_client() -> OpenAI:
    settings = get_settings()
    return OpenAI(api_key=settings.open_ai_key)


def _endpoint_to_text(endpoint: Endpoint) -> str:
    tool = endpoint.tool or {}
    function = tool.get("function", {})
    name = function.get("name", "")
    description = function.get("description", "")
    parameters = json.dumps(function.get("parameters", {}), sort_keys=True)
    return f"{endpoint.method.value} {endpoint.path}\n{name}: {description}\nParameters: {parameters}"


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


def upsert_endpoint_embedding(session: Session, endpoint_id: UUID, user_id: str) -> EndpointEmbedding | None:
    endpoint = session.scalar(select(Endpoint).where(Endpoint.id == endpoint_id))
    if not endpoint:
        log_error("EmbeddingService", "upsert_endpoint_embedding", "Endpoint not found", endpoint_id=str(endpoint_id))
        return None

    text = _endpoint_to_text(endpoint)
    content_hash = _compute_hash(text)

    existing = session.scalar(select(EndpointEmbedding).where(EndpointEmbedding.endpoint_id == endpoint_id))
    if existing and existing.content_hash == content_hash:
        log_info("EmbeddingService", "upsert_endpoint_embedding", "Embedding unchanged", endpoint_id=str(endpoint_id))
        return existing

    try:
        embedding_vector = generate_embedding(text)
    except Exception as e:
        log_error("EmbeddingService", "upsert_endpoint_embedding", "Failed to generate embedding", exc=e, endpoint_id=str(endpoint_id))
        return None

    if existing:
        existing.embedding = embedding_vector
        existing.content_hash = content_hash
        existing.user_id = user_id
        session.flush()
        log_info("EmbeddingService", "upsert_endpoint_embedding", "Embedding updated", endpoint_id=str(endpoint_id))
        return existing

    embedding = EndpointEmbedding(
        endpoint_id=endpoint_id,
        user_id=user_id,
        embedding=embedding_vector,
        content_hash=content_hash
    )
    session.add(embedding)
    session.flush()
    log_info("EmbeddingService", "upsert_endpoint_embedding", "Embedding created", endpoint_id=str(endpoint_id))
    return embedding


def delete_endpoint_embedding(session: Session, endpoint_id: UUID) -> None:
    existing = session.scalar(select(EndpointEmbedding).where(EndpointEmbedding.endpoint_id == endpoint_id))
    if existing:
        session.delete(existing)
        session.flush()
        log_info("EmbeddingService", "delete_endpoint_embedding", "Embedding deleted", endpoint_id=str(endpoint_id))


def search_similar_endpoints(session: Session, user_id: str, query: str, top_k: int | None = None) -> list[UUID]:
    if top_k is None:
        total = session.scalar(
            select(func.count()).select_from(EndpointEmbedding).where(EndpointEmbedding.user_id == user_id)
        ) or 0
        top_k = llm_config.calculate_top_k(total)

    if top_k == 0:
        return []

    try:
        query_embedding = generate_embedding(query)
    except Exception as e:
        log_error("EmbeddingService", "search_similar_endpoints", "Failed to generate query embedding", exc=e)
        return []

    results = session.scalars(
        select(EndpointEmbedding.endpoint_id)
        .where(EndpointEmbedding.user_id == user_id)
        .order_by(EndpointEmbedding.embedding.cosine_distance(query_embedding))
        .limit(top_k)
    ).all()

    log_info("EmbeddingService", "search_similar_endpoints", "Search completed", user_id=user_id, results=len(results))
    return list(results)

