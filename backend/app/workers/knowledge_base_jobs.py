from uuid import UUID

from rq import Retry

from ..core.database import session_scope
from ..core.logger import log_error, log_info
from ..models import DocumentStatus, KnowledgeChunk
from ..services.knowledge_base_service import update_document_status
from ..services.knowledge_chunking_service import chunk_elements
from ..services.knowledge_embedding_service import upsert_knowledge_embedding
from ..services.unstructured_service import parse_document
from .queue import get_queue


retry_policy = Retry(max=3, interval=[10, 60, 300])

SAFE_ERROR_MESSAGES = {
    "HTTPStatusError": "The document could not be processed by the parsing service. Please try again or use a different file format.",
    "ConnectError": "Could not reach the document parsing service. Please try again later.",
    "TimeoutException": "Document processing timed out. Try uploading a smaller file.",
    "ConnectionError": "Could not reach the document parsing service. Please try again later.",
}
DEFAULT_ERROR_MESSAGE = "Something went wrong while processing this document. Please try again or contact support."


def _sanitize_error(exc: Exception) -> str:
    exc_name = type(exc).__name__
    for parent in type(exc).__mro__:
        if parent.__name__ in SAFE_ERROR_MESSAGES:
            return SAFE_ERROR_MESSAGES[parent.__name__]
    for key, message in SAFE_ERROR_MESSAGES.items():
        if key in exc_name:
            return message
    return DEFAULT_ERROR_MESSAGE


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


def process_document(document_id: str, user_id: str, file_bytes: bytes, file_name: str) -> None:
    try:
        parsed_id = UUID(document_id)
    except ValueError as exc:
        log_error("KBWorker", "process_document", "Invalid document id", exc=exc, document_id=document_id)
        return

    try:
        elements = parse_document(file_bytes, file_name)
        chunks = chunk_elements(elements)

        if not chunks:
            with session_scope() as session:
                update_document_status(session, parsed_id, DocumentStatus.error, error_message="No content could be extracted from this file")
            return

        with session_scope() as session:
            for index, chunk_data in enumerate(chunks):
                chunk = KnowledgeChunk(
                    document_id=parsed_id,
                    user_id=user_id,
                    content=chunk_data["content"],
                    chunk_index=index,
                    chunk_metadata=chunk_data.get("metadata"),
                )
                session.add(chunk)
                session.flush()
                upsert_knowledge_embedding(session, chunk.id, user_id)
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
