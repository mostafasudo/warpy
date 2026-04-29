# Warpy GTM Task Executor Automation

## Objective

Use Apollo as the operational queue for outbound tasks, then execute actionable tasks through the live browser with Chrome CDP.

This automation removes founder manual work from sequence execution while preserving quality, idempotency, and AE ownership of real conversations.

## Source Of Truth

Read first:

1. `GTM.md`
2. `docs/gtm-automation-task-executor.md`

Relevant marketing skills:

- `.codex/skills/marketing/cold-email/SKILL.md`
- `.codex/skills/marketing/social-content/SKILL.md`
- `.codex/skills/marketing/sales-enablement/SKILL.md`
- `.codex/skills/marketing/revops/SKILL.md`

If Amplemarket context is needed, prefer direct `mcp__amplemarket__*` read-only lookup when it can answer the exact question. If that lookup is unavailable, limited, unsupported, stale, or failing, load `docs/chrome-cdp.md` and fall back to the Chrome CDP user browser.

## Systems

- Apollo: task queue, sequence context, contact/account stage state
- Chrome CDP: execution layer for Apollo, LinkedIn, and X
- LinkedIn: likes-only public social engagement, connection requests, DMs
- X: optional social touch, including public comments, when the lead is active there
- Local GTM state: `/Users/levw/.codex/state/warpy-gtm/`
- Task ledger: `/Users/levw/.codex/state/warpy-gtm/task-action-ledger.jsonl`

## Programmatic Tool Fallback

Chrome CDP is the fallback path for every external GTM surface. If an MCP, direct MCP, connector, direct API, script, agent tool, or other non-browser path is unavailable, limited, unsupported for the needed action, stale, or failing, use the Chrome CDP user browser for that step before marking the task blocked.

This applies to read-only context lookup as well as execution surfaces. Local state and the task ledger remain local filesystem work.

## Non-Blocking Operating Rule

Keep processing actionable Apollo tasks until the queue has no safe work left. Do not introduce per-run, per-channel, per-day, schedule-window, or daily-volume caps.

If a specific task is unsafe, unclear, duplicate-prone, or missing context, mark that task with a reason and continue to the next actionable task.

## Context Order

When a task needs message context, use:

1. `manifest-index.json` and the referenced batch manifest
2. `GTM.md`
3. the live Apollo sequence step and task note
4. direct Amplemarket read-only lookup when needed, with Chrome CDP fallback when MCP lookup is limited or failing
5. live LinkedIn or X context

Do not assume Apollo custom fields contain full GTM research context.

## Voice

Recipient-facing copy follows `GTM.md`.

Key reminders:

- lowercase by default
- short, informal, and human
- no em dashes or semicolons
- no corporate polish or generic sales language
- lead with adoption, product usage, and users getting more done in the dashboard
- mention support reduction only when the persona or trigger makes it natural

If a live Apollo draft is off-strategy, rewrite it before sending.

## Handoff And Safety

The AE owns replies, objections, negotiations, meetings, and live back-and-forth.

Before taking action, check Apollo and local state for:

- contact reply
- booked meeting
- open opportunity
- current customer
- active human-owned conversation
- do-not-contact, bad data, unsubscribe, or manual stop marker

If any are present, do not send outbound. Update local state with the safest account status and keep processing other tasks.

If Apollo stage state and local manifest state disagree, use the safer interpretation for that task and log the mismatch for reconciliation.

## Idempotency Contract

Before a browser action, compute a stable `action_key` from:

- `apollo_task_id`
- `channel`
- `step_type`
- `contact_email` or `linkedin_url`
- `copy_hash`

Ledger fields:

- `action_key`
- `apollo_task_id`
- `channel`
- `step_type`
- `contact_email`
- `copy_hash`
- `status`
- `sent_at`
- `apollo_completed_at`
- `platform_url`

Statuses:

- `planned`: copy generated, action not taken
- `sent`: external browser action succeeded
- `completion_pending`: action sent, Apollo completion did not persist
- `completed`: action sent and Apollo task completed
- `skipped`: task intentionally skipped with reason

Never resend an action already recorded as `sent`, `completion_pending`, or `completed`. If completion is pending, retry only Apollo task completion.

## Task Priority

When due-task volume is high, prioritize tasks that move conversations forward:

1. manual emails
2. multithread steps
3. earned DMs
4. asset sends
5. connection requests
6. social touches

Within each bucket, work oldest due first. Priority guides order only. It is not a cap.

## Task Playbook

### Manual Email

- keep Apollo's native signature enabled
- use one clear CTA
- align the message with the sequence step and persona angle
- pull trigger and proof context from local manifest first
- send clean drafts as-is
- polish only when the live task body is off-strategy

### LinkedIn Post Interaction

- prefer a recent relevant post from the lead
- use a company or adjacent leadership post when that is the better context
- like the post
- do not leave public LinkedIn comments for now
- if a task explicitly asks for a LinkedIn comment, either complete it as a like-only touch when the task allows public engagement alternatives, or skip it with the paused-comment reason
- no generic praise, fake familiarity, CTA, or product pitch

### X Post Interaction

- use only when the lead is clearly active there and the post is relevant
- likes and public comments/replies are allowed
- comment only when there is a real observation to add
- no generic praise, fake familiarity, CTA, or product pitch

### LinkedIn Connection Request

- default to a blank request
- use a note only when there is specific context
- keep it casual and non-pitchy

### LinkedIn DM

- send after connection when the task calls for it
- reference the real trigger
- offer a breakdown or useful observation
- do not ask for a demo by default

### Second Social Touch

- use X only when the lead is clearly active there and the post is relevant
- otherwise use LinkedIn as a like-only public touch
- keep it lighter than a DM
- no hard CTA

### Multithread

- find the adjacent contact in local state
- confirm the account is still automation-eligible
- import the adjacent contact only when the current task needs it and the contact is sequence-ready
- use a different KPI angle from the primary thread
- do not duplicate the primary message

### Earned DM

- use only when engagement makes the DM natural: follow-back, open DMs, prior interaction, direct reply, or reaction
- tie it to the public context
- keep it brief

### Asset Send

- send useful proof, not a generic follow-up
- use a concise written breakdown if no asset exists
- tailor the proof to Product, Support, Technical, or CS/Growth angle
- send on the channel where the lead has shown the most engagement

## Workflow

1. Open Apollo tasks for the Warpy outbound motion.
2. Load the manifest index and task ledger.
3. Sort actionable pending tasks oldest due first, with the priority order above when volume is high.
4. For each task:
   - read Apollo note, contact context, and sequence step
   - load matching manifest context
   - check handoff, suppression, duplicate, and stage state
   - inspect LinkedIn or X only when needed for the task, using Chrome CDP when any non-browser lookup cannot provide the needed context
   - generate or edit the exact copy
   - compute `action_key` and check the ledger
   - execute the browser action when safe
   - write `sent` immediately after the external action succeeds
   - complete the Apollo task
   - write `completed` only after Apollo confirms completion
5. If Apollo completion fails after the action succeeds, write `completion_pending` and retry only completion next time.
6. If a task cannot be completed safely, log the reason and keep moving.

## Logging

For each run, log:

- tasks reviewed
- tasks completed
- tasks skipped with reasons
- accounts moved into AE-owned, suppressed, or blocked state
- Apollo/local state mismatches
- links to profiles or posts acted on
- exact copy used
- ledger path and `completion_pending` items

## Success Criteria

A successful run:

- completes actionable tasks without arbitrary caps
- keeps copy aligned with `GTM.md`
- avoids duplicate sends across retries
- leaves replies and live conversations to the AE
- updates Apollo task state and local ledger accurately
- records blockers without stopping unrelated tasks
