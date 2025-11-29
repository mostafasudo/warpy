import json
from uuid import UUID

import pytest

from app.models import HttpMethod
from app.services import agent_tools
from app.services.agent_tools import create_endpoint_tool, create_get_endpoints_tool


class DummyEndpoint:
    def __init__(self, endpoint_id: str, path: str, method: HttpMethod, tool: dict):
        self.id = UUID(endpoint_id)
        self.path = path
        self.method = method
        self.tool = tool
        self.user_id = "user"


class DummySession:
    def __init__(self, endpoints: list[DummyEndpoint]):
        self._endpoints = endpoints

    def scalars(self, _query):
        return self

    def all(self):
        return self._endpoints

    def __iter__(self):
        return iter(self._endpoints)


def test_create_endpoint_tool_invokes_executor(monkeypatch: pytest.MonkeyPatch):
    captured = {}

    def fake_execute(session, user_id, endpoint, args):
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


def test_create_get_endpoints_tool_formats_results(monkeypatch: pytest.MonkeyPatch):
    endpoint = DummyEndpoint(
        "22222222-2222-2222-2222-222222222222",
        "/orders",
        HttpMethod.post,
        {"function": {"name": "createOrder", "description": "Create order"}}
    )
    session = DummySession([endpoint])
    monkeypatch.setattr(agent_tools, "search_similar_endpoints", lambda _s, _u, _q: [endpoint.id])

    tool = create_get_endpoints_tool(session, "user_1")
    response = json.loads(tool.invoke("order"))
    assert response[0]["id"] == str(endpoint.id)
    assert response[0]["name"] == "createOrder"
    assert response[0]["description"] == "Create order"


def test_create_get_endpoints_tool_handles_empty(monkeypatch: pytest.MonkeyPatch):
    session = DummySession([])
    monkeypatch.setattr(agent_tools, "search_similar_endpoints", lambda _s, _u, _q: [])
    tool = create_get_endpoints_tool(session, "user_1")
    response = tool.invoke("none")
    assert "No matching endpoints" in response


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


def test_dummy_session_iterates():
    session = DummySession([])
    assert list(session) == []
