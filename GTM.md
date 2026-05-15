# Sales, Marketing, and GTM

## Operating Rule

For any sales, marketing, or GTM task, read this file first, then check the marketing skills pack in `.codex/skills/marketing/`.

## GTM Scope & Platform Compliance

Warpy GTM automations are routine sales, marketing, sourcing, sequencing, and content-drafting workflows only. They use authenticated, user-owned GTM accounts and the approved workflows exposed by Apollo, Amplemarket, Buffer, LinkedIn, X, and source websites.

They must not perform cybersecurity testing, vulnerability research, credential work, bypassing, evasion, scraping protected data, or unauthorized access. If a task appears outside GTM, outside the user's authenticated account permissions, or outside a platform-allowed workflow, skip it and log the reason instead of continuing.

Automation source docs:

- [Lead Builder](docs/gtm-automation-lead-builder.md)
- [Task Executor](docs/gtm-automation-task-executor.md)
- [Marketing Engine](docs/gtm-automation-marketing-engine.md)
- [Improvement Review](docs/gtm-automation-improvement-review.md)

## Chrome CDP Fallback Rule

For all three GTM automations, the user's Chrome CDP browser is the fallback for approved GTM platforms when direct tooling cannot complete a platform-allowed GTM workflow.

Non-browser paths are allowed when they can complete the exact GTM step: MCPs, direct MCP namespaces, connectors, CLIs, scripts, direct APIs, or other programmatic tools. If any non-browser path is unavailable, unauthenticated, limited, missing an operation, unsupported by the MCP/API, stale, rate-limited, or fails in a way that blocks the step, load `docs/chrome-cdp.md` and use the Chrome CDP workflow for the user's authenticated GTM browser session.

Do this before declaring the step blocked. This applies to Amplemarket, Apollo, Buffer, LinkedIn, X, source browsing, and similar approved GTM platforms. Local state files and generated artifacts remain local filesystem work.

## Automation Reliability And Context Budget

Codex GTM automations must finish with a compact live transcript. Long-running GTM work should store detailed state on disk and keep only decisions, counts, artifact paths, and blockers in the model context.

Run guard claim commands should use the shared two-hour stale window unless a workflow doc explicitly overrides it:

```sh
node scripts/gtm-automation-run-guard.mjs claim --automation-id <automation-id> --stale-after-ms 7200000
```

After a successful claim, run a heartbeat after every major phase, before and after any long Chrome CDP/platform phase, and at least every 15 tool actions:

```sh
node scripts/gtm-automation-run-guard.mjs heartbeat --automation-id <automation-id> --owner-token <owner_token>
```

Keep raw or bulky data out of the live conversation:

- write candidate lists, enrichment payloads, browser extraction JSON, screenshots, CSVs, and audit details to `/Users/levw/.codex/tmp/` or `/Users/levw/.codex/state/`
- summarize large artifacts with counts, accepted IDs/domains, status, and paths only
- use filters, projections, `jq`, `head`, and small purpose-built summaries instead of printing full JSON, DOM snapshots, bundled JS, CSVs, or long tool payloads
- avoid screenshots unless they prove a required platform state; when needed, save the file and mention only the path plus the observed result
- before any step likely to produce many rows or browser output, decide what exact fields are needed and request only those fields when the tool supports it

Direct tool responses still enter the live transcript before they can be written to disk. Do not call MCP, browser, connector, or API list/detail tools against bulk GTM objects unless the tool can limit rows and fields. High-risk examples include Amplemarket full lead-list reads, Apollo page/API dumps, Buffer history dumps, source-page captures, and browser DOM/table extraction.

After any context-window failure, resume from a fresh automation run or fresh thread that reads only the checkpoint, relevant workflow doc, and needed local artifacts. Do not continue the failed, already-bloated transcript unless the remaining step is a trivial local command.

Each run must keep a resume checkpoint in the automation's persistent state directory. Update it after every side-effecting phase with:

- `automation_id`
- `owner_token`
- current phase
- completed side effects
- pending steps
- artifact paths
- platform IDs touched
- cleanup status
- blockers
- last heartbeat time

If the context starts getting large, stop exploratory work, update the checkpoint, reread only the checkpoint plus the relevant workflow doc, and continue from the checkpoint. Do not repeat sourcing, imports, sends, draft creation, or other side effects that the checkpoint marks complete.

## What Warpy Is

Warpy is a drop-in AI execution layer for complex B2B dashboards. Customers embed a lightweight widget into their product, expose approved APIs and UI actions, and let end users ask for work in plain language.

Warpy does not replace the product UI. Chat is the low-friction intent input. The widget can render compact structured output, and customers can map that output to native components when the host app should own the final presentation.

The core GTM promise is dashboard adoption: more users reaching value, using advanced workflows, and getting work done without menu hunting. Lower support volume matters, but it is a secondary outcome.

## Voice

For outbound emails, LinkedIn messages, X posts, X/Twitter comments, and follow-up copy:

- default to lowercase
- keep it informal and a little rough
- avoid polished corporate phrasing
- do not use em dashes or semicolons
- do not sound arrogant, hypey, or sales-trained
- use humble framing for opinions: `i think`, `i keep noticing`, `it seems like`, `one pattern i keep seeing`
- back the thought with a real example, product pattern, source, or observed behavior when possible
- keep it short, direct, and human

This is intentional. Do not "clean it up" into standard sales copy.

## ICP

Best-fit accounts are B2B SaaS companies where the dashboard is central to customer value and the product is complex enough that users regularly filter, segment, navigate, configure, or take actions.

Strong fit signals:

- feature-rich, data-dense, workflow-heavy dashboards
- users only adopting a small slice of the product
- repetitive "how do i..." support or onboarding friction
- pressure to look AI-native without building an internal agent stack
- modern web frontend and documented APIs
- vertical SaaS categories such as fintech, healthcare, logistics, HR, analytics, data infrastructure, customer support, or operations software

Typical company shape is growth-stage B2B SaaS, often around 10-500 employees and roughly $5M-$50M ARR. Treat those ranges as targeting guidance, not hard exclusion rules.

Primary buyer personas:

| Persona | Titles | Main Angle |
| --- | --- | --- |
| Product Lead | VP Product, Head of Product, Director of Product, Product Manager | Feature adoption, time-to-value, advanced workflow usage |
| Support Lead | Head/VP Support, CX Lead, Customer Support leader | Fewer repetitive "how do i..." tickets and faster self-serve help |
| Technical Lead | CTO, VP Eng, Head of Engineering, Founder | AI-native product experience without building an internal agent stack |
| CS/Growth Lead | VP CS, Head of Growth, Onboarding Lead | Activation, onboarding, expansion, power-user behavior |

## Competitive Context

Use [Crow AI](https://usecrow.ai) as the default direct competitor reference for positioning, objection handling, sales enablement, and competitive GTM work unless a task calls for a different competitor set.

## Outbound System

Apollo is the outbound workflow control plane. The live sequence is [`Warpy Founder-Led SDR Sequence`](https://app.apollo.io/#/sequences/69d153277282c2001550d75f).

Amplemarket is the sourcing and enrichment layer. Codex automations move clean leads into Apollo and complete eligible due or overdue Apollo tasks through approved GTM platform workflows. The AE owns replies, objections, live conversations, and opportunities.

The task executor must preserve Apollo sequence timing and per-contact step order. It may complete only Apollo tasks from the Warpy sequence that are overdue or due on the current local date. Future-dated tasks are not actionable, even if Apollo shows them in an open or pending task list. If the due date cannot be confirmed before a recipient-visible GTM step, skip the task and log the blocker. For a given contact, never complete a later sequence step until all earlier Apollo sequence steps for that contact are completed, safely skipped with a terminal no-action reason, or no longer applicable in Apollo. Build the eligible queue once at run start; do not complete tasks that appear only after completing another task in the same run. Never send more than one outbound touch to the same contact in a single executor run.

Before opening any Apollo email, LinkedIn, X, or other approved GTM platform composer, the task executor must write an audit record JSON and run `node scripts/gtm-task-guard.mjs claim --payload-file <task-audit-record.json>`. This local recipient-safety ledger is the duplicate-prevention and copy-quality boundary. If it blocks the claim, skip without touching the platform composer. `copy_hash` is audit metadata only and must never be used for duplicate prevention. Existing `sent`, `completion_pending`, `completed`, or `claimed` ledger state wins over Apollo backlog pressure. A missed touch is acceptable; a duplicate email, DM, connection request, public social touch, unresolved placeholder, or static Apollo-template send is not.

Every recipient-visible message must be hyper-personalized for the specific lead. Apollo sequence templates are cadence scaffolding only, never the source of truth for final copy. The shared core idea is consistent: Warpy helps B2B dashboards with low feature adoption and repetitive support tickets by embedding an in-product AI assistant that lets users control the app through chat and dynamic UI, using only approved actions. The actual subject, body, LinkedIn note, DM, X reply, or asset note must be unique to the person and account, using that lead's trigger, persona angle, dashboard/workflow context, and proof workflow. Literal placeholders such as `[First name]`, `[trigger]`, `[Company]`, `{{ ... }}`, or internal sourcing labels like `Amplemarket`, `Apollo profile`, or `Duo Copilot` are terminal blockers.

Pipeline rules:

- build account-first, not from random contact dumps
- choose the best primary lead for the trigger and keep an adjacent lead available when useful
- import the primary lead first and hold adjacent context locally until multithreading is actually useful
- each accepted account needs a persona, trigger, pain hypothesis, proof point, `fit_score`, and `priority_tier`
- each accepted primary lead needs a `personalization_packet` before Apollo sequence enrollment, or a recorded blocker explaining why copy cannot be generated yet
- Duo Copilot suggestions are high-signal inputs, not trusted leads. Verify account ICP fit and buyer authority before import; reject random SWEs, designers, junior ICs, unclear titles, or other non-buyer roles unless there is clear evidence they own the relevant Product, Support, CS/Growth, Engineering, or Founder decision. After recording the local decision, dismiss reviewed Duo suggestions that are intentionally not picked up, using only a clearly safe Amplemarket dismiss/not-interested action for that exact suggestion.
- use verified work email for email sequencing and do not send to generic aliases, personal free-mail, or risky guesses
- LinkedIn is the main social context surface. X is useful only when the buyer is clearly active there
- public LinkedIn engagement is likes only for now. Do not leave LinkedIn public comments. X/Twitter public comments are allowed when relevant, specific, and non-pitchy
- do not automate outreach to contacts or accounts in Apollo states that indicate reply ownership, active opportunity, current customer, do-not-contact, bad data, or manual AE ownership
- keep Apollo stages and local GTM state synchronized so either system can prevent unsafe sends

The only enforced throughput cap in the GTM automation system is the Lead Builder cap: target `6` accepted primary leads and import/enrich no more than `8` accepted primary leads per run. The Lead Builder runs twice per weekday so daily sourcing capacity stays comparable while each run remains smaller and more reliable. Do not add other per-run, per-day, per-channel, topic, or task-volume limits that could stop the three automations from continuing their work. The task executor due-window, sequence-order, run-start snapshot, and same-contact cadence rules are recipient safety gates, not throughput caps.

## Sequence Strategy

Pick the best-fit primary lead first. Use the adjacent lead only when the account still justifies multithreading and the primary motion has not converted.

| Day | Channel | Lead | Intent |
| --- | --- | --- | --- |
| 0 | Research / intro | Primary + adjacent context | Find a real trigger, pain hypothesis, proof point, and possible warm intro. |
| 1 | LinkedIn | Primary | Like a recent relevant post. Do not comment publicly on LinkedIn. No pitch. |
| 2 | Email 1 | Primary | Short trigger-led email. Ask if they want a quick breakdown. |
| 3 | LinkedIn | Primary | Send a blank or highly specific connection request. No generic pitch note. |
| 5 | LinkedIn / X | Primary | Light second social touch on the channel that fits their activity: LinkedIn like only, or X like/comment when relevant. |
| 6 | Email 2 | Primary | New persona angle: adoption, support deflection, or AI-native product experience. |
| 7 | LinkedIn DM | Primary if connected | Short permission-based DM tied to the trigger. |
| 8 | Email / LinkedIn | Adjacent if justified | Multithread with a different KPI angle only if the account is still eligible. |
| 10 | Email 3 | Primary | Add proof, a workflow example, or a concise use-case note. |
| 12 | X DM / LinkedIn DM | Most engaged lead | Earned DM only when public engagement or open DMs make it natural. |
| 14 | Email / DM | Most engaged lead | Send the most useful asset or breakdown for that persona. |
| 17 | Email | Primary or adjacent | Pure value touch. No hard CTA. |
| 21 | Email | Primary | Polite close-the-loop email. |

Every touch should add a new angle. Lead with dashboard adoption, product usage, and users controlling the product through chat plus dynamic UI. Mention support reduction when the persona or trigger makes it natural, especially repetitive "how do i..." tickets.

For each lead, keep messages short and straightforward while varying the observation, proof workflow, and CTA by step. Follow-ups may reuse the same account thesis, but they must not reuse a static template body with only names or company fields swapped.

## GTM State

Sales automation state:

- persistent state: `/Users/levw/.codex/state/warpy-gtm/`
- temporary artifacts: `/Users/levw/.codex/tmp/warpy-gtm/`
- improvement log: `/Users/levw/.codex/state/warpy-gtm/improvement-log.jsonl`
- improvement index: `/Users/levw/.codex/state/warpy-gtm/improvement-log-index.json`

Marketing automation state:

- persistent state: `/Users/levw/.codex/state/warpy-marketing-gtm/`

Amplemarket lead lists are temporary transport objects. Their names must stay neutral and must not include `Warpy`. Delete temporary lists after local artifacts and Apollo import state are safely recorded.

## Self-Improving Pipeline

The Lead Builder and Task Executor should record only obvious, high-confidence issues or improvements that materially affect the goal: generating interested leads while staying autonomous, safe, and high-quality.

Use the local improvement log CLI:

```sh
node scripts/gtm-improvement-log.mjs add --payload-file /path/to/improvement-note.json
node scripts/gtm-improvement-log.mjs report --days 90
node scripts/gtm-improvement-log.mjs resolve --fingerprint <fingerprint> --resolution-note "fixed in ..."
```

Record a note only when the run found a clear bug, recurring blocker, state mismatch, copy-quality failure mode, platform workflow friction, or obvious optimization that can improve interested-lead generation, autonomy, safety, deliverability, data quality, copy quality, throughput, or platform reliability.

Do not log speculative ideas, vague preferences, one-off friction without clear impact, "could be nicer" cleanup, or generic observations that would not change pipeline outcomes. Missing a note is better than polluting the improvement backlog.

Improvement note payloads must include:

- `source_automation`: `warpy-gtm-lead-builder` or `warpy-gtm-task-executor`
- `category`: `bug`, `optimization`, `data_quality`, `copy_quality`, `platform_reliability`, `observability`, or `process`
- `priority`: `p1`, `p2`, or `p3`
- `impact_area`: `interested_leads`, `autonomy`, `safety`, `copy_quality`, `data_quality`, `deliverability`, `throughput`, or `platform_reliability`
- `confidence`: `high`
- `title`, `observation`, `impact_on_goal`, `suggested_fix`
- optional compact `evidence`, `artifact_paths`, and `platform_refs`

Priority definitions:

- `p1`: blocks safe autonomy, risks duplicate/bad sends, or materially prevents interested-lead generation
- `p2`: recurring blocker or clear optimization that would improve run completion, copy quality, fit quality, or platform reliability
- `p3`: smaller but still obvious improvement with a concrete fix and clear expected payoff

The weekly improvement review automation reads the report, clusters related notes, and creates a focused optimization plan. It should usually pick at most three high-leverage fixes. It should not turn every logged note into immediate implementation work.

## Marketing Engine

Warpy runs a founder-led marketing engine alongside outbound. Its job is to publish smart, human takes on product, AI, dashboards, and software behavior so the market associates Warpy with a clear point of view.

Operating principles:

- post from the founder or personal profile on LinkedIn, not the company page
- lead with the thought or pattern, not bait
- default to broader tech, AI, product, and UI shifts
- mention Warpy only when the bridge is natural
- broad commentary should still work if Warpy disappeared from the page
- never turn a loose source story into a disguised product pitch
- do not put links in the LinkedIn post body unless there is a deliberate reason
- optimize for saves, thoughtful comments, DMs, and profile visits
- use reference creators to raise taste, not to copy lines, structure, or claims

Content pillars:

- AI-native dashboards adding conversational input without throwing away the existing UI
- users only using a small slice of feature-rich products
- chat as the fastest input path to adoption, activation, and time-to-value
- embedded AI that takes approved actions, not just answers questions
- product and UX shifts from menu hunting to intent capture with structured output in the widget or native app UI
- smart commentary on launches, interface changes, and product strategy shifts that show where software is going

Reference accounts for taste calibration:

- `https://x.com/LoganTGott`
- `https://x.com/AdamrahmanGTM`
- `https://x.com/itsalexvacca`
- `https://x.com/paolo_scales`

Every accepted post should have one concrete pattern, opinion, or takeaway and enough support that a smart reader would save, reply, or DM about it.
