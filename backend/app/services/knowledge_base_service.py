from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.logger import log_info
from ..models import Agent, DocumentStatus, KnowledgeChunk, KnowledgeDocument


def list_documents(session: Session, user_id: str) -> tuple[list[KnowledgeDocument], int]:
    docs = session.scalars(
        select(KnowledgeDocument)
        .where(KnowledgeDocument.user_id == user_id)
        .order_by(KnowledgeDocument.created_at.desc())
    ).all()
    return list(docs), len(docs)


def create_document_record(
    session: Session, user_id: str, file_name: str, file_type: str, file_size: int
) -> KnowledgeDocument:
    doc = KnowledgeDocument(
        user_id=user_id,
        file_name=file_name,
        file_type=file_type,
        file_size=file_size,
    )
    session.add(doc)
    session.flush()
    log_info("KBService", "create_document_record", "Document created", document_id=str(doc.id), file_name=file_name)
    return doc


def update_document_status(
    session: Session,
    document_id: UUID,
    doc_status: DocumentStatus,
    chunk_count: int | None = None,
    error_message: str | None = None,
) -> None:
    doc = session.get(KnowledgeDocument, document_id)
    if not doc:
        return
    doc.status = doc_status
    if chunk_count is not None:
        doc.chunk_count = chunk_count
    if doc_status == DocumentStatus.ready:
        doc.error_message = None
    if error_message is not None:
        doc.error_message = error_message
    session.flush()
    log_info("KBService", "update_document_status", "Status updated", document_id=str(document_id), status=doc_status.value)


def delete_document(session: Session, document_id: UUID, user_id: str) -> None:
    doc = session.scalar(
        select(KnowledgeDocument).where(
            KnowledgeDocument.id == document_id,
            KnowledgeDocument.user_id == user_id,
        )
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    session.delete(doc)
    session.flush()
    log_info("KBService", "delete_document", "Document deleted", document_id=str(document_id))


def get_knowledge_base_status(session: Session, user_id: str) -> dict:
    agent = session.scalar(select(Agent).where(Agent.user_id == user_id))
    enabled = agent.knowledge_base_enabled if agent else False

    total = session.scalar(
        select(func.count()).select_from(KnowledgeDocument).where(KnowledgeDocument.user_id == user_id)
    ) or 0
    ready = session.scalar(
        select(func.count()).select_from(KnowledgeDocument).where(
            KnowledgeDocument.user_id == user_id,
            KnowledgeDocument.status == DocumentStatus.ready,
        )
    ) or 0

    if ready == 0 and enabled and agent:
        agent.knowledge_base_enabled = False
        session.flush()
        enabled = False

    return {"enabled": enabled, "document_count": total, "ready_document_count": ready}


def get_document_chunks(
    session: Session, document_id: UUID, user_id: str
) -> tuple[KnowledgeDocument, list[KnowledgeChunk]]:
    doc = session.scalar(
        select(KnowledgeDocument).where(
            KnowledgeDocument.id == document_id,
            KnowledgeDocument.user_id == user_id,
        )
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    chunks = list(
        session.scalars(
            select(KnowledgeChunk)
            .where(KnowledgeChunk.document_id == document_id, KnowledgeChunk.user_id == user_id)
            .order_by(KnowledgeChunk.chunk_index)
        ).all()
    )
    return doc, chunks


def toggle_knowledge_base(session: Session, user_id: str, enabled: bool) -> dict:
    agent = session.scalar(select(Agent).where(Agent.user_id == user_id))
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    if enabled:
        ready = session.scalar(
            select(func.count()).select_from(KnowledgeDocument).where(
                KnowledgeDocument.user_id == user_id,
                KnowledgeDocument.status == DocumentStatus.ready,
            )
        ) or 0
        if ready == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload at least one document first")

    agent.knowledge_base_enabled = enabled
    session.flush()
    return get_knowledge_base_status(session, user_id)
