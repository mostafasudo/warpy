import json
from typing import Any
from uuid import UUID

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Endpoint
from .embedding_service import search_similar_endpoints
from .agent_execution import execute_endpoint
from .agent_schema import SchemaFactory, serialize_args


class GetEndpointsInput(BaseModel):
    query: str = Field(description="Natural language description of what API functionality you're looking for")


def create_get_endpoints_tool(session: Session, user_id: str) -> StructuredTool:
    def get_endpoints(query: str) -> str:
        endpoint_ids = search_similar_endpoints(session, user_id, query)
        if not endpoint_ids:
            return "No matching endpoints found. Try a different search query."
        endpoints = session.scalars(
            select(Endpoint).where(
                Endpoint.id.in_(endpoint_ids),
                Endpoint.user_id == user_id,
                Endpoint.agent_enabled.is_(True)
            )
        ).all()
        if not endpoints:
            return "No matching endpoints found. Try a different search query."
        result = []
        for endpoint in endpoints:
            tool = endpoint.tool or {}
            function = tool.get("function", {})
            result.append(
                {
                    "id": str(endpoint.id),
                    "method": endpoint.method.value,
                    "path": endpoint.path,
                    "name": function.get("name", ""),
                    "description": function.get("description", "")
                }
            )
        return json.dumps(result, indent=2)

    return StructuredTool.from_function(
        func=get_endpoints,
        name="get_endpoints",
        description=(
            "Search for relevant API endpoints based on what you want to accomplish. "
            "Returns a list of matching endpoints with their IDs, methods, paths, and descriptions."
        ),
        args_schema=GetEndpointsInput
    )


def create_endpoint_tool(
    session: Session,
    user_id: str,
    endpoint: Endpoint,
    schema_factory: SchemaFactory | None = None
) -> StructuredTool:
    factory = schema_factory or SchemaFactory()
    tool_spec = endpoint.tool or {}
    function_spec = tool_spec.get("function", {})
    name = function_spec.get("name", f"endpoint_{endpoint.id}")
    description = function_spec.get("description", f"{endpoint.method.value} {endpoint.path}")
    parameters = function_spec.get("parameters", {"type": "object", "properties": {}})
    InputModel = factory.model_from_schema(f"{name}Input", parameters)

    def execute_func(**kwargs: Any) -> str:
        serialized = serialize_args(kwargs)
        filtered = {key: value for key, value in serialized.items() if value is not None}
        result = execute_endpoint(session, user_id, endpoint, filtered)
        return json.dumps(result, indent=2)

    return StructuredTool.from_function(
        func=execute_func,
        name=name,
        description=description,
        args_schema=InputModel
    )


def get_endpoint_tools(
    session: Session,
    user_id: str,
    endpoint_ids: list[UUID],
    schema_factory: SchemaFactory | None = None
) -> list[StructuredTool]:
    if not endpoint_ids:
        return []
    endpoints = session.scalars(
        select(Endpoint).where(
            Endpoint.id.in_(endpoint_ids),
            Endpoint.user_id == user_id,
            Endpoint.agent_enabled.is_(True)
        )
    ).all()
    factory = schema_factory or SchemaFactory()
    return [create_endpoint_tool(session, user_id, endpoint, factory) for endpoint in endpoints]
