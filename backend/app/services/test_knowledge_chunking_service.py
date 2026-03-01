from unittest.mock import patch

from app.services.knowledge_chunking_service import chunk_elements, _extract_page_numbers, _merge_page_numbers


def test_empty_elements_returns_empty():
    assert chunk_elements([]) == []


def test_single_element():
    elements = [{"type": "NarrativeText", "text": "Hello world", "metadata": {"page_number": 1}}]
    chunks = chunk_elements(elements)
    assert len(chunks) == 1
    assert chunks[0]["content"] == "Hello world"
    assert chunks[0]["metadata"]["page_numbers"] == [1]
    assert chunks[0]["metadata"]["element_types"] == ["NarrativeText"]


def test_elements_merge_within_limit():
    elements = [
        {"type": "NarrativeText", "text": "First sentence.", "metadata": {"page_number": 1}},
        {"type": "NarrativeText", "text": "Second sentence.", "metadata": {"page_number": 1}},
    ]
    chunks = chunk_elements(elements)
    assert len(chunks) == 1
    assert "First sentence." in chunks[0]["content"]
    assert "Second sentence." in chunks[0]["content"]


def test_title_gets_double_newline_separator():
    elements = [
        {"type": "NarrativeText", "text": "Intro text.", "metadata": {}},
        {"type": "Title", "text": "Chapter 2", "metadata": {}},
    ]
    chunks = chunk_elements(elements)
    assert len(chunks) == 1
    assert "\n\n" in chunks[0]["content"]


@patch("app.services.knowledge_chunking_service.llm_config")
def test_elements_split_on_max_chars(mock_config):
    mock_config.kb_chunk_max_chars = 50
    mock_config.kb_chunk_overlap_chars = 10
    elements = [
        {"type": "NarrativeText", "text": "A" * 40, "metadata": {"page_number": 1}},
        {"type": "NarrativeText", "text": "B" * 40, "metadata": {"page_number": 2}},
    ]
    chunks = chunk_elements(elements)
    assert len(chunks) == 2
    assert chunks[0]["content"].startswith("A")
    assert chunks[1]["metadata"]["element_types"] == ["NarrativeText"]


@patch("app.services.knowledge_chunking_service.llm_config")
def test_overlap_included_in_next_chunk(mock_config):
    mock_config.kb_chunk_max_chars = 30
    mock_config.kb_chunk_overlap_chars = 10
    elements = [
        {"type": "NarrativeText", "text": "A" * 25, "metadata": {}},
        {"type": "NarrativeText", "text": "B" * 25, "metadata": {}},
    ]
    chunks = chunk_elements(elements)
    assert len(chunks) == 2
    assert "A" in chunks[1]["content"]


def test_empty_text_elements_skipped():
    elements = [
        {"type": "NarrativeText", "text": "", "metadata": {}},
        {"type": "NarrativeText", "text": "   ", "metadata": {}},
        {"type": "NarrativeText", "text": "Real content", "metadata": {}},
    ]
    chunks = chunk_elements(elements)
    assert len(chunks) == 1
    assert chunks[0]["content"] == "Real content"


def test_missing_text_key_skipped():
    elements = [{"type": "NarrativeText", "metadata": {}}]
    chunks = chunk_elements(elements)
    assert chunks == []


def test_extract_page_numbers_with_int():
    assert _extract_page_numbers({"page_number": 5}) == [5]


def test_extract_page_numbers_without_int():
    assert _extract_page_numbers({}) == []
    assert _extract_page_numbers({"page_number": "five"}) == []


def test_merge_page_numbers_deduplicates():
    assert _merge_page_numbers([1, 2], [2, 3]) == [1, 2, 3]
    assert _merge_page_numbers([], [1]) == [1]
