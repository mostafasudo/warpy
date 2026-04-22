from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..core.auth import require_dashboard_principal
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.auth import DashboardPrincipal
from ..schemas.tool import PaginatedToolsResponse, ToolPayload, ToolResponse
from ..services.tool_service import create_tool, delete_tool, list_tools, update_tool

router = APIRouter()


@router.get("/tools", response_model=PaginatedToolsResponse)
def read_tools(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="page_size"),
    search: str | None = Query(None, min_length=1, max_length=128),
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> PaginatedToolsResponse:
    try:
        items, total = list_tools(session, principal.user_id, page, page_size, search)
        log_info("ToolsController", "read_tools", "Tools fetched", user_id=principal.user_id)
        return PaginatedToolsResponse(items=items, page=page, page_size=page_size, total=total)
    except HTTPException:
        raise
    except Exception as error:
        log_error("ToolsController", "read_tools", "Failed to fetch tools", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch tools")


@router.post("/tools", response_model=ToolResponse, status_code=status.HTTP_201_CREATED)
def create_tool_route(
    payload: ToolPayload,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> ToolResponse:
    try:
        tool = create_tool(session, principal.user_id, payload)
        log_info("ToolsController", "create_tool", "Tool created", user_id=principal.user_id)
        return tool
    except HTTPException:
        raise
    except Exception as error:
        log_error("ToolsController", "create_tool", "Failed to create tool", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create tool")


@router.put("/tools/{tool_id}", response_model=ToolResponse)
def replace_tool(
    tool_id: UUID,
    payload: ToolPayload,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> ToolResponse:
    try:
        tool = update_tool(session, tool_id, principal.user_id, payload)
        log_info("ToolsController", "replace_tool", "Tool updated", user_id=principal.user_id)
        return tool
    except HTTPException:
        raise
    except Exception as error:
        log_error("ToolsController", "replace_tool", "Failed to update tool", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update tool")


@router.delete("/tools/{tool_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_tool(
    tool_id: UUID,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal)
) -> None:
    try:
        delete_tool(session, tool_id, principal.user_id)
        log_info("ToolsController", "remove_tool", "Tool deleted", user_id=principal.user_id)
    except HTTPException:
        raise
    except Exception as error:
        log_error("ToolsController", "remove_tool", "Failed to delete tool", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete tool")
