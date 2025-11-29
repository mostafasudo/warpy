import json
from uuid import UUID

from langchain_core.messages import AIMessage
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.services.agent_chain import AgentExecutor


class DummyLLM:
    def __init__(self, responses):
        self.responses = responses
        self.bound_tools = []

    def bind_tools(self, tools):
        self.bound_tools = tools
        return self

    async def ainvoke(self, _messages):
        return self.responses.pop(0)


class DummyArgs(BaseModel):
    query: str = Field(default="")


def build_tool(name: str, payload: str):
    return StructuredTool.from_function(func=lambda **kwargs: payload, name=name, description=name, args_schema=DummyArgs)


def test_agent_executor_runs_with_tool_calls(monkeypatch):
    import asyncio
    responses = [
        AIMessage(content="", tool_calls=[{"id": "call-1", "name": "get_endpoints", "args": {"query": "test"}}]),
        AIMessage(content="done", tool_calls=[])
    ]
    llm = DummyLLM(responses)

    endpoint_id = UUID("33333333-3333-3333-3333-333333333333")
    tool_result = json.dumps([{"id": str(endpoint_id)}])
    get_tool = build_tool("get_endpoints", tool_result)

    endpoint_calls: list[list[UUID]] = []

    def fake_get_endpoint_tools(_session, _user_id, endpoint_ids, _schema_factory):
        endpoint_calls.append(list(endpoint_ids))
        return []

    monkeypatch.setattr("app.services.agent_chain.create_get_endpoints_tool", lambda *_args, **_kwargs: get_tool)
    monkeypatch.setattr("app.services.agent_chain.get_endpoint_tools", fake_get_endpoint_tools)

    executor = AgentExecutor(session=None, user_id="user", llm_client=llm)
    result = asyncio.run(executor.run("hello", []))
    assert result == "done"
    assert endpoint_id in executor.active_endpoint_ids
    assert endpoint_calls[0] == []
    assert endpoint_calls[1] == [endpoint_id]


def test_agent_executor_handles_tool_error(monkeypatch):
    import asyncio
    responses = [
        AIMessage(content="", tool_calls=[{"id": "call-1", "name": "broken", "args": {}}]),
        AIMessage(content="final", tool_calls=[])
    ]
    llm = DummyLLM(responses)
    broken_tool = StructuredTool.from_function(
        func=lambda **kwargs: (_ for _ in ()).throw(RuntimeError("fail")),
        name="broken",
        description="broken",
        args_schema=DummyArgs
    )
    monkeypatch.setattr("app.services.agent_chain.create_get_endpoints_tool", lambda *_args, **_kwargs: broken_tool)
    monkeypatch.setattr("app.services.agent_chain.get_endpoint_tools", lambda *_a, **_k: [])
    executor = AgentExecutor(session=None, user_id="user", llm_client=llm)
    result = asyncio.run(executor.run("hello", []))
    assert result == "final"


def test_agent_executor_parses_history_and_missing_tool(monkeypatch):
    import asyncio
    history = [
        {"role": "user", "content": "u"},
        {"role": "assistant", "content": "a"}
    ]
    class LoopLLM:
        def __init__(self):
            self.calls = 0
        def bind_tools(self, tools):
            return self
        async def ainvoke(self, _messages):
            self.calls += 1
            return AIMessage(content="", tool_calls=[{"id": f"call-{self.calls}", "name": "missing", "args": {}}])
    llm = LoopLLM()
    monkeypatch.setattr("app.services.agent_chain.create_get_endpoints_tool", lambda *_args, **_kwargs: build_tool("get_endpoints", "[]"))
    monkeypatch.setattr("app.services.agent_chain.get_endpoint_tools", lambda *_a, **_k: [])
    executor = AgentExecutor(session=None, user_id="user", llm_client=llm)
    result = asyncio.run(executor.run("hello", history))
    assert result.startswith("I've reached the maximum number of steps")


def test_parse_endpoint_ids_handles_invalid_json():
    executor = AgentExecutor(session=None, user_id="user", llm_client=DummyLLM([]))
    assert executor._parse_endpoint_ids_from_response("not-json") == []
    assert executor._parse_endpoint_ids_from_response("{}") == []
