import json
from typing import Any

from openai import OpenAI

from ..core.config import get_settings
from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info


SYSTEM_PROMPT = """Context: You label one tool with a product feature.

Task: Pick the best feature name.

Constraints:
- Prefer an existing feature name from the provided list when it clearly fits.
- If none fit, create a new name: 2-4 words, Title Case, concrete and specific.
- Choose the shortest name that still fits.

Output: JSON only: {"feature":"Name"}."""


def _get_openai_client() -> OpenAI:
    settings = get_settings()
    return OpenAI(api_key=settings.openai_api_key)


def _fallback_feature_name(tool_payload: dict[str, Any]) -> str:
    tool = tool_payload.get("tool") if isinstance(tool_payload, dict) else None
    function = tool.get("function") if isinstance(tool, dict) else None
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
    path = tool_payload.get("path") if isinstance(tool_payload, dict) else None
    if isinstance(path, str):
        parts = [segment for segment in path.split("/") if segment and not segment.startswith("{")]
        if parts:
            return parts[0].replace("-", " ").replace("_", " ").title()
    return "General"


def classify_feature_name(tool_payload: dict[str, Any], features: list[str]) -> str:
    if not features:
        return _fallback_feature_name(tool_payload)
    try:
        client = _get_openai_client()
        payload_source = tool_payload if isinstance(tool_payload, dict) else {}
        tool_info = payload_source.get("tool")
        function_info = tool_info.get("function") if isinstance(tool_info, dict) else None
        payload = {
            "tool": {
                "path": payload_source.get("path"),
                "method": payload_source.get("method"),
                "name": function_info.get("name") if isinstance(function_info, dict) else None,
                "description": function_info.get("description") if isinstance(function_info, dict) else None
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
    return _fallback_feature_name(tool_payload)
