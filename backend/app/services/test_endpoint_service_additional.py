import pytest
from fastapi import HTTPException

from app.models import HttpMethod
from app.services.endpoint_service import _search_condition, _validate_tool


def test_validate_tool_requires_name_and_description():
    with pytest.raises(HTTPException):
        _validate_tool({"function": {"name": "", "description": ""}}, HttpMethod.get)


def test_validate_tool_rejects_get_body():
    with pytest.raises(HTTPException):
        _validate_tool(
            {
                "function": {
                    "name": "getUser",
                    "description": "d",
                    "parameters": {"type": "object", "properties": {"body": {"type": "object"}}}
                }
            },
            HttpMethod.get
        )


def test_search_condition_handles_empty_terms():
    assert _search_condition(None) is None
    assert _search_condition("   ") is None
