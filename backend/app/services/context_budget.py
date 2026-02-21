import json

import tiktoken
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage

from ..core.logger import log_info, log_warning

MODEL_CONTEXT_LIMITS: dict[str, int] = {
    "gpt-4o": 128_000,
    "gpt-5.2": 256_000,
}
DEFAULT_CONTEXT_LIMIT = 128_000
RESPONSE_HEADROOM_RATIO = 0.20
MIN_RESPONSE_HEADROOM = 4_096
MAX_TOOL_RESULT_TOKENS = 12_000
MAX_HISTORY_PAIRS = 10

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


def count_tokens(text: str, model: str = "gpt-4o") -> int:
    if not text:
        return 0
    return len(_get_encoder(model).encode(text))


def count_message_tokens(message: BaseMessage, model: str = "gpt-4o") -> int:
    overhead = 4
    content = message.content or ""
    tokens = overhead + count_tokens(str(content), model)
    if isinstance(message, AIMessage) and message.tool_calls:
        try:
            tokens += count_tokens(json.dumps(message.tool_calls), model)
        except (TypeError, ValueError):
            tokens += 200
    return tokens


def count_messages_tokens(messages: list[BaseMessage], model: str = "gpt-4o") -> int:
    return sum(count_message_tokens(m, model) for m in messages)


def get_context_limit(model: str) -> int:
    return MODEL_CONTEXT_LIMITS.get(model, DEFAULT_CONTEXT_LIMIT)


def get_token_budget(model: str) -> int:
    limit = get_context_limit(model)
    headroom = max(int(limit * RESPONSE_HEADROOM_RATIO), MIN_RESPONSE_HEADROOM)
    return limit - headroom


def truncate_tool_result(content: str, model: str = "gpt-4o", max_tokens: int = MAX_TOOL_RESULT_TOKENS) -> str:
    if count_tokens(content, model) <= max_tokens:
        return content

    try:
        data = json.loads(content)
        if isinstance(data, dict):
            data = _truncate_json_dict(data, model, max_tokens)
            result = json.dumps(data)
            if count_tokens(result, model) <= max_tokens:
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
    if count_tokens(result, model) <= max_tokens:
        return data

    body = data.get("body", data)
    if isinstance(body, dict):
        for list_key in ("elements", "items", "results", "data"):
            if list_key in body and isinstance(body[list_key], list) and len(body[list_key]) > 1:
                original_len = len(body[list_key])
                while len(body[list_key]) > 1:
                    result = json.dumps(data)
                    if count_tokens(result, model) <= max_tokens:
                        break
                    body[list_key] = body[list_key][:len(body[list_key]) // 2]
                if len(body[list_key]) < original_len:
                    log_info(
                        "ContextBudget", "truncate_tool_result",
                        f"Trimmed {list_key} from {original_len} to {len(body[list_key])} items"
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


def _get_tool_call_id(call: object) -> str | None:
    if isinstance(call, dict):
        return call.get("id")
    return getattr(call, "id", None)


def prune_messages(
    messages: list[BaseMessage],
    model: str = "gpt-4o",
    budget: int | None = None,
) -> list[BaseMessage]:
    if not messages:
        return messages

    if budget is None:
        budget = get_token_budget(model)

    msg_tokens = [count_message_tokens(m, model) for m in messages]
    total = sum(msg_tokens)
    if total <= budget:
        return messages

    log_warning(
        "ContextBudget", "prune_messages",
        f"Token count {total} exceeds budget {budget}, pruning",
        model=model,
    )

    protected: set[int] = set()

    if messages and isinstance(messages[0], SystemMessage):
        protected.add(0)

    for i in range(len(messages) - 1, -1, -1):
        if isinstance(messages[i], HumanMessage):
            protected.add(i)
            break

    if messages:
        protected.add(len(messages) - 1)

    removable = [i for i in range(len(messages)) if i not in protected]

    def removal_priority(idx: int) -> tuple[int, int]:
        return (0 if isinstance(messages[idx], ToolMessage) else 1, -msg_tokens[idx])

    removable.sort(key=removal_priority)

    removed: set[int] = set()
    running_total = total

    for idx in removable:
        if running_total <= budget:
            break
        removed.add(idx)
        running_total -= msg_tokens[idx]

        if isinstance(messages[idx], ToolMessage):
            tool_call_id = getattr(messages[idx], "tool_call_id", None)
            if tool_call_id:
                for j in range(idx - 1, -1, -1):
                    if j in removed or j in protected:
                        continue
                    if isinstance(messages[j], AIMessage) and messages[j].tool_calls:
                        call_ids = {_get_tool_call_id(c) for c in messages[j].tool_calls}
                        result_indices = [
                            k for k in range(len(messages))
                            if isinstance(messages[k], ToolMessage)
                            and getattr(messages[k], "tool_call_id", None) in call_ids
                        ]
                        if all(k in removed for k in result_indices):
                            removed.add(j)
                            running_total -= msg_tokens[j]
                        break

    retained = set(range(len(messages))) - removed
    for i in retained:
        if not isinstance(messages[i], AIMessage) or not messages[i].tool_calls:
            continue
        call_ids = {_get_tool_call_id(c) for c in messages[i].tool_calls}
        result_indices = [
            k for k in range(len(messages))
            if isinstance(messages[k], ToolMessage)
            and getattr(messages[k], "tool_call_id", None) in call_ids
        ]
        has_retained_result = any(k in retained for k in result_indices)
        if not has_retained_result and i not in protected:
            removed.add(i)
            running_total -= msg_tokens[i]

    for i in retained - removed:
        if not isinstance(messages[i], ToolMessage):
            continue
        tool_call_id = getattr(messages[i], "tool_call_id", None)
        if not tool_call_id:
            continue
        parent_found = False
        for j in range(i - 1, -1, -1):
            if j in removed:
                continue
            if isinstance(messages[j], AIMessage) and messages[j].tool_calls:
                parent_call_ids = {_get_tool_call_id(c) for c in messages[j].tool_calls}
                if tool_call_id in parent_call_ids:
                    parent_found = True
                    break
        if not parent_found and i not in protected:
            removed.add(i)
            running_total -= msg_tokens[i]

    pruned = [m for i, m in enumerate(messages) if i not in removed]
    pruned_total = count_messages_tokens(pruned, model)

    log_info(
        "ContextBudget", "prune_messages",
        f"Pruned {len(removed)} messages, {total} -> {pruned_total} tokens",
        model=model,
    )

    return pruned
