import json
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from redis import Redis
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info
from ..models import Endpoint
from ..schemas.widget import ToolCallPayload, ToolResultPayload
from .agent_schema import SchemaFactory, serialize_args
from .agent_tools import create_find_actions_tool, get_endpoint_tools
from .tool_cache import ToolCache

SYSTEM_PROMPT = """You are a helpful dashboard assistant that can perform actions on behalf of the user.

Your role:
- You help users accomplish tasks by discovering and executing available actions
- You communicate in a friendly, non-technical way
- You stay strictly within the scope of dashboard actions

When a user asks you to do something:
1. Use the find_actions tool to discover what actions are available for their request
2. Before executing any action, ensure you have gathered ALL required information from the user in a natural, conversational way
3. Never guess or assume values for required fields - always ask the user
4. Execute actions only when you have complete information matching the expected format
5. Summarize what you accomplished in simple terms

Important guidelines:
- Only execute actions that are available to you - do not invent capabilities
- If an action requires specific values, ask for them clearly without using technical terminology
- If something goes wrong, explain the issue in plain language and suggest next steps
- You cannot perform actions outside of what has been configured for this dashboard"""


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
        conversation_id: UUID | None = None,
        redis_client: Redis | None = None,
        llm_client: Any | None = None,
        schema_factory: SchemaFactory | None = None
    ):
        self.session = session
        self.user_id = user_id
        self.conversation_id = conversation_id
        self.schema_factory = schema_factory or SchemaFactory()
        settings = get_settings()
        self.llm = llm_client or ChatOpenAI(
            model=llm_config.chat_model,
            temperature=llm_config.temperature,
            api_key=settings.openai_api_key
        )
        self.active_endpoint_ids: list[UUID] = []
        self._tool_cache: ToolCache | None = None
        if conversation_id:
            self._tool_cache = ToolCache(redis_client, conversation_id)

    def _parse_endpoint_ids_from_response(self, content: str) -> list[UUID]:
        try:
            data = json.loads(content)
            if isinstance(data, list):
                return [UUID(item["id"]) for item in data if "id" in item]
        except (json.JSONDecodeError, ValueError, KeyError):
            return []
        return []

    def _get_valid_endpoint_ids(self) -> set[UUID]:
        if not self.active_endpoint_ids:
            return set()
        endpoints = self.session.scalars(
            select(Endpoint).where(
                Endpoint.id.in_(self.active_endpoint_ids),
                Endpoint.user_id == self.user_id,
                Endpoint.agent_enabled.is_(True)
            )
        ).all()
        return {e.id for e in endpoints}

    def _sync_cache(self) -> None:
        if not self._tool_cache:
            return
        self._tool_cache.load()
        cached_ids = self._tool_cache.get_endpoint_ids()
        for eid in cached_ids:
            if eid not in self.active_endpoint_ids:
                self.active_endpoint_ids.append(eid)
        valid_ids = self._get_valid_endpoint_ids()
        self._tool_cache.remove_invalid(valid_ids)
        self.active_endpoint_ids = [eid for eid in self.active_endpoint_ids if eid in valid_ids]

    def _update_cache_after_discovery(self, new_ids: list[UUID]) -> None:
        if not self._tool_cache:
            return
        self._tool_cache.add_tools(new_ids)
        self._tool_cache.update_used(new_ids)
        self._tool_cache.enforce_cap(llm_config.max_cached_tools)
        self._tool_cache.save()

    def _get_tools(self):
        tools = [create_find_actions_tool(self.session, self.user_id)]
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

        self._sync_cache()

        if pending_messages:
            messages = list(pending_messages)
            if user_message:
                messages.append(HumanMessage(content=user_message))
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
                
                if tool_name == "find_actions":
                    tool = next((t for t in tools if t.name == "find_actions"), None)
                    if tool:
                        try:
                            tool_result = tool.invoke(tool_args)
                            new_ids = self._parse_endpoint_ids_from_response(tool_result)
                            added_ids: list[UUID] = []
                            for endpoint_id in new_ids:
                                if endpoint_id not in self.active_endpoint_ids:
                                    self.active_endpoint_ids.append(endpoint_id)
                                    added_ids.append(endpoint_id)
                            if added_ids:
                                self._update_cache_after_discovery(added_ids)
                        except Exception as error:
                            log_error("AgentExecutor", "run_step", "find_actions failed", exc=error)
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
        self._sync_cache()

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
                if tool_name == "find_actions":
                    new_ids = self._parse_endpoint_ids_from_response(tool_result)
                    added_ids: list[UUID] = []
                    for endpoint_id in new_ids:
                        if endpoint_id not in self.active_endpoint_ids:
                            self.active_endpoint_ids.append(endpoint_id)
                            added_ids.append(endpoint_id)
                    if added_ids:
                        self._update_cache_after_discovery(added_ids)
                messages.append(ToolMessage(content=tool_result, tool_call_id=tool_call["id"]))
        log_info("AgentExecutor", "run", "Max iterations reached")
        return "I've reached the maximum number of steps. Here's what I found so far based on our conversation."
