import httpx

from ..core.config import get_settings
from ..core.logger import log_error, log_info

UNSTRUCTURED_API_URL = "https://api.unstructuredapp.io/general/v0/general"


def parse_document(file_bytes: bytes, file_name: str) -> list[dict]:
    settings = get_settings()
    if not settings.unstructured_api_key:
        raise ValueError("UNSTRUCTURED_API_KEY is not configured")
    try:
        with httpx.Client(timeout=300.0) as client:
            response = client.post(
                UNSTRUCTURED_API_URL,
                headers={"unstructured-api-key": settings.unstructured_api_key},
                files={"files": (file_name, file_bytes)},
                data={"strategy": "hi_res"},
            )
            response.raise_for_status()
            elements = response.json()
            log_info("UnstructuredService", "parse_document", "Document parsed", file_name=file_name, elements=len(elements))
            return elements
    except httpx.HTTPStatusError as exc:
        log_error("UnstructuredService", "parse_document", "API error", exc=exc, file_name=file_name, status_code=exc.response.status_code)
        raise
    except Exception as exc:
        log_error("UnstructuredService", "parse_document", "Failed to parse document", exc=exc, file_name=file_name)
        raise
