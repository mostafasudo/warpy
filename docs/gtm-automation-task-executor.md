# Warpy GTM Task Executor Automation

## Objective

Use Apollo as the operational queue for outbound tasks, then complete eligible GTM tasks through approved platform workflows with Chrome CDP when needed.

This automation removes founder manual work from sequence follow-through while preserving quality, idempotency, and AE ownership of real conversations.

## Source Of Truth

Read first:

1. `GTM.md`
2. `docs/gtm-automation-task-executor.md`

## GTM Scope & Platform Compliance

This automation is routine sales and marketing sequencing work only: due-task review, compliant outbound emails, LinkedIn like-only public engagement, connection requests, DMs when connected, X touches when appropriate, Apollo task completion, and local audit logging.

Use only authenticated, user-owned GTM accounts and approved Apollo, LinkedIn, X, Amplemarket, and source-site workflows. Do not perform cybersecurity testing, vulnerability research, credential work, bypassing, evasion, scraping protected data, or unauthorized access. If a task appears outside GTM or outside a platform-allowed workflow, skip it and log the reason.

Relevant marketing skills:

- `.codex/skills/marketing/cold-email/SKILL.md`
- `.codex/skills/marketing/social-content/SKILL.md`
- `.codex/skills/marketing/sales-enablement/SKILL.md`
- `.codex/skills/marketing/revops/SKILL.md`

If Amplemarket context is needed, prefer direct `mcp__amplemarket__*` read-only lookup when it can answer the exact question. If that lookup is unavailable, limited, unsupported, stale, or failing, load `docs/chrome-cdp.md` and fall back to the Chrome CDP user browser.

## Systems

- Apollo: task queue, sequence context, contact/account stage state
- Chrome CDP workflow for the user's authenticated GTM browser session: Apollo, LinkedIn, and X platform workflows when direct tooling cannot complete the step
- LinkedIn: likes-only public social engagement, connection requests, DMs
- X: optional social touch, including public comments, when the lead is active there
- Local GTM state: `/Users/levw/.codex/state/warpy-gtm/`
- Task ledger: `/Users/levw/.codex/state/warpy-gtm/task-action-ledger.jsonl`
- Recipient-safety ledger CLI: `scripts/gtm-task-guard.mjs`
- Recipient-safety ledger index: `/Users/levw/.codex/state/warpy-gtm/task-guard-index.json`
- Recipient-safety ledger claims: `/Users/levw/.codex/state/warpy-gtm/task-guard-claims/`

## Run Concurrency Guard

Before doing any other workflow step, claim the automation run lock:

```sh
node scripts/gtm-automation-run-guard.mjs claim --automation-id warpy-gtm-task-executor --stale-after-ms 7200000
```

If the guard returns `decision: "blocked"`, do not read Apollo, open GTM platforms, claim recipient ledger entries, or update local GTM state. Open only a short skipped inbox item that says an older `warpy-gtm-task-executor` run is already active, then stop.

If the guard returns `decision: "claimed"`, keep the returned `owner_token` for the whole run. As the final tool action before the final inbox report, release the lock:

```sh
node scripts/gtm-automation-run-guard.mjs release --automation-id warpy-gtm-task-executor --owner-token <owner_token>
```

Different GTM automations may run at the same time. Only another active `warpy-gtm-task-executor` run blocks this automation.

## Context Budget And Checkpoints

Follow the shared context-budget rules in `GTM.md`.

Persistent run checkpoints:

- directory: `/Users/levw/.codex/state/warpy-gtm/task-executor-runs/`
- filename: `<run-start-iso>.json`

Update the checkpoint after the Apollo run-start queue snapshot, recipient-safety index rebuild, each recipient-visible action attempt, each Apollo completion verification, and final queue/blocker reconciliation. Run a guard heartbeat after each checkpoint:

```sh
node scripts/gtm-automation-run-guard.mjs heartbeat --automation-id warpy-gtm-task-executor --owner-token <owner_token>
```

Do not keep raw Apollo task payloads, page extraction dumps, task-history dumps, LinkedIn/X page captures, screenshots, or full ledger excerpts in the live transcript. Write them to artifacts and summarize only reviewed/completed/skipped counts, recipient-safety claim/block counts, task IDs acted on, exact copy used for sent actions, blocker reasons, and paths.

Do not run bulk task, history, lead-list, page, or table reads unless the tool can return a compact projection. If a platform surface cannot be limited, capture only the visible fields needed through Chrome CDP or checkpoint and stop.

## Cadence

Run every two hours on weekdays so the executor keeps Apollo moving without creating unnecessary hourly backlog churn.

## Programmatic Tool Fallback

Chrome CDP is the fallback path for approved GTM platforms. If an MCP, direct MCP, connector, direct API, script, agent tool, or other non-browser path is unavailable, limited, unsupported for the needed platform-allowed GTM step, stale, or failing, use the Chrome CDP workflow for the user's authenticated GTM browser session before marking the task blocked.

This applies to read-only context lookup as well as recipient-facing GTM platform workflows. Local state and the task ledger remain local filesystem work.

## Non-Blocking Operating Rule

Keep processing eligible Apollo tasks until the due-today and overdue queue has no safe work left. Do not introduce arbitrary per-channel, daily-volume, deliverability, or throughput caps beyond the due-window and recipient safety gates.

## Due-Window Enforcement

The executor must preserve Apollo sequence timing and per-contact sequence order. A task is eligible only when all of these are true:

- it belongs to the Warpy outbound motion / `Warpy Founder-Led SDR Sequence`
- Apollo status is open or pending, not completed, dismissed, paused, or skipped
- Apollo due date is before the current local date, or due on the current local date
- Apollo due date is verified from Apollo before any recipient-visible GTM step
- all earlier Apollo sequence steps for the same contact are completed, safely skipped with a terminal no-action reason, or no longer applicable in Apollo
- the task was present in the due/overdue run-start snapshot built at the start of the run
- no outbound touch has already been sent to the same contact during the current executor run

Do not complete future-dated Apollo tasks. Do not pull forward later sequence steps to clear visible backlog. Do not use Apollo views that mix future tasks with due work unless each task's due date is independently verified before any recipient-visible GTM step.

Do not complete sequence steps out of order for a contact. Before any outbound touch, inspect Apollo task detail, sequence context, and visible contact task history enough to verify that no earlier sequence step is still open, pending, future-dated, `completion_pending`, blocked by a transient platform error, or unresolved. If an earlier step is unresolved or its state cannot be verified, skip the later task with `skip_reason: "prior_sequence_step_unresolved"` and continue to the next eligible task.

Terminal no-action skips are allowed only when the earlier step should not produce an outbound touch, such as no recent relevant social post, connection not accepted for a DM task, suppressed contact/account state, AE-owned handoff, unsubscribe, do-not-contact, bad data, duplicate prevention, or Apollo indicating the step is no longer applicable. Browser errors, unresolved placeholders, due-date uncertainty, future-dated tasks, and completion failures are not terminal no-action reasons and must block later steps for that contact until resolved.

Build the eligible task queue once at run start. Do not refresh the queue after completing a task in order to pick up newly generated sequence tasks. If Apollo creates or reveals another task after completion, leave it for a later executor run and log it as deferred. This prevents back-to-back sequence steps caused by task completion side effects.

Never send more than one outbound touch to the same contact in a single executor run. If multiple due or overdue tasks exist for the same contact in the run-start snapshot, choose the oldest due task after applying safety checks and defer the rest with `skip_reason: "same_run_contact_cadence_guard"`. This is a recipient safety rule, not a throughput cap.

Use Apollo's task queue as the entry point:

`https://app.apollo.io/#/tasks?sortBy[]=task_due_at.asc&dateRange[min]=0_minutes_later&dateRange[max]=1_days_later`

After opening the task page, apply the necessary Apollo filters so the working view contains only due/overdue or today's tasks for the Warpy outbound motion, sorted by due date ascending. Treat the URL as a starting view, not proof of eligibility. Never complete a task from an all-open, all-pending, sequence-wide, or contact-detail task list until the task detail confirms that it is due today or overdue.

If a task has no visible due date, a malformed due date, an ambiguous timezone, or conflicting list/detail due-state, skip it with `skip_reason: "due_date_unverified"` and continue to the next eligible task. The only exception is retrying Apollo completion for an existing `completion_pending` ledger item after the recipient-visible platform step has already succeeded; that retry must not send any new outbound touch.

If a specific eligible task is unsafe, unclear, duplicate-prone, or missing context, mark that task with a reason and continue to the next eligible task.

## Context Order

When a task needs message context, use:

1. `manifest-index.json` and the referenced batch manifest
2. `GTM.md`
3. the live Apollo sequence step and task note
4. direct Amplemarket read-only lookup when needed, limited to the specific person/company fields required, with Chrome CDP fallback when MCP lookup is limited, bulky, or failing
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

## Recipient-Safety Ledger Contract

Duplicate prevention is at-most-once. A skipped or missed touch is acceptable; a duplicate email, DM, connection request, or public social touch is not.

Before opening any Apollo email, LinkedIn, X, or other approved GTM platform composer, create an audit record JSON and claim it through the recipient-safety ledger CLI:

```sh
node scripts/gtm-task-guard.mjs claim --payload-file /path/to/task-audit-record.json
```

The audit record must include:

- `apollo_task_id`
- `run_started_at`
- `local_date`
- `channel`
- `step_type`
- `contact_email`, `linkedin_url`, `x_url`, `apollo_contact_id`, or `contact_name` plus `account_domain`

The recipient-safety ledger normalizes:

- `email` and `apollo_email` into the same `email` family
- LinkedIn URLs by host/path, ignoring trailing slashes and query/hash noise
- all available recipient identities from lowercased email, normalized social URLs, Apollo contact id, and strict fallback identifiers
- action family into `email`, `linkedin_dm`, `connection_request`, `public_social_touch`, or `x_touch`

`copy_hash` is audit metadata only. It must never be part of the duplicate-prevention boundary.

The recipient-safety ledger blocks when any of these are true:

- the same Apollo task already has a `claimed`, `sent`, `completion_pending`, or `completed` ledger record
- the same normalized recipient already has an outbound touch claimed in the same executor run
- the same normalized recipient already received an email or LinkedIn DM on the same local date
- a prior `completion_pending` record exists, in which case only Apollo completion may be retried

If the recipient-safety ledger returns `blocked`, do not open or touch the approved GTM platform composer. Write a `skipped` ledger entry with the block reason and continue. If it returns `claimed`, complete the eligible GTM task at most once, then mark ledger state after the result:

```sh
node scripts/gtm-task-guard.mjs mark --status sent --payload-file /path/to/task-audit-record.json
node scripts/gtm-task-guard.mjs mark --status completed --payload-file /path/to/task-audit-record.json
node scripts/gtm-task-guard.mjs mark --status completion_pending --payload-file /path/to/task-audit-record.json
```

For Apollo-native email, do not pre-complete the Apollo task if doing so would destroy the send/draft path. The local recipient-safety ledger claim is the hard safety boundary. Use Apollo pre-completion only for task types where completion is independent of the outbound send.

Backfill the recipient-safety ledger index from legacy records before relying on historical safety state:

```sh
node scripts/gtm-task-guard.mjs rebuild-index
```

Use the audit mode to inspect duplicate-prone history without mutating Apollo or any GTM platform:

```sh
node scripts/gtm-task-guard.mjs audit
```

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
- `linkedin_url`
- `guard_claim_keys` (legacy field name for recipient-safety ledger claim keys)
- `guard_block_reason` (legacy field name for recipient-safety ledger block reason)
- `copy_hash`
- `status`
- `sent_at`
- `apollo_completed_at`
- `platform_url`

Statuses:

- `claimed`: local recipient-safety ledger claim created before any approved GTM platform composer was opened
- `planned`: copy generated, action not taken
- `sent`: recipient-visible platform step succeeded
- `completion_pending`: action sent, Apollo completion did not persist
- `completed`: action sent and Apollo task completed
- `skipped`: task intentionally skipped with reason

Never resend an action already recorded as `claimed`, `sent`, `completion_pending`, or `completed`. If completion is pending, retry only Apollo task completion.

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

1. Claim the run concurrency guard for `warpy-gtm-task-executor`.
2. Establish the current local date.
3. Open Apollo tasks at `https://app.apollo.io/#/tasks?sortBy[]=task_due_at.asc&dateRange[min]=0_minutes_later&dateRange[max]=1_days_later`, then apply due/overdue and today's-task filters for the Warpy outbound motion only.
4. Load the manifest index and task ledger.
5. Rebuild the recipient-safety ledger index with `node scripts/gtm-task-guard.mjs rebuild-index`.
6. Build the eligible task queue only from Apollo tasks whose detail view confirms they are overdue or due on the current local date.
7. Freeze that run-start queue. Do not add tasks that appear after another task is completed.
8. Sort eligible pending tasks oldest due first, with the priority order above when volume is high.
9. For each eligible task:
   - record `run_started_at`
   - record `apollo_due_date` and `apollo_due_state`
   - record `apollo_sequence_step` and `prior_sequence_step_state`
   - re-check that the task is not future-dated before any recipient-visible GTM step
   - re-check that all earlier Apollo sequence steps for the contact are completed, safely terminal-skipped, or no longer applicable
   - re-check that no outbound touch has already been sent to the same contact in this run
   - read Apollo note, contact context, and sequence step
   - load matching manifest context
   - check handoff, suppression, duplicate, and stage state
   - inspect LinkedIn or X only when needed for context, using Chrome CDP when any non-browser lookup cannot provide the needed context
   - generate or edit the exact copy
   - write an audit record JSON and run `node scripts/gtm-task-guard.mjs claim --payload-file <task-audit-record.json>` before opening any approved GTM platform composer
   - if the recipient-safety ledger blocks, do not open the platform composer; write `skipped` with the block reason and continue
   - complete the eligible GTM task when safe
   - mark ledger status `sent` immediately after the recipient-visible platform step succeeds
   - write `sent` immediately after the recipient-visible platform step succeeds
   - complete the Apollo task
   - mark ledger status `completed` only after Apollo confirms completion
   - write `completed` only after Apollo confirms completion
10. If Apollo completion fails after the recipient-visible platform step succeeds, mark ledger status `completion_pending`, write `completion_pending`, and retry only completion next time.
11. If a task cannot be completed safely, log the reason and keep moving.
12. Release the run concurrency guard before the final inbox report.

## Logging

For each run, log:

- tasks reviewed
- tasks completed
- tasks skipped with reasons
- future-dated tasks observed and skipped
- later sequence steps skipped because a prior step was unresolved
- same-run contact cadence deferrals
- tasks skipped because due date could not be verified
- recipient-safety ledger claims and blocks
- accounts moved into AE-owned, suppressed, or blocked state
- Apollo/local state mismatches
- links to profiles or posts acted on
- exact copy used
- Apollo due date/state for every acted task
- Apollo sequence step and prior-step state for every acted task
- ledger path and `completion_pending` items
- recipient-safety ledger index path and any `claimed` items that did not reach `sent`, `completion_pending`, or `completed`

## Success Criteria

A successful run:

- completes eligible due/overdue tasks without arbitrary throughput caps
- completes only overdue tasks and tasks due on the current local date
- skips every future-dated or due-date-unverified task without outbound action
- never completes a later sequence step before earlier steps for the same contact are completed, safely terminal-skipped, or no longer applicable
- never sends two outbound touches to the same contact in one executor run
- never opens an approved GTM platform composer before a successful recipient-safety ledger claim
- does not complete tasks that appear only after another task is completed in the same run
- keeps copy aligned with `GTM.md`
- avoids duplicate sends across retries
- leaves replies and live conversations to the AE
- updates Apollo task state and local ledger accurately
- records blockers without stopping unrelated tasks
