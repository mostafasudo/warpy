import json

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from app.services.context_budget import (
    DEFAULT_CONTEXT_LIMIT,
    IMAGE_TOKEN_COST_HIGH,
    IMAGE_TOKEN_COST_LOW,
    MAX_TOOL_RESULT_TOKENS,
    MIN_RESPONSE_HEADROOM,
    MODEL_CONTEXT_LIMITS,
    RESPONSE_HEADROOM_RATIO,
    _count_content_tokens,
    _get_encoder,
    _get_tool_call_id,
    _hard_truncate,
    _truncate_json_dict,
    count_message_tokens,
    count_messages_tokens,
    count_tokens,
    get_context_limit,
    get_token_budget,
    prune_messages,
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


def test_get_encoder_caches():
    enc1 = _get_encoder("gpt-4o")
    enc2 = _get_encoder("gpt-4o")
    assert enc1 is enc2


def test_get_tool_call_id_dict():
    assert _get_tool_call_id({"id": "c1", "name": "t"}) == "c1"


def test_get_tool_call_id_object():
    class FakeToolCall:
        id = "c2"
    assert _get_tool_call_id(FakeToolCall()) == "c2"


def test_get_tool_call_id_none():
    assert _get_tool_call_id({}) is None
    assert _get_tool_call_id(object()) is None


def test_count_message_tokens_system():
    msg = SystemMessage(content="You are helpful.")
    tokens = count_message_tokens(msg, "gpt-4o")
    assert tokens > 4


def test_count_message_tokens_human():
    msg = HumanMessage(content="Hello")
    tokens = count_message_tokens(msg, "gpt-4o")
    assert tokens >= 5


def test_count_message_tokens_ai_without_tool_calls():
    msg = AIMessage(content="Sure, I can help.")
    tokens = count_message_tokens(msg, "gpt-4o")
    assert tokens > 4


def test_count_message_tokens_ai_with_tool_calls():
    msg = AIMessage(
        content="",
        tool_calls=[{"id": "call-1", "name": "find_tools", "args": {"query": "test"}}],
    )
    tokens_with = count_message_tokens(msg, "gpt-4o")
    msg_no_tools = AIMessage(content="")
    tokens_without = count_message_tokens(msg_no_tools, "gpt-4o")
    assert tokens_with > tokens_without


def test_count_message_tokens_tool():
    msg = ToolMessage(content='{"status": "ok"}', tool_call_id="call-1")
    tokens = count_message_tokens(msg, "gpt-4o")
    assert tokens > 4


def test_count_content_tokens_string():
    tokens = _count_content_tokens("hello world", "gpt-4o")
    assert tokens == count_tokens("hello world", "gpt-4o")


def test_count_content_tokens_empty_string():
    assert _count_content_tokens("", "gpt-4o") == 0


def test_count_content_tokens_image_low_detail():
    content = [
        {"type": "text", "text": "page tree"},
        {"type": "image_url", "image_url": {"url": "data:image/webp;base64,abc", "detail": "low"}},
    ]
    tokens = _count_content_tokens(content, "gpt-4o")
    assert tokens == count_tokens("page tree", "gpt-4o") + IMAGE_TOKEN_COST_LOW


def test_count_content_tokens_image_high_detail():
    content = [
        {"type": "text", "text": "desc"},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,abc", "detail": "high"}},
    ]
    tokens = _count_content_tokens(content, "gpt-4o")
    assert tokens == count_tokens("desc", "gpt-4o") + IMAGE_TOKEN_COST_HIGH


def test_count_content_tokens_image_default_detail():
    content = [
        {"type": "image_url", "image_url": {"url": "data:image/webp;base64,abc"}},
    ]
    tokens = _count_content_tokens(content, "gpt-4o")
    assert tokens == IMAGE_TOKEN_COST_HIGH


def test_count_content_tokens_none():
    assert _count_content_tokens(None, "gpt-4o") == 0


def test_count_message_tokens_multimodal_tool():
    content = [
        {"type": "text", "text": '{"tree": "..."}'},
        {"type": "image_url", "image_url": {"url": "data:image/webp;base64,abc", "detail": "low"}},
    ]
    msg = ToolMessage(content=content, tool_call_id="call-1")
    tokens = count_message_tokens(msg, "gpt-4o")
    expected = 4 + count_tokens('{"tree": "..."}', "gpt-4o") + IMAGE_TOKEN_COST_LOW
    assert tokens == expected


def test_count_message_tokens_empty_content():
    msg = AIMessage(content="")
    tokens = count_message_tokens(msg, "gpt-4o")
    assert tokens == 4


def test_count_messages_tokens_sums():
    msgs = [
        SystemMessage(content="system"),
        HumanMessage(content="hello"),
    ]
    total = count_messages_tokens(msgs, "gpt-4o")
    individual = sum(count_message_tokens(m, "gpt-4o") for m in msgs)
    assert total == individual


def test_count_messages_tokens_empty():
    assert count_messages_tokens([], "gpt-4o") == 0


def test_get_context_limit_known_models():
    for model, expected in MODEL_CONTEXT_LIMITS.items():
        assert get_context_limit(model) == expected


def test_get_context_limit_unknown():
    assert get_context_limit("unknown-model") == DEFAULT_CONTEXT_LIMIT


def test_get_token_budget_reserves_headroom():
    budget = get_token_budget("gpt-4o")
    limit = get_context_limit("gpt-4o")
    headroom = max(int(limit * RESPONSE_HEADROOM_RATIO), MIN_RESPONSE_HEADROOM)
    assert budget == limit - headroom


def test_get_token_budget_min_headroom():
    budget = get_token_budget("gpt-4o")
    limit = get_context_limit("gpt-4o")
    assert budget < limit
    assert budget > 0


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
    content = "x" * 200_000
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


def test_prune_messages_within_budget():
    msgs = [
        SystemMessage(content="sys"),
        HumanMessage(content="hi"),
    ]
    result = prune_messages(msgs, "gpt-4o")
    assert result == msgs


def test_prune_messages_empty():
    assert prune_messages([], "gpt-4o") == []


def test_prune_messages_preserves_system_and_last_human():
    sys_msg = SystemMessage(content="system")
    human_msg = HumanMessage(content="question")
    tool_msg = ToolMessage(content="x" * 100_000, tool_call_id="c1")
    ai_msg = AIMessage(content="", tool_calls=[{"id": "c1", "name": "t", "args": {}}])
    msgs = [sys_msg, ai_msg, tool_msg, human_msg]
    result = prune_messages(msgs, "gpt-4o", budget=500)
    assert result[0] is sys_msg
    assert any(m is human_msg for m in result)


def test_prune_messages_removes_tool_messages_first():
    sys_msg = SystemMessage(content="system")
    h1 = HumanMessage(content="first")
    a1 = AIMessage(content="resp1")
    ai_tool = AIMessage(content="", tool_calls=[{"id": "c1", "name": "t", "args": {}}])
    tool_msg = ToolMessage(content="x" * 50_000, tool_call_id="c1")
    human_last = HumanMessage(content="latest question")
    msgs = [sys_msg, h1, a1, ai_tool, tool_msg, human_last]
    budget = count_messages_tokens([sys_msg, h1, a1, human_last], "gpt-4o") + 50
    result = prune_messages(msgs, "gpt-4o", budget=budget)
    assert not any(isinstance(m, ToolMessage) for m in result)
    assert any(m is human_last for m in result)
    assert result[0] is sys_msg


def test_prune_messages_preserves_last_and_human():
    sys_msg = SystemMessage(content="sys")
    old_tool_ai = AIMessage(content="", tool_calls=[{"id": "c1", "name": "t", "args": {}}])
    old_tool = ToolMessage(content="big " * 20_000, tool_call_id="c1")
    recent1 = HumanMessage(content="recent q")
    recent2 = AIMessage(content="recent a")
    recent3 = HumanMessage(content="latest")
    msgs = [sys_msg, old_tool_ai, old_tool, recent1, recent2, recent3]
    budget = count_messages_tokens([sys_msg, recent1, recent2, recent3], "gpt-4o") + 100
    result = prune_messages(msgs, "gpt-4o", budget=budget)
    assert recent3 in result
    assert result[0] is sys_msg
    assert not any(isinstance(m, ToolMessage) for m in result)


def test_prune_messages_removes_orphaned_ai():
    sys_msg = SystemMessage(content="sys")
    ai_msg = AIMessage(content="", tool_calls=[{"id": "c1", "name": "tool", "args": {}}])
    tool_msg = ToolMessage(content="large " * 10_000, tool_call_id="c1")
    human = HumanMessage(content="q")
    msgs = [sys_msg, ai_msg, tool_msg, human]
    budget = count_messages_tokens([sys_msg, human], "gpt-4o") + 50
    result = prune_messages(msgs, "gpt-4o", budget=budget)
    assert not any(isinstance(m, ToolMessage) for m in result)
    assert not any(isinstance(m, AIMessage) and m.tool_calls for m in result)


def test_prune_messages_keeps_ai_if_not_all_tools_removed():
    sys_msg = SystemMessage(content="sys")
    ai_msg = AIMessage(
        content="",
        tool_calls=[
            {"id": "c1", "name": "t1", "args": {}},
            {"id": "c2", "name": "t2", "args": {}},
        ],
    )
    tool1 = ToolMessage(content="small result", tool_call_id="c1")
    tool2 = ToolMessage(content="x" * 50_000, tool_call_id="c2")
    human = HumanMessage(content="q")
    msgs = [sys_msg, ai_msg, tool1, tool2, human]
    target_tokens = count_messages_tokens([sys_msg, ai_msg, tool1, human], "gpt-4o")
    budget = target_tokens + 100
    result = prune_messages(msgs, "gpt-4o", budget=budget)
    has_ai_with_calls = any(isinstance(m, AIMessage) and m.tool_calls for m in result)
    has_tool1 = any(
        isinstance(m, ToolMessage) and getattr(m, "tool_call_id", None) == "c1"
        for m in result
    )
    has_tool2 = any(
        isinstance(m, ToolMessage) and getattr(m, "tool_call_id", None) == "c2"
        for m in result
    )
    assert not has_tool2, "Large tool2 should be removed"
    assert has_tool1, "Small tool1 should be retained"
    assert has_ai_with_calls, "AIMessage should be kept when tool1 is retained"


def test_prune_messages_single_oversized_tool():
    sys_msg = SystemMessage(content="sys")
    human = HumanMessage(content="q")
    ai = AIMessage(content="ok")
    tool = ToolMessage(content="z" * 200_000, tool_call_id="c1")
    msgs = [sys_msg, human, ai, tool]
    result = prune_messages(msgs, "gpt-4o", budget=500)
    assert result[0] is sys_msg
    assert any(isinstance(m, HumanMessage) for m in result)


def test_prune_messages_no_orphan_tool_without_parent_ai():
    sys_msg = SystemMessage(content="sys")
    filler1 = HumanMessage(content="old question")
    filler2 = AIMessage(content="old answer " * 500)
    ai_tool = AIMessage(content="", tool_calls=[{"id": "c1", "name": "ctx", "args": {}}])
    tool_msg = ToolMessage(content="small result", tool_call_id="c1")
    human = HumanMessage(content="latest")
    msgs = [sys_msg, filler1, filler2, ai_tool, tool_msg, human]
    budget = count_messages_tokens([sys_msg, filler1, tool_msg, human], "gpt-4o") - 10
    result = prune_messages(msgs, "gpt-4o", budget=budget)
    retained_tool_ids = {
        getattr(m, "tool_call_id", None)
        for m in result
        if isinstance(m, ToolMessage)
    }
    retained_ai_call_ids: set[str | None] = set()
    for m in result:
        if isinstance(m, AIMessage) and m.tool_calls:
            for c in m.tool_calls:
                retained_ai_call_ids.add(c.get("id") if isinstance(c, dict) else getattr(c, "id", None))
    for tid in retained_tool_ids:
        if tid is not None:
            assert tid in retained_ai_call_ids, f"ToolMessage {tid} has no parent AIMessage"


def test_prune_messages_no_orphan_ai_without_tool_results():
    sys_msg = SystemMessage(content="sys")
    ai_tool = AIMessage(content="", tool_calls=[{"id": "c1", "name": "ctx", "args": {}}])
    tool_msg = ToolMessage(content="big " * 20_000, tool_call_id="c1")
    human = HumanMessage(content="latest")
    msgs = [sys_msg, ai_tool, tool_msg, human]
    budget = count_messages_tokens([sys_msg, ai_tool, human], "gpt-4o") + 50
    result = prune_messages(msgs, "gpt-4o", budget=budget)
    for m in result:
        if isinstance(m, AIMessage) and m.tool_calls:
            call_ids = {c.get("id") if isinstance(c, dict) else getattr(c, "id", None) for c in m.tool_calls}
            has_result = any(
                isinstance(r, ToolMessage) and getattr(r, "tool_call_id", None) in call_ids
                for r in result
            )
            assert has_result, "AIMessage with tool_calls has no matching ToolMessage"
