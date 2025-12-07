from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..core.auth import require_clerk_session
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.auth import ClerkSession
from ..schemas.endpoint import EndpointResponse
from ..schemas.feature import EndpointPagination, FeaturePayload, FeatureTogglePayload, FeatureWithEndpointsResponse
from ..services.feature_service import create_feature, delete_feature, list_feature_endpoints, list_features, set_feature_enabled, update_feature


router = APIRouter()


class FeatureEndpointsResponse(EndpointPagination):
    items: list[EndpointResponse]


@router.get("/features", response_model=list[FeatureWithEndpointsResponse])
def read_features(
    search: str | None = Query(None, min_length=0, max_length=128),
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> list[FeatureWithEndpointsResponse]:
    try:
        features = list_features(session, clerk_session.user_id, search)
        log_info("FeaturesController", "read_features", "Features fetched", user_id=clerk_session.user_id)
        return features
    except HTTPException:
        raise
    except Exception as error:
        log_error("FeaturesController", "read_features", "Failed to fetch features", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch features")


@router.get("/features/{feature_id}/endpoints", response_model=FeatureEndpointsResponse)
def read_feature_endpoints(
    feature_id: UUID,
    page: int = Query(1, ge=1),
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> FeatureEndpointsResponse:
    try:
        endpoints, pagination = list_feature_endpoints(session, feature_id, clerk_session.user_id, page)
        log_info("FeaturesController", "read_feature_endpoints", "Endpoints fetched", user_id=clerk_session.user_id, feature_id=str(feature_id))
        return FeatureEndpointsResponse(
            items=endpoints,
            page=pagination.page,
            page_size=pagination.page_size,
            total=pagination.total,
            total_pages=pagination.total_pages
        )
    except HTTPException:
        raise
    except Exception as error:
        log_error("FeaturesController", "read_feature_endpoints", "Failed to fetch endpoints", exc=error, user_id=clerk_session.user_id, feature_id=str(feature_id))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch endpoints")


@router.post("/features", response_model=FeatureWithEndpointsResponse, status_code=status.HTTP_201_CREATED)
def create_feature_route(
    payload: FeaturePayload,
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> FeatureWithEndpointsResponse:
    try:
        feature = create_feature(session, clerk_session.user_id, payload.name)
        log_info("FeaturesController", "create_feature", "Feature created", user_id=clerk_session.user_id)
        return feature
    except HTTPException:
        raise
    except Exception as error:
        log_error("FeaturesController", "create_feature", "Failed to create feature", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create feature")


@router.put("/features/{feature_id}", response_model=FeatureWithEndpointsResponse)
def rename_feature(
    feature_id: UUID,
    payload: FeaturePayload,
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> FeatureWithEndpointsResponse:
    try:
        feature = update_feature(session, feature_id, clerk_session.user_id, payload.name)
        log_info("FeaturesController", "rename_feature", "Feature renamed", user_id=clerk_session.user_id)
        return feature
    except HTTPException:
        raise
    except Exception as error:
        log_error("FeaturesController", "rename_feature", "Failed to rename feature", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to rename feature")


@router.post("/features/{feature_id}/enabled", response_model=FeatureWithEndpointsResponse)
def toggle_feature(
    feature_id: UUID,
    payload: FeatureTogglePayload,
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> FeatureWithEndpointsResponse:
    try:
        feature = set_feature_enabled(session, feature_id, clerk_session.user_id, payload.agent_enabled)
        log_info("FeaturesController", "toggle_feature", "Feature toggled", user_id=clerk_session.user_id)
        return feature
    except HTTPException:
        raise
    except Exception as error:
        log_error("FeaturesController", "toggle_feature", "Failed to toggle feature", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to toggle feature")


@router.delete("/features/{feature_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_feature(
    feature_id: UUID,
    session: Session = Depends(get_session),
    clerk_session: ClerkSession = Depends(require_clerk_session)
) -> None:
    try:
        delete_feature(session, feature_id, clerk_session.user_id)
        log_info("FeaturesController", "remove_feature", "Feature deleted", user_id=clerk_session.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("FeaturesController", "remove_feature", "Failed to delete feature", exc=error, user_id=clerk_session.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete feature")
