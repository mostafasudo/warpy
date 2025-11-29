import pytest
from fastapi import HTTPException

from app.services.endpoint_service import _search_condition, _validate_tool


def test_validate_tool_requires_name_and_description():
    with pytest.raises(HTTPException):
        _validate_tool({"function": {"name": "", "description": ""}})


def test_search_condition_handles_empty_terms():
    assert _search_condition(None) is None
    assert _search_condition("   ") is None
