import json
from contextlib import contextmanager
from uuid import UUID

import pytest

from app.models import HttpMethod
from app.services import agent_tools
from app.services.agent_tools import (
    ToolSnapshot,
    create_backend_tool,
    create_find_tools_tool,
    create_find_elements_tool,
    create_js_exec_tool,
    create_read_page_tool,
)
from app.services.mcp_runtime import make_db_tool_ref


class DummyFeature:
    def __init__(self, name: str):
        self.name = name


class DummyTool:
    def __init__(
        self,
        tool_id: str,
        path: str | None,
        method: HttpMethod | None,
        tool: dict,
        agent_enabled: bool = True,
        feature: DummyFeature | None = None,
        tool_type: str = "backend",
    ):
        self.id = UUID(tool_id)
        self.path = path
        self.method = method
        self.tool = tool
        self.tool_type = tool_type
        self.user_id = "user"
        self.agent_enabled = agent_enabled
        self.feature = feature


class DummySession:
    def __init__(self, tools: list[DummyTool]):
        self._tools = tools

    def scalars(self, _query):
        class Result:
            def __init__(self, tools):
                self._tools = tools
            def all(self):
                return self._tools
            def __iter__(self):
                return iter(self._tools)
        enabled = [tool for tool in self._tools if getattr(tool, "agent_enabled", True)]
        return Result(enabled)

    def scalar(self, _query):
        enabled = [tool for tool in self._tools if getattr(tool, "agent_enabled", True)]
        return enabled[0] if enabled else None

    def all(self):
        return self._tools

    def __iter__(self):
        return iter(self._tools)


def test_create_backend_tool_invokes_executor(monkeypatch: pytest.MonkeyPatch):
    captured = {}

    def fake_execute(session, user_id, tool_record, args, conversation_id=None):
        captured["session"] = session
        captured["user_id"] = user_id
        captured["tool"] = tool_record
        captured["args"] = args
        return {"ok": True}

    monkeypatch.setattr(agent_tools, "execute_backend_tool", fake_execute)

    tool_record = DummyTool(
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
    session = DummySession([tool_record])
    tool = create_backend_tool(session, "user_1", tool_record)
    result = tool.invoke({"params": {"id": "9"}})
    assert json.loads(result) == {"ok": True}
    assert captured["tool"] is tool_record
    assert captured["args"] == {"params": {"id": "9"}}


def test_create_find_tools_tool_formats_results(monkeypatch: pytest.MonkeyPatch):
    tool_record = DummyTool(
        "22222222-2222-2222-2222-222222222222",
        "/orders",
        HttpMethod.post,
        {"function": {"name": "createOrder", "description": "Create order"}},
        feature=DummyFeature("Orders")
    )
    session = DummySession([tool_record])
    monkeypatch.setattr(agent_tools, "search_similar_tools", lambda _s, _u, _q: [tool_record.id])

    tool = create_find_tools_tool(session, "user_1")
    response = json.loads(tool.invoke("order"))
    assert response[0]["id"] == make_db_tool_ref(tool_record.id)
    assert response[0]["toolType"] == "backend"
    assert response[0]["name"] == "createOrder"
    assert response[0]["description"] == "Create order"
    assert response[0]["feature"] == "Orders"


def test_create_find_tools_tool_handles_empty(monkeypatch: pytest.MonkeyPatch):
    session = DummySession([])
    monkeypatch.setattr(agent_tools, "search_similar_tools", lambda _s, _u, _q: [])
    tool = create_find_tools_tool(session, "user_1")
    response = json.loads(tool.invoke("none"))
    assert response == []


def test_create_find_tools_tool_returns_empty_when_all_disabled(monkeypatch: pytest.MonkeyPatch):
    disabled = DummyTool(
        "99999999-9999-9999-9999-999999999999",
        "/disabled",
        HttpMethod.get,
        {"function": {"name": "disabled", "description": "Disabled"}},
        agent_enabled=False
    )
    session = DummySession([disabled])
    monkeypatch.setattr(agent_tools, "search_similar_tools", lambda _s, _u, _q: [disabled.id])
    tool = create_find_tools_tool(session, "user_1")
    response = json.loads(tool.invoke("anything"))
    assert response == []


def test_create_find_tools_tool_ignores_disabled(monkeypatch: pytest.MonkeyPatch):
    enabled = DummyTool(
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "/active",
        HttpMethod.get,
        {"function": {"name": "active", "description": "enabled"}},
        agent_enabled=True
    )
    disabled = DummyTool(
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "/inactive",
        HttpMethod.get,
        {"function": {"name": "inactive", "description": "disabled"}},
        agent_enabled=False
    )
    session = DummySession([enabled, disabled])
    monkeypatch.setattr(agent_tools, "search_similar_tools", lambda _s, _u, _q: [enabled.id, disabled.id])

    tool = create_find_tools_tool(session, "user_1")
    response = json.loads(tool.invoke("anything"))
    assert len(response) == 1
    assert response[0]["id"] == make_db_tool_ref(enabled.id)


def test_create_backend_tool_uses_session_provider(monkeypatch: pytest.MonkeyPatch):
    captured = {}
    tool_record = DummyTool(
        "12121212-1212-1212-1212-121212121212",
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
                            "required": ["id"],
                        }
                    },
                    "required": ["params"],
                },
            }
        },
    )
    sessions: list[DummySession] = []

    @contextmanager
    def session_provider():
        session = DummySession([tool_record])
        sessions.append(session)
        yield session

    def fake_execute(session, user_id, loaded_tool_record, args, conversation_id=None):
        captured["session"] = session
        captured["user_id"] = user_id
        captured["tool"] = loaded_tool_record
        captured["args"] = args
        return {"ok": True}

    monkeypatch.setattr(agent_tools, "execute_backend_tool", fake_execute)

    tool = create_backend_tool(
        None,
        "user_1",
        ToolSnapshot.from_record(tool_record),
        session_provider=session_provider,
    )
    result = tool.invoke({"params": {"id": "9"}})

    assert json.loads(result) == {"ok": True}
    assert len(sessions) == 1
    assert captured["session"] is sessions[0]
    assert captured["tool"] is tool_record
    assert captured["args"] == {"params": {"id": "9"}}


def test_create_backend_tool_reload_safely_when_given_snapshot_and_session(monkeypatch: pytest.MonkeyPatch):
    captured = {}
    tool_record = DummyTool(
        "56565656-5656-5656-5656-565656565656",
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
                            "required": ["id"],
                        }
                    },
                    "required": ["params"],
                },
            }
        },
    )
    session = DummySession([tool_record])

    def fake_execute(session, user_id, loaded_tool_record, args, conversation_id=None):
        captured["session"] = session
        captured["tool"] = loaded_tool_record
        captured["args"] = args
        return {"ok": True}

    monkeypatch.setattr(agent_tools, "execute_backend_tool", fake_execute)

    tool = create_backend_tool(session, "user_1", ToolSnapshot.from_record(tool_record))
    result = tool.invoke({"params": {"id": "9"}})

    assert json.loads(result) == {"ok": True}
    assert captured["session"] is session
    assert captured["tool"] is tool_record
    assert captured["args"] == {"params": {"id": "9"}}


def test_get_agent_tools_empty_list():
    session = DummySession([])
    tools = agent_tools.get_agent_tools(session, "user", [], None)
    assert tools == []


def test_get_agent_tools_returns_tools(monkeypatch: pytest.MonkeyPatch):
    tool_record = DummyTool(
        "33333333-3333-3333-3333-333333333333",
        "/things",
        HttpMethod.get,
        {"function": {"name": "listThings", "description": "List", "parameters": {"type": "object", "properties": {}, "required": []}}}
    )
    session = DummySession([tool_record])
    tools = agent_tools.get_agent_tools(session, "user", [tool_record.id], None)
    assert len(tools) == 1


def test_get_agent_tools_returns_frontend_tool():
    tool_record = DummyTool(
        "77777777-7777-7777-7777-777777777777",
        "",
        HttpMethod.post,
        {"function": {"name": "openDrawer", "description": "Open drawer", "parameters": {"type": "object", "properties": {}, "required": []}}},
        tool_type="frontend"
    )
    tool_record.path = None
    tool_record.method = None
    session = DummySession([tool_record])
    tools = agent_tools.get_agent_tools(session, "user", [tool_record.id], None)
    assert len(tools) == 1
    assert tools[0].name == "openDrawer"
    assert json.loads(tools[0].invoke({})) == {"status": "queued"}


def test_get_agent_tools_skips_disabled():
    enabled = DummyTool(
        "44444444-4444-4444-4444-444444444444",
        "/enabled",
        HttpMethod.get,
        {"function": {"name": "enabledTool", "description": "Enabled", "parameters": {"type": "object", "properties": {}, "required": []}}}
    )
    disabled = DummyTool(
        "55555555-5555-5555-5555-555555555555",
        "/disabled",
        HttpMethod.get,
        {"function": {"name": "disabledTool", "description": "Disabled", "parameters": {"type": "object", "properties": {}, "required": []}}},
        agent_enabled=False
    )
    session = DummySession([enabled, disabled])
    tools = agent_tools.get_agent_tools(session, "user", [enabled.id, disabled.id], None)
    assert len(tools) == 1
    assert tools[0].name == "enabledTool"


def test_create_read_page_tool_returns_queued():
    tool = create_read_page_tool()
    assert tool.name == "read_page"
    result = json.loads(tool.invoke({}))
    assert result == {"status": "queued"}


def test_create_find_elements_tool_returns_queued():
    tool = create_find_elements_tool()
    assert tool.name == "find_elements"
    result = json.loads(tool.invoke({"query": "save button"}))
    assert result == {"status": "queued"}


def test_create_js_exec_tool_returns_queued():
    tool = create_js_exec_tool()
    assert tool.name == "js_exec"
    result = json.loads(tool.invoke({"code": "document.title"}))
    assert result == {"status": "queued"}


def test_dummy_session_iterates():
    session = DummySession([])
    assert list(session) == []


def test_create_search_knowledge_base_tool(monkeypatch):
    from app.services.agent_tools import create_search_knowledge_base_tool
    monkeypatch.setattr(
        "app.services.knowledge_embedding_service.search_knowledge_base",
        lambda session, user_id, query: [{"content": "answer", "metadata": {}}],
    )
    session = DummySession([])
    tool = create_search_knowledge_base_tool(session, "user_1")
    assert tool.name == "search_knowledge_base"
    assert "public website content" in tool.description
    result = json.loads(tool.invoke({"query": "how does it work"}))
    assert len(result["results"]) == 1


def test_create_search_knowledge_base_tool_empty(monkeypatch):
    from app.services.agent_tools import create_search_knowledge_base_tool
    monkeypatch.setattr(
        "app.services.knowledge_embedding_service.search_knowledge_base",
        lambda session, user_id, query: [],
    )
    session = DummySession([])
    tool = create_search_knowledge_base_tool(session, "user_1")
    result = json.loads(tool.invoke({"query": "nothing"}))
    assert result["results"] == []
    assert "couldn't find" in result["message"]
