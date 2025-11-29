from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.auth import require_clerk_session
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.auth import ClerkSession
from ..schemas.config import ConfigPayload, ConfigResponse
from ..services.config_service import get_config, upsert_config

router = APIRouter()


@router.get("/config", response_model=ConfigResponse)
def read_config(
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> ConfigResponse:
    try:
        return get_config(session, clerk_session.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("ConfigController", "read_config", "Failed to fetch config", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch config")


@router.put("/config", response_model=ConfigResponse)
def replace_config(
    payload: ConfigPayload,
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> ConfigResponse:
    try:
        config = upsert_config(session, clerk_session.user_id, payload)
        log_info("ConfigController", "replace_config", "Config saved", user_id=clerk_session.user_id)
        return config
    except HTTPException:
        raise
    except Exception as error:
        log_error("ConfigController", "replace_config", "Failed to save config", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save config")
