import asyncio
import json

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from websockets.exceptions import ConnectionClosed
from websockets.frames import Close

from app.services.openai_responses_ws import (
    OPENAI_RESPONSE_MAX_SIZE_BYTES,
    OpenAIResponsesTransportError,
    OpenAIResponsesWebSocketSession,
)


class ToolArgs(BaseModel):
    query: str = Field(default="")


def build_tool(name: str) -> StructuredTool:
    return StructuredTool.from_function(
        func=lambda **_kwargs: "ok",
        name=name,
        description=f"{name} description",
        args_schema=ToolArgs,
    )


def test_tool_to_responses_tool_uses_top_level_function_shape():
    tool = OpenAIResponsesWebSocketSession.tool_to_responses_tool(build_tool("find_tools"))

    assert tool["type"] == "function"
    assert tool["name"] == "find_tools"
    assert tool["description"] == "find_tools description"
    assert "parameters" in tool


def test_messages_to_input_items_serializes_tool_calls_and_screenshots():
    messages = [
        SystemMessage(content="system prompt"),
        HumanMessage(content="hello"),
        AIMessage(content="", tool_calls=[{"id": "call_1", "name": "find_tools", "args": {"query": "invoice"}}]),
        ToolMessage(
            content=[
                {"type": "text", "text": '{"status":"ok"}'},
                {"type": "image_url", "image_url": {"url": "data:image/png;base64,abc", "detail": "high"}},
            ],
            tool_call_id="call_1",
        ),
    ]

    items = OpenAIResponsesWebSocketSession.messages_to_input_items(messages)

    assert items[0]["role"] == "system"
    assert items[1]["role"] == "user"
    assert items[2] == {
        "type": "function_call",
        "call_id": "call_1",
        "name": "find_tools",
        "arguments": json.dumps({"query": "invoice"}),
    }
    assert items[3] == {
        "type": "function_call_output",
        "call_id": "call_1",
        "output": '{"status":"ok"}',
    }
    assert items[4]["role"] == "user"
    assert items[4]["content"][1]["type"] == "input_image"


def test_response_to_ai_message_parses_text_and_function_calls():
    response = {
        "id": "resp_1",
        "output": [
            {
                "type": "message",
                "content": [
                    {"type": "output_text", "text": "I found a tool."},
                ],
            },
            {
                "type": "function_call",
                "call_id": "call_1",
                "name": "find_tools",
                "arguments": '{"query":"invoice"}',
            },
        ],
    }

    message = OpenAIResponsesWebSocketSession.response_to_ai_message(response)

    assert message.content == "I found a tool."
    assert message.tool_calls == [{"id": "call_1", "name": "find_tools", "args": {"query": "invoice"}, "type": "tool_call"}]


def test_response_to_ai_message_dedupes_adjacent_duplicate_text():
    response = {
        "id": "resp_1",
        "output": [
            {
                "type": "message",
                "content": [
                    {"type": "output_text", "text": "Confirm deletion?"},
                ],
            },
            {
                "type": "message",
                "content": [
                    {"type": "output_text", "text": "Confirm deletion?"},
                ],
            },
        ],
    }

    message = OpenAIResponsesWebSocketSession.response_to_ai_message(response)

    assert message.content == "Confirm deletion?"


def test_build_next_input_items_keeps_suffix_from_latest_compaction():
    current_input = [
        {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "hello"}]},
    ]
    response = {
        "id": "resp_1",
        "output": [
            {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "working"}]},
            {"type": "compaction", "encrypted_content": "compact_1"},
            {"type": "function_call", "call_id": "call_1", "name": "find_tools", "arguments": "{}"},
        ],
    }

    next_input = OpenAIResponsesWebSocketSession.build_next_input_items(current_input, response)

    assert next_input == [
        {"type": "compaction", "encrypted_content": "compact_1"},
        {"type": "function_call", "call_id": "call_1", "name": "find_tools", "arguments": "{}"},
    ]


def test_ainvoke_retries_with_full_input_on_previous_response_not_found(monkeypatch):
    session = OpenAIResponsesWebSocketSession(api_key="sk_test", model="gpt-5.4", temperature=0.7)
    messages = [HumanMessage(content="hello")]
    calls: list[dict] = []

    async def fake_create_response(*, input_items, tools, previous_response_id):
        calls.append(
            {
                "input_items": input_items,
                "tools": tools,
                "previous_response_id": previous_response_id,
            }
        )
        if len(calls) == 1:
            raise OpenAIResponsesTransportError(
                code="previous_response_not_found",
                message="missing",
                status=400,
                retriable=True,
            )
        return {"id": "resp_2", "output": [{"type": "message", "content": [{"type": "output_text", "text": "done"}]}]}

    async def fake_reconnect(_reason):
        session._previous_response_id = None
        session._last_input_items = []

    monkeypatch.setattr(session, "_create_response", fake_create_response)
    monkeypatch.setattr(session, "_reconnect", fake_reconnect)

    response = asyncio.run(session.ainvoke(messages, [build_tool("find_tools")]))

    assert response.message.content == "done"
    assert len(calls) == 2
    assert calls[0]["previous_response_id"] is None
    assert calls[1]["previous_response_id"] is None
    assert calls[1]["input_items"] == OpenAIResponsesWebSocketSession.messages_to_input_items(messages)


def test_ainvoke_retries_with_full_input_on_connection_closed(monkeypatch):
    session = OpenAIResponsesWebSocketSession(api_key="sk_test", model="gpt-5.4")
    session._previous_response_id = "resp_1"
    session._last_input_items = OpenAIResponsesWebSocketSession.messages_to_input_items([HumanMessage(content="hello")])
    messages = [
        HumanMessage(content="hello"),
        AIMessage(content="", tool_calls=[{"id": "call_1", "name": "find_tools", "args": {"query": "invoice"}}]),
        ToolMessage(content='{"status":"ok"}', tool_call_id="call_1"),
    ]
    calls: list[dict] = []

    async def fake_create_response(*, input_items, tools, previous_response_id):
        calls.append(
            {
                "input_items": input_items,
                "previous_response_id": previous_response_id,
            }
        )
        if len(calls) == 1:
            raise ConnectionClosed(None, Close(1000, "sent"))
        return {"id": "resp_3", "output": [{"type": "message", "content": [{"type": "output_text", "text": "processed"}]}]}

    async def fake_reconnect(_reason):
        session._previous_response_id = None
        session._last_input_items = []

    monkeypatch.setattr(session, "_create_response", fake_create_response)
    monkeypatch.setattr(session, "_reconnect", fake_reconnect)

    response = asyncio.run(session.ainvoke(messages, [build_tool("find_tools")]))

    assert response.message.content == "processed"
    assert calls[0]["previous_response_id"] == "resp_1"
    assert calls[1]["previous_response_id"] is None
    assert calls[1]["input_items"] == OpenAIResponsesWebSocketSession.messages_to_input_items(messages)


def test_ainvoke_retries_with_full_input_on_connection_limit_error(monkeypatch):
    session = OpenAIResponsesWebSocketSession(api_key="sk_test", model="gpt-5.4")
    messages = [HumanMessage(content="continue")]
    calls = {"count": 0}

    async def fake_create_response(*, input_items, tools, previous_response_id):
        calls["count"] += 1
        if calls["count"] == 1:
            raise OpenAIResponsesTransportError(
                code="websocket_connection_limit_reached",
                message="expired",
                status=400,
                retriable=True,
            )
        return {"id": "resp_4", "output": [{"type": "message", "content": [{"type": "output_text", "text": "ok"}]}]}

    async def fake_reconnect(_reason):
        session._previous_response_id = None
        session._last_input_items = []

    monkeypatch.setattr(session, "_create_response", fake_create_response)
    monkeypatch.setattr(session, "_reconnect", fake_reconnect)

    response = asyncio.run(session.ainvoke(messages, [build_tool("find_tools")]))

    assert response.message.content == "ok"
    assert calls["count"] == 2


def test_ainvoke_wraps_connection_closed_during_retry(monkeypatch):
    session = OpenAIResponsesWebSocketSession(api_key="sk_test", model="gpt-5.4")
    calls = {"count": 0}

    async def fake_reconnect(_reason):
        session._previous_response_id = None
        session._last_input_items = []

    async def fake_request_response(*, input_items, tools, previous_response_id):
        calls["count"] += 1
        if calls["count"] == 1:
            raise OpenAIResponsesTransportError(
                code="previous_response_not_found",
                message="missing",
                status=400,
                retriable=True,
            )
        raise ConnectionClosed(None, Close(1000, "sent"))

    monkeypatch.setattr(session, "_reconnect", fake_reconnect)
    monkeypatch.setattr(session, "_request_response", fake_request_response)

    with pytest.raises(OpenAIResponsesTransportError) as error:
        asyncio.run(session.ainvoke([HumanMessage(content="hello")], []))

    assert error.value.code == "connection_closed"
    assert error.value.retriable is True


def test_ainvoke_uses_incremental_input_only_for_append_only_history(monkeypatch):
    old_messages = [HumanMessage(content="hello")]
    new_messages = old_messages + [HumanMessage(content="follow up")]
    session = OpenAIResponsesWebSocketSession(api_key="sk_test", model="gpt-5.4")
    session._previous_response_id = "resp_1"
    session._last_input_items = OpenAIResponsesWebSocketSession.messages_to_input_items(old_messages)
    calls: list[dict[str, object]] = []

    async def fake_request_response(*, input_items, tools, previous_response_id):
        calls.append(
            {
                "input_items": input_items,
                "previous_response_id": previous_response_id,
            }
        )
        return {"id": "resp_2", "output": [{"type": "message", "content": [{"type": "output_text", "text": "ok"}]}]}

    monkeypatch.setattr(session, "_request_response", fake_request_response)

    response = asyncio.run(session.ainvoke(new_messages, []))

    assert response.message.content == "ok"
    assert calls == [
        {
            "input_items": OpenAIResponsesWebSocketSession.messages_to_input_items([HumanMessage(content="follow up")]),
            "previous_response_id": "resp_1",
        }
    ]


def test_ainvoke_replays_full_input_after_history_is_pruned(monkeypatch):
    old_messages = [
        SystemMessage(content="sys"),
        HumanMessage(content="older question"),
        AIMessage(content="older answer"),
        HumanMessage(content="latest question"),
    ]
    new_messages = [
        SystemMessage(content="sys"),
        HumanMessage(content="latest question"),
        ToolMessage(content='{"status":"ok"}', tool_call_id="call_1"),
    ]
    session = OpenAIResponsesWebSocketSession(api_key="sk_test", model="gpt-5.4")
    session._previous_response_id = "resp_1"
    session._last_input_items = OpenAIResponsesWebSocketSession.messages_to_input_items(old_messages)
    calls: list[dict[str, object]] = []

    async def fake_request_response(*, input_items, tools, previous_response_id):
        calls.append(
            {
                "input_items": input_items,
                "previous_response_id": previous_response_id,
            }
        )
        return {"id": "resp_2", "output": [{"type": "message", "content": [{"type": "output_text", "text": "ok"}]}]}

    monkeypatch.setattr(session, "_request_response", fake_request_response)

    response = asyncio.run(session.ainvoke(new_messages, []))

    assert response.message.content == "ok"
    assert calls == [
        {
            "input_items": OpenAIResponsesWebSocketSession.messages_to_input_items(new_messages),
            "previous_response_id": None,
        }
    ]


def test_ainvoke_raises_structured_error_when_api_key_missing():
    session = OpenAIResponsesWebSocketSession(api_key="", model="gpt-5.4")

    with pytest.raises(OpenAIResponsesTransportError) as error:
        asyncio.run(session.ainvoke([HumanMessage(content="hello")], []))

    assert error.value.code == "openai_api_key_missing"
    assert error.value.message == "OpenAI API key missing"
    assert error.value.args == ("OpenAI API key missing",)


def test_await_response_times_out(monkeypatch):
    session = OpenAIResponsesWebSocketSession(api_key="sk_test", model="gpt-5.4")

    class HangingSocket:
        async def recv(self):
            await asyncio.sleep(1)
            return ""

    monkeypatch.setattr("app.services.openai_responses_ws.OPENAI_RESPONSE_TIMEOUT_SECONDS", 0.01)

    with pytest.raises(OpenAIResponsesTransportError) as error:
        asyncio.run(session._await_response(HangingSocket()))

    assert error.value.code == "response_timeout"
    assert error.value.retriable is True


def test_await_response_raises_on_incomplete_response():
    session = OpenAIResponsesWebSocketSession(api_key="sk_test", model="gpt-5.4")

    class IncompleteSocket:
        async def recv(self):
            return json.dumps(
                {
                    "type": "response.incomplete",
                    "response": {"incomplete_details": {"reason": "max_output_tokens"}},
                }
            )

    with pytest.raises(OpenAIResponsesTransportError) as error:
        asyncio.run(session._await_response(IncompleteSocket()))

    assert error.value.code == "response_incomplete"
    assert error.value.message == "OpenAI response incomplete: max_output_tokens"


def test_ensure_connection_uses_bounded_max_size(monkeypatch):
    session = OpenAIResponsesWebSocketSession(api_key="sk_test", model="gpt-5.4")
    captured: dict[str, object] = {}

    class DummySocket:
        async def close(self):
            return None

    async def fake_connect(*args, **kwargs):
        captured["url"] = args[0]
        captured["kwargs"] = kwargs
        return DummySocket()

    monkeypatch.setattr("app.services.openai_responses_ws.websockets.connect", fake_connect)

    asyncio.run(session._ensure_connection())

    assert captured["url"] == "wss://api.openai.com/v1/responses"
    assert captured["kwargs"]["max_size"] == OPENAI_RESPONSE_MAX_SIZE_BYTES


def test_ainvoke_wraps_unexpected_transport_errors(monkeypatch):
    session = OpenAIResponsesWebSocketSession(api_key="sk_test", model="gpt-5.4")

    async def fake_create_response(*, input_items, tools, previous_response_id):
        raise RuntimeError("boom")

    monkeypatch.setattr(session, "_create_response", fake_create_response)

    with pytest.raises(OpenAIResponsesTransportError) as error:
        asyncio.run(session.ainvoke([HumanMessage(content="hello")], []))

    assert error.value.code == "openai_connection_failed"
    assert error.value.message == "OpenAI responses websocket request failed: RuntimeError: boom"


def test_reconnect_clears_state_when_close_fails(monkeypatch):
    session = OpenAIResponsesWebSocketSession(api_key="sk_test", model="gpt-5.4")
    session._previous_response_id = "resp_1"
    session._last_input_items = [{"type": "message"}]

    async def fake_close():
        raise RuntimeError("broken close")

    monkeypatch.setattr(session, "close", fake_close)

    asyncio.run(session._reconnect("test"))

    assert session._previous_response_id is None
    assert session._last_input_items == []


def test_ainvoke_serializes_concurrent_calls(monkeypatch):
    session = OpenAIResponsesWebSocketSession(api_key="sk_test", model="gpt-5.4")
    call_order: list[str] = []

    async def fake_request_response(*, input_items, tools, previous_response_id):
        text = input_items[0]["content"][0]["text"]
        call_order.append(f"start:{text}")
        await asyncio.sleep(0)
        call_order.append(f"end:{text}")
        return {
            "id": f"resp_{text}",
            "output": [{"type": "message", "content": [{"type": "output_text", "text": text}]}],
        }

    monkeypatch.setattr(session, "_request_response", fake_request_response)

    async def run_calls():
        return await asyncio.gather(
            session.ainvoke([HumanMessage(content="one")], []),
            session.ainvoke([HumanMessage(content="two")], []),
        )

    responses = asyncio.run(run_calls())

    assert [response.message.content for response in responses] == ["one", "two"]
    assert call_order == ["start:one", "end:one", "start:two", "end:two"]


def test_create_response_omits_temperature_for_gpt5(monkeypatch):
    session = OpenAIResponsesWebSocketSession(api_key="sk_test", model="gpt-5.4", temperature=0.7)
    sent_payloads: list[dict] = []

    class FakeSocket:
        async def send(self, payload: str) -> None:
            sent_payloads.append(json.loads(payload))

    async def fake_ensure_connection():
        return FakeSocket()

    async def fake_await_response(_socket):
        return {"id": "resp_5", "output": []}

    monkeypatch.setattr(session, "_ensure_connection", fake_ensure_connection)
    monkeypatch.setattr(session, "_await_response", fake_await_response)

    asyncio.run(
        session._create_response(
            input_items=[{"type": "message", "role": "user", "content": [{"type": "input_text", "text": "hi"}]}],
            tools=[],
            previous_response_id=None,
        )
    )

    assert len(sent_payloads) == 1
    assert "temperature" not in sent_payloads[0]
    assert sent_payloads[0]["context_management"] == [{"type": "compaction", "compact_threshold": 200000}]


def test_create_response_omits_temperature_for_gpt4o(monkeypatch):
    session = OpenAIResponsesWebSocketSession(api_key="sk_test", model="gpt-4o", temperature=0.7)
    sent_payloads: list[dict] = []

    class FakeSocket:
        async def send(self, payload: str) -> None:
            sent_payloads.append(json.loads(payload))

    async def fake_ensure_connection():
        return FakeSocket()

    async def fake_await_response(_socket):
        return {"id": "resp_6", "output": []}

    monkeypatch.setattr(session, "_ensure_connection", fake_ensure_connection)
    monkeypatch.setattr(session, "_await_response", fake_await_response)

    asyncio.run(
        session._create_response(
            input_items=[{"type": "message", "role": "user", "content": [{"type": "input_text", "text": "hi"}]}],
            tools=[],
            previous_response_id=None,
        )
    )

    assert len(sent_payloads) == 1
    assert "temperature" not in sent_payloads[0]
    assert sent_payloads[0]["context_management"] == [{"type": "compaction", "compact_threshold": 100000}]
