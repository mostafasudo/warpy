import pytest
from fastapi import HTTPException

from app.models import HttpMethod
from app.services.tool_service import _escape_like, _search_condition, _validate_tool


def test_validate_tool_requires_name_and_description():
    with pytest.raises(HTTPException):
        _validate_tool({"function": {"name": "", "description": ""}}, HttpMethod.get, "backend")


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
            HttpMethod.get,
            "backend",
        )


def test_search_condition_handles_empty_terms():
    assert _search_condition(None) is None
    assert _search_condition("   ") is None


def test_escape_like_escapes_wildcards_and_backslashes():
    assert _escape_like("a%b_c\\d") == "a\\%b\\_c\\\\d"
