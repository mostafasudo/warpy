from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.logger import log_info
from ..models import McpAuthMode, McpConnection
from ..schemas.mcp_connection import McpConnectionPayload, WidgetMcpConnectionResponse


def _normalize_name(name: str) -> str:
    normalized = name.strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Connection name is required")
    return normalized


def _get_connection(session: Session, connection_id: UUID, user_id: str) -> McpConnection:
    connection = session.scalar(
        select(McpConnection).where(
            McpConnection.id == connection_id,
            McpConnection.user_id == user_id,
        )
    )
    if not connection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP connection not found")
    return connection


def list_mcp_connections(session: Session, user_id: str) -> list[McpConnection]:
    return list(
        session.scalars(
            select(McpConnection)
            .where(McpConnection.user_id == user_id)
            .order_by(McpConnection.created_at.desc(), McpConnection.id.desc())
        ).all()
    )


def create_mcp_connection(session: Session, user_id: str, payload: McpConnectionPayload) -> McpConnection:
    connection = McpConnection(
        user_id=user_id,
        name=_normalize_name(payload.name),
        server_url=str(payload.server_url),
        auth_mode=McpAuthMode(payload.auth_mode),
        static_headers=payload.static_headers,
        token_exchange_path=payload.token_exchange_path,
    )
    session.add(connection)
    session.flush()
    log_info("McpConnectionService", "create_mcp_connection", "MCP connection created", user_id=user_id, connection_id=str(connection.id))
    return connection


def update_mcp_connection(
    session: Session,
    connection_id: UUID,
    user_id: str,
    payload: McpConnectionPayload,
) -> McpConnection:
    connection = _get_connection(session, connection_id, user_id)
    connection.name = _normalize_name(payload.name)
    connection.server_url = str(payload.server_url)
    connection.auth_mode = McpAuthMode(payload.auth_mode)
    connection.static_headers = payload.static_headers
    connection.token_exchange_path = payload.token_exchange_path
    session.flush()
    log_info("McpConnectionService", "update_mcp_connection", "MCP connection updated", user_id=user_id, connection_id=str(connection.id))
    return connection


def delete_mcp_connection(session: Session, connection_id: UUID, user_id: str) -> None:
    connection = _get_connection(session, connection_id, user_id)
    session.delete(connection)
    session.flush()
    log_info("McpConnectionService", "delete_mcp_connection", "MCP connection deleted", user_id=user_id, connection_id=str(connection_id))


def list_widget_mcp_connections(session: Session, user_id: str) -> list[WidgetMcpConnectionResponse]:
    connections = list_mcp_connections(session, user_id)
    return [
        WidgetMcpConnectionResponse(
            id=connection.id,
            name=connection.name,
            authMode=connection.auth_mode.value,
            tokenExchangePath=connection.token_exchange_path if connection.auth_mode == McpAuthMode.token_exchange else None,
        )
        for connection in connections
    ]

