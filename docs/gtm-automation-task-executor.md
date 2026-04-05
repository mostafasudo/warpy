# Warpy GTM Task Executor Automation

## Objective

Use Apollo as the operational queue for all pending outbound tasks, then execute those tasks automatically through the live browser with Chrome CDP.

This automation exists to remove founder manual work from the sequence while keeping GTM quality high.

## Source Of Truth

Always read these first:

1. `GTM.md`
2. `docs/gtm-automation-task-executor.md`

Use these skills while working:

- [$cold-email](/Users/levw/Desktop/Levw/warpy/.codex/skills/marketing/cold-email/SKILL.md)
- [$social-content](/Users/levw/Desktop/Levw/warpy/.codex/skills/marketing/social-content/SKILL.md)
- [$sales-enablement](/Users/levw/Desktop/Levw/warpy/.codex/skills/marketing/sales-enablement/SKILL.md)
- [$revops](/Users/levw/Desktop/Levw/warpy/.codex/skills/marketing/revops/SKILL.md)

If Amplemarket context is needed during task execution, prefer the direct:

- `mcp__amplemarket__*`

namespace over browser navigation for Amplemarket.

## Systems

- Apollo: task queue and sequence context
- Apollo Deliverability Suite and stage model: send safety and handoff guardrails
- LinkedIn: social engagement, connection requests, DMs
- X / Twitter: optional social touch when the lead is active there
- Chrome CDP: execution layer for Apollo, LinkedIn, and X
- Direct Amplemarket MCP: optional read-only enrichment and context lookup only
- Persistent manifest index and manifests in `/Users/levw/.codex/state/warpy-gtm/`: source of truth for trigger, pain, proof, persona, adjacent lead lookup, and import state
- Persistent task-action ledger in `/Users/levw/.codex/state/warpy-gtm/task-action-ledger.jsonl`: idempotency layer for all browser actions
- Persistent daily rate counters in `/Users/levw/.codex/state/warpy-gtm/daily-rate-counters.json`: daily social and manual-email safety caps

## GTM Context Source Of Truth

When a task needs message context, use this order:

1. the persistent manifest index, then the referenced batch manifest for the lead or account
2. `GTM.md`
3. the live Apollo sequence step and task note
4. direct `mcp__amplemarket__*` read-only context if needed
5. the lead's live LinkedIn or X context

Do not assume Apollo custom fields hold the full GTM research context.

## Voice Rules

All recipient-facing copy must follow the voice in `GTM.md`.

Hard rules:

- default to lowercase
- keep punctuation light and informal
- do not "fix" rough phrasing just to make it read more professionally
- never use em dashes
- never use semicolons
- avoid corporate phrasing, polished transitions, and generic sales language
- keep messages short enough to feel personally typed
- lead with adoption, product usage, and users getting more done in the dashboard through chat
- mention lower support load only as a secondary outcome unless the persona or trigger clearly makes support the natural hook

If a live Apollo draft violates these rules, rewrite it before sending.

## Human Handoff Contract

The account executive owns all replies and live conversations.

Before taking any action, check whether Apollo indicates any of the following:

- replied contact
- booked meeting
- open opportunity
- active human-owned conversation
- manual pause or stop marker

Rules:

- if the contact has replied, do not automate any further touches to that contact
- if the account has a positive reply, booked meeting, or active opportunity, do not automate any further touches to any contact at that account
- if the account has an explicit negative reply or unsubscribe, suppress new automation to that account for at least `60 days` unless manually overridden
- update the persistent manifest index with the resulting `account_status`, reply timestamp, suppression window, and Apollo stage state

## Apollo Guardrails

Apollo must provide a second safety layer beyond the local ledger.

Required controls:

- The sequence ruleset must exclude contacts in `Replied`, `Interested`, `Do Not Contact`, and `Bad Data`.
- The sequence ruleset must exclude accounts in `Active Opportunity`, `Current Client`, `Do Not Prospect`, and any custom AE handoff stage such as `AE Owned` or `Automation Suppressed`.
- Before sending a manual email task, confirm the mailbox used by the sequence is healthy in Apollo Deliverability Suite and not blocked by sending-limit or critical-recommendation issues.
- If Apollo stage state and local manifest state disagree, treat the safer interpretation as the truth and skip the outbound action until reconciled.

## Idempotency Contract

Before taking any browser action, compute a stable action key from:

- `apollo_task_id`
- `channel`
- `step_type`
- `contact_email` or `linkedin_url`
- `copy_hash`

The ledger must record:

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

Status rules:

- `planned`: copy generated, action not yet taken
- `sent`: browser action executed successfully
- `completion_pending`: action sent, but Apollo task completion did not persist
- `completed`: action sent and Apollo task marked complete
- `skipped`: intentionally skipped with reason

Execution rules:

- if the ledger already contains `sent`, `completion_pending`, or `completed` for the same `action_key`, do not resend the action
- if the ledger shows `completion_pending`, try only to complete the Apollo task on the next run
- write `sent` immediately after the external action succeeds
- write `completed` only after Apollo task completion is confirmed

## Core Rules

1. Execute all high-confidence pending manual tasks.
2. Follow `GTM.md` exactly for channel choice, tone, and cadence.
3. Keep comments and messages short, human, and specific.
4. No generic pitch comments.
5. No fake familiarity.
6. No connection-note pitch by default.
7. If confidence is low, skip the action instead of forcing low-quality outreach.
8. If X is not clearly appropriate, use LinkedIn instead.
9. Respect per-run rate limits.
10. Only act on tasks that are already due in Apollo.
11. Trust Apollo due time as the primary timing gate, not the machine clock alone.
12. Check the idempotency ledger before every outbound action.
13. For email tasks, protect deliverability before throughput. If mailbox health is degraded, do not send.

## Working Window

Primary timing rule:

- process only tasks that are already due in Apollo

Secondary safety rule for social actions:

- if the lead's local time is visible and outside `8:00 AM` to `6:00 PM`, skip the social action until the next run
- if the lead's local time is not available, trust Apollo's due time and proceed

The cron may run more often than the actual send cadence. Apollo due state is the real schedule boundary.

## Per-Run Rate Limits

Cap each run at:

- `8` LinkedIn comments or reactions
- `8` connection requests
- `8` LinkedIn DMs
- `5` X replies or DMs
- `10` manual email sends

If there are more pending tasks, continue on the next run.

## Daily Rate Limits

Cap each day at:

- `20` LinkedIn comments or reactions
- `20` connection requests
- `15` LinkedIn DMs
- `8` X replies or DMs
- `20` manual email sends

Persist counters locally and do not exceed them even if the cron keeps running.

## Backlog Priority

When due-task volume exceeds per-run capacity, process in this order:

1. manual emails
2. multithread tasks
3. earned DMs
4. asset sends
5. connection requests
6. LinkedIn post interactions
7. second social touches on X

Within each priority bucket, work oldest due first.

## Apollo Starting Point

Start in Apollo tasks and work oldest due tasks first.

Prioritize tasks tied to:

- `Warpy Founder-Led SDR Sequence`

## Task-Type Playbook

### 1. Manual email

Goal:

- send the Apollo task email when the body matches the GTM step and reads cleanly

Rules:

- keep Apollo's native signature enabled
- never add a manual signature line
- verify there is only one CTA
- keep the copy aligned with the step angle in `GTM.md`
- pull the trigger and persona angle from the persistent manifest state first
- keep the tone in the lowercase informal house style even after polishing
- if Apollo shows a meaningful prior engagement signal such as opens, clicks, profile views, or recent connection acceptance, bias the message toward a specific breakdown or useful observation instead of a generic ask
- do not send if the contact or account is in an Apollo stage that should block the sequence
- do not send if the sending mailbox has unresolved deliverability blockers
- send as-is if it is already clean
- lightly polish only if the live task body is clearly off-strategy

### 2. LinkedIn - interact with post

Goal:

- build familiarity without pitching

Rules:

- prefer a recent post from the lead
- if the lead has no recent relevant post, use a company or adjacent leadership post
- like the post
- add a comment only when there is a real insight to add
- comment should be `1-2 sentences`
- no product mention unless the post explicitly opens the door
- no CTA
- if there is no valid post or no real insight to add, skip the comment and do not force an empty engagement
- keep the comment natural and lowercase, like something typed quickly by a real person

Good comment pattern:

- reflect the point
- add one useful observation

Bad comment pattern:

- “great post”
- pitching Warpy
- pretending to know them

### 3. LinkedIn - send connection request

Goal:

- create a clean path for later DM

Rules:

- default to a blank request
- only add a note when there is strong specific context:
  - their post
  - a mutual event
  - a shared contact
  - a very recent public trigger
- if a note is used, keep it under `220 characters`
- never pitch in the request note
- keep the note lowercase and casual

### 4. LinkedIn - send message

Goal:

- send a short permission-based DM after connection

Rules:

- keep it very short
- reference the real trigger
- offer a breakdown or useful observation
- do not ask for a demo
- keep it lowercase and slightly imperfect, not polished

### 5. Action item - second social touch

Goal:

- deliver the Day 5 light social touch

Rules:

- if the lead is clearly active on X and there is a relevant post, use X
- otherwise do another LinkedIn engagement
- keep it lighter than a DM
- no hard CTA

### 6. Action item - multithread

Goal:

- activate the adjacent lead on the same account with a different KPI angle

Rules:

- find the adjacent contact in the persistent manifest index for the same account
- do not multithread if the account is AE-owned, replied, booked, or currently in human follow-up
- only multithread Tier 1 or Tier 2 accounts, or accounts with a clearly new trigger
- if the adjacent contact is not already in Apollo, import that one adjacent lead first using the saved adjacent import file only if the adjacent lead is still stage-eligible and has a verified work email for email-based steps
- choose a different angle than the primary lead received
- prefer a lightweight first touch:
  - connection request
  - short email
  - brief LinkedIn DM if already connected
- do not duplicate the primary message

### 7. Action item - earned DM

Goal:

- send a short X DM or LinkedIn DM only when engagement has been earned

Rules:

- only DM if there was:
  - a follow-back
  - open DMs
  - prior engagement
  - a direct reply or reaction
- tie the message to the public interaction
- keep it extremely short
- keep it lowercase and casual

### 8. Action item - asset send

Goal:

- send useful proof, not a generic follow-up

Rules:

- prefer a concise written breakdown if no prebuilt asset exists
- the fallback asset should be a `3-bullet micro-breakdown`
- tailor the breakdown to the persona:
  - Product Lead: feature adoption and time-to-value
  - Support Lead: users getting unstuck in the product and fewer repetitive how do i do this questions
  - Technical Lead: AI-native layer without internal stack build
  - CS/Growth Lead: activation and power-user behavior
- send on the channel where the lead has shown the most engagement

## Execution Workflow

1. Open Apollo tasks.
2. Filter to pending tasks for the Warpy outbound motion.
3. Filter to tasks that are already due.
4. Sort oldest due first.
5. Load the persistent manifest index, the task-action ledger, and the daily rate counters.
6. Apply backlog priority if due-task volume is larger than the current per-run capacity.
7. Process tasks one by one.
8. For each task:
   - read the Apollo note and contact context
   - load the matching persistent manifest context by email or account
   - check for reply ownership, meeting state, open opportunity, suppression, blocked stage, or deliverability blocker before generating copy
   - if the account is AE-owned, suppressed, or stage-blocked, do not act and update the manifest index accordingly
   - read the sequence step context from `GTM.md`
   - inspect the lead's LinkedIn or X profile if needed
   - generate the exact copy using the marketing skills
   - compute the `action_key` and check the ledger
   - check the daily counters before taking any browser action
   - if the ledger already shows `sent`, `completion_pending`, or `completed`, do not resend
   - execute the action in the live browser
   - write `sent` to the ledger immediately after the browser action succeeds
   - increment the relevant daily counter
   - complete the task in Apollo
   - write `completed` only after Apollo completion is confirmed
9. If the browser action succeeds but Apollo completion fails, write `completion_pending` and retry only the Apollo completion on the next run.
10. If the action cannot be completed with high confidence, leave the task incomplete and log the reason.

## Quality Bar

A task should only be executed if the generated action:

- sounds like a thoughtful human
- is specific to the trigger or public context
- matches the correct persona angle
- does not over-pitch
- keeps friction low

## Skip Rules

Skip the action if:

- there is no valid profile or post to engage with
- the platform UI prevents safe execution
- the message would have to be generic
- there is a clear risk of duplicate outreach
- the account context is weak or contradictory
- the account is currently AE-owned or in a reply-driven human conversation
- the account is in a suppression or cooldown window
- the contact or account is in an Apollo stage that should block automation
- the step requires email and the mailbox health or sending limit makes the send unsafe
- the step requires email and the lead no longer has a verified work email status
- the relevant daily cap has already been reached

## Logging

For each run, log:

- number of tasks reviewed
- number completed
- number skipped
- skip reasons
- accounts moved into AE-owned or suppressed status
- accounts blocked by Apollo stage or deliverability health
- links to the posts or profiles acted on
- the exact copy used for each outbound action
- ledger path and any `completion_pending` items
- daily counter state at the end of the run

## Success Criteria

The run is successful only if:

1. completed tasks match the GTM intent for the sequence step
2. messages and comments read naturally
3. no task uses duplicate signatures or duplicate pitches
4. X is used only when it is genuinely the better channel
5. Apollo reflects the completed task state at the end of the run
6. no outbound action is sent twice because of a retry or partial failure
7. no action is taken on an AE-owned, replied, or suppressed account
8. daily social volume stays within the defined caps
9. manual emails are never sent when Apollo stages or deliverability health say the sequence should stop
