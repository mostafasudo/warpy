import json
import re
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from redis import Redis
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.llm_config import llm_config
from ..core.logger import log_error, log_info
from ..models import Endpoint
from ..schemas.widget import ToolCallPayload, ToolResultPayload
from .agent_execution import execute_endpoint
from .agent_schema import SchemaFactory, serialize_args
from .agent_tools import create_find_actions_tool, create_frontend_actions_tool, create_frontend_context_tool, get_endpoint_tools
from .hallucination_checker import HallucinationChecker
from .tool_cache import ToolCache

BLOCKED_RESPONSE = "I can only help with dashboard actions. Please ask me to perform a specific action available in your dashboard."
BLOCKED_SYSTEM_NOTE = "Your previous response was blocked because it did not align with your role as a dashboard assistant. Stay focused on discovering and executing dashboard actions only."
MAX_ITERATIONS_RESPONSE = "I've reached the maximum number of steps. Here's what I found so far based on our conversation."
LANGUAGE_LABELS = {
    "arabic",
    "chinese",
    "czech",
    "danish",
    "dutch",
    "english",
    "finnish",
    "french",
    "german",
    "greek",
    "hebrew",
    "hindi",
    "hungarian",
    "indonesian",
    "italian",
    "japanese",
    "korean",
    "norwegian",
    "polish",
    "portuguese",
    "romanian",
    "russian",
    "spanish",
    "swedish",
    "thai",
    "turkish",
    "ukrainian",
    "vietnamese",
}
LANGUAGE_LABEL_PREFIX_PATTERN = re.compile(
    r"^(arabic|chinese|czech|danish|dutch|english|finnish|french|german|greek|hebrew|hindi|hungarian|indonesian|italian|japanese|korean|norwegian|polish|portuguese|romanian|russian|spanish|swedish|thai|turkish|ukrainian|vietnamese)\s*[\.:;,-]\s*",
    re.IGNORECASE,
)
LANGUAGE_TAG_PREFIX_PATTERN = re.compile(r"^(language|idioma|langue|sprache)\s*:\s*[^\s]+\s*", re.IGNORECASE)

SYSTEM_PROMPT_BASE = """Context: You are a dashboard assistant that can execute backend endpoints{frontend_context}.

Task: Help the user achieve their dashboard goal.

Constraints:
- Discover backend actions with find_actions first unless the task is clearly a frontend-only UI interaction.{frontend_constraints}
- Ask for values the user hasn't provided; do not guess those. But take obvious next steps (navigation, opening menus, clicking tabs) without asking.{frontend_execution}
- Use only available tools; stay within the current page.
- Keep responses friendly and non-technical.
- Keep responses minimal: 1-2 short sentences (max 40 words) or one short question.
{frontend_tips}
Output:
- Either tool calls OR a concise response (<=2 sentences, <=40 words) that summarizes what you did or asks one clear question for missing info.
- When listing capabilities, mention 2-3 examples and say you can do more if the user describes their goal."""

FRONTEND_CONTEXT_FRAGMENT = " and frontend UI steps on the current page"
FRONTEND_CONSTRAINTS_FRAGMENT = """
- If find_actions returns no suitable actions (empty list) or the returned actions don't match the user's goal, request frontend_context next.
- If the task is a UI change or find_actions is not relevant, request frontend_context."""
FRONTEND_EXECUTION_FRAGMENT = """
- Execute frontend actions in small, ordered steps; include waits for dynamic UI.
- If the target element isn't visible but a navigation link or tab would reveal it, click that first — don't ask the user.
- For layered UIs (menus, popovers, dialogs, comboboxes), open the trigger control first, then select within that surfaced container.
- For unstable targets, send selectorAlternatives (1-3) alongside the primary selector.
- For ambiguous labels, set scope/scopeAlternatives so matching stays inside the intended container, not global page navigation.
- If a frontend step is unclear or fails, request a new frontend_context with refined scope/hints before asking the user.
- Before confirming success for order-sensitive or state-sensitive UI changes (step order, selected option, toggle state), verify the resulting UI state via frontend_context in the same turn.
- If the user says the result is wrong or not what they asked for, treat that as a likely mismatch: re-check state with frontend_context and fix it before replying; do not repeat the prior claim without fresh verification."""
FRONTEND_TIPS_FRAGMENT = """
Frontend Action Tips:
- If an action reports ELEMENT_NOT_FOUND, the selector didn't match anything - request fresh frontend_context with refined scope/hints
- If an action succeeds but nothing changes, the element may be disabled or hidden - check the page state and try a different approach
- For ELEMENT_NOT_FOUND in layered UI containers, retry after opening the right trigger and using selector alternatives (`text=`, role/data-testid, then CSS)
- Avoid bare global `text=` clicks for labels that exist in multiple regions; use scoped selectors first
- For dynamic UIs, use wait_for_stable or add wait actions between steps
- When context returns fewer elements than expected, increase maxElements to 100-160
- Use suggestedSelectors from context response to pick reliable selectors
- After failures, always request fresh frontend_context - the DOM may have changed
- frontend_context may include a screenshot field (base64 image) showing the actual page - use it to visually confirm element locations and page state
- Never ask the user to send a screenshot; use frontend_context to capture a fresh one automatically
- If the user corrects your previous completion claim, run a verification pass first (frontend_context focused on the changed UI area), then confirm or repair based on what you find
"""


def build_system_prompt(frontend_capability_enabled: bool = True) -> str:
    return SYSTEM_PROMPT_BASE.format(
        frontend_context=FRONTEND_CONTEXT_FRAGMENT if frontend_capability_enabled else "",
        frontend_constraints=FRONTEND_CONSTRAINTS_FRAGMENT if frontend_capability_enabled else "",
        frontend_execution=FRONTEND_EXECUTION_FRAGMENT if frontend_capability_enabled else "",
        frontend_tips=FRONTEND_TIPS_FRAGMENT if frontend_capability_enabled else "",
    )


@dataclass
class StepResult:
    tool_calls: list[ToolCallPayload] = field(default_factory=list)
    response: str | None = None
    done: bool = False
    messages: list[BaseMessage] = field(default_factory=list)
    active_endpoint_ids: list[UUID] = field(default_factory=list)


class AgentExecutor:
    def __init__(
        self,
        session: Session,
        user_id: str,
        conversation_id: UUID | None = None,
        redis_client: Redis | None = None,
        llm_client: Any | None = None,
        schema_factory: SchemaFactory | None = None,
        hallucination_checker: HallucinationChecker | None = None,
        frontend_capability_enabled: bool = True,
    ):
        self.session = session
        self.user_id = user_id
        self.conversation_id = conversation_id
        self.frontend_capability_enabled = frontend_capability_enabled
        self.schema_factory = schema_factory or SchemaFactory()
        self._system_prompt = build_system_prompt(frontend_capability_enabled)
        settings = get_settings()
        self.llm = llm_client or ChatOpenAI(
            model=llm_config.chat_model,
            temperature=llm_config.temperature,
            api_key=settings.openai_api_key
        )
        self.active_endpoint_ids: list[UUID] = []
        self._tool_cache: ToolCache | None = None
        self._hallucination_checker = hallucination_checker or HallucinationChecker()
        if conversation_id:
            self._tool_cache = ToolCache(redis_client, conversation_id)

    def _parse_endpoint_ids_from_response(self, content: str) -> list[UUID]:
        try:
            data = json.loads(content)
            if isinstance(data, list):
                return [UUID(item["id"]) for item in data if "id" in item]
        except (json.JSONDecodeError, ValueError, KeyError):
            return []
        return []

    def _get_valid_endpoint_ids(self) -> set[UUID]:
        if not self.active_endpoint_ids:
            return set()
        endpoints = self.session.scalars(
            select(Endpoint).where(
                Endpoint.id.in_(self.active_endpoint_ids),
                Endpoint.user_id == self.user_id,
                Endpoint.agent_enabled.is_(True)
            )
        ).all()
        return {e.id for e in endpoints}

    def _sync_cache(self) -> None:
        if not self._tool_cache:
            return
        self._tool_cache.load()
        cached_ids = self._tool_cache.get_endpoint_ids()
        for eid in cached_ids:
            if eid not in self.active_endpoint_ids:
                self.active_endpoint_ids.append(eid)
        valid_ids = self._get_valid_endpoint_ids()
        self._tool_cache.remove_invalid(valid_ids)
        self.active_endpoint_ids = [eid for eid in self.active_endpoint_ids if eid in valid_ids]

    def _update_cache_after_discovery(self, new_ids: list[UUID]) -> None:
        if not self._tool_cache:
            return
        self._tool_cache.add_tools(new_ids)
        self._tool_cache.update_used(new_ids)
        self._tool_cache.enforce_cap(llm_config.max_cached_tools)
        self._tool_cache.save()

    def _get_tools(self):
        tools = [
            create_find_actions_tool(self.session, self.user_id),
        ]
        if self.frontend_capability_enabled:
            tools.append(create_frontend_context_tool())
            tools.append(create_frontend_actions_tool())
        tools.extend(get_endpoint_tools(
            self.session,
            self.user_id,
            self.active_endpoint_ids,
            self.schema_factory,
            conversation_id=self.conversation_id,
        ))
        return tools

    def _get_endpoint_by_tool_name(self, tool_name: str) -> Endpoint | None:
        for endpoint_id in self.active_endpoint_ids:
            endpoint = self.session.get(Endpoint, endpoint_id)
            if endpoint and endpoint.agent_enabled:
                tool_spec = endpoint.tool or {}
                function_spec = tool_spec.get("function", {})
                name = function_spec.get("name", f"endpoint_{endpoint.id}")
                if name == tool_name:
                    return endpoint
        return None

    def _build_messages_from_history(
        self,
        user_message: str | None,
        conversation_history: list[dict[str, str]]
    ) -> list[BaseMessage]:
        messages: list[BaseMessage] = [SystemMessage(content=self._system_prompt)]
        for msg in conversation_history:
            if msg["role"] == "user":
                messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "assistant":
                messages.append(AIMessage(content=msg["content"]))
        if user_message:
            messages.append(HumanMessage(content=user_message))
        return messages

    async def _generate_blocked_response(self, user_input: str) -> str:
        prompt = f"""User message: "{user_input}"

Write ONLY one short user-facing reply in the same language as the user message.
Do not mention or label the language.
Do not include prefixes like "English.", "Spanish.", or "Language:".

Reply goal: Politely say you can only help with dashboard actions and ask them to request a specific action available in their dashboard.
Keep it brief and friendly."""
        response = await self.llm.ainvoke([HumanMessage(content=prompt)], config={"tags": ["blocked-response"]})
        return self._sanitize_localized_reply(response.content or "", BLOCKED_RESPONSE)

    async def _generate_max_iterations_response(self, user_input: str) -> str:
        prompt = f"""User message: "{user_input}"

Write ONLY one short user-facing reply in the same language as the user message.
Do not mention or label the language.
Do not include prefixes like "English.", "Spanish.", or "Language:".

Reply goal: Apologize that you've reached the maximum number of steps and briefly summarize that you tried to help based on their conversation.
Keep it brief and friendly."""
        response = await self.llm.ainvoke([HumanMessage(content=prompt)], config={"tags": ["max-iterations-response"]})
        return self._sanitize_localized_reply(response.content or "", MAX_ITERATIONS_RESPONSE)

    def _sanitize_localized_reply(self, content: str, fallback: str) -> str:
        text = str(content or "").strip()
        if not text:
            return fallback
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not lines:
            return fallback
        first_line = lines[0].rstrip(" .:;,-").lower()
        if first_line in LANGUAGE_LABELS:
            lines = lines[1:]
        text = " ".join(lines).strip()
        text = LANGUAGE_LABEL_PREFIX_PATTERN.sub("", text).strip()
        text = LANGUAGE_TAG_PREFIX_PATTERN.sub("", text).strip()
        return text or fallback

    async def _check_and_refine_response(
        self,
        user_input: str,
        response: str,
        messages: list[BaseMessage]
    ) -> str:
        def truncate(value: str, limit: int) -> str:
            if len(value) <= limit:
                return value
            return value[:limit] + "..."

        def summarize_json(value: Any) -> str:
            if isinstance(value, dict):
                if "error" in value:
                    return f"error: {truncate(str(value.get('error') or ''), 240)}"
                if "status_code" in value:
                    status = value.get("status_code")
                    body = value.get("body")
                    if isinstance(body, dict):
                        keys = sorted(body.keys())
                        keys_str = ", ".join(keys[:10])
                        more = f" (+{len(keys) - 10} more)" if len(keys) > 10 else ""
                        return f"status_code={status}, body_keys: {keys_str}{more}"
                    if isinstance(body, list):
                        return f"status_code={status}, body_list_len={len(body)}"
                    if body is None:
                        return f"status_code={status}"
                    return f"status_code={status}, body: {truncate(str(body), 240)}"
                keys = sorted(value.keys())
                keys_str = ", ".join(keys[:10])
                more = f" (+{len(keys) - 10} more)" if len(keys) > 10 else ""
                return f"object keys: {keys_str}{more}"
            if isinstance(value, list):
                summary = f"list len={len(value)}"
                if value and isinstance(value[0], dict):
                    keys = sorted(value[0].keys())
                    keys_str = ", ".join(keys[:10])
                    more = f" (+{len(keys) - 10} more)" if len(keys) > 10 else ""
                    summary += f", item_keys: {keys_str}{more}"
                return summary
            return f"{type(value).__name__}: {truncate(str(value), 240)}"

        def summarize_tool_content(content: str) -> tuple[bool, str, str]:
            raw = str(content or "")
            compact = " ".join(raw.split())
            preview = truncate(compact, 800)
            try:
                parsed = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                return False, truncate(compact, 300), preview
            return True, truncate(summarize_json(parsed), 300), preview

        available_tools = [
            {"name": str(tool.name), "description": str(getattr(tool, "description", "") or "")}
            for tool in self._get_tools()
            if getattr(tool, "name", None)
        ]
        tool_trace: list[dict[str, Any]] = []
        tool_calls_by_id: dict[str, dict[str, Any]] = {}
        for message in messages:
            if isinstance(message, AIMessage):
                for call in getattr(message, "tool_calls", []) or []:
                    call_id = call.get("id")
                    name = call.get("name")
                    if not call_id or not name:
                        continue
                    entry = {"id": str(call_id), "name": str(name), "args": call.get("args")}
                    tool_trace.append(entry)
                    tool_calls_by_id[str(call_id)] = entry
            if isinstance(message, ToolMessage):
                call_id = getattr(message, "tool_call_id", None)
                if not call_id:
                    continue
                entry = tool_calls_by_id.get(str(call_id))
                if not entry:
                    entry = {"id": str(call_id), "name": "", "args": None}
                    tool_trace.append(entry)
                    tool_calls_by_id[str(call_id)] = entry
                is_json, summary, preview = summarize_tool_content(message.content or "")
                entry["result_is_json"] = is_json
                entry["result_summary"] = summary
                entry["result_preview"] = preview

        result = await self._hallucination_checker.check(
            user_input,
            response,
            self._system_prompt,
            available_tools=available_tools,
            tool_trace=tool_trace
        )
        if result.mode == "BLOCK":
            log_info("AgentExecutor", "_check_and_refine_response", "Response blocked")
            messages.append(SystemMessage(content=BLOCKED_SYSTEM_NOTE))
            return await self._generate_blocked_response(user_input)
        return response

    def _build_frontend_recovery_note(self, result: ToolResultPayload) -> str | None:
        if result.status_code not in (207, 400, 404, 422, 500):
            if result.status_code not in (200, 201, 204):
                return None
        body = result.body
        if not isinstance(body, dict) or body.get("kind") != "frontend_actions":
            return None
        raw_results = body.get("results")
        if not isinstance(raw_results, list):
            return None
        failed_step = next(
            (
                step for step in raw_results
                if isinstance(step, dict) and step.get("status") == "error"
            ),
            None
        )
        if failed_step:
            error_code = str(failed_step.get("errorCode") or "")
            recovery_hint = str(failed_step.get("recoveryHint") or "")
            if error_code != "ELEMENT_NOT_FOUND" and recovery_hint != "RESCAN_WITH_SCOPE":
                failed_step = None
        if failed_step:
            selector = str(failed_step.get("selector") or "").strip()
            selector_hint_line = (
                f'- Include selectorHints with "{selector}" plus likely trigger/container hints (e.g., role=menuitem, role=option, role=dialog).'
                if selector else
                "- Include selectorHints for the missing target plus likely trigger/container hints (e.g., role=menuitem, role=option, role=dialog)."
            )
            return (
                "Frontend retry directive:\n"
                "- Do not ask the user for a screenshot.\n"
                "- Request frontend_context now with includeOffscreen=true and maxElements=140.\n"
                f"{selector_hint_line}\n"
                "- Retry frontend actions in order, opening the relevant menu/popover trigger before selecting the item."
            )
        suspicious_success = next(
            (
                step for step in raw_results
                if isinstance(step, dict)
                and step.get("status") == "ok"
                and str(step.get("selector") or "").strip().lower().startswith("text=")
                and isinstance(step.get("targetContext"), dict)
                and step.get("targetContext", {}).get("inOverlay") is False
            ),
            None
        )
        if suspicious_success:
            selector = str(suspicious_success.get("selector") or "").strip()
            return (
                "Frontend verification directive:\n"
                "- A text-based click succeeded but matched outside overlay/menu context, so treat it as potentially wrong-target.\n"
                "- Request frontend_context with menu/popover scope hints and retry with scope/scopeAlternatives.\n"
                f'- Re-validate the intended UI state after retry before confirming success (selector: "{selector}").'
            )
        return None

    async def run_step(
        self,
        user_message: str | None,
        conversation_history: list[dict[str, str]],
        tool_results: list[ToolResultPayload] | None = None,
        pending_messages: list[BaseMessage] | None = None,
        active_endpoint_ids: list[UUID] | None = None
    ) -> StepResult:
        if active_endpoint_ids:
            self.active_endpoint_ids = list(active_endpoint_ids)

        self._sync_cache()

        if pending_messages:
            messages = list(pending_messages)
            if user_message:
                messages.append(HumanMessage(content=user_message))
        else:
            messages = self._build_messages_from_history(user_message, conversation_history)
        runtime_messages = list(messages)

        if tool_results:
            for result in tool_results:
                body = result.body
                if result.error:
                    content = json.dumps({"error": result.error})
                else:
                    content = json.dumps({"status_code": result.status_code, "body": body})
                tool_message = ToolMessage(content=content, tool_call_id=result.id)
                messages.append(tool_message)
                runtime_messages.append(tool_message)
                recovery_note = self._build_frontend_recovery_note(result)
                if recovery_note:
                    system_note = SystemMessage(content=recovery_note)
                    messages.append(system_note)
                    runtime_messages.append(system_note)

        max_iterations = llm_config.max_iterations
        iteration = 0
        
        while iteration < max_iterations:
            iteration += 1
            tools = self._get_tools()
            llm_with_tools = self.llm.bind_tools(tools)
            response = await llm_with_tools.ainvoke(runtime_messages, config={"tags": ["main-agent"]})
            messages.append(response)
            runtime_messages.append(response)

            if not response.tool_calls:
                raw_response = response.content or ""
                user_input = user_message or ""
                if not user_input and conversation_history:
                    for msg in reversed(conversation_history):
                        if msg["role"] == "user":
                            user_input = msg["content"]
                            break
                checked_response = await self._check_and_refine_response(user_input, raw_response, messages)
                return StepResult(
                    response=checked_response,
                    done=True,
                    messages=messages,
                    active_endpoint_ids=self.active_endpoint_ids
                )

            pending_tool_calls: list[ToolCallPayload] = []

            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                
                if tool_name == "find_actions":
                    tool = next((t for t in tools if t.name == "find_actions"), None)
                    if tool:
                        try:
                            tool_result = tool.invoke(tool_args)
                            new_ids = self._parse_endpoint_ids_from_response(tool_result)
                            added_ids: list[UUID] = []
                            for endpoint_id in new_ids:
                                if endpoint_id not in self.active_endpoint_ids:
                                    self.active_endpoint_ids.append(endpoint_id)
                                    added_ids.append(endpoint_id)
                            if added_ids:
                                self._update_cache_after_discovery(added_ids)
                        except Exception as error:
                            log_error("AgentExecutor", "run_step", "find_actions failed", exc=error)
                            tool_result = f"Error: {str(error)}"
                    else:
                        tool_result = "Tool not found"
                    tool_message = ToolMessage(content=tool_result, tool_call_id=tool_call["id"])
                    messages.append(tool_message)
                    runtime_messages.append(tool_message)
                elif tool_name == "frontend_context":
                    try:
                        pending_tool_calls.append(ToolCallPayload(
                            id=tool_call["id"],
                            type="frontend_context",
                            name=tool_name,
                            goal=tool_args.get("goal") if isinstance(tool_args, dict) else None,
                            context=tool_args if isinstance(tool_args, dict) else None,
                        ))
                    except Exception as error:
                        log_error("AgentExecutor", "run_step", "frontend_context args invalid", exc=error)
                        tool_message = ToolMessage(
                            content="frontend_context args invalid",
                            tool_call_id=tool_call["id"]
                        )
                        messages.append(tool_message)
                        runtime_messages.append(tool_message)
                elif tool_name == "frontend":
                    try:
                        pending_tool_calls.append(ToolCallPayload(
                            id=tool_call["id"],
                            type="frontend",
                            name=tool_name,
                            goal=tool_args.get("goal") if isinstance(tool_args, dict) else None,
                            actions=tool_args.get("actions", []) if isinstance(tool_args, dict) else [],
                        ))
                    except Exception as error:
                        log_error("AgentExecutor", "run_step", "frontend args invalid", exc=error)
                        tool_message = ToolMessage(
                            content="frontend args invalid",
                            tool_call_id=tool_call["id"]
                        )
                        messages.append(tool_message)
                        runtime_messages.append(tool_message)
                else:
                    endpoint = self._get_endpoint_by_tool_name(tool_name)
                    if endpoint:
                        serialized = serialize_args(tool_args)
                        filtered = {k: v for k, v in serialized.items() if v is not None}
                        pending_tool_calls.append(ToolCallPayload(
                            id=tool_call["id"],
                            type="backend",
                            endpointId=endpoint.id,
                            name=tool_name,
                            method=endpoint.method.value,
                            path=endpoint.path,
                            params=filtered.get("params", {}),
                            query=filtered.get("query", {}),
                            body=filtered.get("body", {}),
                            headers=filtered.get("headers", {})
                        ))
                    else:
                        tool_message = ToolMessage(
                            content=f"Tool '{tool_name}' not found",
                            tool_call_id=tool_call["id"]
                        )
                        messages.append(tool_message)
                        runtime_messages.append(tool_message)

            if pending_tool_calls:
                return StepResult(
                    tool_calls=pending_tool_calls,
                    done=False,
                    messages=messages,
                    active_endpoint_ids=self.active_endpoint_ids
                )

        log_info("AgentExecutor", "run_step", "Max iterations reached")
        user_input = user_message or ""
        if not user_input and conversation_history:
            for msg in reversed(conversation_history):
                if msg["role"] == "user":
                    user_input = msg["content"]
                    break
        max_iter_response = await self._generate_max_iterations_response(user_input)
        return StepResult(
            response=max_iter_response,
            done=True,
            messages=messages,
            active_endpoint_ids=self.active_endpoint_ids
        )

    async def run(self, user_message: str, conversation_history: list[dict[str, str]]):
        self._sync_cache()

        messages = [SystemMessage(content=self._system_prompt)]
        for message in conversation_history:
            if message["role"] == "user":
                messages.append(HumanMessage(content=message["content"]))
            elif message["role"] == "assistant":
                messages.append(AIMessage(content=message["content"]))
        messages.append(HumanMessage(content=user_message))

        max_iterations = llm_config.max_iterations
        iteration = 0
        while iteration < max_iterations:
            iteration += 1
            tools = self._get_tools()
            llm_with_tools = self.llm.bind_tools(tools)
            response = await llm_with_tools.ainvoke(messages, config={"tags": ["main-agent"]})
            messages.append(response)
            if not response.tool_calls:
                raw_response = response.content or ""
                return await self._check_and_refine_response(user_message, raw_response, messages)
            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                tool = next((item for item in tools if item.name == tool_name), None)
                if tool_name == "find_actions" and tool:
                    try:
                        tool_result = tool.invoke(tool_args)
                    except Exception as error:
                        log_error("AgentExecutor", "run", "find_actions failed", exc=error)
                        tool_result = f"Error executing tool: {str(error)}"
                    new_ids = self._parse_endpoint_ids_from_response(tool_result)
                    added_ids: list[UUID] = []
                    for endpoint_id in new_ids:
                        if endpoint_id not in self.active_endpoint_ids:
                            self.active_endpoint_ids.append(endpoint_id)
                            added_ids.append(endpoint_id)
                    if added_ids:
                        self._update_cache_after_discovery(added_ids)
                    messages.append(ToolMessage(content=tool_result, tool_call_id=tool_call["id"]))
                    continue
                if tool_name in ("frontend_context", "frontend"):
                    messages.append(ToolMessage(
                        content="Frontend tools require the widget runtime",
                        tool_call_id=tool_call["id"]
                    ))
                    continue

                endpoint = self._get_endpoint_by_tool_name(tool_name)
                if endpoint:
                    serialized = serialize_args(tool_args)
                    filtered = {k: v for k, v in serialized.items() if v is not None}
                    result = execute_endpoint(
                        self.session,
                        self.user_id,
                        endpoint,
                        filtered,
                        conversation_id=self.conversation_id,
                        tool_call_id=tool_call.get("id"),
                    )
                    tool_result = json.dumps(result, indent=2)
                    messages.append(ToolMessage(content=tool_result, tool_call_id=tool_call["id"]))
                    continue

                if not tool:
                    tool_result = f"Tool '{tool_name}' not found"
                else:
                    try:
                        tool_result = tool.invoke(tool_args)
                    except Exception as error:
                        log_error("AgentExecutor", "run", f"Tool execution failed: {tool_name}", exc=error)
                        tool_result = f"Error executing tool: {str(error)}"
                messages.append(ToolMessage(content=tool_result, tool_call_id=tool_call["id"]))
        log_info("AgentExecutor", "run", "Max iterations reached")
        return await self._generate_max_iterations_response(user_message)
