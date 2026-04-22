import os
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..core.auth import require_dashboard_principal
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..models import BillingPlan
from ..schemas.auth import DashboardPrincipal
from ..schemas.knowledge_base import (
    KnowledgeBaseStatusResponse,
    KnowledgeBaseToggle,
    KnowledgeDocumentContentResponse,
    KnowledgeDocumentListResponse,
    KnowledgeDocumentResponse,
    KnowledgeWebsiteCreate,
    KnowledgeWebsiteDetailResponse,
    KnowledgeWebsiteListResponse,
    KnowledgeWebsiteResponse,
)
from ..services.billing_service import get_billing_actions_summary
from ..services.knowledge_base_service import (
    create_document_record,
    delete_document,
    get_document_chunks,
    get_knowledge_base_status,
    list_documents,
    toggle_knowledge_base,
)
from ..services.knowledge_website_service import (
    build_website_response,
    create_website_record,
    delete_website,
    get_website_detail,
    list_websites,
    mark_website_processing,
    resolve_website_scope,
)
from ..workers.knowledge_base_jobs import enqueue_document_processing, enqueue_website_processing


router = APIRouter()

MAX_FILE_SIZE = 50 * 1024 * 1024

ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".doc", ".pptx", ".ppt", ".txt", ".md",
    ".xlsx", ".xls", ".csv", ".rtf", ".html", ".htm", ".xml", ".json",
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".tif",
    ".rst", ".tsv", ".eml", ".msg", ".epub",
}


def _validate_file(filename: str, size: int) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File type '{ext}' is not supported")
    if size > MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File exceeds the 50 MB limit")
    return ext


def _ensure_can_add_source(session: Session, user_id: str) -> None:
    summary = get_billing_actions_summary(session, user_id)
    if summary.plan == BillingPlan.free and summary.total_remaining <= 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Upgrade your plan to add knowledge sources")


@router.get("/knowledge-base/status", response_model=KnowledgeBaseStatusResponse)
def get_status(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> KnowledgeBaseStatusResponse:
    try:
        result = get_knowledge_base_status(session, principal.user_id)
        return KnowledgeBaseStatusResponse(**result)
    except HTTPException:
        raise
    except Exception as error:
        log_error("KBController", "get_status", "Failed", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to get knowledge base status")


@router.put("/knowledge-base/toggle", response_model=KnowledgeBaseStatusResponse)
def toggle_kb(
    payload: KnowledgeBaseToggle,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> KnowledgeBaseStatusResponse:
    try:
        result = toggle_knowledge_base(session, principal.user_id, payload.enabled)
        log_info("KBController", "toggle_kb", "Toggled", user_id=principal.user_id, enabled=payload.enabled)
        return KnowledgeBaseStatusResponse(**result)
    except HTTPException:
        raise
    except Exception as error:
        log_error("KBController", "toggle_kb", "Failed", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to toggle knowledge base")


@router.get("/knowledge-base/documents", response_model=KnowledgeDocumentListResponse)
def list_docs(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> KnowledgeDocumentListResponse:
    try:
        items, total = list_documents(session, principal.user_id)
        log_info("KBController", "list_docs", "Listed", user_id=principal.user_id, total=total)
        return KnowledgeDocumentListResponse(items=items, total=total)
    except HTTPException:
        raise
    except Exception as error:
        log_error("KBController", "list_docs", "Failed", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to list documents")


@router.post("/knowledge-base/documents", response_model=KnowledgeDocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> KnowledgeDocumentResponse:
    try:
        _ensure_can_add_source(session, principal.user_id)
        file_bytes = await file.read()
        file_name = file.filename or "unknown"
        ext = _validate_file(file_name, len(file_bytes))
        doc = create_document_record(session, principal.user_id, file_name, ext, len(file_bytes))
        session.commit()
        enqueue_document_processing(doc.id, principal.user_id, file_bytes, file_name)
        session.refresh(doc)
        log_info("KBController", "upload_document", "Uploaded", user_id=principal.user_id, file_name=file_name)
        return KnowledgeDocumentResponse.model_validate(doc)
    except HTTPException:
        raise
    except Exception as error:
        log_error("KBController", "upload_document", "Failed", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to upload document")


@router.get("/knowledge-base/documents/{document_id}/content", response_model=KnowledgeDocumentContentResponse)
def get_document_content(
    document_id: UUID,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> KnowledgeDocumentContentResponse:
    try:
        doc, chunks = get_document_chunks(session, document_id, principal.user_id)
        log_info("KBController", "get_document_content", "Fetched", user_id=principal.user_id, document_id=str(document_id), chunks=len(chunks))
        return KnowledgeDocumentContentResponse(
            document_id=doc.id,
            file_name=doc.file_name,
            chunks=chunks,
            total_chunks=len(chunks),
        )
    except HTTPException:
        raise
    except Exception as error:
        log_error("KBController", "get_document_content", "Failed", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to get document content")


@router.delete("/knowledge-base/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_doc(
    document_id: UUID,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> None:
    try:
        delete_document(session, document_id, principal.user_id)
        log_info("KBController", "delete_doc", "Deleted", user_id=principal.user_id, document_id=str(document_id))
    except HTTPException:
        raise
    except Exception as error:
        log_error("KBController", "delete_doc", "Failed", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete document")


@router.get("/knowledge-base/websites", response_model=KnowledgeWebsiteListResponse)
def list_kb_websites(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> KnowledgeWebsiteListResponse:
    try:
        items, total = list_websites(session, principal.user_id)
        log_info("KBController", "list_kb_websites", "Listed", user_id=principal.user_id, total=total)
        return KnowledgeWebsiteListResponse(items=items, total=total)
    except HTTPException:
        raise
    except Exception as error:
        log_error("KBController", "list_kb_websites", "Failed", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to list websites")


@router.post("/knowledge-base/websites", response_model=KnowledgeWebsiteResponse, status_code=status.HTTP_201_CREATED)
def create_kb_website(
    payload: KnowledgeWebsiteCreate,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> KnowledgeWebsiteResponse:
    try:
        _ensure_can_add_source(session, principal.user_id)
        scope_url = resolve_website_scope(payload.url)
        website = create_website_record(session, principal.user_id, payload.url, scope_url)
        session.commit()
        enqueue_website_processing(website.id, principal.user_id)
        session.refresh(website)
        log_info("KBController", "create_kb_website", "Created", user_id=principal.user_id, website_id=str(website.id), scope_url=scope_url)
        return KnowledgeWebsiteResponse.model_validate(build_website_response(website))
    except HTTPException:
        raise
    except Exception as error:
        log_error("KBController", "create_kb_website", "Failed", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to add website")


@router.get("/knowledge-base/websites/{website_id}", response_model=KnowledgeWebsiteDetailResponse)
def get_kb_website_detail(
    website_id: UUID,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> KnowledgeWebsiteDetailResponse:
    try:
        website, pages = get_website_detail(session, website_id, principal.user_id)
        log_info("KBController", "get_kb_website_detail", "Fetched", user_id=principal.user_id, website_id=str(website_id), pages=len(pages))
        return KnowledgeWebsiteDetailResponse(website=website, pages=pages)
    except HTTPException:
        raise
    except Exception as error:
        log_error("KBController", "get_kb_website_detail", "Failed", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load website")


@router.post("/knowledge-base/websites/{website_id}/refresh", response_model=KnowledgeWebsiteResponse)
def refresh_kb_website(
    website_id: UUID,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> KnowledgeWebsiteResponse:
    try:
        website = mark_website_processing(session, website_id, principal.user_id)
        session.commit()
        enqueue_website_processing(website.id, principal.user_id)
        session.refresh(website)
        log_info("KBController", "refresh_kb_website", "Queued", user_id=principal.user_id, website_id=str(website.id))
        return KnowledgeWebsiteResponse.model_validate(build_website_response(website))
    except HTTPException:
        raise
    except Exception as error:
        log_error("KBController", "refresh_kb_website", "Failed", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to refresh website")


@router.delete("/knowledge-base/websites/{website_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_kb_website(
    website_id: UUID,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> None:
    try:
        delete_website(session, website_id, principal.user_id)
        log_info("KBController", "delete_kb_website", "Deleted", user_id=principal.user_id, website_id=str(website_id))
    except HTTPException:
        raise
    except Exception as error:
        log_error("KBController", "delete_kb_website", "Failed", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete website")
