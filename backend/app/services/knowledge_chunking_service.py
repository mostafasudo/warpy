from ..core.llm_config import llm_config


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


def chunk_elements(elements: list[dict]) -> list[dict]:
    max_chars = llm_config.kb_chunk_max_chars
    overlap_chars = llm_config.kb_chunk_overlap_chars
    chunks: list[dict] = []
    current_text = ""
    current_types: list[str] = []
    current_pages: list[int] = []

    for element in elements:
        text = (element.get("text") or "").strip()
        if not text:
            continue
        element_type = element.get("type", "")
        meta = element.get("metadata") or {}
        pages = _extract_page_numbers(meta)

        if current_text and len(current_text) + len(text) + 1 > max_chars:
            chunks.append({
                "content": current_text,
                "metadata": {"element_types": current_types, "page_numbers": current_pages},
            })
            overlap = current_text[-overlap_chars:] if len(current_text) > overlap_chars else current_text
            current_text = (overlap + "\n\n" + text).strip() if overlap else text
            current_types = [element_type]
            current_pages = list(pages)
        else:
            separator = "\n\n" if element_type in ("Title", "Header") else " "
            current_text = (current_text + separator + text).strip() if current_text else text
            current_types.append(element_type)
            current_pages = _merge_page_numbers(current_pages, pages)

    if current_text:
        chunks.append({
            "content": current_text,
            "metadata": {"element_types": current_types, "page_numbers": current_pages},
        })

    return chunks
