from __future__ import annotations

import json
import re
from typing import Any

from ..schemas.widget_dynamic_ui import WidgetRenderPayload

WIDGET_RESPONSE_MODES = {"markdown", "warpy_components", "native_components"}
MAX_SUMMARY_BODY_CHARS = 420
MAX_CARD_TITLE_CHARS = 80
MAX_LIST_ITEMS = 6
MAX_LIST_ITEM_CHARS = 120
MAX_TABLE_ROWS = 6
MAX_TABLE_COLUMNS = 4
MAX_TABLE_CELL_CHARS = 80
MAX_NATIVE_MARKDOWN_CHARS = 2000
MAX_NATIVE_STRING_PROP_CHARS = 1000
MAX_NATIVE_PROPS_JSON_CHARS = 6000
MIN_NATIVE_COMPONENT_MATCH_SCORE = 2

STRING_CONTENT_PROPS = ("markdownFallback", "markdown", "content", "body", "text", "summary")
TITLE_PROPS = ("title", "heading", "label")
ACRONYM_LABELS = {
    "api": "API",
    "csv": "CSV",
    "id": "ID",
    "json": "JSON",
    "qr": "QR",
    "sku": "SKU",
    "ui": "UI",
    "url": "URL",
}
INLINE_RECORD_MARKER_RE = re.compile(r"(?<![\d.])(\d{1,2})\.\s+(?=[A-Z0-9])")
INLINE_FIELD_RE = re.compile(r"\s-\s([A-Za-z][A-Za-z0-9_/]*(?:\s+[A-Za-z][A-Za-z0-9_/]*){0,6}):\s")
FLAT_RECORD_LABEL_PATTERN = r"[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,5}"
FLAT_RECORD_MARKER_RE = re.compile(
    rf"(?<!\w)({FLAT_RECORD_LABEL_PATTERN})\s+(\d{{1,3}})\s+-\s+"
    r"(?=[A-Za-z][A-Za-z0-9_/]*(?:\s+[A-Za-z][A-Za-z0-9_/]*){0,6}:\s)"
)
FLAT_FIELD_RE = re.compile(r"(?:^|\s-\s)([A-Za-z][A-Za-z0-9_/]*(?:\s+[A-Za-z][A-Za-z0-9_/]*){0,6}):\s")
INLINE_RECORD_SUFFIX_RE = re.compile(r"\s+(If you want,?\s+I can also\b.+)$", re.IGNORECASE)
MARKDOWN_CODE_FENCE_RE = re.compile(r"```([A-Za-z0-9_-]+)?\s*\n?(.*?)(?:\n?```|$)", re.DOTALL)
PLAIN_FIELD_RE = re.compile(r"^([A-Za-z][A-Za-z0-9 _/-]{0,60}):\s*(.*)$")
PLAIN_FIELD_ONLY_RE = re.compile(r"^\s*(?:[-*]\s+)?([A-Za-z][A-Za-z0-9 _/-]{0,60}):\s*$")
IMAGE_FIELD_VALUE_RE = re.compile(
    r"^(\s*(?:[-*]\s+)?([A-Za-z][A-Za-z0-9 _/-]{0,60}):\s*)"
    r"(https?://\S+\.(?:apng|avif|gif|jpe?g|png|svg|webp)(?:[?#]\S*)?)\s*$",
    re.IGNORECASE,
)
IMAGE_BULLET_VALUE_RE = re.compile(
    r"^(\s*[-*]\s+)(https?://\S+\.(?:apng|avif|gif|jpe?g|png|svg|webp)(?:[?#]\S*)?)\s*$",
    re.IGNORECASE,
)
IMAGE_BARE_VALUE_RE = re.compile(
    r"^(\s*)(https?://\S+\.(?:apng|avif|gif|jpe?g|png|svg|webp)(?:[?#]\S*)?)\s*$",
    re.IGNORECASE,
)
FORMAT_OFFER_RE = re.compile(
    r"\s*If you want,?\s+I can also format (?:it|them|these|this).+?(?:\.|$)",
    re.IGNORECASE,
)
IMAGE_URL_RE = re.compile(r"^https?://\S+\.(?:apng|avif|gif|jpe?g|png|svg|webp)(?:[?#]\S*)?$", re.IGNORECASE)
URL_RE = re.compile(r"^https?://\S+$", re.IGNORECASE)
NATIVE_MATCH_STOP_WORDS = {
    "and",
    "are",
    "body",
    "card",
    "component",
    "content",
    "data",
    "details",
    "display",
    "for",
    "from",
    "info",
    "information",
    "item",
    "list",
    "mode",
    "native",
    "output",
    "panel",
    "props",
    "render",
    "reply",
    "response",
    "should",
    "show",
    "status",
    "summary",
    "that",
    "the",
    "this",
    "use",
    "used",
    "when",
    "with",
}


def format_widget_markdown_response(markdown: str, *, user_message: str | None = None) -> str:
    text = str(markdown or "").strip()
    if not text:
        return ""
    fenced_records = _format_plain_record_fences(text)
    if fenced_records:
        return _render_image_urls_in_markdown(fenced_records)
    json_formatted = _format_embedded_json_payload(text, _user_requested_json(user_message))
    if json_formatted:
        return _render_image_urls_in_markdown(json_formatted)
    formatted = _format_flat_dash_records(text) or _format_inline_numbered_records(text) or _format_plain_record_sections(text) or text
    return _render_image_urls_in_markdown(formatted)


def normalize_widget_response_mode(value: str | None) -> str:
    return value if value in WIDGET_RESPONSE_MODES else "warpy_components"


def build_widget_render_payload(
    markdown: str,
    response_mode: str | None,
    *,
    native_components: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    raw_markdown = str(markdown or "").strip()
    if not " ".join(raw_markdown.split()).strip():
        return None
    mode = normalize_widget_response_mode(response_mode)
    if mode == "markdown":
        return None
    try:
        if mode == "native_components":
            return _build_native_payload(raw_markdown, native_components or [])
        return _build_warpy_payload(raw_markdown)
    except Exception:
        return None


def _build_warpy_payload(markdown: str) -> dict[str, Any] | None:
    table = _parse_markdown_table(markdown)
    if table:
        payload = WidgetRenderPayload(
            kind="warpy_components",
            markdownFallback=markdown,
            tree=[{"component": "compact_table", "props": table}],
        )
        return payload.model_dump(by_alias=True, exclude_none=True)
    if _looks_like_markdown_table(markdown):
        return None

    bullets = _parse_bullets(markdown)
    if bullets:
        title = _extract_title(markdown, fallback="Summary")
        body = _strip_bullets(markdown)
        if len(_strip_markdown_inline(body)) > MAX_SUMMARY_BODY_CHARS:
            return None
        nodes: list[dict[str, Any]] = [
            {
                "component": "summary_card",
                "props": {
                    "title": title,
                    "body": _strip_markdown_inline(body),
                },
            },
            {
                "component": "status_list",
                "props": {"items": [{"label": item, "status": "neutral"} for item in bullets]},
            },
        ]
        payload = WidgetRenderPayload(kind="warpy_components", markdownFallback=markdown, tree=nodes)
        return payload.model_dump(by_alias=True, exclude_none=True)

    return None


def _build_native_payload(markdown: str, native_components: list[dict[str, Any]]) -> dict[str, Any] | None:
    if len(markdown) > MAX_NATIVE_MARKDOWN_CHARS:
        return None
    candidates: list[tuple[int, dict[str, Any]]] = []
    for component in native_components:
        if component.get("active") is False:
            continue
        match_score = _native_component_match_score(markdown, component)
        if match_score < MIN_NATIVE_COMPONENT_MATCH_SCORE:
            continue
        schema = component.get("propsSchema") or component.get("props_schema") or {}
        constraints = component.get("constraints") if isinstance(component.get("constraints"), dict) else {}
        props = _build_native_props(markdown, schema, constraints)
        component_key = component.get("key") or component.get("componentKey") or component.get("component_key")
        if props is None or not isinstance(component_key, str) or not component_key.strip():
            continue
        if not _props_match_schema(props, schema):
            continue
        if len(json.dumps(props, separators=(",", ":"), ensure_ascii=False)) > MAX_NATIVE_PROPS_JSON_CHARS:
            continue
        payload = WidgetRenderPayload(
            kind="native_components",
            markdownFallback=markdown,
            componentKey=component_key.strip(),
            componentVersion=str(component.get("version") or "1"),
            props=props,
        )
        candidates.append((match_score, payload.model_dump(by_alias=True, exclude_none=True)))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    if len(candidates) > 1 and candidates[0][0] == candidates[1][0]:
        return None
    return candidates[0][1]


def _user_requested_json(user_message: str | None) -> bool:
    return bool(re.search(r"\bjson\b", str(user_message or ""), flags=re.IGNORECASE))


def _format_embedded_json_payload(markdown: str, user_requested_json: bool) -> str | None:
    extracted = _extract_first_json_value(markdown)
    if extracted is None:
        return None
    prefix, payload, suffix = extracted
    if not user_requested_json:
        records = _extract_record_collection(payload)
        if records:
            intro = _clean_json_intro(prefix) or "Here are the records."
            return "\n\n".join([intro, *[_format_record(index + 1, record) for index, record in enumerate(records)]])
    return _format_json_code_block(prefix, payload, suffix)


def _extract_first_json_value(markdown: str) -> tuple[str, Any, str] | None:
    start = _find_first_json_start(markdown)
    if start < 0:
        return None
    try:
        payload, end = json.JSONDecoder().raw_decode(markdown[start:])
    except json.JSONDecodeError:
        return None
    return markdown[:start].strip(), payload, markdown[start + end :].strip()


def _find_first_json_start(markdown: str) -> int:
    in_code_fence = False
    index = 0
    while index < len(markdown):
        if markdown.startswith("```", index):
            in_code_fence = not in_code_fence
            index += 3
            continue
        if not in_code_fence and markdown[index] in "{[":
            return index
        index += 1
    return -1


def _clean_json_intro(prefix: str) -> str:
    cleaned = re.sub(r"\bjson\s*$", "", str(prefix or "").strip(), flags=re.IGNORECASE).strip()
    cleaned = re.sub(
        r"\s*If you want,?\s+I can also format (?:it|them|these|this).+?(?:JSON|json)\.\s*$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    return cleaned.strip()


def _format_json_code_block(prefix: str, payload: Any, suffix: str) -> str:
    intro = _clean_json_intro(prefix)
    formatted = json.dumps(payload, indent=2, ensure_ascii=False)
    parts = []
    if intro:
        parts.append(intro)
    parts.append(f"```json\n{formatted}\n```")
    if suffix:
        parts.append(suffix)
    return "\n\n".join(parts)


def _format_plain_record_fences(markdown: str) -> str | None:
    changed = False

    def replace_fence(match: re.Match[str]) -> str:
        nonlocal changed
        language = (match.group(1) or "").strip().lower()
        body = (match.group(2) or "").strip()
        if language in {"json", "js", "javascript", "ts", "typescript", "python", "py", "html", "css", "sql", "bash", "sh"}:
            return match.group(0)
        formatted = _format_plain_record_block(body)
        if not formatted:
            return match.group(0)
        changed = True
        return formatted

    formatted = MARKDOWN_CODE_FENCE_RE.sub(replace_fence, markdown)
    if not changed:
        return None
    return _separate_intro_from_records(_clean_format_offer(formatted)).strip()


def _format_plain_record_sections(markdown: str) -> str | None:
    cleaned = _clean_format_offer(markdown)
    lines = cleaned.splitlines()
    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or stripped.startswith("```") or URL_RE.fullmatch(stripped) or _plain_field_match(line):
            continue
        next_index = _next_nonblank_index(lines, index + 1)
        if next_index is None or not _plain_field_match(lines[next_index]):
            continue
        prefix = "\n".join(lines[:index]).strip()
        formatted = _format_plain_record_block("\n".join(lines[index:]))
        if not formatted:
            continue
        return "\n\n".join(part for part in (prefix, formatted) if part)
    return None


def _format_plain_record_block(body: str) -> str | None:
    lines = body.splitlines()
    records: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    field_count = 0
    index = 0
    while index < len(lines):
        raw_line = lines[index].strip()
        if not raw_line:
            index += 1
            continue
        field_match = _plain_field_match(raw_line)
        if field_match and current is not None:
            label, value = field_match
            current["fields"].append({"label": label, "value": value.strip(), "children": []})
            field_count += 1
            index += 1
            continue
        if _starts_new_plain_record(lines, index, current):
            if current is not None:
                records.append(current)
            current = {"title": raw_line, "fields": []}
            index += 1
            continue
        if current is not None and current["fields"]:
            current["fields"][-1]["children"].append(raw_line)
        index += 1
    if current is not None:
        records.append(current)
    if field_count < 2 or not records:
        return None
    return "\n\n".join(_format_plain_record(index + 1, record) for index, record in enumerate(records))


def _starts_new_plain_record(lines: list[str], index: int, current: dict[str, Any] | None) -> bool:
    line = lines[index].strip()
    if not line or line.startswith("```") or URL_RE.fullmatch(line) or _plain_field_match(line):
        return False
    next_index = _next_nonblank_index(lines, index + 1)
    if next_index is None or not _plain_field_match(lines[next_index]):
        return current is None
    if current is None:
        return True
    fields = current.get("fields") if isinstance(current, dict) else None
    if not fields:
        return False
    last_field = fields[-1]
    return bool(last_field.get("value") or last_field.get("children"))


def _format_plain_record(index: int, record: dict[str, Any]) -> str:
    title = _string_value(record.get("title")) or f"Record {index}"
    lines = [f"{index}. **{title}**"]
    for field in record.get("fields") or []:
        lines.extend(_format_plain_record_field(field, indent="   "))
    return "\n".join(lines)


def _format_plain_record_field(field: dict[str, Any], *, indent: str) -> list[str]:
    label = _string_value(field.get("label"))
    value = _string_value(field.get("value"))
    children = [_string_value(child) for child in field.get("children") or [] if _string_value(child)]
    if children:
        lines = [f"{indent}- {label}:"]
        lines.extend(f"{indent}  - {_format_markdown_scalar(child, label)}" for child in children)
        return lines
    if value:
        return [f"{indent}- {label}: {_format_markdown_scalar(value, label)}"]
    return [f"{indent}- {label}:"]


def _plain_field_match(line: str) -> tuple[str, str] | None:
    normalized = str(line or "").strip()
    if URL_RE.fullmatch(normalized) or IMAGE_URL_RE.fullmatch(normalized):
        return None
    match = PLAIN_FIELD_RE.match(normalized)
    if not match:
        return None
    return match.group(1).strip(), match.group(2).strip()


def _next_nonblank_index(lines: list[str], start: int) -> int | None:
    for index in range(start, len(lines)):
        if lines[index].strip():
            return index
    return None


def _clean_format_offer(value: str) -> str:
    return FORMAT_OFFER_RE.sub("", str(value or "")).strip()


def _separate_intro_from_records(value: str) -> str:
    return re.sub(r"([^\n])\n(\d+\. \*\*)", r"\1\n\n\2", str(value or "").strip())


def _extract_record_collection(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    best_records: list[dict[str, Any]] = []
    for value in payload.values():
        if not isinstance(value, list):
            continue
        records = [item for item in value if isinstance(item, dict)]
        if len(records) > len(best_records):
            best_records = records
    return best_records


def _format_record(index: int, record: dict[str, Any]) -> str:
    title_key, title = _record_title(record, index)
    lines = [f"{index}. **{title}**"]
    for key, value in record.items():
        if key == title_key:
            continue
        lines.extend(_format_record_field(key, value, indent="   "))
    return "\n".join(lines)


def _record_title(record: dict[str, Any], index: int) -> tuple[str | None, str]:
    for key in ("title", "name", "subject", "label", "heading"):
        value = _string_value(record.get(key))
        if value:
            return key, value
    value = _string_value(record.get("id"))
    if value:
        return "id", f"#{value}"
    for key, value in record.items():
        if isinstance(value, (str, int, float, bool)) and _string_value(value):
            return key, _string_value(value)
    return None, f"Record {index}"


def _format_record_field(key: str, value: Any, *, indent: str) -> list[str]:
    label = _humanize_key(key)
    if _is_empty_value(value):
        return []
    if isinstance(value, dict):
        summary = _summarize_dict(value)
        if summary:
            return [f"{indent}- {label}: {summary}"]
        lines = [f"{indent}- {label}:"]
        for child_key, child_value in value.items():
            lines.extend(_format_record_field(child_key, child_value, indent=indent + "  "))
        return lines
    if isinstance(value, list):
        scalar_values = [_string_value(item) for item in value if isinstance(item, (str, int, float, bool)) and _string_value(item)]
        record_values = [item for item in value if isinstance(item, dict)]
        if scalar_values and not record_values:
            return [f"{indent}- {label}: {', '.join(_format_markdown_scalar(item, label) for item in scalar_values)}"]
        lines = [f"{indent}- {label}:"]
        lines.extend(f"{indent}  - {_format_markdown_scalar(item, label)}" for item in scalar_values)
        for item in record_values:
            summary = _summarize_dict(item)
            lines.append(f"{indent}  - {summary or json.dumps(item, ensure_ascii=False)}")
        return lines
    return [f"{indent}- {label}: {_format_markdown_scalar(_string_value(value), label)}"]


def _summarize_dict(value: dict[str, Any]) -> str:
    parts = []
    for key, item in value.items():
        if isinstance(item, (dict, list)) or _is_empty_value(item):
            continue
        parts.append(f"{_humanize_key(key)}: {_string_value(item)}")
    return ", ".join(parts)


def _string_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value).strip()


def _format_markdown_scalar(value: str, label: str) -> str:
    text = _string_value(value)
    if IMAGE_URL_RE.fullmatch(text):
        alt = _humanize_key(label) or "Image"
        return f"![{alt}]({text})"
    if URL_RE.fullmatch(text):
        return f"<{text}>"
    return text


def _render_image_urls_in_markdown(markdown: str) -> str:
    lines: list[str] = []
    in_code_fence = False
    image_context_label = "Image"
    for line in str(markdown or "").splitlines():
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code_fence = not in_code_fence
            lines.append(line)
            continue
        if in_code_fence:
            lines.append(line)
            continue
        rendered = _render_image_url_line(line, image_context_label)
        lines.append(rendered)
        field_only = PLAIN_FIELD_ONLY_RE.match(line)
        if field_only:
            image_context_label = field_only.group(1).strip()
        elif stripped and not IMAGE_BARE_VALUE_RE.match(stripped):
            image_context_label = "Image"
    return "\n".join(lines).strip()


def _render_image_url_line(line: str, image_context_label: str) -> str:
    if "](" in line:
        return line
    field_match = IMAGE_FIELD_VALUE_RE.match(line)
    if field_match:
        return f"{field_match.group(1)}{_format_markdown_scalar(field_match.group(3), field_match.group(2))}"
    bullet_match = IMAGE_BULLET_VALUE_RE.match(line)
    if bullet_match:
        return f"{bullet_match.group(1)}{_format_markdown_scalar(bullet_match.group(2), image_context_label)}"
    bare_match = IMAGE_BARE_VALUE_RE.match(line)
    if bare_match:
        return f"{bare_match.group(1)}{_format_markdown_scalar(bare_match.group(2), image_context_label)}"
    return line


def _is_empty_value(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, dict)):
        return not value
    return False


def _humanize_key(key: str) -> str:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", str(key or ""))
    spaced = spaced.replace("_", " ").replace("-", " ")
    words = " ".join(spaced.split()).split(" ")
    humanized = [
        ACRONYM_LABELS.get(word.lower(), word[:1].upper() + word[1:].lower())
        for word in words
        if word
    ]
    return " ".join(humanized) or "Value"


def _format_flat_dash_records(markdown: str) -> str | None:
    cleaned = _clean_format_offer(markdown)
    all_markers = list(FLAT_RECORD_MARKER_RE.finditer(cleaned))
    if not all_markers:
        return None
    first_marker_label = all_markers[0].group(1).strip()
    repeated_marker_re = re.compile(
        rf"(?<!\w)({re.escape(first_marker_label)})\s+(\d{{1,3}})\s+-\s+"
        r"(?=[A-Za-z][A-Za-z0-9_/]*(?:\s+[A-Za-z][A-Za-z0-9_/]*){0,6}:\s)"
    )
    markers = list(repeated_marker_re.finditer(cleaned))
    if not markers:
        return None
    records: list[str] = []
    for index, marker in enumerate(markers):
        start = marker.end()
        end = markers[index + 1].start() if index + 1 < len(markers) else len(cleaned)
        raw_record = cleaned[start:end].strip()
        record = _format_flat_dash_record(
            marker.group(2),
            f"{marker.group(1).strip()} {marker.group(2)}",
            raw_record,
        )
        if record is None:
            return None
        records.append(record)
    if not records:
        return None
    prefix = cleaned[: markers[0].start()].strip()
    parts: list[str] = []
    if prefix:
        parts.append(prefix)
    parts.extend(records)
    return "\n\n".join(parts)


def _format_flat_dash_record(number: str, fallback_title: str, raw_record: str) -> str | None:
    field_matches = list(FLAT_FIELD_RE.finditer(raw_record))
    if len(field_matches) < 2:
        return None
    fields: list[tuple[str, str]] = []
    for index, match in enumerate(field_matches):
        label = match.group(1).strip()
        start = match.end()
        end = field_matches[index + 1].start() if index + 1 < len(field_matches) else len(raw_record)
        value = _trim_inline_field_value(raw_record[start:end])
        fields.append((label, value))
    title_label, title = _flat_record_title(fields, fallback_title)
    lines = [f"{number}. **{title}**"]
    for label, value in fields:
        if title_label and label.lower() == title_label:
            continue
        lines.extend(_format_inline_record_field(_humanize_key(label), value))
    return "\n".join(lines)


def _flat_record_title(fields: list[tuple[str, str]], fallback_title: str) -> tuple[str | None, str]:
    for label, value in fields:
        normalized = label.lower().replace("_", "").replace("-", "").replace(" ", "")
        if normalized in {"title", "name", "subject", "label", "heading"} and value.strip():
            return label.lower(), value.strip()
    return None, fallback_title


def _format_inline_numbered_records(markdown: str) -> str | None:
    if markdown.count("\n") > 2:
        return None
    markers = list(INLINE_RECORD_MARKER_RE.finditer(markdown))
    if len(markers) < 2:
        return None
    prefix = markdown[: markers[0].start()].strip()
    records: list[str] = []
    suffix = ""
    for index, marker in enumerate(markers):
        start = marker.end()
        end = markers[index + 1].start() if index + 1 < len(markers) else len(markdown)
        raw_record = markdown[start:end].strip()
        if index + 1 == len(markers):
            suffix_match = INLINE_RECORD_SUFFIX_RE.search(raw_record)
            if suffix_match:
                suffix = suffix_match.group(1).strip()
                raw_record = raw_record[: suffix_match.start()].strip()
        record = _format_inline_record(marker.group(1), raw_record)
        if record is None:
            return None
        records.append(record)
    if not records:
        return None
    parts: list[str] = []
    if prefix:
        parts.append(prefix)
    parts.extend(records)
    if suffix:
        parts.append(suffix)
    return "\n\n".join(parts)


def _format_inline_record(number: str, raw_record: str) -> str | None:
    field_matches = list(INLINE_FIELD_RE.finditer(raw_record))
    if len(field_matches) < 2:
        return None
    title = raw_record[: field_matches[0].start()].strip(" -")
    if not title:
        return None
    lines = [f"{number}. **{title}**"]
    for index, match in enumerate(field_matches):
        label = _humanize_key(match.group(1).strip())
        start = match.end()
        end = field_matches[index + 1].start() if index + 1 < len(field_matches) else len(raw_record)
        value = _trim_inline_field_value(raw_record[start:end])
        if not value:
            continue
        lines.extend(_format_inline_record_field(label, value))
    return "\n".join(lines)


def _trim_inline_field_value(value: str) -> str:
    trimmed = str(value or "").strip()
    while trimmed.endswith(" -"):
        trimmed = trimmed[:-2].rstrip()
    return trimmed


def _format_inline_record_field(label: str, value: str) -> list[str]:
    normalized_label = label.lower()
    if normalized_label == "reviews":
        reviews = _split_dash_prefixed_items(value, r"\d+\/\d+\s")
        if len(reviews) > 1:
            return [f"   - {label}:"] + [f"     - {review}" for review in reviews]
    if normalized_label == "images":
        images = _split_dash_prefixed_items(value, r"https?://")
        if len(images) > 1:
            return [f"   - {label}:"] + [f"     - {_format_markdown_scalar(image, label)}" for image in images]
    dash_items = _split_generic_dash_items(value)
    if dash_items:
        return [f"   - {label}:"] + [f"     - {_format_markdown_scalar(item, label)}" for item in dash_items]
    if value:
        return [f"   - {label}: {_format_markdown_scalar(value, label)}"]
    return [f"   - {label}:"]


def _split_dash_prefixed_items(value: str, item_prefix_pattern: str) -> list[str]:
    cleaned = value.strip()
    if cleaned.startswith("- "):
        cleaned = cleaned[2:].strip()
    return [
        item.strip()
        for item in re.split(rf"\s+-\s+(?={item_prefix_pattern})", cleaned)
        if item.strip()
    ]


def _split_generic_dash_items(value: str) -> list[str]:
    cleaned = value.strip()
    if not cleaned.startswith("- "):
        return []
    items = [item.strip() for item in re.split(r"\s+-\s+", cleaned[2:].strip()) if item.strip()]
    return items if len(items) > 1 else []


def _build_native_props(markdown: str, schema: dict[str, Any], constraints: dict[str, Any] | None = None) -> dict[str, Any] | None:
    if schema.get("type") != "object" or not isinstance(schema.get("properties"), dict):
        return None
    properties: dict[str, Any] = schema["properties"]
    required = schema.get("required") if isinstance(schema.get("required"), list) else []
    constraints = constraints or {}
    props: dict[str, Any] = {}
    for name in STRING_CONTENT_PROPS:
        prop_schema = properties.get(name)
        if _is_string_property(prop_schema):
            if not _fits_string_limit(markdown, prop_schema, constraints, "content"):
                return None
            props[name] = markdown
            break
    for name in TITLE_PROPS:
        prop_schema = properties.get(name)
        if _is_string_property(prop_schema):
            title = _extract_title(markdown, fallback="Update")
            if not _fits_string_limit(title, prop_schema, constraints, "title"):
                return None
            props[name] = title
            break
    for key in required:
        if key in props:
            continue
        prop_schema = properties.get(key)
        if not _is_string_property(prop_schema):
            return None
        value = markdown if key in STRING_CONTENT_PROPS else _extract_title(markdown, fallback="Update")
        limit_kind = "content" if key in STRING_CONTENT_PROPS else "title"
        if not _fits_string_limit(value, prop_schema, constraints, limit_kind):
            return None
        props[key] = value
    return props if props else None


def _is_string_property(schema: Any) -> bool:
    return isinstance(schema, dict) and schema.get("type") == "string"


def _fits_string_limit(value: str, schema: Any, constraints: dict[str, Any], kind: str) -> bool:
    limits: list[int] = [MAX_NATIVE_STRING_PROP_CHARS]
    if isinstance(schema, dict) and isinstance(schema.get("maxLength"), int):
        limits.append(schema["maxLength"])
    if kind == "content":
        for key in ("maxContentChars", "maxBodyChars", "maxMarkdownChars", "contentMaxChars"):
            if isinstance(constraints.get(key), int):
                limits.append(constraints[key])
    else:
        for key in ("maxTitleChars", "titleMaxChars"):
            if isinstance(constraints.get(key), int):
                limits.append(constraints[key])
    return not limits or len(value) <= min(limits)


def _props_match_schema(props: dict[str, Any], schema: dict[str, Any]) -> bool:
    if schema.get("type") != "object" or not isinstance(schema.get("properties"), dict):
        return False
    properties: dict[str, Any] = schema["properties"]
    required = schema.get("required") if isinstance(schema.get("required"), list) else []
    if any(key not in props for key in required):
        return False
    if schema.get("additionalProperties") is False and any(key not in properties for key in props):
        return False
    for key, value in props.items():
        prop_schema = properties.get(key)
        if not isinstance(prop_schema, dict):
            if schema.get("additionalProperties") is False:
                return False
            continue
        if prop_schema.get("type") == "string" and not isinstance(value, str):
            return False
        if isinstance(value, str):
            if isinstance(prop_schema.get("minLength"), int) and len(value) < prop_schema["minLength"]:
                return False
            if isinstance(prop_schema.get("maxLength"), int) and len(value) > prop_schema["maxLength"]:
                return False
            enum = prop_schema.get("enum")
            if isinstance(enum, list) and value not in enum:
                return False
    return True


def _native_component_match_score(markdown: str, component: dict[str, Any]) -> int:
    markdown_tokens = _semantic_tokens(markdown)
    if not markdown_tokens:
        return 0
    key = component.get("key") or component.get("componentKey") or component.get("component_key") or ""
    contract = " ".join(
        str(component.get(field) or "")
        for field in ("key", "componentKey", "component_key", "displayName", "display_name", "description", "suitability")
    )
    contract_tokens = _semantic_tokens(contract)
    key_tokens = _semantic_tokens(str(key))
    if not contract_tokens:
        return 0
    return len(markdown_tokens & contract_tokens) + (2 * len(markdown_tokens & key_tokens))


def _semantic_tokens(value: str) -> set[str]:
    tokens = set()
    for token in re.findall(r"[a-z0-9]+", str(value).lower().replace("_", " ")):
        if len(token) < 3 or token in NATIVE_MATCH_STOP_WORDS:
            continue
        tokens.add(token)
    return tokens


def _extract_title(markdown: str, *, fallback: str) -> str:
    heading = re.search(r"^#{1,4}\s+(.+)$", markdown, flags=re.MULTILINE)
    if heading:
        title = _strip_markdown_inline(heading.group(1))
        return title if len(title) <= MAX_CARD_TITLE_CHARS else fallback
    first_sentence = re.split(r"(?<=[.!?])\s+", _strip_markdown_inline(markdown), maxsplit=1)[0]
    if len(first_sentence) > MAX_CARD_TITLE_CHARS:
        return fallback
    return first_sentence.strip(" .,:;-")[:MAX_CARD_TITLE_CHARS] or fallback


def _parse_bullets(markdown: str) -> list[str]:
    items: list[str] = []
    for line in markdown.splitlines():
        match = re.match(r"^\s*[-*]\s+(.+?)\s*$", line)
        if not match:
            continue
        item = _strip_markdown_inline(match.group(1))
        if not item or len(item) > MAX_LIST_ITEM_CHARS:
            return []
        items.append(item)
        if len(items) > MAX_LIST_ITEMS:
            return []
    return items if len(items) >= 2 else []


def _strip_bullets(markdown: str) -> str:
    lines = [line for line in markdown.splitlines() if not re.match(r"^\s*[-*]\s+", line)]
    return " ".join(" ".join(lines).split()).strip()


def _parse_markdown_table(markdown: str) -> dict[str, Any] | None:
    nonblank_lines = [line.strip() for line in markdown.splitlines() if line.strip()]
    if any(not (line.startswith("|") and line.endswith("|")) for line in nonblank_lines):
        return None
    rows = nonblank_lines
    if len(rows) < 3:
        return None
    header = _split_table_row(rows[0])
    separator = _split_table_row(rows[1])
    if not header or not all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in separator):
        return None
    body_rows = [_split_table_row(row) for row in rows[2:]]
    if len(header) > MAX_TABLE_COLUMNS or len(body_rows) > MAX_TABLE_ROWS:
        return None
    if any(len(row) != len(header) for row in body_rows):
        return None
    if any(len(cell) > MAX_TABLE_CELL_CHARS for cell in header):
        return None
    if any(len(cell) > MAX_TABLE_CELL_CHARS for row in body_rows for cell in row):
        return None
    return {
        "title": _extract_title(markdown, fallback="Details"),
        "columns": header,
        "rows": body_rows,
    }


def _looks_like_markdown_table(markdown: str) -> bool:
    rows = [line.strip() for line in markdown.splitlines() if line.strip().startswith("|") and line.strip().endswith("|")]
    return len(rows) >= 3


def _split_table_row(line: str) -> list[str]:
    return [_strip_markdown_inline(cell.strip()) for cell in line.strip().strip("|").split("|")]


def _strip_markdown_inline(value: str) -> str:
    stripped = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    stripped = re.sub(r"[*_`~>#]", "", stripped)
    return " ".join(stripped.split()).strip()
