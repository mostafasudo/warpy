from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..core.auth import require_dashboard_principal
from ..core.database import get_session
from ..core.logger import log_error, log_info
from ..schemas.auth import DashboardPrincipal
from ..schemas.mcp_connection import McpConnectionPayload, McpConnectionResponse
from ..services.mcp_connection_service import (
    create_mcp_connection,
    delete_mcp_connection,
    list_mcp_connections,
    update_mcp_connection,
)

router = APIRouter()


@router.get("/mcp-connections", response_model=list[McpConnectionResponse])
def read_mcp_connections(
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> list[McpConnectionResponse]:
    try:
        connections = list_mcp_connections(session, principal.user_id)
        log_info("McpConnectionsController", "read_mcp_connections", "MCP connections fetched", user_id=principal.user_id)
        return connections
    except HTTPException:
        raise
    except Exception as error:
        log_error("McpConnectionsController", "read_mcp_connections", "Failed to fetch MCP connections", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to fetch MCP connections")


@router.post("/mcp-connections", response_model=McpConnectionResponse, status_code=status.HTTP_201_CREATED)
def create_mcp_connection_route(
    payload: McpConnectionPayload,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> McpConnectionResponse:
    try:
        connection = create_mcp_connection(session, principal.user_id, payload)
        log_info("McpConnectionsController", "create_mcp_connection", "MCP connection created", user_id=principal.user_id)
        return connection
    except HTTPException:
        raise
    except Exception as error:
        log_error("McpConnectionsController", "create_mcp_connection", "Failed to create MCP connection", exc=error, user_id=principal.user_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create MCP connection")


@router.put("/mcp-connections/{connection_id}", response_model=McpConnectionResponse)
def update_mcp_connection_route(
    connection_id: UUID,
    payload: McpConnectionPayload,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> McpConnectionResponse:
    try:
        connection = update_mcp_connection(session, connection_id, principal.user_id, payload)
        log_info("McpConnectionsController", "update_mcp_connection", "MCP connection updated", user_id=principal.user_id, connection_id=str(connection_id))
        return connection
    except HTTPException:
        raise
    except Exception as error:
        log_error("McpConnectionsController", "update_mcp_connection", "Failed to update MCP connection", exc=error, user_id=principal.user_id, connection_id=str(connection_id))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update MCP connection")


@router.delete("/mcp-connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mcp_connection_route(
    connection_id: UUID,
    session: Session = Depends(get_session),
    principal: DashboardPrincipal = Depends(require_dashboard_principal),
) -> None:
    try:
        delete_mcp_connection(session, connection_id, principal.user_id)
        log_info("McpConnectionsController", "delete_mcp_connection", "MCP connection deleted", user_id=principal.user_id, connection_id=str(connection_id))
    except HTTPException:
        raise
    except Exception as error:
        log_error("McpConnectionsController", "delete_mcp_connection", "Failed to delete MCP connection", exc=error, user_id=principal.user_id, connection_id=str(connection_id))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete MCP connection")
