from uuid import UUID

from rq import Retry

from ..core.database import session_scope
from ..core.logger import log_error, log_info
from ..services.embedding_service import upsert_tool_embedding
from .queue import get_queue


retry_policy = Retry(max=3, interval=[5, 30, 120])


def enqueue_tool_embedding(tool_id: UUID, user_id: str) -> None:
    try:
        queue = get_queue()
        queue.enqueue(
            process_tool_embedding,
            str(tool_id),
            user_id,
            retry=retry_policy
        )
        log_info("EmbeddingWorker", "enqueue_tool_embedding", "Job enqueued", tool_id=str(tool_id), user_id=user_id)
    except Exception as exc:
        log_error("EmbeddingWorker", "enqueue_tool_embedding", "Failed to enqueue job", exc=exc, tool_id=str(tool_id), user_id=user_id)


def process_tool_embedding(tool_id: str, user_id: str) -> None:
    try:
        parsed_id = UUID(tool_id)
    except ValueError as exc:
        log_error("EmbeddingWorker", "process_tool_embedding", "Invalid tool id", exc=exc, tool_id=tool_id, user_id=user_id)
        return
    try:
        with session_scope() as session:
            result = upsert_tool_embedding(session, parsed_id, user_id)
        if result:
            log_info("EmbeddingWorker", "process_tool_embedding", "Embedding updated", tool_id=tool_id, user_id=user_id)
        else:
            log_info("EmbeddingWorker", "process_tool_embedding", "No embedding change", tool_id=tool_id, user_id=user_id)
    except Exception as exc:
        log_error("EmbeddingWorker", "process_tool_embedding", "Failed to process embedding", exc=exc, tool_id=tool_id, user_id=user_id)
        raise
