from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.auth import require_dashboard_principal
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.api_key import ApiKeyRevealResponse, ApiKeySummaryResponse
from ..schemas.auth import DashboardPrincipal
from ..services.api_key_service import ensure_user_api_key, reveal_user_api_key, rotate_user_api_key

router = APIRouter()


@router.get("/api-key", response_model=ApiKeySummaryResponse)
def read_api_key(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> ApiKeySummaryResponse:
    try:
        record = ensure_user_api_key(session, principal.user_id)
        return ApiKeySummaryResponse(
            apiKeyLast4=record.key_last4,
            createdAt=record.created_at,
            rotatedAt=record.rotated_at,
        )
    except HTTPException:
        raise
    except Exception as error:
        log_error("ApiKeyController", "read_api_key", "Failed to fetch API key", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch API key")


@router.post("/api-key/reveal", response_model=ApiKeyRevealResponse)
def reveal_api_key(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> ApiKeyRevealResponse:
    try:
        record, api_key = reveal_user_api_key(session, principal.user_id)
        log_info("ApiKeyController", "reveal_api_key", "API key revealed", user_id=principal.user_id)
        return ApiKeyRevealResponse(
            apiKey=api_key,
            apiKeyLast4=record.key_last4,
            createdAt=record.created_at,
            rotatedAt=record.rotated_at,
        )
    except HTTPException:
        raise
    except Exception as error:
        log_error("ApiKeyController", "reveal_api_key", "Failed to reveal API key", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to reveal API key")


@router.post("/api-key/rotate", response_model=ApiKeyRevealResponse)
def rotate_api_key(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> ApiKeyRevealResponse:
    try:
        record, api_key = rotate_user_api_key(session, principal.user_id)
        log_info("ApiKeyController", "rotate_api_key", "API key rotated", user_id=principal.user_id)
        return ApiKeyRevealResponse(
            apiKey=api_key,
            apiKeyLast4=record.key_last4,
            createdAt=record.created_at,
            rotatedAt=record.rotated_at,
        )
    except HTTPException:
        raise
    except Exception as error:
        log_error("ApiKeyController", "rotate_api_key", "Failed to rotate API key", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to rotate API key")
