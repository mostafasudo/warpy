import asyncio
from contextlib import contextmanager
from uuid import UUID, uuid4

import pytest

from app.services.mcp_runtime import McpAuthExpiredError, McpConnectionSnapshot, McpStepContext, McpToolSnapshot


@contextmanager
def _session_provider():
    class DummySession:
        def scalars(self, _query):
            class Result:
                def all(self):
                    return []

            return Result()

    yield DummySession()


def _connection(connection_id: str, name: str) -> McpConnectionSnapshot:
    return McpConnectionSnapshot(
        id=UUID(connection_id),
        name=name,
        slug=name.lower().replace(" ", "_"),
        server_url="https://example.com/mcp",
        auth_mode="none",
        static_headers={},
        token_exchange_path=None,
    )


def _tool(connection: McpConnectionSnapshot, tool_name: str, description: str) -> McpToolSnapshot:
    return McpToolSnapshot(
        ref=f"mcp:{connection.id}:{tool_name}",
        connection_id=connection.id,
        connection_name=connection.name,
        connection_slug=connection.slug,
        alias_name=f"{connection.slug}__{tool_name}",
        server_tool_name=tool_name,
        description=description,
        input_schema={"type": "object", "properties": {}},
    )


def test_search_tools_skips_expired_connection_during_discovery(monkeypatch: pytest.MonkeyPatch):
    stale = _connection("11111111-1111-1111-1111-111111111111", "Stale MCP")
    healthy = _connection("22222222-2222-2222-2222-222222222222", "Healthy MCP")
    healthy_tool = _tool(healthy, "get_customer", "Fetch customer")

    context = McpStepContext(session_provider=_session_provider, user_id="user")
    context._connections = [stale, healthy]
    context._connections_by_id = {stale.id: stale, healthy.id: healthy}

    async def fake_list(connection: McpConnectionSnapshot):
        if connection.id == stale.id:
            raise McpAuthExpiredError("expired")
        return [healthy_tool]

    monkeypatch.setattr(context, "list_connection_tools", fake_list)

    results = asyncio.run(context.search_tools("customer"))

    assert results == [healthy_tool]


def test_validate_refs_drops_expired_connection_refs(monkeypatch: pytest.MonkeyPatch):
    stale = _connection("11111111-1111-1111-1111-111111111111", "Stale MCP")
    stale_tool = _tool(stale, "get_customer", "Fetch customer")

    context = McpStepContext(session_provider=_session_provider, user_id="user")
    context._connections = [stale]
    context._connections_by_id = {stale.id: stale}

    async def fake_list(_connection: McpConnectionSnapshot):
        raise McpAuthExpiredError("expired")

    monkeypatch.setattr(context, "list_connection_tools", fake_list)

    valid_refs = asyncio.run(context.validate_refs({stale_tool.ref}))

    assert valid_refs == set()


def test_get_snapshots_for_refs_raises_when_selected_tool_auth_is_expired(monkeypatch: pytest.MonkeyPatch):
    stale = _connection("11111111-1111-1111-1111-111111111111", "Stale MCP")
    stale_tool = _tool(stale, "get_customer", "Fetch customer")

    context = McpStepContext(session_provider=_session_provider, user_id="user")
    context._connections = [stale]
    context._connections_by_id = {stale.id: stale}

    async def fake_list(_connection: McpConnectionSnapshot):
        raise McpAuthExpiredError("expired")

    monkeypatch.setattr(context, "list_connection_tools", fake_list)

    with pytest.raises(McpAuthExpiredError):
        asyncio.run(context.get_snapshots_for_refs([stale_tool.ref], strict_auth=True))

