from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.auth import require_dashboard_principal
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.auth import DashboardPrincipal
from ..schemas.widget_dynamic_ui import (
    WidgetUiComponentPayload,
    WidgetUiComponentResponse,
    WidgetUiComponentsResponse,
)
from ..services.widget_ui_component_service import (
    create_widget_ui_component,
    delete_widget_ui_component,
    list_widget_ui_components,
    update_widget_ui_component,
)

router = APIRouter()


@router.get("/widget-components", response_model=WidgetUiComponentsResponse)
def read_widget_components(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> WidgetUiComponentsResponse:
    try:
        items = list_widget_ui_components(session, principal.user_id)
        log_info("WidgetUiComponentsController", "read_widget_components", "Widget components fetched", user_id=principal.user_id)
        return WidgetUiComponentsResponse(items=items)
    except Exception as error:
        log_error(
            "WidgetUiComponentsController",
            "read_widget_components",
            "Failed to fetch widget components",
            exc=error,
            user_id=principal.user_id,
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch widget components")


@router.post("/widget-components", response_model=WidgetUiComponentResponse, status_code=status.HTTP_201_CREATED)
def create_widget_component_route(
    payload: WidgetUiComponentPayload,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> WidgetUiComponentResponse:
    try:
        component = create_widget_ui_component(session, principal.user_id, payload)
        log_info("WidgetUiComponentsController", "create_widget_component", "Widget component created", user_id=principal.user_id)
        return WidgetUiComponentResponse.model_validate(component)
    except HTTPException:
        raise
    except Exception as error:
        log_error(
            "WidgetUiComponentsController",
            "create_widget_component",
            "Failed to create widget component",
            exc=error,
            user_id=principal.user_id,
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create widget component")


@router.put("/widget-components/{component_id}", response_model=WidgetUiComponentResponse)
def replace_widget_component(
    component_id: UUID,
    payload: WidgetUiComponentPayload,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> WidgetUiComponentResponse:
    try:
        component = update_widget_ui_component(session, component_id, principal.user_id, payload)
        log_info("WidgetUiComponentsController", "replace_widget_component", "Widget component updated", user_id=principal.user_id)
        return WidgetUiComponentResponse.model_validate(component)
    except HTTPException:
        raise
    except Exception as error:
        log_error(
            "WidgetUiComponentsController",
            "replace_widget_component",
            "Failed to update widget component",
            exc=error,
            user_id=principal.user_id,
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update widget component")


@router.delete("/widget-components/{component_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_widget_component(
    component_id: UUID,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> None:
    try:
        delete_widget_ui_component(session, component_id, principal.user_id)
        log_info("WidgetUiComponentsController", "remove_widget_component", "Widget component deleted", user_id=principal.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error(
            "WidgetUiComponentsController",
            "remove_widget_component",
            "Failed to delete widget component",
            exc=error,
            user_id=principal.user_id,
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete widget component")
