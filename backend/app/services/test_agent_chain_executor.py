import asyncio
import json
from uuid import UUID

from langchain_core.messages import AIMessage
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.services.agent_chain import AgentExecutor, BLOCKED_SYSTEM_NOTE
from app.services.hallucination_checker import CheckResult


class DummyLLM:
    def __init__(self, responses):
        self.responses = responses
        self.bound_tools = []

    def bind_tools(self, tools):
        self.bound_tools = tools
        return self

    async def ainvoke(self, _messages, **_kwargs):
        return self.responses.pop(0)


class DummyArgs(BaseModel):
    query: str = Field(default="")


class MockChecker:
    def __init__(self, results):
        self.results = results
        self.calls = []

    async def check(self, user_input, agent_response, system_prompt, available_tools=None, tool_trace=None):
        self.calls.append((user_input, agent_response, system_prompt, available_tools, tool_trace))
        return self.results.pop(0)


def build_tool(name: str, payload: str):
    return StructuredTool.from_function(func=lambda **kwargs: payload, name=name, description=name, args_schema=DummyArgs)


def test_agent_executor_runs_with_tool_calls(monkeypatch):
    responses = [
        AIMessage(content="", tool_calls=[{"id": "call-1", "name": "find_actions", "args": {"query": "test"}}]),
        AIMessage(content="done", tool_calls=[])
    ]
    llm = DummyLLM(responses)
    checker = MockChecker([CheckResult(mode="ALLOW")])

    endpoint_id = UUID("33333333-3333-3333-3333-333333333333")
    tool_result = json.dumps([{"id": str(endpoint_id)}])
    get_tool = build_tool("find_actions", tool_result)

    endpoint_calls: list[list[UUID]] = []

    def fake_get_endpoint_tools(_session, _user_id, endpoint_ids, _schema_factory, conversation_id=None):
        endpoint_calls.append(list(endpoint_ids))
        return []

    monkeypatch.setattr("app.services.agent_chain.create_find_actions_tool", lambda *_args, **_kwargs: get_tool)
    monkeypatch.setattr("app.services.agent_chain.get_endpoint_tools", fake_get_endpoint_tools)

    executor = AgentExecutor(session=None, user_id="user", llm_client=llm, hallucination_checker=checker)
    result = asyncio.run(executor.run("hello", []))
    assert result == "done"
    assert endpoint_id in executor.active_endpoint_ids
    assert endpoint_calls[0] == []
    assert endpoint_calls[1] == [endpoint_id]


def test_agent_executor_handles_tool_error(monkeypatch):
    responses = [
        AIMessage(content="", tool_calls=[{"id": "call-1", "name": "broken", "args": {}}]),
        AIMessage(content="final", tool_calls=[])
    ]
    llm = DummyLLM(responses)
    checker = MockChecker([CheckResult(mode="ALLOW")])
    broken_tool = StructuredTool.from_function(
        func=lambda **kwargs: (_ for _ in ()).throw(RuntimeError("fail")),
        name="broken",
        description="broken",
        args_schema=DummyArgs
    )
    monkeypatch.setattr("app.services.agent_chain.create_find_actions_tool", lambda *_args, **_kwargs: broken_tool)
    monkeypatch.setattr("app.services.agent_chain.get_endpoint_tools", lambda *_a, **_k: [])
    executor = AgentExecutor(session=None, user_id="user", llm_client=llm, hallucination_checker=checker)
    result = asyncio.run(executor.run("hello", []))
    assert result == "final"


def test_agent_executor_parses_history_and_missing_tool(monkeypatch):
    history = [
        {"role": "user", "content": "u"},
        {"role": "assistant", "content": "a"}
    ]
    class LoopLLM:
        def __init__(self):
            self.calls = 0
        def bind_tools(self, tools):
            return self
        async def ainvoke(self, _messages, **_kwargs):
            self.calls += 1
            return AIMessage(content="", tool_calls=[{"id": f"call-{self.calls}", "name": "missing", "args": {}}])
    llm = LoopLLM()
    checker = MockChecker([CheckResult(mode="ALLOW")])
    monkeypatch.setattr("app.services.agent_chain.create_find_actions_tool", lambda *_args, **_kwargs: build_tool("find_actions", "[]"))
    monkeypatch.setattr("app.services.agent_chain.get_endpoint_tools", lambda *_a, **_k: [])
    executor = AgentExecutor(session=None, user_id="user", llm_client=llm, hallucination_checker=checker)
    result = asyncio.run(executor.run("hello", history))
    assert result.startswith("I've reached the maximum number of steps")


def test_parse_endpoint_ids_handles_invalid_json():
    checker = MockChecker([])
    executor = AgentExecutor(session=None, user_id="user", llm_client=DummyLLM([]), hallucination_checker=checker)
    assert executor._parse_endpoint_ids_from_response("not-json") == []
    assert executor._parse_endpoint_ids_from_response("{}") == []


def test_checker_receives_available_tools(monkeypatch):
    responses = [AIMessage(content="ok", tool_calls=[])]
    llm = DummyLLM(responses)
    checker = MockChecker([CheckResult(mode="ALLOW")])
    monkeypatch.setattr("app.services.agent_chain.create_find_actions_tool", lambda *_args, **_kwargs: build_tool("find_actions", "[]"))
    monkeypatch.setattr("app.services.agent_chain.get_endpoint_tools", lambda *_a, **_k: [build_tool("do_thing", "{}")])
    executor = AgentExecutor(session=None, user_id="user", llm_client=llm, hallucination_checker=checker)
    endpoint_id = UUID("33333333-3333-3333-3333-333333333333")
    result = asyncio.run(executor.run_step("hello", [], active_endpoint_ids=[endpoint_id]))
    assert result.response == "ok"
    tools = checker.calls[0][3]
    assert {t["name"] for t in tools} == {"find_actions", "do_thing"}
    assert checker.calls[0][4] == []


def test_checker_receives_tool_trace_from_executed_tools(monkeypatch):
    responses = [
        AIMessage(content="", tool_calls=[{"id": "call-1", "name": "find_actions", "args": {"query": "test"}}]),
        AIMessage(content="done", tool_calls=[])
    ]
    llm = DummyLLM(responses)
    checker = MockChecker([CheckResult(mode="ALLOW")])
    monkeypatch.setattr("app.services.agent_chain.create_find_actions_tool", lambda *_args, **_kwargs: build_tool("find_actions", "[{\"id\":\"1\"}]"))
    monkeypatch.setattr("app.services.agent_chain.get_endpoint_tools", lambda *_a, **_k: [])
    executor = AgentExecutor(session=None, user_id="user", llm_client=llm, hallucination_checker=checker)
    result = asyncio.run(executor.run("hello", []))
    assert result == "done"
    tool_trace = checker.calls[0][4]
    assert len(tool_trace) == 1
    assert tool_trace[0]["id"] == "call-1"
    assert tool_trace[0]["name"] == "find_actions"
    assert tool_trace[0]["args"] == {"query": "test"}
    assert tool_trace[0]["result_is_json"] is True
    assert tool_trace[0]["result_summary"].startswith("list len=")


def test_checker_blocks_out_of_scope_response(monkeypatch):
    responses = [
        AIMessage(content="The answer is 2.", tool_calls=[]),
        AIMessage(content="I can only help with dashboard actions.", tool_calls=[])
    ]
    llm = DummyLLM(responses)
    checker = MockChecker([CheckResult(mode="BLOCK")])
    monkeypatch.setattr("app.services.agent_chain.create_find_actions_tool", lambda *_args, **_kwargs: build_tool("find_actions", "[]"))
    monkeypatch.setattr("app.services.agent_chain.get_endpoint_tools", lambda *_a, **_k: [])
    executor = AgentExecutor(session=None, user_id="user", llm_client=llm, hallucination_checker=checker)
    result = asyncio.run(executor.run("What's 1+1?", []))
    assert result == "I can only help with dashboard actions."
    assert len(checker.calls) == 1


def test_checker_allows_valid_response(monkeypatch):
    responses = [AIMessage(content="I've created the user.", tool_calls=[])]
    llm = DummyLLM(responses)
    checker = MockChecker([CheckResult(mode="ALLOW")])
    monkeypatch.setattr("app.services.agent_chain.create_find_actions_tool", lambda *_args, **_kwargs: build_tool("find_actions", "[]"))
    monkeypatch.setattr("app.services.agent_chain.get_endpoint_tools", lambda *_a, **_k: [])
    executor = AgentExecutor(session=None, user_id="user", llm_client=llm, hallucination_checker=checker)
    result = asyncio.run(executor.run("Create a user", []))
    assert result == "I've created the user."
    assert len(checker.calls) == 1


def test_run_step_with_checker_block(monkeypatch):
    from langchain_core.messages import SystemMessage
    responses = [
        AIMessage(content="bad response", tool_calls=[]),
        AIMessage(content="Solo puedo ayudar con acciones del dashboard.", tool_calls=[])
    ]
    llm = DummyLLM(responses)
    checker = MockChecker([CheckResult(mode="BLOCK")])
    monkeypatch.setattr("app.services.agent_chain.create_find_actions_tool", lambda *_args, **_kwargs: build_tool("find_actions", "[]"))
    monkeypatch.setattr("app.services.agent_chain.get_endpoint_tools", lambda *_a, **_k: [])
    executor = AgentExecutor(session=None, user_id="user", llm_client=llm, hallucination_checker=checker)
    result = asyncio.run(executor.run_step("¿Cuánto es 1+1?", []))
    assert result.done is True
    assert result.response == "Solo puedo ayudar con acciones del dashboard."
    system_notes = [m for m in result.messages if isinstance(m, SystemMessage) and BLOCKED_SYSTEM_NOTE in m.content]
    assert len(system_notes) == 1


def test_run_step_uses_history_for_user_input(monkeypatch):
    responses = [AIMessage(content="response", tool_calls=[])]
    llm = DummyLLM(responses)
    checker = MockChecker([CheckResult(mode="ALLOW")])
    monkeypatch.setattr("app.services.agent_chain.create_find_actions_tool", lambda *_args, **_kwargs: build_tool("find_actions", "[]"))
    monkeypatch.setattr("app.services.agent_chain.get_endpoint_tools", lambda *_a, **_k: [])
    executor = AgentExecutor(session=None, user_id="user", llm_client=llm, hallucination_checker=checker)
    history = [{"role": "user", "content": "previous message"}]
    result = asyncio.run(executor.run_step(None, history))
    assert result.done is True
    assert checker.calls[0][0] == "previous message"
