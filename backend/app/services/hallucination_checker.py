import json
from dataclasses import dataclass
from typing import Any, Literal

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from ..core.config import get_settings
from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info

CHECKER_SYSTEM_PROMPT = """You review an AI assistant's response for alignment with its intended purpose.

The assistant is a dashboard helper that:
- Discovers and executes available dashboard actions
- Communicates in a friendly, non-technical way
- Stays strictly within the scope of configured dashboard actions

Your task:
1. Compare the assistant's response against its system prompt
2. Determine if the response is aligned with the assistant's purpose

Modes:
- BLOCK: Response is clearly malicious or obviously out-of-scope
  Examples: math problems ("What's 1+1?"), entertainment ("Top TV shows"), coding help, general knowledge
- ADJUST: Response is slightly off, contains factual errors, or could be improved
  Return feedback to guide the assistant
- ALLOW: Response is acceptable and aligned with purpose (default)

Always ALLOW:
- Error messages about failed actions (e.g., "There was a problem", "The action couldn't be completed")
- Explanations of why an action failed or what went wrong
- Requests for clarification or missing information needed to perform an action

Be lenient - only BLOCK when clearly out of scope. Prefer ALLOW or ADJUST for edge cases.

Respond with JSON: {"mode": "ALLOW|ADJUST|BLOCK", "feedback": "optional feedback for ADJUST mode"}"""


@dataclass
class CheckResult:
    mode: Literal["BLOCK", "ADJUST", "ALLOW"]
    feedback: str | None = None


class HallucinationChecker:
    def __init__(self, llm_client: Any | None = None):
        settings = get_settings()
        self._llm = llm_client or ChatOpenAI(
            model=llm_config.chat_model,
            temperature=0,
            api_key=settings.openai_api_key
        )

    async def check(
        self,
        user_input: str,
        agent_response: str,
        system_prompt: str
    ) -> CheckResult:
        if not agent_response or not agent_response.strip():
            return CheckResult(mode="ALLOW")
        try:
            payload = {
                "system_prompt": system_prompt,
                "user_input": user_input,
                "agent_response": agent_response
            }
            response = await self._llm.ainvoke(
                [
                    SystemMessage(content=CHECKER_SYSTEM_PROMPT),
                    HumanMessage(content=json.dumps(payload))
                ],
                config={"tags": ["hallucination-checker"]},
                response_format={"type": "json_object"}
            )
            message = response.content or ""
            parsed = json.loads(message)
            mode = parsed.get("mode", "ALLOW")
            if mode not in ("BLOCK", "ADJUST", "ALLOW"):
                mode = "ALLOW"
            feedback = parsed.get("feedback") if mode == "ADJUST" else None
            log_info("HallucinationChecker", "check", f"Result: {mode}")
            return CheckResult(mode=mode, feedback=feedback)
        except Exception as error:
            log_error("HallucinationChecker", "check", "Check failed", exc=error)
            return CheckResult(mode="ALLOW")

