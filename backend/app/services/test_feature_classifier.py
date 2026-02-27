import json

import pytest

from app.services.feature_classifier import _fallback_feature_name, classify_feature_name


class _DummyMessage:
    def __init__(self, content: str):
        self.content = content


class _DummyChoice:
    def __init__(self, content: str):
        self.message = _DummyMessage(content)


class _DummyResponse:
    def __init__(self, content: str):
        self.choices = [_DummyChoice(content)]


class _DummyCompletions:
    def __init__(self):
        self.last_payload: dict | None = None

    def create(self, **kwargs):
        user_message = kwargs["messages"][1]["content"]
        self.last_payload = json.loads(user_message)
        return _DummyResponse(json.dumps({"feature": "Existing Feature"}))


class _DummyChat:
    def __init__(self):
        self.completions = _DummyCompletions()


class _DummyClient:
    def __init__(self):
        self.chat = _DummyChat()


def test_fallback_feature_name_handles_none_tool():
    assert _fallback_feature_name({"tool": None, "path": "/orders/{id}"}) == "Orders"


def test_classify_feature_name_handles_none_tool(monkeypatch: pytest.MonkeyPatch):
    dummy = _DummyClient()
    monkeypatch.setattr("app.services.feature_classifier._get_openai_client", lambda: dummy)

    result = classify_feature_name({"tool": None, "path": "/orders", "method": "GET"}, ["Orders"])

    assert result == "Existing Feature"
    assert dummy.chat.completions.last_payload is not None
    assert dummy.chat.completions.last_payload["tool"]["name"] is None
    assert dummy.chat.completions.last_payload["tool"]["description"] is None
