from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..core.auth import require_dashboard_principal
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.auth import DashboardPrincipal
from ..schemas.tool import ToolResponse
from ..schemas.feature import FeaturePayload, FeatureTogglePayload, FeatureWithToolsResponse, ToolPagination
from ..services.feature_service import create_feature, delete_feature, list_feature_tools, list_features, set_feature_enabled, update_feature


router = APIRouter()


class FeatureToolsResponse(ToolPagination):
    items: list[ToolResponse]


@router.get("/features", response_model=list[FeatureWithToolsResponse])
def read_features(
    search: str | None = Query(None, min_length=0, max_length=128),
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> list[FeatureWithToolsResponse]:
    try:
        features = list_features(session, principal.user_id, search)
        log_info("FeaturesController", "read_features", "Features fetched", user_id=principal.user_id)
        return features
    except HTTPException:
        raise
    except Exception as error:
        log_error("FeaturesController", "read_features", "Failed to fetch features", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch features")


@router.get("/features/{feature_id}/tools", response_model=FeatureToolsResponse)
def read_feature_tools(
    feature_id: UUID,
    page: int = Query(1, ge=1),
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> FeatureToolsResponse:
    try:
        tools, pagination = list_feature_tools(session, feature_id, principal.user_id, page)
        log_info("FeaturesController", "read_feature_tools", "Tools fetched", user_id=principal.user_id, feature_id=str(feature_id))
        return FeatureToolsResponse(
            items=tools,
            page=pagination.page,
            page_size=pagination.page_size,
            total=pagination.total,
            total_pages=pagination.total_pages
        )
    except HTTPException:
        raise
    except Exception as error:
        log_error("FeaturesController", "read_feature_tools", "Failed to fetch tools", exc=error, user_id=principal.user_id, feature_id=str(feature_id))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch tools")


@router.post("/features", response_model=FeatureWithToolsResponse, status_code=status.HTTP_201_CREATED)
def create_feature_route(
    payload: FeaturePayload,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> FeatureWithToolsResponse:
    try:
        feature = create_feature(session, principal.user_id, payload.name)
        log_info("FeaturesController", "create_feature", "Feature created", user_id=principal.user_id)
        return feature
    except HTTPException:
        raise
    except Exception as error:
        log_error("FeaturesController", "create_feature", "Failed to create feature", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create feature")


@router.put("/features/{feature_id}", response_model=FeatureWithToolsResponse)
def rename_feature(
    feature_id: UUID,
    payload: FeaturePayload,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> FeatureWithToolsResponse:
    try:
        feature = update_feature(session, feature_id, principal.user_id, payload.name)
        log_info("FeaturesController", "rename_feature", "Feature renamed", user_id=principal.user_id)
        return feature
    except HTTPException:
        raise
    except Exception as error:
        log_error("FeaturesController", "rename_feature", "Failed to rename feature", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to rename feature")


@router.post("/features/{feature_id}/enabled", response_model=FeatureWithToolsResponse)
def toggle_feature(
    feature_id: UUID,
    payload: FeatureTogglePayload,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> FeatureWithToolsResponse:
    try:
        feature = set_feature_enabled(session, feature_id, principal.user_id, payload.agent_enabled)
        log_info("FeaturesController", "toggle_feature", "Feature toggled", user_id=principal.user_id)
        return feature
    except HTTPException:
        raise
    except Exception as error:
        log_error("FeaturesController", "toggle_feature", "Failed to toggle feature", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to toggle feature")


@router.delete("/features/{feature_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_feature(
    feature_id: UUID,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> None:
    try:
        delete_feature(session, feature_id, principal.user_id)
        log_info("FeaturesController", "remove_feature", "Feature deleted", user_id=principal.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("FeaturesController", "remove_feature", "Failed to delete feature", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete feature")
