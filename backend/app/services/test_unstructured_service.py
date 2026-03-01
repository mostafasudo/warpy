import httpx
import pytest

from app.services import unstructured_service
from app.services.unstructured_service import UNSTRUCTURED_API_URL, parse_document


class FakeSettings:
    unstructured_api_key = "test-key"


class FakeSettingsEmpty:
    unstructured_api_key = ""


class FakeResponse:
    def __init__(self, data, status_code=200):
        self._data = data
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=httpx.Request("POST", "http://test"), response=self)

    def json(self):
        return self._data


class FakeClient:
    def __init__(self, response):
        self._response = response
        self.last_call = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def post(self, url, **kwargs):
        self.last_call = {"url": url, **kwargs}
        return self._response


def test_parse_document_success(monkeypatch):
    elements = [{"type": "NarrativeText", "text": "Hello world"}]
    fake_client = FakeClient(FakeResponse(elements))
    monkeypatch.setattr(unstructured_service, "get_settings", lambda: FakeSettings())
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: fake_client)
    result = parse_document(b"data", "test.pdf")
    assert result == elements
    assert fake_client.last_call["url"] == UNSTRUCTURED_API_URL
    assert fake_client.last_call["data"] == {"strategy": "hi_res"}


def test_parse_document_raises_without_api_key(monkeypatch):
    monkeypatch.setattr(unstructured_service, "get_settings", lambda: FakeSettingsEmpty())
    with pytest.raises(ValueError, match="UNSTRUCTURED_API_KEY"):
        parse_document(b"data", "test.pdf")


def test_parse_document_raises_on_http_error(monkeypatch):
    fake_client = FakeClient(FakeResponse([], status_code=500))
    monkeypatch.setattr(unstructured_service, "get_settings", lambda: FakeSettings())
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: fake_client)
    with pytest.raises(httpx.HTTPStatusError):
        parse_document(b"data", "test.pdf")


def test_parse_document_raises_on_exception(monkeypatch):
    monkeypatch.setattr(unstructured_service, "get_settings", lambda: FakeSettings())

    class FailingClient:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, *args, **kwargs):
            raise ConnectionError("network fail")

    monkeypatch.setattr(httpx, "Client", lambda **kwargs: FailingClient())
    with pytest.raises(ConnectionError):
        parse_document(b"data", "test.pdf")
