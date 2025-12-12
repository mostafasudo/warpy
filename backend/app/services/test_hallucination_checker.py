import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

from langchain_core.messages import AIMessage, SystemMessage, HumanMessage

from app.services.hallucination_checker import CheckResult, HallucinationChecker, CHECKER_SYSTEM_PROMPT


def make_mock_llm():
    llm = MagicMock()
    llm.ainvoke = AsyncMock()
    return llm


def test_check_returns_allow_for_valid_response():
    llm = make_mock_llm()
    llm.ainvoke.return_value = AIMessage(content=json.dumps({"mode": "ALLOW"}))
    checker = HallucinationChecker(llm_client=llm)
    result = asyncio.run(checker.check(
        user_input="Create a new user",
        agent_response="I've created the user account for you.",
        system_prompt="You are a dashboard assistant."
    ))
    assert result.mode == "ALLOW"
    assert result.feedback is None


def test_check_returns_block_for_out_of_scope():
    llm = make_mock_llm()
    llm.ainvoke.return_value = AIMessage(content=json.dumps({"mode": "BLOCK"}))
    checker = HallucinationChecker(llm_client=llm)
    result = asyncio.run(checker.check(
        user_input="What's 1+1?",
        agent_response="The answer is 2.",
        system_prompt="You are a dashboard assistant."
    ))
    assert result.mode == "BLOCK"
    assert result.feedback is None


def test_check_returns_adjust_with_feedback():
    llm = make_mock_llm()
    llm.ainvoke.return_value = AIMessage(content=json.dumps({"mode": "ADJUST", "feedback": "Response should focus on dashboard actions."}))
    checker = HallucinationChecker(llm_client=llm)
    result = asyncio.run(checker.check(
        user_input="Help me",
        agent_response="I can help with many things.",
        system_prompt="You are a dashboard assistant."
    ))
    assert result.mode == "ADJUST"
    assert result.feedback == "Response should focus on dashboard actions."


def test_check_returns_allow_for_empty_response():
    llm = make_mock_llm()
    checker = HallucinationChecker(llm_client=llm)
    result = asyncio.run(checker.check(
        user_input="test",
        agent_response="",
        system_prompt="You are a dashboard assistant."
    ))
    assert result.mode == "ALLOW"
    llm.ainvoke.assert_not_called()


def test_check_returns_allow_for_whitespace_response():
    llm = make_mock_llm()
    checker = HallucinationChecker(llm_client=llm)
    result = asyncio.run(checker.check(
        user_input="test",
        agent_response="   ",
        system_prompt="You are a dashboard assistant."
    ))
    assert result.mode == "ALLOW"
    llm.ainvoke.assert_not_called()


def test_check_returns_allow_on_api_error():
    llm = make_mock_llm()
    llm.ainvoke.side_effect = Exception("API error")
    checker = HallucinationChecker(llm_client=llm)
    result = asyncio.run(checker.check(
        user_input="test",
        agent_response="Some response",
        system_prompt="You are a dashboard assistant."
    ))
    assert result.mode == "ALLOW"


def test_check_returns_allow_on_invalid_json():
    llm = make_mock_llm()
    llm.ainvoke.return_value = AIMessage(content="not json")
    checker = HallucinationChecker(llm_client=llm)
    result = asyncio.run(checker.check(
        user_input="test",
        agent_response="Some response",
        system_prompt="You are a dashboard assistant."
    ))
    assert result.mode == "ALLOW"


def test_check_defaults_to_allow_for_invalid_mode():
    llm = make_mock_llm()
    llm.ainvoke.return_value = AIMessage(content=json.dumps({"mode": "INVALID"}))
    checker = HallucinationChecker(llm_client=llm)
    result = asyncio.run(checker.check(
        user_input="test",
        agent_response="Some response",
        system_prompt="You are a dashboard assistant."
    ))
    assert result.mode == "ALLOW"


def test_check_ignores_feedback_when_not_adjust():
    llm = make_mock_llm()
    llm.ainvoke.return_value = AIMessage(content=json.dumps({"mode": "ALLOW", "feedback": "This should be ignored"}))
    checker = HallucinationChecker(llm_client=llm)
    result = asyncio.run(checker.check(
        user_input="test",
        agent_response="Some response",
        system_prompt="You are a dashboard assistant."
    ))
    assert result.mode == "ALLOW"
    assert result.feedback is None


def test_check_sends_correct_payload():
    llm = make_mock_llm()
    llm.ainvoke.return_value = AIMessage(content=json.dumps({"mode": "ALLOW"}))
    checker = HallucinationChecker(llm_client=llm)
    asyncio.run(checker.check(
        user_input="Create user",
        agent_response="User created.",
        system_prompt="Dashboard assistant."
    ))
    call_args = llm.ainvoke.call_args
    messages = call_args.args[0]
    assert isinstance(messages[0], SystemMessage)
    assert messages[0].content == CHECKER_SYSTEM_PROMPT
    assert isinstance(messages[1], HumanMessage)
    payload = json.loads(messages[1].content)
    assert payload["system_prompt"] == "Dashboard assistant."
    assert payload["user_input"] == "Create user"
    assert payload["agent_response"] == "User created."


def test_check_uses_json_response_format():
    llm = make_mock_llm()
    llm.ainvoke.return_value = AIMessage(content=json.dumps({"mode": "ALLOW"}))
    checker = HallucinationChecker(llm_client=llm)
    asyncio.run(checker.check(
        user_input="test",
        agent_response="response",
        system_prompt="prompt"
    ))
    call_args = llm.ainvoke.call_args
    assert call_args.kwargs["response_format"] == {"type": "json_object"}


def test_check_handles_empty_message_content():
    llm = make_mock_llm()
    llm.ainvoke.return_value = AIMessage(content="")
    checker = HallucinationChecker(llm_client=llm)
    result = asyncio.run(checker.check(
        user_input="test",
        agent_response="response",
        system_prompt="prompt"
    ))
    assert result.mode == "ALLOW"


def test_check_result_dataclass():
    result = CheckResult(mode="BLOCK", feedback="test feedback")
    assert result.mode == "BLOCK"
    assert result.feedback == "test feedback"


def test_check_result_default_feedback():
    result = CheckResult(mode="ALLOW")
    assert result.mode == "ALLOW"
    assert result.feedback is None
