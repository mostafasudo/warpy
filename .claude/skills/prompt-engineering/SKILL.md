---
name: prompt-engineering
description: Reference guide for prompt engineering best practices. Use when creating, modifying, or optimizing LLM agent system prompts, tool descriptions, or any AI instruction text. Apply when writing prompts for Claude, GPT, or other language models.
---

# Prompt Engineering Guide

* One prompt = one clear goal
    * Eliminate excess context
    * State the task in one sentence
* Define success explicitly
    * Use measurable criteria
    * Prefer checklists, counts, or outputs over subjective language
* Make prompts reproducible
    * Avoid time-based or vague references
    * Specify versions, formats, and assumptions
* Narrow the scope
    * Split complex work into multiple prompts
    * Chain prompts instead of bundling tasks
* Add explicit constraints
    * State what to include and what to exclude
    * Limit tools, libraries, length, style, and structure
* Use a fixed logical structure
    * Context (inputs, background)
    * Task (what to do)
    * Constraints (rules, limits)
    * Output (format, location, naming)
* Optimize for verification
    * Outputs should be easy to test or validate
    * If you can't verify it, rewrite the prompt
* Prefer precision over creativity
    * Replace "better", "clean", "efficient" with concrete requirements
* Reduce tokens intentionally
    * Shorter prompts → faster, more accurate responses
    * Remove anything that doesn't change the output
* Iterate by chaining, not bloating
    * Each prompt refines or builds on the previous result
    * Keep every step focused and atomic

# Prompt engineering guidelines and rules

- **Clarify the goal, audience, and success criteria before you write the prompt**
- Decide exactly what you want the model to do in one short, imperative sentence (e.g., "Summarize this article in 3 bullet points.").
- Specify the audience and use-case (e.g., "for executives with no technical background," "explain to a 5-year-old").
- State what "good" looks like: accuracy, creativity, brevity, depth, formality, etc.
- If it's high-stakes, say how the answer will be used (policy, code, legal, medical, production system).


- **Be explicit, specific, and concrete in your instructions**
- Avoid vague verbs; use direct action verbs like *write, summarize, classify, extract, rank, compare*.
- Include clear constraints: length, style, format, language, reading level, timeframe.
- Prefer numbers over fuzzy phrases ("3–5 bullets" instead of "very short summary").
- Choose words carefully: avoid slang, metaphors, or ambiguous wording that could be misread.
- Pose open-ended questions when you want richer or more creative responses instead of yes/no answers.

- **Structure the prompt cleanly and remove fluff**
- Put instructions first, then context, then the actual question or input.
- Use clear delimiters (triple quotes, XML/HTML-like tags, headers, or ### separators) between instructions and data.
- Keep sentences short and grammar/punctuation correct to avoid mis-parsing.
- Cut conversational filler ("please," "if you don't mind") and irrelevant details that don't affect the task.
- Use headings, numbered steps, and markup tags when the structure is complex.

- **Use roles, personas, and audience to control style and depth**
- Assign a role/persona that matches the task (e.g., "You are a senior tax accountant," "Act as a grumpy travel guide").
- Define the audience explicitly; this strongly influences tone, vocabulary, and explanation depth.
- Put stable behavior (tone, safety rules, personality) into system-level instructions; put task-specific details into user turns.
- If needed, define guardrails: what to decline, what to avoid, and when to ask for clarification.

- **Provide the right context—and only what's needed**
- Don't assume the model knows your project; paste the key background information it must use.
- Include domain definitions, policies, constraints, or examples of your internal standards.
- For RAG or document-based questions, explicitly say "Answer only using the provided text" and then include that text.
- Trim context to what is actually relevant to the current query to save tokens and avoid distraction.

- **Use examples (few-shot) when format, tone, or subtle judgment matters**
- Provide 1–5 realistic input → output examples that closely match your real task.
- Keep examples short but representative; don't hide edge cases you care about.
- Make example formatting 100% consistent: same labels, fields, separators, and spacing.
- For classification, vary the label order across examples so the model doesn't memorize one fixed pattern.
- Use few-shot prompting as your default tool to fix formatting/style issues before considering fine-tuning.

- **Specify the desired output format precisely**
- State the exact structure: "Return a JSON object with fields X, Y, Z," or "Output as a Markdown table," or "bulleted list only."
- Show a minimal template or tiny example of the desired output.
- For structured outputs, request hard constraints like "valid JSON only, no explanation text."
- Reserve natural-language commentary for when you need it; otherwise keep outputs machine-friendly.
- Use response prefixes or partial outputs to "pre-fill" rigid formats that the model should continue.

- **Prefer positive, non-conflicting instructions**
- Tell the model what to do rather than listing what not to do ("Write in short sentences" instead of "Do not write long sentences").
- Avoid long lists of "never do X" rules, which can conflict and reduce adherence.
- Use short, targeted constraints only where necessary (e.g., safety, legal compliance).

- **Control length and level of detail**
- Use explicit length constraints: "one sentence," "3 bullet points," "~300 words," or "no more than N tokens."
- Define the summarization level: headline, abstract, executive summary, or detailed notes.
- Set approximate output length goals or limits to avoid overly short or excessively long answers.
- Use max_tokens / similar settings to prevent runaway outputs while leaving enough room to finish.

- **Break down complex tasks into smaller steps**
- Split big jobs into phases (e.g., analyze → plan → draft → refine) rather than asking for everything at once.
- When you need multiple operations (summarize + extract + translate), run them as separate prompts when possible.
- For multi-part outputs, list each part explicitly and ask the model to label each section clearly.

- **Leverage reasoning explicitly—when appropriate**
- For standard reasoning models (like GPT-4-style), you can ask "Think step by step" or "Show your reasoning" for complex problems.
- Keep the final answer clearly separated from the reasoning so you can parse or display it easily.
- Use low temperature (often 0) and deterministic settings for logic- and correctness-critical tasks.
- For high-stakes questions, generate multiple samples and compare or vote among them for self-consistency.
- For *native reasoning models* (like OpenAI o1/DeepSeek R1–style), don't explicitly request chain-of-thought; keep the prompt simple and constraint-focused.

- **Tune model choice and sampling parameters intentionally**
- Use the latest, most capable model available for complex or high-value tasks.
- Lower temperature for deterministic/analytical tasks; raise it for creative writing and brainstorming.
- Adjust max_tokens/length to balance completeness, cost, and latency.
- Avoid changing many parameters at once; tweak one or two, observe results, then iterate.

- **Reuse prompts via templates and variables**
- Turn stable prompt patterns into templates with variables (e.g., `{city}`, `{product}`, `{audience}`).
- Keep reusable instructions and canonical examples at the top so they can be cached efficiently.
- Store prompts separately from application code so you can update them without redeploying.

- **Improve robustness and reliability of outputs**
- Explicitly give the model permission to say "I don't know" or "Information is insufficient" instead of guessing.
- When using external documents, ask for citations or short quotes for key claims.
- Instruct the model to stick strictly to the provided data when hallucinations would be risky.
- Ask the model to review its own answer: "Check your response for mistakes, contradictions, or missing steps before replying."
- Don't overlook verification—have humans or a second model check important outputs.

- **Optimize examples, formats, and structure for your specific task**
- Use zero-shot for simple tasks; upgrade to one/few-shot if the results are off.
- Match example domain to the target domain (finance examples for finance tasks, medical examples for medical tasks).
- For extraction, classification, or parsing, prefer structured outputs (JSON, CSV, XML) over free text.
- Use punctuation and formatting (lists, numbering) to clarify complex instructions and nested logic.

- **Keep prompts simple, readable, and non-redundant**
- If the prompt feels confusing to you, rewrite it until it's straightforward.
- Avoid undefined jargon and acronyms unless you define them in the prompt itself.
- Eliminate redundant or conflicting instructions and repeated constraints.

- **Use established frameworks to design prompts**
- CO-STAR framework:
- **Context** – relevant background.
- **Objective** – precise task.
- **Style** – e.g., "Hemingway-esque, punchy."
- **Tone** – e.g., "empathetic but professional."
- **Audience** – who will read it.
- **Response** – required format (JSON, bullets, table, etc.).
- RTF framework for quick tasks:
- **Role** – the persona ("Act as a lawyer").
- **Task** – what to do ("Summarize this contract").
- **Format** – how to respond ("As a bulleted list").

- **Account for model-specific "dialects" and preferences**
- For Anthropic-style models, XML-like tags (`<instructions>`, `<context>`, `<examples>`) work well.
- Use "prefilling" tricks where supported (e.g., starting `Assistant:` with a JSON brace) to enforce specific formats.
- For OpenAI-style models, Markdown sections and clear system vs user messages are effective.
- Don't assume prompts transfer perfectly between models; adapt wording and structure to each model's strengths.

- **Apply advanced prompt-engineering techniques when helpful**
- **Output priming:** end your prompt with the beginning of the desired response ("Here is the code:" or an opening `{` for JSON) so the model continues in that pattern.
- **Use delimiters:** wrap user data in `"""`, `<data>…</data>`, or `###` to avoid mixing it with instructions.
- **Sandwich defense:** place key instructions both before *and* after long documents to prevent them from being ignored.
- **Emotional/importance framing:** optionally indicate importance ("This answer is critical for my job; be thorough and accurate") to encourage more careful responses.

- **Control style and verbosity with length and content guidance**
- Set expectations like "be concise," "focus only on technical details," or "avoid repetition."
- Specify whether you want explanations, just the final result, or both (e.g., "give the answer only," vs "explain briefly, then give the final answer").

- **Special guidance for image-generation prompts**
- Describe the scene explicitly: subjects, actions, environment, and composition/framing.
- Specify mood, aesthetic, and style (e.g., cinematic, watercolor, cyberpunk).
- Mention lighting and color palette (e.g., soft natural light, high contrast, muted tones).
- Indicate level of realism (photorealistic vs stylized vs abstract).

- **Iterate, test, and document your prompts**
- Treat prompt engineering as an experiment loop: draft → run → inspect → revise.
- Don't settle for your first prompt; refine wording, structure, examples, and parameters.
- Log prompt versions, model settings, and evaluation notes so you can compare changes.
- Test prompts on diverse, realistic examples—including edge cases—not only "happy paths."
- Re-evaluate and possibly adjust prompts when switching models or changing parameters.

- **Common mistakes to avoid (and what to do instead)**
- **Mistake:** Relying on a single, hastily written prompt.
- **Instead:** Iteratively improve and A/B test variants.
- **Mistake:** Always asking for very short answers.
- **Instead:** Encourage depth when needed, then constrain length thoughtfully.
- **Mistake:** Assuming the same prompt works identically across models.
- **Instead:** Tune prompts per model and verify behavior.
- **Mistake:** Ignoring verification and source checking.
- **Instead:** Require citations where possible and have critical outputs reviewed.
