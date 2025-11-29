import json
import re
from typing import Any
from uuid import UUID

import httpx
from langchain_core.tools import StructuredTool
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info
from ..models import Endpoint, Environment
from .embedding_service import search_similar_endpoints


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


class GetEndpointsInput(BaseModel):
    query: str = Field(description="Natural language description of what API functionality you're looking for")


def create_get_endpoints_tool(session: Session, user_id: str) -> StructuredTool:
    def get_endpoints(query: str) -> str:
        endpoint_ids = search_similar_endpoints(session, user_id, query)
        if not endpoint_ids:
            return "No matching endpoints found. Try a different search query."
        
        endpoints = session.scalars(
            select(Endpoint).where(Endpoint.id.in_(endpoint_ids))
        ).all()
        
        result = []
        for ep in endpoints:
            tool = ep.tool or {}
            function = tool.get("function", {})
            result.append({
                "id": str(ep.id),
                "method": ep.method.value,
                "path": ep.path,
                "name": function.get("name", ""),
                "description": function.get("description", "")
            })
        
        return json.dumps(result, indent=2)

    return StructuredTool.from_function(
        func=get_endpoints,
        name="get_endpoints",
        description="Search for relevant API endpoints based on what you want to accomplish. Returns a list of matching endpoints with their IDs, methods, paths, and descriptions.",
        args_schema=GetEndpointsInput
    )


def _substitute_path_params(path: str, params: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    remaining = dict(params)
    pattern = r'\{(\w+)\}'
    
    def replace_param(match):
        param_name = match.group(1)
        if param_name in remaining:
            value = remaining.pop(param_name)
            return str(value)
        return match.group(0)
    
    new_path = re.sub(pattern, replace_param, path)
    return new_path, remaining


async def execute_endpoint(
    session: Session,
    user_id: str,
    endpoint: Endpoint,
    params: dict[str, Any]
) -> dict[str, Any]:
    environment = session.scalar(
        select(Environment).where(Environment.user_id == user_id).limit(1)
    )
    
    if not environment:
        return {"error": "No environment configured. Please set up an environment with a base URL first."}
    
    path, remaining_params = _substitute_path_params(endpoint.path, params)
    url = f"{environment.base_url.rstrip('/')}/{path.lstrip('/')}"
    
    method = endpoint.method.value.upper()
    
    request_kwargs: dict[str, Any] = {"timeout": 30.0}
    
    if method == "GET":
        request_kwargs["params"] = remaining_params
    else:
        request_kwargs["json"] = remaining_params
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.request(method, url, **request_kwargs)
            
            try:
                body = response.json()
            except Exception:
                body = response.text
            
            log_info("AgentChain", "execute_endpoint", "Endpoint executed", 
                    endpoint_id=str(endpoint.id), status=response.status_code)
            
            return {
                "status_code": response.status_code,
                "body": body
            }
    except httpx.TimeoutException:
        log_error("AgentChain", "execute_endpoint", "Request timeout", endpoint_id=str(endpoint.id))
        return {"error": "Request timed out"}
    except Exception as e:
        log_error("AgentChain", "execute_endpoint", "Request failed", exc=e, endpoint_id=str(endpoint.id))
        return {"error": str(e)}


def create_endpoint_tool(session: Session, user_id: str, endpoint: Endpoint) -> StructuredTool:
    tool_spec = endpoint.tool or {}
    function_spec = tool_spec.get("function", {})
    name = function_spec.get("name", f"endpoint_{endpoint.id}")
    description = function_spec.get("description", f"{endpoint.method.value} {endpoint.path}")
    parameters = function_spec.get("parameters", {"type": "object", "properties": {}})
    
    properties = parameters.get("properties", {})
    required = parameters.get("required", [])
    
    field_definitions = {}
    for prop_name, prop_spec in properties.items():
        prop_type = prop_spec.get("type", "string")
        prop_desc = prop_spec.get("description", "")
        is_required = prop_name in required
        
        if prop_type == "integer":
            py_type = int
        elif prop_type == "number":
            py_type = float
        elif prop_type == "boolean":
            py_type = bool
        elif prop_type == "array":
            py_type = list
        elif prop_type == "object":
            py_type = dict
        else:
            py_type = str
        
        if is_required:
            field_definitions[prop_name] = (py_type, Field(description=prop_desc))
        else:
            field_definitions[prop_name] = (py_type | None, Field(default=None, description=prop_desc))
    
    if field_definitions:
        InputModel = type(f"{name}Input", (BaseModel,), {"__annotations__": {k: v[0] for k, v in field_definitions.items()}, **{k: v[1] for k, v in field_definitions.items()}})
    else:
        InputModel = type(f"{name}Input", (BaseModel,), {})
    
    import asyncio
    
    def execute_func(**kwargs) -> str:
        filtered_kwargs = {k: v for k, v in kwargs.items() if v is not None}
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        result = loop.run_until_complete(execute_endpoint(session, user_id, endpoint, filtered_kwargs))
        return json.dumps(result, indent=2)
    
    return StructuredTool.from_function(
        func=execute_func,
        name=name,
        description=description,
        args_schema=InputModel
    )


def get_endpoint_tools(session: Session, user_id: str, endpoint_ids: list[UUID]) -> list[StructuredTool]:
    if not endpoint_ids:
        return []
    
    endpoints = session.scalars(
        select(Endpoint).where(Endpoint.id.in_(endpoint_ids), Endpoint.user_id == user_id)
    ).all()
    
    return [create_endpoint_tool(session, user_id, ep) for ep in endpoints]


class AgentExecutor:
    def __init__(self, session: Session, user_id: str):
        self.session = session
        self.user_id = user_id
        self.settings = get_settings()
        self.llm = ChatOpenAI(
            model=llm_config.chat_model,
            temperature=llm_config.temperature,
            api_key=self.settings.open_ai_key
        )
        self.active_endpoint_ids: list[UUID] = []
    
    def _get_tools(self) -> list[StructuredTool]:
        tools = [create_get_endpoints_tool(self.session, self.user_id)]
        tools.extend(get_endpoint_tools(self.session, self.user_id, self.active_endpoint_ids))
        return tools
    
    def _parse_endpoint_ids_from_response(self, content: str) -> list[UUID]:
        try:
            data = json.loads(content)
            if isinstance(data, list):
                return [UUID(item["id"]) for item in data if "id" in item]
        except (json.JSONDecodeError, ValueError, KeyError):
            pass
        return []
    
    async def run(self, user_message: str, conversation_history: list[dict[str, str]]) -> str:
        messages = [SystemMessage(content=SYSTEM_PROMPT)]
        
        for msg in conversation_history:
            if msg["role"] == "user":
                messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                messages.append(AIMessage(content=msg["content"]))
        
        messages.append(HumanMessage(content=user_message))
        
        max_iterations = 10
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
                
                tool = next((t for t in tools if t.name == tool_name), None)
                if not tool:
                    tool_result = f"Tool '{tool_name}' not found"
                else:
                    try:
                        tool_result = tool.invoke(tool_args)
                    except Exception as e:
                        log_error("AgentExecutor", "run", f"Tool execution failed: {tool_name}", exc=e)
                        tool_result = f"Error executing tool: {str(e)}"
                
                if tool_name == "get_endpoints":
                    new_ids = self._parse_endpoint_ids_from_response(tool_result)
                    for eid in new_ids:
                        if eid not in self.active_endpoint_ids:
                            self.active_endpoint_ids.append(eid)
                
                from langchain_core.messages import ToolMessage
                messages.append(ToolMessage(content=tool_result, tool_call_id=tool_call["id"]))
        
        log_info("AgentExecutor", "run", "Max iterations reached")
        return "I've reached the maximum number of steps. Here's what I found so far based on our conversation."

