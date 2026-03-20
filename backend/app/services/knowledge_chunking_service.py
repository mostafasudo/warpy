from __future__ import annotations

import re
from typing import Any

from ..core.llm_config import llm_config


# SECTION-AWARE CHUNKING
# elements -> section groups (by headings) -> bounded chunks -> search text
SECTION_HEADING_TYPES = {"Title", "Header", "Heading"}
LATIN_LETTER_PATTERN = re.compile(r"[A-Za-z]")
ARABIC_LETTER_PATTERN = re.compile(r"[\u0600-\u06FF]")


def _extract_page_numbers(metadata: dict) -> list[int]:
    page = metadata.get("page_number")
    if isinstance(page, int):
        return [page]
    return []


def _merge_page_numbers(existing: list[int], new_pages: list[int]) -> list[int]:
    merged = list(existing)
    for page in new_pages:
        if page not in merged:
            merged.append(page)
    return merged


def infer_content_language(text: str) -> str | None:
    if not text:
        return None
    latin_count = len(LATIN_LETTER_PATTERN.findall(text))
    arabic_count = len(ARABIC_LETTER_PATTERN.findall(text))
    total_letters = latin_count + arabic_count
    if total_letters == 0:
        return None
    if arabic_count / total_letters >= 0.2:
        return "arabic"
    if latin_count / total_letters >= 0.6:
        return "english"
    return None


def build_chunk_search_text(
    content: str,
    *,
    document_title: str | None = None,
    section_title: str | None = None,
    source_url: str | None = None,
) -> str:
    parts: list[str] = []
    seen: set[str] = set()
    for value in (document_title, section_title, source_url, content):
        normalized = " ".join(str(value or "").split()).strip()
        if not normalized:
            continue
        lowered = normalized.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        parts.append(normalized)
    return "\n".join(parts)


def _split_oversized_text(text: str, max_chars: int, overlap_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]

    chunks: list[str] = []
    start = 0
    min_split = max(1, max_chars // 2)

    while start < len(text):
        end = min(len(text), start + max_chars)
        if end >= len(text):
            chunk = text[start:].strip()
            if chunk:
                chunks.append(chunk)
            break

        split_at = text.rfind("\n", start, end)
        if split_at - start < min_split:
            split_at = text.rfind(" ", start, end)
        if split_at <= start:
            split_at = end

        chunk = text[start:split_at].strip()
        if chunk:
            chunks.append(chunk)

        next_start = max(split_at - overlap_chars, start + 1)
        if next_start <= start:
            next_start = split_at
        start = next_start

    return chunks


def _new_section() -> dict[str, Any]:
    return {"parts": [], "section_title": None, "element_types": [], "page_numbers": []}


def _append_section_chunks(section: dict[str, Any], chunks: list[dict[str, Any]], max_chars: int, overlap_chars: int) -> None:
    if not section["parts"]:
        return

    current_text = ""
    current_types: list[str] = []
    current_pages: list[int] = []

    for element_type, text, pages in section["parts"]:
        if len(text) > max_chars:
            if current_text:
                chunks.append({
                    "content": current_text,
                    "metadata": {"element_types": current_types, "page_numbers": current_pages},
                    "section_title": section["section_title"],
                })
                current_text = ""
                current_types = []
                current_pages = []

            for part in _split_oversized_text(text, max_chars, overlap_chars):
                chunks.append({
                    "content": part,
                    "metadata": {"element_types": [element_type], "page_numbers": list(pages)},
                    "section_title": section["section_title"],
                })
            continue

        if current_text and len(current_text) + len(text) + 1 > max_chars:
            chunks.append({
                "content": current_text,
                "metadata": {"element_types": current_types, "page_numbers": current_pages},
                "section_title": section["section_title"],
            })
            overlap = current_text[-overlap_chars:] if len(current_text) > overlap_chars else current_text
            current_text = (overlap + "\n\n" + text).strip() if overlap else text
            current_types = [element_type]
            current_pages = list(pages)
            continue

        separator = "\n\n" if element_type in SECTION_HEADING_TYPES else " "
        current_text = (current_text + separator + text).strip() if current_text else text
        current_types.append(element_type)
        current_pages = _merge_page_numbers(current_pages, pages)

    if current_text:
        chunks.append({
            "content": current_text,
            "metadata": {"element_types": current_types, "page_numbers": current_pages},
            "section_title": section["section_title"],
        })


def chunk_elements(elements: list[dict]) -> list[dict]:
    max_chars = llm_config.kb_chunk_max_chars
    overlap_chars = llm_config.kb_chunk_overlap_chars
    chunks: list[dict] = []
    current_section = _new_section()
    pending_heading: tuple[str, list[int], str] | None = None

    for element in elements:
        text = (element.get("text") or "").strip()
        if not text:
            continue
        element_type = element.get("type", "")
        meta = element.get("metadata") or {}
        pages = _extract_page_numbers(meta)

        if element_type in SECTION_HEADING_TYPES:
            if pending_heading is not None:
                standalone_heading, heading_pages, heading_type = pending_heading
                current_section["section_title"] = standalone_heading
                current_section["parts"].append((heading_type, standalone_heading, heading_pages))
                current_section["element_types"].append(heading_type)
                current_section["page_numbers"] = _merge_page_numbers(current_section["page_numbers"], heading_pages)
                _append_section_chunks(current_section, chunks, max_chars, overlap_chars)
                current_section = _new_section()
            elif current_section["parts"]:
                _append_section_chunks(current_section, chunks, max_chars, overlap_chars)
                current_section = _new_section()
            pending_heading = (text, pages, element_type)
            continue

        if pending_heading is not None:
            heading_text, heading_pages, heading_type = pending_heading
            current_section["section_title"] = heading_text
            current_section["parts"].append((heading_type, heading_text, heading_pages))
            current_section["element_types"].append(heading_type)
            current_section["page_numbers"] = _merge_page_numbers(current_section["page_numbers"], heading_pages)
            pending_heading = None

        current_section["parts"].append((element_type, text, pages))
        current_section["element_types"].append(element_type)
        current_section["page_numbers"] = _merge_page_numbers(current_section["page_numbers"], pages)

    if pending_heading is not None:
        heading_text, heading_pages, heading_type = pending_heading
        if not current_section["parts"] and chunks:
            merged_content = f"{chunks[-1]['content']}\n\n{heading_text}".strip()
            if len(merged_content) <= max_chars:
                chunks[-1]["content"] = merged_content
                chunks[-1]["metadata"]["element_types"].append(heading_type)
                chunks[-1]["metadata"]["page_numbers"] = _merge_page_numbers(
                    chunks[-1]["metadata"]["page_numbers"],
                    heading_pages,
                )
                return chunks
        if current_section["section_title"] is None:
            current_section["section_title"] = heading_text
        current_section["parts"].append((heading_type, heading_text, heading_pages))
        current_section["element_types"].append(heading_type)
        current_section["page_numbers"] = _merge_page_numbers(current_section["page_numbers"], heading_pages)

    _append_section_chunks(current_section, chunks, max_chars, overlap_chars)
    return chunks
