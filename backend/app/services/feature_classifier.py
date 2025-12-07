import json
from typing import Any

from openai import OpenAI

from ..core.config import get_settings
from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info


SYSTEM_PROMPT = """You group API endpoints into concise product features.

Rules:
- Choose the smallest sensible feature bucket.
- Prefer existing feature names when they fit.
- Otherwise suggest a short, descriptive new feature name (2-4 words, title case).
- Respond with JSON: {"feature": "Name"}."""


def _get_openai_client() -> OpenAI:
    settings = get_settings()
    return OpenAI(api_key=settings.open_ai_key)


def _fallback_feature_name(endpoint: dict[str, Any]) -> str:
    function = endpoint.get("tool", {}).get("function", {}) if isinstance(endpoint, dict) else {}
    name = function.get("name") if isinstance(function, dict) else None
    description = function.get("description") if isinstance(function, dict) else None
    if isinstance(name, str) and name.strip():
        words = [part for part in name.replace("_", " ").replace("-", " ").split(" ") if part]
        if words:
            return " ".join(words[:4]).title()
    if isinstance(description, str) and description.strip():
        words = description.split()
        if words:
            return " ".join(words[:4]).title()
    path = endpoint.get("path") if isinstance(endpoint, dict) else None
    if isinstance(path, str):
        parts = [segment for segment in path.split("/") if segment and not segment.startswith("{")]
        if parts:
            return parts[0].replace("-", " ").replace("_", " ").title()
    return "General"


def classify_feature_name(endpoint: dict[str, Any], features: list[str]) -> str:
    if not features:
        return _fallback_feature_name(endpoint)
    try:
        client = _get_openai_client()
        payload = {
            "endpoint": {
                "path": endpoint.get("path"),
                "method": endpoint.get("method"),
                "name": endpoint.get("tool", {}).get("function", {}).get("name"),
                "description": endpoint.get("tool", {}).get("function", {}).get("description")
            },
            "features": features
        }
        response = client.chat.completions.create(
            model=llm_config.chat_model,
            temperature=0,
            timeout=10.0,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps(payload)}
            ],
            response_format={"type": "json_object"}
        )
        message = response.choices[0].message.content or ""
        parsed = json.loads(message)
        name = parsed.get("feature") if isinstance(parsed, dict) else None
        if isinstance(name, str) and name.strip():
            normalized = name.strip()
            log_info("FeatureClassifier", "classify_feature_name", "LLM classification success")
            return normalized[:128]
    except Exception as error:
        log_error("FeatureClassifier", "classify_feature_name", "Classification failed", exc=error)
    return _fallback_feature_name(endpoint)
