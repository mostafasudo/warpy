from uuid import UUID

from rq import Retry

from ..core.database import session_scope
from ..core.logger import log_error, log_info
from ..services.embedding_service import upsert_endpoint_embedding
from .queue import get_queue


retry_policy = Retry(max=3, interval=[5, 30, 120])


def enqueue_endpoint_embedding(endpoint_id: UUID, user_id: str) -> None:
    try:
        queue = get_queue()
        queue.enqueue(
            process_endpoint_embedding,
            str(endpoint_id),
            user_id,
            retry=retry_policy
        )
        log_info("EmbeddingWorker", "enqueue_endpoint_embedding", "Job enqueued", endpoint_id=str(endpoint_id), user_id=user_id)
    except Exception as exc:
        log_error("EmbeddingWorker", "enqueue_endpoint_embedding", "Failed to enqueue job", exc=exc, endpoint_id=str(endpoint_id), user_id=user_id)


def process_endpoint_embedding(endpoint_id: str, user_id: str) -> None:
    try:
        parsed_id = UUID(endpoint_id)
    except ValueError as exc:
        log_error("EmbeddingWorker", "process_endpoint_embedding", "Invalid endpoint id", exc=exc, endpoint_id=endpoint_id, user_id=user_id)
        return
    try:
        with session_scope() as session:
            result = upsert_endpoint_embedding(session, parsed_id, user_id)
        if result:
            log_info("EmbeddingWorker", "process_endpoint_embedding", "Embedding updated", endpoint_id=endpoint_id, user_id=user_id)
        else:
            log_info("EmbeddingWorker", "process_endpoint_embedding", "No embedding change", endpoint_id=endpoint_id, user_id=user_id)
    except Exception as exc:
        log_error("EmbeddingWorker", "process_endpoint_embedding", "Failed to process embedding", exc=exc, endpoint_id=endpoint_id, user_id=user_id)
        raise
