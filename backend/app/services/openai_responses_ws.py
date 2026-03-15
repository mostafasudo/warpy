import asyncio
import json
from copy import deepcopy
from dataclasses import dataclass
from typing import Any

import websockets
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import BaseTool
from langchain_core.utils.function_calling import convert_to_openai_function
from websockets.asyncio.client import ClientConnection
from websockets.exceptions import ConnectionClosed

from ..core.logger import log_info, log_warning


OPENAI_RESPONSE_TIMEOUT_SECONDS = 120
OPENAI_RESPONSE_MAX_SIZE_BYTES = 10 * 1024 * 1024
OPENAI_COMPACTION_THRESHOLDS = {
    "gpt-5.4": 200_000,
    "gpt-4o": 100_000,
}
DEFAULT_OPENAI_COMPACTION_THRESHOLD = 100_000


@dataclass
class OpenAIResponsesTransportError(Exception):
    code: str
    message: str
    status: int | None = None
    retriable: bool = False

    def __post_init__(self) -> None:
        super().__init__(self.message)

    def __str__(self) -> str:
        return self.message


@dataclass(frozen=True)
class OpenAIResponsesInvocationResult:
    message: AIMessage
    input_items: list[dict[str, Any]]


class OpenAIResponsesWebSocketSession:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        temperature: float | None = None,
        scope: str = "WidgetOpenAIResponses",
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.scope = scope
        self._socket: ClientConnection | None = None
        self._previous_response_id: str | None = None
        self._last_input_items: list[dict[str, Any]] = []
        self._invoke_lock = asyncio.Lock()

    async def close(self) -> None:
        if not self._socket:
            return
        socket = self._socket
        self._socket = None
        await socket.close()
        log_info(self.scope, "close", "Closed OpenAI responses websocket")

    async def ainvoke(
        self,
        messages: list[BaseMessage],
        tools: list[BaseTool],
        *,
        input_items: list[dict[str, Any]] | None = None,
    ) -> OpenAIResponsesInvocationResult:
        async with self._invoke_lock:
            full_input = deepcopy(input_items) if input_items is not None else self.messages_to_input_items(messages)
            incremental_input, previous_response_id = self._build_request_input(full_input)

            payload_tools = [self.tool_to_responses_tool(tool) for tool in tools]

            try:
                response = await self._request_response(
                    input_items=incremental_input,
                    tools=payload_tools,
                    previous_response_id=previous_response_id,
                )
            except OpenAIResponsesTransportError as error:
                if not error.retriable:
                    raise
                log_warning(
                    self.scope,
                    "ainvoke",
                    "Retrying OpenAI response after recoverable error",
                    code=error.code,
                    status=error.status,
                )
                await self._reconnect(error.code)
                response = await self._retry_request_with_full_input(
                    input_items=full_input,
                    tools=payload_tools,
                )
            except ConnectionClosed as error:
                log_warning(self.scope, "ainvoke", "Reconnecting after socket closure", reason=str(error))
                await self._reconnect("connection_closed")
                response = await self._retry_request_with_full_input(
                    input_items=full_input,
                    tools=payload_tools,
                )

            next_input_items = self.build_next_input_items(full_input, response)
            self._previous_response_id = str(response.get("id") or "")
            self._last_input_items = next_input_items
            return OpenAIResponsesInvocationResult(
                message=self.response_to_ai_message(response),
                input_items=next_input_items,
            )

    async def _request_response(
        self,
        *,
        input_items: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        previous_response_id: str | None,
    ) -> dict[str, Any]:
        try:
            return await self._create_response(
                input_items=input_items,
                tools=tools,
                previous_response_id=previous_response_id,
            )
        except (OpenAIResponsesTransportError, ConnectionClosed):
            raise
        except Exception as error:
            raise self._wrap_unexpected_error(error) from error

    async def _reconnect(self, reason: str) -> None:
        log_info(self.scope, "reconnect", "Reconnecting OpenAI responses websocket", reason=reason)
        try:
            await self.close()
        except Exception as error:
            log_warning(self.scope, "reconnect", "Failed to close websocket during reconnect", error=str(error))
        finally:
            self._previous_response_id = None
            self._last_input_items = []

    async def _retry_request_with_full_input(
        self,
        *,
        input_items: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> dict[str, Any]:
        try:
            return await self._request_response(
                input_items=input_items,
                tools=tools,
                previous_response_id=None,
            )
        except ConnectionClosed as error:
            raise OpenAIResponsesTransportError(
                code="connection_closed",
                message=f"OpenAI websocket connection closed unexpectedly: {error}",
                status=None,
                retriable=True,
            ) from error

    def _build_request_input(
        self,
        full_input: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], str | None]:
        if not self._previous_response_id or not self._last_input_items:
            return full_input, None
        prefix_length = len(self._last_input_items)
        if len(full_input) <= prefix_length:
            return full_input, None
        if full_input[:prefix_length] != self._last_input_items:
            return full_input, None
        incremental_input = full_input[prefix_length:]
        if not incremental_input:
            return full_input, None
        return incremental_input, self._previous_response_id

    async def _ensure_connection(self) -> ClientConnection:
        if self._socket:
            return self._socket
        if not self.api_key:
            raise OpenAIResponsesTransportError(
                code="openai_api_key_missing",
                message="OpenAI API key missing",
                status=500,
                retriable=False,
            )
        self._socket = await websockets.connect(
            "wss://api.openai.com/v1/responses",
            additional_headers={
                "Authorization": f"Bearer {self.api_key}",
            },
            open_timeout=10,
            close_timeout=5,
            ping_interval=20,
            ping_timeout=20,
            max_size=OPENAI_RESPONSE_MAX_SIZE_BYTES,
        )
        log_info(self.scope, "connect", "Opened OpenAI responses websocket")
        return self._socket

    async def _create_response(
        self,
        *,
        input_items: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        previous_response_id: str | None,
    ) -> dict[str, Any]:
        socket = await self._ensure_connection()
        payload: dict[str, Any] = {
            "type": "response.create",
            "model": self.model,
            "store": False,
            "input": input_items,
            "tools": tools,
            "context_management": [
                {
                    "type": "compaction",
                    "compact_threshold": self._get_compact_threshold(self.model),
                }
            ],
        }
        if self.temperature is not None and self._supports_temperature(self.model):
            payload["temperature"] = self.temperature
        if previous_response_id:
            payload["previous_response_id"] = previous_response_id
        await socket.send(json.dumps(payload))
        log_info(
            self.scope,
            "_create_response",
            "Created OpenAI response",
            previous_response_id=previous_response_id or "",
            input_count=len(input_items),
            tool_count=len(tools),
        )
        return await self._await_response(socket)

    async def _await_response(self, socket: ClientConnection) -> dict[str, Any]:
        while True:
            try:
                raw_event = await asyncio.wait_for(socket.recv(), timeout=OPENAI_RESPONSE_TIMEOUT_SECONDS)
            except asyncio.TimeoutError as error:
                raise OpenAIResponsesTransportError(
                    code="response_timeout",
                    message="Timeout waiting for OpenAI response",
                    status=None,
                    retriable=True,
                ) from error
            event = json.loads(raw_event)
            event_type = str(event.get("type") or "")

            if event_type == "response.completed":
                response = event.get("response") or {}
                log_info(
                    self.scope,
                    "_await_response",
                    "OpenAI response completed",
                    response_id=response.get("id", ""),
                    output_count=len(response.get("output") or []),
                )
                return response

            if event_type == "response.failed":
                response = event.get("response") or {}
                error = response.get("error") or {}
                raise self._build_error(
                    code=str(error.get("code") or "response_failed"),
                    message=str(error.get("message") or "OpenAI response failed"),
                    status=400,
                )

            if event_type == "error":
                error = event.get("error") or {}
                raise self._build_error(
                    code=str(error.get("code") or "openai_error"),
                    message=str(error.get("message") or "OpenAI websocket error"),
                    status=event.get("status"),
                )

            if event_type == "response.incomplete":
                response = event.get("response") or {}
                incomplete_details = response.get("incomplete_details") or {}
                reason = str(incomplete_details.get("reason") or "unknown")
                raise OpenAIResponsesTransportError(
                    code="response_incomplete",
                    message=f"OpenAI response incomplete: {reason}",
                    status=400,
                    retriable=False,
                )

    def _build_error(self, *, code: str, message: str, status: int | None) -> OpenAIResponsesTransportError:
        return OpenAIResponsesTransportError(
            code=code,
            message=message,
            status=status,
            retriable=code in {"previous_response_not_found", "websocket_connection_limit_reached"},
        )

    def _wrap_unexpected_error(self, error: Exception) -> OpenAIResponsesTransportError:
        return OpenAIResponsesTransportError(
            code="openai_connection_failed",
            message=f"OpenAI responses websocket request failed: {type(error).__name__}: {error}",
            status=None,
            retriable=False,
        )

    @staticmethod
    def _supports_temperature(model: str) -> bool:
        normalized = model.lower()
        # gpt-4o responses websocket requests clean-close when temperature is sent in our production path.
        return not (normalized.startswith("gpt-5") or normalized.startswith("gpt-4o"))

    @staticmethod
    def _get_compact_threshold(model: str) -> int:
        normalized = model.lower()
        for model_prefix, threshold in OPENAI_COMPACTION_THRESHOLDS.items():
            if normalized.startswith(model_prefix):
                return threshold
        return DEFAULT_OPENAI_COMPACTION_THRESHOLD

    @classmethod
    def tool_to_responses_tool(cls, tool: BaseTool) -> dict[str, Any]:
        function = convert_to_openai_function(tool)
        return {
            "type": "function",
            "name": function["name"],
            "description": function.get("description"),
            "parameters": function.get("parameters"),
            "strict": function.get("strict"),
        }

    @classmethod
    def messages_to_input_items(cls, messages: list[BaseMessage]) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for message in messages:
            items.extend(cls.message_to_input_items(message))
        return items

    @classmethod
    def message_to_input_items(cls, message: BaseMessage) -> list[dict[str, Any]]:
        if isinstance(message, HumanMessage):
            return [cls._text_message_item("user", message.content)]

        if isinstance(message, SystemMessage):
            role = str(message.additional_kwargs.get("__openai_role__", "system"))
            if role not in {"system", "developer"}:
                role = "system"
            return [cls._text_message_item(role, message.content)]

        if isinstance(message, AIMessage):
            return cls._ai_message_to_input_items(message)

        if isinstance(message, ToolMessage):
            return cls._tool_message_to_input_items(message)

        return [cls._text_message_item("user", message.content)]

    @classmethod
    def _ai_message_to_input_items(cls, message: AIMessage) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        text = cls._extract_text_content(message.content)
        if text:
            items.append(cls._simple_message_item("assistant", text))
        for tool_call in message.tool_calls or []:
            call_id = str(tool_call.get("id") or "")
            if not call_id:
                continue
            items.append(
                {
                    "type": "function_call",
                    "call_id": call_id,
                    "name": str(tool_call.get("name") or ""),
                    "arguments": json.dumps(tool_call.get("args") or {}),
                }
            )
        return items

    @classmethod
    def _tool_message_to_input_items(cls, message: ToolMessage) -> list[dict[str, Any]]:
        text = cls._extract_text_content(message.content)
        image_urls = cls._extract_image_urls(message.content)
        items: list[dict[str, Any]] = [
            {
                "type": "function_call_output",
                "call_id": message.tool_call_id,
                "output": text or "",
            }
        ]
        for image_url in image_urls:
            items.append(
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                f"Tool screenshot for call {message.tool_call_id}. "
                                "Use it as additional visual context for the corresponding tool output."
                            ),
                        },
                        {
                            "type": "input_image",
                            "image_url": image_url,
                            "detail": "high",
                        },
                    ],
                }
            )
        return items

    @classmethod
    def response_to_ai_message(cls, response: dict[str, Any]) -> AIMessage:
        text_parts: list[str] = []
        tool_calls: list[dict[str, Any]] = []

        for item in response.get("output") or []:
            item_type = str(item.get("type") or "")

            if item_type == "message":
                for part in item.get("content") or []:
                    part_type = str(part.get("type") or "")
                    if part_type == "output_text" and part.get("text"):
                        cls._append_text_part(text_parts, str(part["text"]))
                    elif part_type == "refusal" and part.get("refusal"):
                        cls._append_text_part(text_parts, str(part["refusal"]))
                continue

            if item_type == "function_call":
                args = cls._parse_tool_arguments(item.get("arguments"))
                call_id = str(item.get("call_id") or item.get("id") or "")
                if not call_id:
                    continue
                tool_calls.append(
                    {
                        "id": call_id,
                        "name": str(item.get("name") or ""),
                        "args": args,
                    }
                )

        content = "\n\n".join(part.strip() for part in text_parts if part and part.strip()).strip()
        return AIMessage(content=content, tool_calls=tool_calls)

    @classmethod
    def build_next_input_items(
        cls,
        current_input_items: list[dict[str, Any]],
        response: dict[str, Any],
    ) -> list[dict[str, Any]]:
        next_input_items = deepcopy(current_input_items)
        next_input_items.extend(deepcopy(response.get("output") or []))

        latest_compaction_index = -1
        for index, item in enumerate(next_input_items):
            if str(item.get("type") or "") == "compaction":
                latest_compaction_index = index

        if latest_compaction_index >= 0:
            return next_input_items[latest_compaction_index:]

        return next_input_items

    @staticmethod
    def _append_text_part(text_parts: list[str], value: str) -> None:
        normalized = value.strip()
        if not normalized:
            return
        if text_parts and text_parts[-1].strip() == normalized:
            return
        text_parts.append(value)

    @staticmethod
    def _parse_tool_arguments(arguments: Any) -> dict[str, Any]:
        if isinstance(arguments, dict):
            return arguments
        if isinstance(arguments, str):
            try:
                parsed = json.loads(arguments)
            except json.JSONDecodeError:
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return {}

    @classmethod
    def _text_message_item(cls, role: str, content: Any) -> dict[str, Any]:
        text = cls._extract_text_content(content)
        return {
            "type": "message",
            "role": role,
            "content": [{"type": "input_text", "text": text}],
        }

    @staticmethod
    def _simple_message_item(role: str, content: str) -> dict[str, Any]:
        return {
            "type": "message",
            "role": role,
            "content": content,
        }

    @staticmethod
    def _extract_text_content(content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if not isinstance(item, dict):
                    continue
                item_type = str(item.get("type") or "")
                if item_type == "text" and item.get("text"):
                    parts.append(str(item["text"]))
            return "\n".join(parts).strip()
        return str(content or "")

    @staticmethod
    def _extract_image_urls(content: Any) -> list[str]:
        if not isinstance(content, list):
            return []
        image_urls: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            if str(item.get("type") or "") != "image_url":
                continue
            image = item.get("image_url")
            if not isinstance(image, dict):
                continue
            url = image.get("url")
            if isinstance(url, str) and url:
                image_urls.append(url)
        return image_urls
