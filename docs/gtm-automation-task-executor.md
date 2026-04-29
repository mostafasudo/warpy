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

## Cadence

Run every two hours on weekdays so the executor keeps Apollo moving without rechecking the same task queue too frequently.

## Programmatic Tool Fallback

Chrome CDP is the fallback path for every external GTM surface. If an MCP, direct MCP, connector, direct API, script, agent tool, or other non-browser path is unavailable, limited, unsupported for the needed action, stale, or failing, use the Chrome CDP user browser for that step before marking the task blocked.

This applies to read-only context lookup as well as execution surfaces. Local state and the task ledger remain local filesystem work.

## Non-Blocking Operating Rule

Keep processing eligible Apollo tasks until the due-today and overdue queue has no safe work left. Do not introduce arbitrary per-channel, daily-volume, deliverability, or throughput caps beyond the due-window and recipient safety gates.

## Due-Window Enforcement

The executor must preserve Apollo sequence timing and per-contact sequence order. A task is eligible only when all of these are true:

- it belongs to the Warpy outbound motion / `Warpy Founder-Led SDR Sequence`
- Apollo status is open or pending, not completed, dismissed, paused, or skipped
- Apollo due date is before the current local date, or due on the current local date
- Apollo due date is verified from Apollo before any external action
- all earlier Apollo sequence steps for the same contact are completed, safely skipped with a terminal no-action reason, or no longer applicable in Apollo
- the task was present in the due/overdue execution snapshot built at the start of the run
- no outbound touch has already been sent to the same contact during the current executor run

Do not execute future-dated Apollo tasks. Do not pull forward later sequence steps to clear visible backlog. Do not use Apollo views that mix future tasks with due work unless each task's due date is independently verified before action.

Do not execute sequence steps out of order for a contact. Before any outbound action, inspect Apollo task detail, sequence context, and visible contact task history enough to verify that no earlier sequence step is still open, pending, future-dated, `completion_pending`, blocked by a transient execution error, or unresolved. If an earlier step is unresolved or its state cannot be verified, skip the later task with `skip_reason: "prior_sequence_step_unresolved"` and continue to the next eligible task.

Terminal no-action skips are allowed only when the earlier step should not produce an outbound action, such as no recent relevant social post, connection not accepted for a DM task, suppressed contact/account state, AE-owned handoff, unsubscribe, do-not-contact, bad data, duplicate prevention, or Apollo indicating the step is no longer applicable. Browser errors, unresolved placeholders, due-date uncertainty, future-dated tasks, and completion failures are not terminal no-action reasons and must block later steps for that contact until resolved.

Build the execution queue once at run start. Do not refresh the queue after completing a task in order to pick up newly generated sequence tasks. If Apollo creates or reveals another task after completion, leave it for a later executor run and log it as deferred. This prevents back-to-back sequence steps caused by task completion side effects.

Never send more than one outbound touch to the same contact in a single executor run. If multiple due or overdue tasks exist for the same contact in the run-start snapshot, choose the oldest due task after applying safety checks and defer the rest with `skip_reason: "same_run_contact_cadence_guard"`. This is a recipient safety rule, not a throughput cap.

If Apollo exposes queue filters, use only due/overdue and today's-task filters for execution. Never execute from an all-open, all-pending, sequence-wide, or contact-detail task list until the task detail confirms that it is due today or overdue.

If a task has no visible due date, a malformed due date, an ambiguous timezone, or conflicting list/detail due-state, skip it with `skip_reason: "due_date_unverified"` and continue to the next eligible task. The only exception is retrying Apollo completion for an existing `completion_pending` ledger item after the external action has already succeeded; that retry must not send any new outbound touch.

If a specific eligible task is unsafe, unclear, duplicate-prone, or missing context, mark that task with a reason and continue to the next eligible task.

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
- `apollo_due_date`
- `apollo_due_state`
- `apollo_sequence_step`
- `prior_sequence_step_state`
- `run_started_at`
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

Within each bucket, work overdue tasks first, oldest due first, then tasks due today oldest due first. Priority guides order only. It is not a cap, never makes future-dated tasks eligible, and never overrides per-contact sequence order.

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

1. Establish the current local date.
2. Open Apollo tasks for the Warpy outbound motion using due/overdue and today's-task filters only.
3. Load the manifest index and task ledger.
4. Build the execution queue only from Apollo tasks whose detail view confirms they are overdue or due on the current local date.
5. Freeze that run-start queue. Do not add tasks that appear after another task is completed.
6. Sort eligible pending tasks oldest due first, with the priority order above when volume is high.
7. For each eligible task:
   - record `run_started_at`
   - record `apollo_due_date` and `apollo_due_state`
   - record `apollo_sequence_step` and `prior_sequence_step_state`
   - re-check that the task is not future-dated before any external action
   - re-check that all earlier Apollo sequence steps for the contact are completed, safely terminal-skipped, or no longer applicable
   - re-check that no outbound touch has already been sent to the same contact in this run
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
8. If Apollo completion fails after the action succeeds, write `completion_pending` and retry only completion next time.
9. If a task cannot be completed safely, log the reason and keep moving.

## Logging

For each run, log:

- tasks reviewed
- tasks completed
- tasks skipped with reasons
- future-dated tasks observed and skipped
- later sequence steps skipped because a prior step was unresolved
- same-run contact cadence deferrals
- tasks skipped because due date could not be verified
- accounts moved into AE-owned, suppressed, or blocked state
- Apollo/local state mismatches
- links to profiles or posts acted on
- exact copy used
- Apollo due date/state for every acted task
- Apollo sequence step and prior-step state for every acted task
- ledger path and `completion_pending` items

## Success Criteria

A successful run:

- completes eligible due/overdue tasks without arbitrary throughput caps
- executes only overdue tasks and tasks due on the current local date
- skips every future-dated or due-date-unverified task without outbound action
- never executes a later sequence step before earlier steps for the same contact are completed, safely terminal-skipped, or no longer applicable
- never sends two outbound touches to the same contact in one executor run
- does not execute tasks that appear only after another task is completed in the same run
- keeps copy aligned with `GTM.md`
- avoids duplicate sends across retries
- leaves replies and live conversations to the AE
- updates Apollo task state and local ledger accurately
- records blockers without stopping unrelated tasks
