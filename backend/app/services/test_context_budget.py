import json

from app.services.context_budget import (
    MAX_TOOL_RESULT_TOKENS,
    _get_encoder,
    _hard_truncate,
    _truncate_json_dict,
    count_tokens,
    truncate_tool_result,
)


def test_count_tokens_empty_string():
    assert count_tokens("", "gpt-4o") == 0


def test_count_tokens_nonempty():
    result = count_tokens("hello world", "gpt-4o")
    assert result > 0
    assert isinstance(result, int)


def test_count_tokens_unknown_model_uses_fallback():
    result = count_tokens("hello world", "nonexistent-model-xyz")
    assert result > 0


def test_count_tokens_default_model():
    assert count_tokens("test") == count_tokens("test", "gpt-4o")


def test_count_tokens_large_string_matches_encoder():
    text = "word " * 4_000
    encoder = _get_encoder("gpt-4o")
    assert count_tokens(text, "gpt-4o") == len(encoder.encode(text))


def test_count_tokens_stop_at_short_circuits_large_text():
    result = count_tokens("x" * 200_000, "gpt-4o", stop_at=1_000)
    assert result > 1_000


def test_get_encoder_caches():
    enc1 = _get_encoder("gpt-4o")
    enc2 = _get_encoder("gpt-4o")
    assert enc1 is enc2


def test_truncate_tool_result_small_content_unchanged():
    content = json.dumps({"status": "ok"})
    assert truncate_tool_result(content, "gpt-4o") == content


def test_truncate_tool_result_strips_screenshot():
    data = {"status_code": 200, "body": {"elements": [{"id": 1}], "screenshot": "A" * 100_000}}
    content = json.dumps(data)
    result = truncate_tool_result(content, "gpt-4o")
    parsed = json.loads(result)
    assert parsed["body"]["screenshot"] == "[truncated]"
    assert count_tokens(result, "gpt-4o") <= MAX_TOOL_RESULT_TOKENS


def test_truncate_tool_result_trims_elements_list():
    elements = [{"id": i, "tag": "button", "text": f"Element {i}" * 20} for i in range(200)]
    data = {"status_code": 200, "body": {"elements": elements}}
    content = json.dumps(data)
    assert count_tokens(content, "gpt-4o") > MAX_TOOL_RESULT_TOKENS
    result = truncate_tool_result(content, "gpt-4o")
    assert count_tokens(result, "gpt-4o") <= MAX_TOOL_RESULT_TOKENS
    parsed = json.loads(result)
    assert len(parsed["body"]["elements"]) < 200


def test_truncate_tool_result_hard_truncate_fallback():
    content = "word " * 14_000
    result = truncate_tool_result(content, "gpt-4o")
    assert count_tokens(result, "gpt-4o") <= MAX_TOOL_RESULT_TOKENS
    assert result.endswith("...[content truncated to fit context window]")


def test_truncate_json_dict_strips_multiple_fields():
    data = {
        "screenshot": "B" * 5000,
        "body": {"image": "C" * 5000, "elements": [1, 2]},
    }
    result = _truncate_json_dict(data, "gpt-4o", 500)
    assert result["screenshot"] == "[truncated]"
    assert result["body"]["image"] == "[truncated]"


def test_truncate_json_dict_trims_long_strings():
    data = {"body": {"description": "z" * 10_000}}
    result = _truncate_json_dict(data, "gpt-4o", 500)
    assert len(result["body"]["description"]) <= 2020


def test_hard_truncate_preserves_marker():
    content = "word " * 50_000
    result = _hard_truncate(content, "gpt-4o", 100)
    assert result.endswith("...[content truncated to fit context window]")
    assert count_tokens(result, "gpt-4o") <= 100


def test_hard_truncate_within_budget():
    content = "short text"
    assert _hard_truncate(content, "gpt-4o", 1000) == content
