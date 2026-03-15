import json

import tiktoken

from ..core.logger import log_info

MAX_TOOL_RESULT_TOKENS = 12_000
TOKEN_COUNT_CHUNK_CHARS = 2_048

_encoders: dict[str, tiktoken.Encoding] = {}


def _get_encoder(model: str) -> tiktoken.Encoding:
    try:
        enc = tiktoken.encoding_for_model(model)
    except KeyError:
        enc = tiktoken.get_encoding("cl100k_base")
    name = enc.name
    if name not in _encoders:
        _encoders[name] = enc
    return _encoders[name]


def _count_tokens_with_encoder(
    encoder: tiktoken.Encoding,
    text: str,
    stop_at: int | None = None,
) -> int:
    if not text:
        return 0
    if stop_at is None:
        return len(encoder.encode(text))

    total = 0
    for start in range(0, len(text), TOKEN_COUNT_CHUNK_CHARS):
        total += len(encoder.encode(text[start:start + TOKEN_COUNT_CHUNK_CHARS]))
        if total > stop_at:
            return total
    return total


def count_tokens(text: str, model: str = "gpt-4o", stop_at: int | None = None) -> int:
    if not text:
        return 0
    return _count_tokens_with_encoder(_get_encoder(model), text, stop_at=stop_at)


def truncate_tool_result(content: str, model: str = "gpt-4o", max_tokens: int = MAX_TOOL_RESULT_TOKENS) -> str:
    if count_tokens(content, model, stop_at=max_tokens) <= max_tokens:
        return content

    try:
        data = json.loads(content)
        if isinstance(data, dict):
            data = _truncate_json_dict(data, model, max_tokens)
            result = json.dumps(data)
            if count_tokens(result, model, stop_at=max_tokens) <= max_tokens:
                return result
    except (json.JSONDecodeError, TypeError):
        pass

    return _hard_truncate(content, model, max_tokens)


def _truncate_json_dict(data: dict, model: str, max_tokens: int) -> dict:
    for key in ("screenshot", "image", "base64"):
        if key in data and isinstance(data[key], str) and len(data[key]) > 1000:
            data[key] = "[truncated]"
        body = data.get("body")
        if isinstance(body, dict) and key in body and isinstance(body[key], str) and len(body[key]) > 1000:
            body[key] = "[truncated]"

    result = json.dumps(data)
    if count_tokens(result, model, stop_at=max_tokens) <= max_tokens:
        return data

    body = data.get("body", data)
    if isinstance(body, dict):
        for list_key in ("elements", "items", "results", "data"):
            if list_key in body and isinstance(body[list_key], list) and len(body[list_key]) > 1:
                original_len = len(body[list_key])
                while len(body[list_key]) > 1:
                    result = json.dumps(data)
                    if count_tokens(result, model, stop_at=max_tokens) <= max_tokens:
                        break
                    body[list_key] = body[list_key][:len(body[list_key]) // 2]
                if len(body[list_key]) < original_len:
                    log_info(
                        "ContextBudget",
                        "truncate_tool_result",
                        f"Trimmed {list_key} from {original_len} to {len(body[list_key])} items",
                    )

    if isinstance(body, dict):
        for key, value in body.items():
            if isinstance(value, str) and len(value) > 2000:
                body[key] = value[:2000] + "...[truncated]"

    return data


def _hard_truncate(content: str, model: str, max_tokens: int) -> str:
    encoder = _get_encoder(model)
    tokens = encoder.encode(content)
    if len(tokens) <= max_tokens:
        return content
    marker = "\n...[content truncated to fit context window]"
    marker_tokens = len(encoder.encode(marker))
    safe_limit = max(max_tokens - marker_tokens, 1)
    return encoder.decode(tokens[:safe_limit]) + marker
