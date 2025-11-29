import re
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.logger import log_error, log_info
from ..models import Endpoint, Environment


def substitute_path_params(path: str, params: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    remaining = dict(params)
    pattern = r"\{(\w+)\}"

    def replace_param(match: re.Match[str]) -> str:
        name = match.group(1)
        if name in remaining:
            value = remaining.pop(name)
            return str(value)
        return match.group(0)

    return re.sub(pattern, replace_param, path), remaining


def execute_endpoint(session: Session, user_id: str, endpoint: Endpoint, args: dict[str, Any]) -> dict[str, Any]:
    environment = session.scalar(select(Environment).where(Environment.user_id == user_id).limit(1))
    if not environment:
        return {"error": "No environment configured. Please set up an environment with a base URL first."}

    path_params = args.get("params", {})
    query_params = args.get("query", {})
    body_data = args.get("body", {})
    header_data = args.get("headers", {})

    path, remaining_path_params = substitute_path_params(endpoint.path, path_params)
    if remaining_path_params:
        log_info(
            "AgentChain",
            "execute_endpoint",
            "Unused path parameters",
            unused=list(remaining_path_params.keys()),
            endpoint_id=str(endpoint.id)
        )

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
            log_info(
                "AgentChain",
                "execute_endpoint",
                "Endpoint executed",
                endpoint_id=str(endpoint.id),
                status=response.status_code
            )
            return {"status_code": response.status_code, "body": body}
    except httpx.TimeoutException:
        log_error("AgentChain", "execute_endpoint", "Request timeout", endpoint_id=str(endpoint.id))
        return {"error": "Request timed out"}
    except Exception as error:
        log_error("AgentChain", "execute_endpoint", "Request failed", exc=error, endpoint_id=str(endpoint.id))
        return {"error": str(error)}
