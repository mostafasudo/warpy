import json
from uuid import UUID

import pytest

from app.models import HttpMethod
from app.services import agent_tools
from app.services.agent_tools import create_endpoint_tool, create_find_actions_tool


class DummyFeature:
    def __init__(self, name: str):
        self.name = name


class DummyEndpoint:
    def __init__(self, endpoint_id: str, path: str, method: HttpMethod, tool: dict, agent_enabled: bool = True, feature: DummyFeature | None = None):
        self.id = UUID(endpoint_id)
        self.path = path
        self.method = method
        self.tool = tool
        self.user_id = "user"
        self.agent_enabled = agent_enabled
        self.feature = feature


class DummySession:
    def __init__(self, endpoints: list[DummyEndpoint]):
        self._endpoints = endpoints

    def scalars(self, _query):
        class Result:
            def __init__(self, endpoints):
                self._endpoints = endpoints
            def all(self):
                return self._endpoints
            def __iter__(self):
                return iter(self._endpoints)
        enabled = [endpoint for endpoint in self._endpoints if getattr(endpoint, "agent_enabled", True)]
        return Result(enabled)

    def all(self):
        return self._endpoints

    def __iter__(self):
        return iter([endpoint for endpoint in self._endpoints if getattr(endpoint, "agent_enabled", True)])

    def __iter__(self):
        return iter(self._endpoints)


def test_create_endpoint_tool_invokes_executor(monkeypatch: pytest.MonkeyPatch):
    captured = {}

    def fake_execute(session, user_id, endpoint, args, conversation_id=None):
        captured["session"] = session
        captured["user_id"] = user_id
        captured["endpoint"] = endpoint
        captured["args"] = args
        return {"ok": True}

    monkeypatch.setattr(agent_tools, "execute_endpoint", fake_execute)

    endpoint = DummyEndpoint(
        "11111111-1111-1111-1111-111111111111",
        "/users/{id}",
        HttpMethod.get,
        {
            "function": {
                "name": "getUser",
                "description": "Fetch user",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "properties": {"id": {"type": "string"}},
                            "required": ["id"]
                        }
                    },
                    "required": ["params"]
                }
            }
        }
    )
    session = DummySession([endpoint])
    tool = create_endpoint_tool(session, "user_1", endpoint)
    result = tool.invoke({"params": {"id": "9"}})
    assert json.loads(result) == {"ok": True}
    assert captured["endpoint"] is endpoint
    assert captured["args"] == {"params": {"id": "9"}}


def test_create_find_actions_tool_formats_results(monkeypatch: pytest.MonkeyPatch):
    endpoint = DummyEndpoint(
        "22222222-2222-2222-2222-222222222222",
        "/orders",
        HttpMethod.post,
        {"function": {"name": "createOrder", "description": "Create order"}},
        feature=DummyFeature("Orders")
    )
    session = DummySession([endpoint])
    monkeypatch.setattr(agent_tools, "search_similar_endpoints", lambda _s, _u, _q: [endpoint.id])

    tool = create_find_actions_tool(session, "user_1")
    response = json.loads(tool.invoke("order"))
    assert response[0]["id"] == str(endpoint.id)
    assert response[0]["name"] == "createOrder"
    assert response[0]["description"] == "Create order"
    assert response[0]["feature"] == "Orders"


def test_create_find_actions_tool_handles_empty(monkeypatch: pytest.MonkeyPatch):
    session = DummySession([])
    monkeypatch.setattr(agent_tools, "search_similar_endpoints", lambda _s, _u, _q: [])
    tool = create_find_actions_tool(session, "user_1")
    response = tool.invoke("none")
    assert "No matching actions" in response


def test_create_find_actions_tool_returns_empty_when_all_disabled(monkeypatch: pytest.MonkeyPatch):
    disabled = DummyEndpoint(
        "99999999-9999-9999-9999-999999999999",
        "/disabled",
        HttpMethod.get,
        {"function": {"name": "disabled", "description": "Disabled"}},
        agent_enabled=False
    )
    session = DummySession([disabled])
    monkeypatch.setattr(agent_tools, "search_similar_endpoints", lambda _s, _u, _q: [disabled.id])
    tool = create_find_actions_tool(session, "user_1")
    response = tool.invoke("anything")
    assert "No matching actions" in response


def test_create_find_actions_tool_ignores_disabled(monkeypatch: pytest.MonkeyPatch):
    enabled = DummyEndpoint(
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "/active",
        HttpMethod.get,
        {"function": {"name": "active", "description": "enabled"}},
        agent_enabled=True
    )
    disabled = DummyEndpoint(
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "/inactive",
        HttpMethod.get,
        {"function": {"name": "inactive", "description": "disabled"}},
        agent_enabled=False
    )
    session = DummySession([enabled, disabled])
    monkeypatch.setattr(agent_tools, "search_similar_endpoints", lambda _s, _u, _q: [enabled.id, disabled.id])

    tool = create_find_actions_tool(session, "user_1")
    response = json.loads(tool.invoke("anything"))
    assert len(response) == 1
    assert response[0]["id"] == str(enabled.id)


def test_get_endpoint_tools_empty_list():
    session = DummySession([])
    tools = agent_tools.get_endpoint_tools(session, "user", [], None)
    assert tools == []


def test_get_endpoint_tools_returns_tools(monkeypatch: pytest.MonkeyPatch):
    endpoint = DummyEndpoint(
        "33333333-3333-3333-3333-333333333333",
        "/things",
        HttpMethod.get,
        {"function": {"name": "listThings", "description": "List", "parameters": {"type": "object", "properties": {}, "required": []}}}
    )
    session = DummySession([endpoint])
    tools = agent_tools.get_endpoint_tools(session, "user", [endpoint.id], None)
    assert len(tools) == 1


def test_get_endpoint_tools_skips_disabled():
    enabled = DummyEndpoint(
        "44444444-4444-4444-4444-444444444444",
        "/enabled",
        HttpMethod.get,
        {"function": {"name": "enabledTool", "description": "Enabled", "parameters": {"type": "object", "properties": {}, "required": []}}}
    )
    disabled = DummyEndpoint(
        "55555555-5555-5555-5555-555555555555",
        "/disabled",
        HttpMethod.get,
        {"function": {"name": "disabledTool", "description": "Disabled", "parameters": {"type": "object", "properties": {}, "required": []}}},
        agent_enabled=False
    )
    session = DummySession([enabled, disabled])
    tools = agent_tools.get_endpoint_tools(session, "user", [enabled.id, disabled.id], None)
    assert len(tools) == 1
    assert tools[0].name == "enabledTool"


def test_dummy_session_iterates():
    session = DummySession([])
    assert list(session) == []
