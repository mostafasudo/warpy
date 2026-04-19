from __future__ import annotations

import json
import re
import time
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from typing import Any, Callable, ContextManager
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.logger import log_error, log_info, log_warning
from ..models import McpAuthMode, McpConnection


class McpAuthExpiredError(Exception):
    pass


def make_db_tool_ref(tool_id: UUID) -> str:
    return f"db:{tool_id}"


def is_db_tool_ref(tool_ref: str) -> bool:
    return str(tool_ref).startswith("db:")


def parse_db_tool_ref(tool_ref: str) -> UUID | None:
    if not is_db_tool_ref(tool_ref):
        return None
    _, _, raw_id = str(tool_ref).partition(":")
    try:
        return UUID(raw_id)
    except ValueError:
        return None


def make_mcp_tool_ref(connection_id: UUID, tool_name: str) -> str:
    return f"mcp:{connection_id}:{tool_name}"


def is_mcp_tool_ref(tool_ref: str) -> bool:
    return str(tool_ref).startswith("mcp:")


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return slug or "mcp"


def _extract_attr(value: Any, *names: str) -> Any:
    for name in names:
        if isinstance(value, dict) and name in value:
            return value[name]
        if hasattr(value, name):
            return getattr(value, name)
    return None


def _normalize_schema(schema: Any) -> dict[str, Any]:
    if isinstance(schema, dict):
        return schema
    if hasattr(schema, "model_dump"):
        return schema.model_dump(by_alias=True)
    return {"type": "object", "properties": {}}


def _is_auth_error(error: Exception) -> bool:
    status_code = getattr(error, "status_code", None) or getattr(getattr(error, "response", None), "status_code", None)
    if status_code in (401, 403):
        return True
    lowered = str(error).lower()
    if "401" in lowered or "403" in lowered:
        return True
    return any(fragment in lowered for fragment in ("unauthorized", "forbidden", "www-authenticate", "access token", "bearer"))


@dataclass(frozen=True)
class McpConnectionSnapshot:
    id: UUID
    name: str
    slug: str
    server_url: str
    auth_mode: str
    static_headers: dict[str, str]
    token_exchange_path: str | None

    @classmethod
    def from_record(cls, record: McpConnection) -> "McpConnectionSnapshot":
        return cls(
            id=record.id,
            name=record.name,
            slug=_slugify(record.name),
            server_url=record.server_url,
            auth_mode=record.auth_mode.value if isinstance(record.auth_mode, McpAuthMode) else str(record.auth_mode),
            static_headers={
                str(key): str(value)
                for key, value in (record.static_headers or {}).items()
                if str(key).strip() and str(value).strip()
            },
            token_exchange_path=record.token_exchange_path,
        )


@dataclass(frozen=True)
class McpToolSnapshot:
    ref: str
    connection_id: UUID
    connection_name: str
    connection_slug: str
    alias_name: str
    server_tool_name: str
    description: str
    input_schema: dict[str, Any]

    @classmethod
    def from_tool(cls, connection: McpConnectionSnapshot, tool: Any) -> "McpToolSnapshot":
        server_tool_name = str(_extract_attr(tool, "name") or "").strip()
        description = str(_extract_attr(tool, "description") or "").strip()
        input_schema = _normalize_schema(
            _extract_attr(tool, "inputSchema", "input_schema") or {"type": "object", "properties": {}}
        )
        return cls(
            ref=make_mcp_tool_ref(connection.id, server_tool_name),
            connection_id=connection.id,
            connection_name=connection.name,
            connection_slug=connection.slug,
            alias_name=f"{connection.slug}__{server_tool_name}",
            server_tool_name=server_tool_name,
            description=description,
            input_schema=input_schema,
        )

    def to_metadata(self) -> dict[str, Any]:
        return {
            "toolType": "mcp",
            "ref": self.ref,
            "connectionId": str(self.connection_id),
            "connectionName": self.connection_name,
            "serverToolName": self.server_tool_name,
        }

    def to_discovery_result(self) -> dict[str, Any]:
        return {
            "id": self.ref,
            "toolType": "mcp",
            "method": None,
            "path": None,
            "name": self.alias_name,
            "description": self.description,
            "feature": self.connection_name,
        }

    def search_text(self) -> str:
        return " ".join(
            part
            for part in (
                self.connection_name,
                self.connection_slug,
                self.alias_name,
                self.server_tool_name,
                self.description,
                json.dumps(self.input_schema, sort_keys=True),
            )
            if part
        ).lower()


def score_mcp_tool(snapshot: McpToolSnapshot, query: str) -> int:
    normalized = query.strip().lower()
    if not normalized:
        return 0
    terms = [term for term in re.findall(r"[a-z0-9_/-]+", normalized) if term]
    haystack = snapshot.search_text()
    score = 0
    if normalized in haystack:
        score += 20
    if normalized in snapshot.alias_name.lower():
        score += 16
    if normalized in snapshot.server_tool_name.lower():
        score += 14
    if normalized in snapshot.connection_name.lower():
        score += 10
    for term in terms:
        if term in snapshot.alias_name.lower():
            score += 6
        if term in snapshot.server_tool_name.lower():
            score += 5
        if term in snapshot.connection_name.lower():
            score += 4
        if term in snapshot.description.lower():
            score += 3
        if term in json.dumps(snapshot.input_schema, sort_keys=True).lower():
            score += 1
    return score


@dataclass
class _McpSessionState:
    connection: McpConnectionSnapshot
    client: httpx.AsyncClient
    stream_context: AbstractAsyncContextManager
    session_context: AbstractAsyncContextManager
    session: Any


class McpStepContext:
    def __init__(
        self,
        *,
        session_provider: Callable[[], ContextManager[Session]],
        user_id: str,
        auth_bundles: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        self._session_provider = session_provider
        self._user_id = user_id
        self._auth_bundles = auth_bundles or {}
        self._connections: list[McpConnectionSnapshot] | None = None
        self._connections_by_id: dict[UUID, McpConnectionSnapshot] = {}
        self._tool_snapshots: dict[str, McpToolSnapshot] = {}
        self._tools_by_connection: dict[UUID, list[McpToolSnapshot]] = {}
        self._sessions: dict[UUID, _McpSessionState] = {}

    async def __aenter__(self) -> "McpStepContext":
        await self._load_connections()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        for state in reversed(list(self._sessions.values())):
            try:
                await state.session_context.__aexit__(exc_type, exc, tb)
            except Exception as error:  # pragma: no cover - best effort close
                log_warning("McpStepContext", "__aexit__", "Failed to close MCP session", connection_id=str(state.connection.id), error=str(error))
            try:
                await state.stream_context.__aexit__(exc_type, exc, tb)
            except Exception as error:  # pragma: no cover - best effort close
                log_warning("McpStepContext", "__aexit__", "Failed to close MCP stream", connection_id=str(state.connection.id), error=str(error))
            try:
                await state.client.aclose()
            except Exception as error:  # pragma: no cover - best effort close
                log_warning("McpStepContext", "__aexit__", "Failed to close MCP client", connection_id=str(state.connection.id), error=str(error))
        self._sessions.clear()

    async def _load_connections(self) -> list[McpConnectionSnapshot]:
        if self._connections is not None:
            return self._connections
        with self._session_provider() as session:
            rows = session.scalars(
                select(McpConnection)
                .where(McpConnection.user_id == self._user_id)
                .order_by(McpConnection.created_at.desc(), McpConnection.id.desc())
            ).all()
        self._connections = [McpConnectionSnapshot.from_record(row) for row in rows]
        self._connections_by_id = {connection.id: connection for connection in self._connections}
        return self._connections

    def _resolve_headers(self, connection: McpConnectionSnapshot) -> dict[str, str]:
        if connection.auth_mode == McpAuthMode.none.value:
            return {}
        if connection.auth_mode == McpAuthMode.static_headers.value:
            return dict(connection.static_headers)
        bundle = self._auth_bundles.get(str(connection.id)) or {}
        headers = bundle.get("headers") if isinstance(bundle, dict) else None
        if not isinstance(headers, dict) or not headers:
            raise McpAuthExpiredError(f"Missing MCP auth bundle for connection {connection.id}")
        return {
            str(key): str(value)
            for key, value in headers.items()
            if str(key).strip() and str(value).strip()
        }

    async def _ensure_session(self, connection: McpConnectionSnapshot) -> Any:
        existing = self._sessions.get(connection.id)
        if existing is not None:
            return existing.session
        try:
            from mcp import ClientSession
            from mcp.client.streamable_http import streamable_http_client
        except ModuleNotFoundError as error:  # pragma: no cover - depends on environment
            raise RuntimeError("Python MCP SDK is not installed") from error

        headers = self._resolve_headers(connection)
        client = httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=30.0)
        try:
            stream_context = streamable_http_client(connection.server_url, http_client=client)
            read, write, _ = await stream_context.__aenter__()
            try:
                session_context = ClientSession(read, write)
                mcp_session = await session_context.__aenter__()
                await mcp_session.initialize()
            except Exception:
                await stream_context.__aexit__(None, None, None)
                raise
        except Exception as error:
            await client.aclose()
            if _is_auth_error(error):
                raise McpAuthExpiredError(str(error)) from error
            raise
        self._sessions[connection.id] = _McpSessionState(
            connection=connection,
            client=client,
            stream_context=stream_context,
            session_context=session_context,
            session=mcp_session,
        )
        return mcp_session

    async def list_connection_tools(self, connection: McpConnectionSnapshot) -> list[McpToolSnapshot]:
        cached = self._tools_by_connection.get(connection.id)
        if cached is not None:
            return cached
        started_at = time.perf_counter()
        session = await self._ensure_session(connection)
        try:
            result = await session.list_tools()
            tool_entries = list(_extract_attr(result, "tools") or [])
            snapshots = [McpToolSnapshot.from_tool(connection, tool) for tool in tool_entries if str(_extract_attr(tool, "name") or "").strip()]
        except McpAuthExpiredError:
            raise
        except Exception as error:
            if _is_auth_error(error):
                raise McpAuthExpiredError(str(error)) from error
            raise
        self._tools_by_connection[connection.id] = snapshots
        for snapshot in snapshots:
            self._tool_snapshots[snapshot.ref] = snapshot
        log_info(
            "McpStepContext",
            "list_connection_tools",
            "Listed MCP tools",
            connection_id=str(connection.id),
            tool_count=len(snapshots),
            duration_ms=int((time.perf_counter() - started_at) * 1000),
        )
        return snapshots

    async def search_tools(self, query: str) -> list[McpToolSnapshot]:
        connections = await self._load_connections()
        results: list[McpToolSnapshot] = []
        for connection in connections:
            try:
                results.extend(await self.list_connection_tools(connection))
            except McpAuthExpiredError as error:
                log_warning(
                    "McpStepContext",
                    "search_tools",
                    "Skipping MCP connection with expired auth during discovery",
                    connection_id=str(connection.id),
                    error=str(error),
                )
            except Exception as error:
                log_warning(
                    "McpStepContext",
                    "search_tools",
                    "Skipping failed MCP connection during discovery",
                    connection_id=str(connection.id),
                    error=str(error),
                )
        ranked = sorted(results, key=lambda snapshot: (score_mcp_tool(snapshot, query), snapshot.alias_name), reverse=True)
        return [snapshot for snapshot in ranked if score_mcp_tool(snapshot, query) > 0]

    async def get_snapshots_for_refs(self, refs: list[str], *, strict_auth: bool = True) -> list[McpToolSnapshot]:
        wanted_refs = {str(ref) for ref in refs if is_mcp_tool_ref(str(ref))}
        if not wanted_refs:
            return []
        await self._load_connections()
        grouped: dict[UUID, list[str]] = {}
        for ref in wanted_refs:
            _, _, remainder = ref.partition("mcp:")
            raw_connection_id, _, _tool_name = remainder.partition(":")
            try:
                connection_id = UUID(raw_connection_id)
            except ValueError:
                continue
            grouped.setdefault(connection_id, []).append(ref)
        snapshots: list[McpToolSnapshot] = []
        for connection_id, connection_refs in grouped.items():
            connection = self._connections_by_id.get(connection_id)
            if connection is None:
                continue
            try:
                tools = await self.list_connection_tools(connection)
            except McpAuthExpiredError as error:
                if strict_auth:
                    raise
                log_warning(
                    "McpStepContext",
                    "get_snapshots_for_refs",
                    "Dropping MCP refs with expired auth",
                    connection_id=str(connection_id),
                    error=str(error),
                )
                continue
            except Exception as error:
                log_warning(
                    "McpStepContext",
                    "get_snapshots_for_refs",
                    "Skipping failed MCP connection while rebuilding active refs",
                    connection_id=str(connection_id),
                    error=str(error),
                )
                continue
            allowed = set(connection_refs)
            snapshots.extend([snapshot for snapshot in tools if snapshot.ref in allowed])
        return snapshots

    async def validate_refs(self, refs: set[str]) -> set[str]:
        snapshots = await self.get_snapshots_for_refs(list(refs), strict_auth=False)
        return {snapshot.ref for snapshot in snapshots}

    async def call_tool(self, snapshot: McpToolSnapshot, arguments: dict[str, Any]) -> dict[str, Any]:
        connection = self._connections_by_id.get(snapshot.connection_id)
        if connection is None:
            raise RuntimeError("MCP connection not found")
        started_at = time.perf_counter()
        session = await self._ensure_session(connection)
        try:
            result = await session.call_tool(snapshot.server_tool_name, arguments=arguments or {})
        except McpAuthExpiredError:
            raise
        except Exception as error:
            if _is_auth_error(error):
                raise McpAuthExpiredError(str(error)) from error
            raise
        structured_content = _extract_attr(result, "structuredContent", "structured_content")
        content_blocks = list(_extract_attr(result, "content") or [])
        text_parts = [str(_extract_attr(block, "text") or "") for block in content_blocks if str(_extract_attr(block, "text") or "").strip()]
        payload: dict[str, Any] = {
            "tool": snapshot.alias_name,
            "connection": connection.name,
        }
        if structured_content is not None:
            payload["structuredContent"] = structured_content
        elif text_parts:
            payload["content"] = "\n".join(text_parts).strip()
        elif content_blocks:
            payload["content"] = [
                block.model_dump(by_alias=True) if hasattr(block, "model_dump") else block
                for block in content_blocks
            ]
        is_error = _extract_attr(result, "isError", "is_error")
        if is_error is not None:
            payload["isError"] = bool(is_error)
        log_info(
            "McpStepContext",
            "call_tool",
            "Executed MCP tool",
            connection_id=str(connection.id),
            tool_name=snapshot.server_tool_name,
            duration_ms=int((time.perf_counter() - started_at) * 1000),
        )
        return payload
