from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..core.auth import require_clerk_session
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.auth import ClerkSession
from ..schemas.endpoint import EndpointPayload, EndpointResponse, PaginatedEndpointsResponse
from ..services.endpoint_service import create_endpoint, delete_endpoint, list_endpoints, update_endpoint

router = APIRouter()


@router.get("/endpoints", response_model=PaginatedEndpointsResponse)
def read_endpoints(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, alias="page_size"),
    search: str | None = Query(None, min_length=1, max_length=128),
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> PaginatedEndpointsResponse:
    try:
        items, total = list_endpoints(session, clerk_session.user_id, page, page_size, search)
        log_info("EndpointsController", "read_endpoints", "Endpoints fetched", user_id=clerk_session.user_id)
        return PaginatedEndpointsResponse(items=items, page=page, page_size=page_size, total=total)
    except HTTPException:
        raise
    except Exception as error:
        log_error("EndpointsController", "read_endpoints", "Failed to fetch endpoints", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch endpoints")


@router.post("/endpoints", response_model=EndpointResponse, status_code=status.HTTP_201_CREATED)
def create_endpoint_route(
    payload: EndpointPayload,
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> EndpointResponse:
    try:
        endpoint = create_endpoint(session, clerk_session.user_id, payload)
        log_info("EndpointsController", "create_endpoint", "Endpoint created", user_id=clerk_session.user_id)
        return endpoint
    except HTTPException:
        raise
    except Exception as error:
        log_error("EndpointsController", "create_endpoint", "Failed to create endpoint", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create endpoint")


@router.put("/endpoints/{endpoint_id}", response_model=EndpointResponse)
def replace_endpoint(
    endpoint_id: UUID,
    payload: EndpointPayload,
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> EndpointResponse:
    try:
        endpoint = update_endpoint(session, endpoint_id, clerk_session.user_id, payload)
        log_info("EndpointsController", "replace_endpoint", "Endpoint updated", user_id=clerk_session.user_id)
        return endpoint
    except HTTPException:
        raise
    except Exception as error:
        log_error("EndpointsController", "replace_endpoint", "Failed to update endpoint", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update endpoint")


@router.delete("/endpoints/{endpoint_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_endpoint(
    endpoint_id: UUID,
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> None:
    try:
        delete_endpoint(session, endpoint_id, clerk_session.user_id)
        log_info("EndpointsController", "remove_endpoint", "Endpoint deleted", user_id=clerk_session.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("EndpointsController", "remove_endpoint", "Failed to delete endpoint", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete endpoint")
