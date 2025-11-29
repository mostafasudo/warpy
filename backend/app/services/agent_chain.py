import json
import re
from typing import Any
from uuid import UUID

import httpx
from langchain_core.tools import StructuredTool
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from urllib.parse import urlparse
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field, create_model
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info
from ..models import Endpoint, Environment
from .embedding_service import search_similar_endpoints


_model_cache: dict[str, type[BaseModel]] = {}


def _json_schema_type_to_python(schema: dict[str, Any], model_name_prefix: str) -> type:
    schema_type = schema.get("type", "string")

    if schema_type == "object":
        if "properties" in schema:
            return _json_schema_to_pydantic_model(model_name_prefix, schema)
        return dict

    if schema_type == "array":
        items = schema.get("items", {})
        item_type = _json_schema_type_to_python(items, f"{model_name_prefix}Item")
        return list[item_type]

    if schema_type == "integer":
        return int
    if schema_type == "number":
        return float
    if schema_type == "boolean":
        return bool
    return str


def _json_schema_to_pydantic_model(name: str, schema: dict[str, Any]) -> type[BaseModel]:
    cache_key = f"{name}_{json.dumps(schema, sort_keys=True)}"
    if cache_key in _model_cache:
        return _model_cache[cache_key]

    properties = schema.get("properties", {})
    required = set(schema.get("required", []))

    if not properties:
        model = create_model(name)
        _model_cache[cache_key] = model
        return model

    field_definitions: dict[str, Any] = {}

    for prop_name, prop_schema in properties.items():
        py_type = _json_schema_type_to_python(prop_schema, f"{name}_{prop_name}")
        description = prop_schema.get("description", "")
        is_required = prop_name in required

        if is_required:
            field_definitions[prop_name] = (py_type, Field(description=description))
        else:
            field_definitions[prop_name] = (py_type | None, Field(default=None, description=description))

    model = create_model(name, **field_definitions)
    _model_cache[cache_key] = model
    return model


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


def execute_endpoint(
    session: Session,
    user_id: str,
    endpoint: Endpoint,
    args: dict[str, Any]
) -> dict[str, Any]:
    environment = session.scalar(
        select(Environment).where(Environment.user_id == user_id).limit(1)
    )

    if not environment:
        return {"error": "No environment configured. Please set up an environment with a base URL first."}

    path_params = args.get("params", {})
    query_params = args.get("query", {})
    body_data = args.get("body", {})
    header_data = args.get("headers", {})

    path, remaining_path_params = _substitute_path_params(endpoint.path, path_params)
    if remaining_path_params:
        log_info("AgentChain", "execute_endpoint", "Unused path parameters",
                unused=list(remaining_path_params.keys()), endpoint_id=str(endpoint.id))

    url = f"{environment.base_url.rstrip('/')}/{path.lstrip('/')}"

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return {"error": f"Invalid URL scheme: {parsed.scheme}. Only http and https are allowed."}

    method = endpoint.method.value.upper()

    request_kwargs: dict[str, Any] = {"timeout": 30.0}

    if query_params:
        request_kwargs["params"] = query_params
    if body_data and method != "GET":
        request_kwargs["json"] = body_data
    if header_data:
        request_kwargs["headers"] = header_data

    try:
        with httpx.Client() as client:
            response = client.request(method, url, **request_kwargs)

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


def _serialize_args(obj: Any) -> Any:
    if isinstance(obj, BaseModel):
        return {k: _serialize_args(v) for k, v in obj.model_dump(exclude_none=True).items()}
    if isinstance(obj, list):
        return [_serialize_args(item) for item in obj]
    if isinstance(obj, dict):
        return {k: _serialize_args(v) for k, v in obj.items()}
    return obj


def create_endpoint_tool(session: Session, user_id: str, endpoint: Endpoint) -> StructuredTool:
    tool_spec = endpoint.tool or {}
    function_spec = tool_spec.get("function", {})
    name = function_spec.get("name", f"endpoint_{endpoint.id}")
    description = function_spec.get("description", f"{endpoint.method.value} {endpoint.path}")
    parameters = function_spec.get("parameters", {"type": "object", "properties": {}})

    InputModel = _json_schema_to_pydantic_model(f"{name}Input", parameters)

    def execute_func(**kwargs) -> str:
        serialized = _serialize_args(kwargs)
        filtered = {k: v for k, v in serialized.items() if v is not None}
        result = execute_endpoint(session, user_id, endpoint, filtered)
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
                
                messages.append(ToolMessage(content=tool_result, tool_call_id=tool_call["id"]))
        
        log_info("AgentExecutor", "run", "Max iterations reached")
        return "I've reached the maximum number of steps. Here's what I found so far based on our conversation."

