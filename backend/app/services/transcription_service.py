from io import BytesIO

from fastapi import HTTPException, status
from openai import AsyncOpenAI

from ..core.config import get_settings
from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info


async def transcribe_audio(data: bytes, filename: str | None = None) -> str:
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Transcription unavailable")
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    try:
        stream = BytesIO(data)
        name = filename or "audio.webm"
        response = await client.audio.transcriptions.create(file=(name, stream), model=llm_config.whisper_model)
        text = getattr(response, "text", "") or ""
        if not text:
            raise ValueError("Empty transcription")
        log_info("TranscriptionService", "transcribe_audio", "Transcription completed")
        return text
    except HTTPException:
        raise
    except Exception as error:
        log_error("TranscriptionService", "transcribe_audio", "Transcription failed", exc=error)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to transcribe audio")
