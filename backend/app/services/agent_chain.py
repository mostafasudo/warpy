import json
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info
from ..models import Endpoint
from ..schemas.widget import ToolCallPayload, ToolResultPayload
from .agent_schema import SchemaFactory, serialize_args
from .agent_tools import create_get_endpoints_tool, get_endpoint_tools

SYSTEM_PROMPT = """You are an intelligent API assistant that helps users interact with their APIs.

Your capabilities:
1. Search for relevant API endpoints using the get_endpoints tool
2. Execute API endpoints to fulfill user requests
3. Handle multi-step workflows that require multiple API calls

When a user makes a request:
1. First, analyze what they want to accomplish
2. Use get_endpoints to find relevant API endpoints
3. Once you have the endpoints, use the appropriate endpoint tools to make API calls
4. If an API call fails or you need different endpoints, you can search again
5. Compose a helpful response summarizing what was done

Always be helpful and explain what you're doing. If you encounter errors, explain them clearly."""


@dataclass
class StepResult:
    tool_calls: list[ToolCallPayload] = field(default_factory=list)
    response: str | None = None
    done: bool = False
    messages: list[BaseMessage] = field(default_factory=list)
    active_endpoint_ids: list[UUID] = field(default_factory=list)


class AgentExecutor:
    def __init__(
        self,
        session: Session,
        user_id: str,
        llm_client: Any | None = None,
        schema_factory: SchemaFactory | None = None
    ):
        self.session = session
        self.user_id = user_id
        self.schema_factory = schema_factory or SchemaFactory()
        settings = get_settings()
        self.llm = llm_client or ChatOpenAI(
            model=llm_config.chat_model,
            temperature=llm_config.temperature,
            api_key=settings.OPENAI_API_KEY
        )
        self.active_endpoint_ids: list[UUID] = []

    def _parse_endpoint_ids_from_response(self, content: str) -> list[UUID]:
        try:
            data = json.loads(content)
            if isinstance(data, list):
                return [UUID(item["id"]) for item in data if "id" in item]
        except (json.JSONDecodeError, ValueError, KeyError):
            return []
        return []

    def _get_tools(self):
        tools = [create_get_endpoints_tool(self.session, self.user_id)]
        tools.extend(get_endpoint_tools(self.session, self.user_id, self.active_endpoint_ids, self.schema_factory))
        return tools

    def _get_endpoint_by_tool_name(self, tool_name: str) -> Endpoint | None:
        for endpoint_id in self.active_endpoint_ids:
            endpoint = self.session.get(Endpoint, endpoint_id)
            if endpoint and endpoint.agent_enabled:
                tool_spec = endpoint.tool or {}
                function_spec = tool_spec.get("function", {})
                name = function_spec.get("name", f"endpoint_{endpoint.id}")
                if name == tool_name:
                    return endpoint
        return None

    def _build_messages_from_history(
        self, 
        user_message: str | None, 
        conversation_history: list[dict[str, str]]
    ) -> list[BaseMessage]:
        messages: list[BaseMessage] = [SystemMessage(content=SYSTEM_PROMPT)]
        for msg in conversation_history:
            if msg["role"] == "user":
                messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                messages.append(AIMessage(content=msg["content"]))
        if user_message:
            messages.append(HumanMessage(content=user_message))
        return messages

    async def run_step(
        self,
        user_message: str | None,
        conversation_history: list[dict[str, str]],
        tool_results: list[ToolResultPayload] | None = None,
        pending_messages: list[BaseMessage] | None = None,
        active_endpoint_ids: list[UUID] | None = None
    ) -> StepResult:
        if active_endpoint_ids:
            self.active_endpoint_ids = list(active_endpoint_ids)

        if pending_messages:
            messages = list(pending_messages)
        else:
            messages = self._build_messages_from_history(user_message, conversation_history)

        if tool_results:
            for result in tool_results:
                if result.error:
                    content = json.dumps({"error": result.error})
                else:
                    content = json.dumps({"status_code": result.status_code, "body": result.body})
                messages.append(ToolMessage(content=content, tool_call_id=result.id))

        max_iterations = llm_config.max_iterations
        iteration = 0
        
        while iteration < max_iterations:
            iteration += 1
            tools = self._get_tools()
            llm_with_tools = self.llm.bind_tools(tools)
            response = await llm_with_tools.ainvoke(messages)
            messages.append(response)

            if not response.tool_calls:
                return StepResult(
                    response=response.content or "",
                    done=True,
                    messages=messages,
                    active_endpoint_ids=self.active_endpoint_ids
                )

            endpoint_tool_calls: list[ToolCallPayload] = []
            
            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                
                if tool_name == "get_endpoints":
                    tool = next((t for t in tools if t.name == "get_endpoints"), None)
                    if tool:
                        try:
                            tool_result = tool.invoke(tool_args)
                            new_ids = self._parse_endpoint_ids_from_response(tool_result)
                            for endpoint_id in new_ids:
                                if endpoint_id not in self.active_endpoint_ids:
                                    self.active_endpoint_ids.append(endpoint_id)
                        except Exception as error:
                            log_error("AgentExecutor", "run_step", "get_endpoints failed", exc=error)
                            tool_result = f"Error: {str(error)}"
                    else:
                        tool_result = "Tool not found"
                    messages.append(ToolMessage(content=tool_result, tool_call_id=tool_call["id"]))
                else:
                    endpoint = self._get_endpoint_by_tool_name(tool_name)
                    if endpoint:
                        serialized = serialize_args(tool_args)
                        filtered = {k: v for k, v in serialized.items() if v is not None}
                        endpoint_tool_calls.append(ToolCallPayload(
                            id=tool_call["id"],
                            endpointId=endpoint.id,
                            name=tool_name,
                            method=endpoint.method.value,
                            path=endpoint.path,
                            params=filtered.get("params", {}),
                            query=filtered.get("query", {}),
                            body=filtered.get("body", {}),
                            headers=filtered.get("headers", {})
                        ))
                    else:
                        messages.append(ToolMessage(
                            content=f"Tool '{tool_name}' not found",
                            tool_call_id=tool_call["id"]
                        ))

            if endpoint_tool_calls:
                return StepResult(
                    tool_calls=endpoint_tool_calls,
                    done=False,
                    messages=messages,
                    active_endpoint_ids=self.active_endpoint_ids
                )

        log_info("AgentExecutor", "run_step", "Max iterations reached")
        return StepResult(
            response="I've reached the maximum number of steps. Here's what I found so far based on our conversation.",
            done=True,
            messages=messages,
            active_endpoint_ids=self.active_endpoint_ids
        )

    async def run(self, user_message: str, conversation_history: list[dict[str, str]]):
        messages = [SystemMessage(content=SYSTEM_PROMPT)]
        for message in conversation_history:
            if message["role"] == "user":
                messages.append(HumanMessage(content=message["content"]))
            elif message["role"] == "assistant":
                messages.append(AIMessage(content=message["content"]))
        messages.append(HumanMessage(content=user_message))

        max_iterations = llm_config.max_iterations
        iteration = 0
        while iteration < max_iterations:
            iteration += 1
            tools = self._get_tools()
            llm_with_tools = self.llm.bind_tools(tools)
            response = await llm_with_tools.ainvoke(messages)
            messages.append(response)
            if not response.tool_calls:
                return response.content or ""
            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                tool = next((item for item in tools if item.name == tool_name), None)
                if not tool:
                    tool_result = f"Tool '{tool_name}' not found"
                else:
                    try:
                        tool_result = tool.invoke(tool_args)
                    except Exception as error:
                        log_error("AgentExecutor", "run", f"Tool execution failed: {tool_name}", exc=error)
                        tool_result = f"Error executing tool: {str(error)}"
                if tool_name == "get_endpoints":
                    new_ids = self._parse_endpoint_ids_from_response(tool_result)
                    for endpoint_id in new_ids:
                        if endpoint_id not in self.active_endpoint_ids:
                            self.active_endpoint_ids.append(endpoint_id)
                messages.append(ToolMessage(content=tool_result, tool_call_id=tool_call["id"]))
        log_info("AgentExecutor", "run", "Max iterations reached")
        return "I've reached the maximum number of steps. Here's what I found so far based on our conversation."
