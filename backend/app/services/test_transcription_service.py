import asyncio

import pytest
from fastapi import HTTPException

from app.services.transcription_service import transcribe_audio


@pytest.fixture(autouse=True)
def reset_settings(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk_test_key")
    from app.core.config import get_settings
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_transcribe_audio_success(monkeypatch: pytest.MonkeyPatch):
    class FakeTranscriptions:
        async def create(self, file, model, **_kwargs):
            return type("Resp", (), {"text": "hello world"})()

    class FakeAudio:
        def __init__(self):
            self.transcriptions = FakeTranscriptions()

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.audio = FakeAudio()

    monkeypatch.setattr("app.services.transcription_service.AsyncOpenAI", FakeClient)

    text = asyncio.run(transcribe_audio(b"123", "test.webm"))
    assert text == "hello world"


def test_transcribe_audio_missing_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from app.core.config import get_settings

    get_settings.cache_clear()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(transcribe_audio(b"123", "audio.webm"))
    assert exc.value.status_code == 503


def test_transcribe_audio_failure(monkeypatch: pytest.MonkeyPatch):
    class FakeTranscriptions:
        async def create(self, file, model, **_kwargs):
            raise RuntimeError("boom")

    class FakeAudio:
        def __init__(self):
            self.transcriptions = FakeTranscriptions()

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.audio = FakeAudio()

    monkeypatch.setattr("app.services.transcription_service.AsyncOpenAI", FakeClient)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(transcribe_audio(b"data", "audio.webm"))
    assert exc.value.status_code == 500
