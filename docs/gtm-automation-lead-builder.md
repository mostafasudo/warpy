# warpy.ai GTM Lead Builder Automation

## Objective

Use Amplemarket as the sourcing and enrichment layer, then push clean, sequence-ready primary leads into Apollo while preserving full GTM context locally.

This automation keeps Apollo focused on outbound workflow state and keeps Amplemarket as a temporary sourcing transport, not a long-term system of record.

## Source Of Truth

Read first:

1. `GTM.md`
2. `docs/gtm-automation-lead-builder.md`

## GTM Scope & Platform Compliance

This automation is routine sales and marketing sourcing work only: account research, contact selection, verified business email lookup, Apollo import preparation, sequence enrollment, local GTM state updates, and cleanup of temporary sourcing lists.

Use only authenticated, user-owned GTM accounts and approved Amplemarket, Apollo, LinkedIn, X, and source-site workflows. Do not perform cybersecurity testing, vulnerability research, credential work, bypassing, evasion, scraping protected data, or unauthorized access. If a task appears outside GTM or outside a platform-allowed workflow, skip it and log the reason.

Relevant marketing skills:

- `.codex/skills/marketing/revops/SKILL.md`
- `.codex/skills/marketing/cold-email/SKILL.md`
- `.codex/skills/marketing/social-content/SKILL.md`

Use the direct `mcp__amplemarket__*` namespace for Amplemarket work whenever it can do the exact job. If the MCP is unavailable, limited, unsupported for the needed operation, stale, or failing, load `docs/chrome-cdp.md` and fall back to the Chrome CDP user browser for that Amplemarket step.

## Systems

- Direct Amplemarket MCP: search, enrichment, verified business email lookup, lead-list creation, and compact lead-list metadata when supported
- Local state: authoritative manifests and account-level control state
- Local artifacts: Apollo import CSVs and audit CSVs
- Apollo authenticated GTM browser workflow: import, verification, sequence enrollment, and adjacent import when multithreading is useful
- Amplemarket Duo Copilot suggestions: first-priority candidate queue from manually configured warpy.ai ICP signals at `https://app.amplemarket.com/dashboard/duo`
- Chrome CDP workflow for the user's authenticated GTM browser session: Apollo work, optional X lookup, and any Amplemarket step where direct MCP cannot complete the exact operation
- Local personalization packet: source of truth for per-lead outbound copy that the task executor refreshes and sends
- Local improvement log: `/Users/levw/.codex/state/warpy-gtm/improvement-log.jsonl` through `scripts/gtm-improvement-log.mjs`

## Run Concurrency Guard

Before doing any other workflow step, claim the automation run lock:

```sh
node scripts/gtm-automation-run-guard.mjs claim --automation-id warpy-gtm-lead-builder --stale-after-ms 7200000
```

If the guard returns `decision: "blocked"`, do not read source systems, open GTM platforms, create lists, import leads, or update local GTM state. Open only a short skipped inbox item that says an older `warpy-gtm-lead-builder` run is already active, then stop.

If the guard returns `decision: "claimed"`, keep the returned `owner_token` for the whole run. As the final tool action before the final inbox report, release the lock:

```sh
node scripts/gtm-automation-run-guard.mjs release --automation-id warpy-gtm-lead-builder --owner-token <owner_token>
```

Different GTM automations may run at the same time. Only another active `warpy-gtm-lead-builder` run blocks this automation.

## Context Budget And Checkpoints

Follow the shared context-budget rules in `GTM.md`.

Persistent run checkpoints:

- directory: `/Users/levw/.codex/state/warpy-gtm/lead-builder-runs/`
- filename: `<batch-name>-run.json`

Update the checkpoint after candidate shortlist selection, enrichment, Amplemarket list creation, artifact generation, Apollo import verification, sequence enrollment verification, manifest/index update, and cleanup. Run a guard heartbeat after each checkpoint:

```sh
node scripts/gtm-automation-run-guard.mjs heartbeat --automation-id warpy-gtm-lead-builder --owner-token <owner_token>
```

Do not keep raw Amplemarket search results, enrichment payloads, Apollo page extraction dumps, screenshots, CSV contents, or full candidate tables in the live transcript. Write them to artifacts and summarize only counts, accepted domains, rejected counts by reason, platform IDs, and paths.

Do not call Amplemarket `get_lead_list` for cleanup or resume after the manifest exists. It is a bulk read. Use the checkpointed list ID/name in Chrome CDP, or leave a cleanup blocker if deletion cannot be reached safely.

## Programmatic Tool Fallback

Direct MCP is an acceleration path, not a blocker. For every approved GTM platform step that uses MCP, direct MCP, a connector, direct API, script, or other non-browser tooling, use the Chrome CDP workflow for the user's authenticated GTM browser session when that programmatic path is unavailable, limited, unsupported, missing the needed action, stale, or failing.

Do not stop the run just because an MCP cannot perform a step. Use Chrome CDP for the live Amplemarket or Apollo UI when the browser can complete the work. Local manifests, CSVs, and audit artifacts remain local filesystem work.

## Duo Copilot Priority Source

Duo Copilot suggestions are the first candidate source for every Lead Builder run. They are a priority queue, not a bypass. Every Duo-sourced lead must still pass the same ICP scoring, buyer-authority verification, Apollo exclusion, verified work email, import, sequence, manifest, and cleanup rules as conventionally sourced Amplemarket leads.

At the start of the sourcing phase, open `https://app.amplemarket.com/dashboard/duo` through the Chrome CDP workflow and capture a compact suggestion queue. Capture only:

- lead name, title, company, company domain or website, LinkedIn URL, and Amplemarket profile URL when visible
- Duo signal name and signal type
- short trigger summary from the visible recommendation reason, post, event, competitor, or thought-leader context
- suggestion status and visible suggested date when available

For each promising Duo suggestion, click into the lead profile before acceptance. Verify the account is ICP-fit, the person maps to a primary buyer persona, and the title has seniority or ownership over Product, Support, CS/Growth, Engineering, or Founder decisions. Reject random SWEs, designers, junior ICs, unclear titles, or other non-buyer roles unless the profile or public context clearly proves relevant decision ownership.

When the Duo profile shows a suggested sequence panel, capture only compact messaging context: the suggested angle, trigger, pain, proof cue, and any useful phrase-level inspiration. Do not copy Duo messages verbatim, store full raw suggested copy, or let Duo copy override `GTM.md` voice. The Lead Builder should preserve enough context for Apollo execution to rewrite the eventual task copy in warpy.ai voice.

Do not bulk-read the Duo page, profile histories, full post bodies, large tables, screenshots, suggested-sequence bodies, or hidden detail payloads into the live transcript. Write any needed audit detail to the run artifact directory and summarize only counts, accepted domains, rejected counts by reason, signal names, and blockers.

Current manually configured warpy.ai ICP signals:

- `Warpy ICP | dashboard adoption + in-app AI intent`
- `Warpy ICP | Crow competitor engagement`
- `Warpy ICP | SaaS product + CS event intent`
- `Warpy ICP | PLG + AI product thought leaders`

Duo priority handling:

- Review Duo suggestions account-first before running broad Amplemarket searches.
- Prefer the strongest accepted Duo suggestion per account as the primary lead.
- Accept a Duo primary only after explicit account-fit, persona, title-seniority, and decision-maker verification.
- Keep a real second owner as an adjacent lead only when the account warrants multithreading.
- Import highest-fit Duo-sourced primaries first, then fill remaining capacity with the existing Amplemarket search flow.
- If Duo has no usable suggestions, is stale, unavailable, or the UI cannot be reached safely, log the blocker and continue the existing Amplemarket MCP/CDP sourcing workflow.
- After the local decision is recorded, dismiss reviewed Duo suggestions that are intentionally not picked up. Use only a clearly safe Amplemarket dismiss, pass, or not-interested action for that exact suggestion.
- Do not dismiss unreviewed Duo suggestions, accepted primaries, locally reserved adjacents, or suggestions whose UI action is ambiguous. If dismissal cannot be reached safely, leave the suggestion in place and log a cleanup blocker.

## Duo Dismissal Contract

Duo suggestions that are reviewed but not selected should not be left in the active Duo queue when Amplemarket exposes a safe dismissal action. This keeps future Lead Builder runs focused on fresh suggestions instead of repeatedly re-reviewing known rejects.

Before dismissing a Duo suggestion:

- Write the compact review decision to the run artifact directory: lead identity, company/domain, visible profile link, Duo signal name/type, rejection or skip reason, reviewer decision, and timestamp.
- Confirm the suggestion was reviewed in the current run and was not accepted as a primary or reserved as an adjacent.
- Confirm the visible Amplemarket action is clearly a dismiss, pass, or not-interested action for that exact suggestion.

After dismissal:

- Record `duo_dismissal_status`, `duo_dismissed_at`, and the visible action label in the run artifact or manifest rejection summary.
- Update the run checkpoint and heartbeat.
- Summarize only dismissed counts by reason and signal in the live transcript.

Never dismiss:

- suggestions that were not opened or reviewed
- buyer-fit suggestions held locally as adjacents
- accepted Duo primaries waiting for enrichment, import, or Apollo verification
- suggestions where the UI may complete, enroll, message, archive an unrelated item, or mutate a different recommendation

## Non-Blocking Operating Rule

Keep the automation moving. Do not add backlog gates, schedule gates, arbitrary quotas, duplicate research loops, or tool-preference rules that stop the run when there is still useful sourcing, enrichment, artifact generation, import, or cleanup work to do.

The only enforced throughput cap is:

- target `6` accepted primary leads per run
- hard max `8` accepted primary leads enriched/imported from Amplemarket per run

If fewer than 6 accepted primaries are available, use the smaller number. Do not fill the batch with weak accounts.

## Improvement Logging

At the end of the run, after side effects are checkpointed and before the final inbox report, decide whether the run exposed any obvious high-confidence issue or optimization worth recording.

Use:

```sh
node scripts/gtm-improvement-log.mjs add --payload-file <improvement-note.json>
```

Record only high-signal notes that would materially improve autonomous interested-lead generation, such as:

- recurring Duo, Amplemarket, Apollo, or Chrome CDP workflow blockers that reduce accepted lead volume
- clear ICP, buyer-authority, or data-quality failure modes that let bad accounts through or reject good accounts
- repeated import, sequence-enrollment, cleanup, or state-sync failures with a concrete fix
- obvious personalization-packet gaps that prevent sequence-ready leads from enrolling
- observability gaps that made safe autonomous recovery materially harder

Do not record speculative ideas, low-confidence preferences, isolated platform slowness, or generic "improve sourcing" notes. If the fix is not clear and the impact is not material, leave it out.

## Cadence

Run twice on weekdays. Smaller batches reduce per-run MCP, browser, import, and cleanup context while preserving comparable daily sourcing capacity.

## Lead And Account Rules

- Build account-first.
- Pick the strongest primary lead for the trigger.
- Keep an adjacent lead when there is a real second owner, but do not import the adjacent by default.
- Prefer one primary and one adjacent per account. Add more only with an explicit reason recorded in the manifest.
- Do not import accounts already owned by AE follow-up, active opportunity, current customer, do-not-contact, bad data, or active sequence motion in Apollo.
- Use verified work email for any contact entering email sequencing.
- Do not send to generic aliases, personal free-mail, or risky guessed emails.
- Treat LinkedIn as the main identity and social context surface when available.
- X is optional. Use it only when identity and buyer activity are clear.
- Every accepted account should have persona, trigger, pain hypothesis, proof point, `fit_score`, and `priority_tier`.
- Every accepted lead should have `decision_maker_verification` and `role_authority_summary`; Duo-sourced leads must not be imported without them.
- Every accepted primary lead should have a complete `personalization_packet` before Apollo enrollment. If copy cannot be generated safely, record `personalization_blocker` and do not enroll the lead until the blocker is resolved.
- Preserve Duo provenance for Duo-sourced leads so future runs can understand which signal created the opportunity.

## Persistent State Contract

Use:

- persistent GTM state: `/Users/levw/.codex/state/warpy-gtm/`
- temporary run artifacts: `/Users/levw/.codex/tmp/warpy-gtm/`

Persistent state:

- `manifest-index.json`
- `manifests/<batch-name>-manifest.json`

The manifest index is keyed by `company_domain`, then `thread_role`. It should store:

- lead identity and role
- `source_channel`: `duo_copilot`, `amplemarket_search`, or another explicit source channel
- Duo provenance when present: `duo_signal_name`, `duo_signal_type`, `duo_trigger_summary`, `duo_seen_at`, and `duo_profile_url`
- Duo copy context when present: `duo_message_context`, kept as compact rewritten notes rather than raw suggested sequence copy
- `personalization_packet`, with generated per-step drafts and evidence references for the primary lead
- `personalization_blocker` when a primary lead is otherwise accepted but should not be enrolled because safe personalized copy cannot be generated
- buyer authority fields: `decision_maker_verification` and `role_authority_summary`
- latest manifest path and batch name
- Apollo import and sequence status
- `account_status`: `active`, `ae_owned`, `suppressed`, or `blocked`
- `fit_score` and `priority_tier`
- Apollo contact/account stage state
- active sequence contact
- handoff or suppression reason when present

Temporary artifacts:

- `<batch-name>-full.csv`
- `<batch-name>-primaries-core.csv`
- `<batch-name>-adjacents-core.csv`

## Amplemarket MCP Map

Use direct MCP for:

- `get_industries`
- `get_job_functions`
- `search_people`
- `search_companies`
- `enrich_person`
- `enrich_company`
- `create_lead_list`
- `add_leads_to_lead_list`
- `list_lead_lists`
- `get_lead_list` only when a compact field/row projection is available and the result is required before side effects; never for cleanup or resume verification

Always use the Chrome CDP authenticated GTM browser workflow when direct MCP cannot complete the required Amplemarket step, including unsupported actions such as a missing delete operation.

## Search Profile

Use the ICP and persona definitions in `GTM.md`.

Useful company filters:

- B2B SaaS and software companies
- company sizes around `11-50`, `51-200`, and `201-500`
- industries such as software, fintech, healthcare, logistics, HR, analytics, data infrastructure, customer support, and operations platforms

Useful trigger signals:

- Duo Copilot suggestions from the configured warpy.ai ICP signals
- complex dashboard, analytics, reporting, workflow, or platform language
- product, support, onboarding, implementation, solutions engineering, or AI hiring
- recent launches, partnerships, funding, or product expansion that strengthens ICP fit
- public posts about activation, support scale, AI-native roadmap, or product adoption

Avoid bad-fit accounts when evidence points to:

- agencies, consultancies, outsourcing, recruiting, web design, or managed services
- consumer-first, marketplace-first, or offline-operations businesses without a dashboard-centered user workflow
- companies where the dashboard is not central to customer value

## Scoring

Score viable accounts before import:

- dashboard complexity and workflow density
- warpy.ai pain intensity: adoption drag, onboarding friction, repetitive support, or AI-native pressure
- trigger strength and recency
- persona seniority and ownership
- channel surface quality

Use tiers for prioritization:

- `Tier 1`: strongest fit and trigger
- `Tier 2`: solid fit worth importing if within cap
- `Tier 3`: keep only if the account has a clear reason to proceed

Import highest-fit accepted accounts first.

## Naming

Amplemarket temporary list:

`LB | YYYY-MM-DD | Batch NN`

Apollo/local batch:

`Warpy | Lead Builder | YYYY-MM-DD | Batch NN`

Do not use the Apollo/local name inside Amplemarket.

## Manifest Schema

The authoritative batch manifest should include:

- `first_name`
- `last_name`
- `email`
- `title`
- `company_name`
- `company_domain`
- `linkedin_url`
- `twitter_url`
- `email_verification_status`
- `persona`
- `thread_role`
- `trigger`
- `pain_hypothesis`
- `proof_point`
- `fit_score`
- `priority_tier`
- `source_channel`
- `duo_signal_name`
- `duo_signal_type`
- `duo_trigger_summary`
- `duo_seen_at`
- `duo_profile_url`
- `duo_message_context`
- `personalization_packet`
- `personalization_blocker`
- `decision_maker_verification`
- `role_authority_summary`
- `batch_name`
- `amplemarket_lead_list_id`
- `apollo_import_status`
- `apollo_sequence_status`
- `apollo_contact_stage`
- `apollo_account_stage`

The local manifest is the GTM source of truth for research context. Do not force triggers, hypotheses, or notes into Apollo unless a dedicated free-text custom field has already been validated.

## Personalization Packet Schema

Every accepted primary lead must get a compact `personalization_packet` before sequence enrollment. The packet is the copy source of truth for all future recipient-visible touches. Apollo templates and Duo suggestions are inputs only.

Required fields:

- `core_idea`: the warpy.ai thesis for this account, centered on complex dashboards, low feature adoption, repetitive support tickets, and an in-product assistant that combines chat, component-rich replies, configured tools, and screen autopilot
- `lead_specific_observation`: the specific account/person trigger that makes this outreach relevant
- `persona_angle`: the Product, Support, Technical, or CS/Growth angle for this lead
- `customer_problem`: the likely adoption, onboarding, product-usage, or repetitive-support problem this account may feel
- `why_this_company`: the bridge between the verified trigger and that customer problem
- `specific_dashboard_workflow`: one concrete workflow, screen, job, or product action the recipient would recognize
- `proof_workflow`: one concrete workflow warpy.ai could help users complete inside the company's dashboard
- `recipient_safe_warpy_bridge`: a plain-language explanation of how warpy.ai helps users ask for that workflow in chat, get component-rich guidance when useful, and complete the workflow through configured tools or screen autopilot in the existing dashboard
- `copy_source`: `duo_rewritten`, `research_generated`, or `executor_refreshed`
- `generated_at`: ISO timestamp
- `fresh_until`: ISO date or timestamp after which the executor should refresh the copy before sending
- `evidence_references`: compact source notes or URLs used for the observation
- `steps`: keyed drafts for sequence steps, such as `email_1`, `email_2`, `linkedin_connection`, `linkedin_dm`, `email_3`, `asset_send`, and `close_loop`

Each message-bearing `steps` entry should include:

- `channel`: `email`, `linkedin`, `x`, or `asset`
- `sequence_step`: Apollo step number or short label
- `subject`: required for email
- `body`: required for email, DM, X reply, or non-blank connection note
- `personalization_evidence`: the trigger or observation that justifies the copy
- `copy_status`: `ready`, `needs_refresh`, or `blocked`

Each message-bearing `steps` entry must be understandable without internal warpy.ai context. It should state why the trigger matters, name the likely user or support problem, include the concrete dashboard workflow, and explain warpy.ai in recipient-safe language. If a draft relies on internal terms, a vague comparison, or an unexplained product phrase, set `copy_status: "needs_refresh"` or `copy_status: "blocked"` instead of enrolling the lead.

Keep packet content compact. Store enough to regenerate and validate copy, not full Duo raw messages, bulky post bodies, screenshots, or long page extracts.

Recipient-visible packet copy must strip internal sourcing labels. It is fine for `evidence_references` to mention Apollo, Amplemarket, or Duo as local provenance, but `subject`, `body`, LinkedIn messages, X copy, and asset notes must never say `Apollo profile`, `Amplemarket`, `Duo Copilot`, or similar internal source names.

## Apollo Import Contract

Use Apollo-native CSV headers:

- `contact first name`
- `contact last name`
- `contact email`
- `contact title`
- `account name`
- `contact linkedin url`
- `twitter url`
- `account website`

Import behavior:

- prefer update-existing-record behavior when Apollo offers it
- verify imported contacts in Apollo People or through sequence enrollment
- do not rely on Apollo list row counts as the verification surface
- confirm contact and account stages remain sequence-eligible before enrollment

The lead builder may import contacts and enroll sequence-eligible primaries, but it must not complete, dismiss, or pull forward Apollo sequence tasks. After enrollment, leave all generated Apollo tasks untouched for the task executor. Sequence timing is controlled by Apollo due dates and per-contact step order; the executor may complete only overdue tasks or tasks due on the current local date, and only when all earlier Apollo sequence steps for that contact are completed, safely terminal-skipped, or no longer applicable.

## Cleanup Contract

Amplemarket lead lists are temporary batch containers.

- Delete the temporary Amplemarket list after local artifacts and Apollo state are safely recorded.
- When the Amplemarket MCP does not expose a delete operation, use the authenticated Chrome CDP Amplemarket UI for cleanup instead of leaving the list behind.
- For CDP cleanup, use only the checkpointed `amplemarket_lead_list_id` and neutral list name. Do not call `get_lead_list`, re-read list contents, or inspect lead rows after the local manifest exists.
- In the Amplemarket UI, search or navigate to the exact temporary list, confirm both the visible name and checkpointed ID when available, then use only a clearly labeled delete/remove/archive action for that exact list. If the UI offers an ambiguous bulk action or another list could be affected, stop and log a blocker.
- After deletion, verify through compact list metadata such as `list_lead_lists` or a visible UI absence check. Never verify cleanup by fetching full list contents.
- If cleanup cannot be completed safely, leave the list in place and log the blocker.
- The local manifest preserves the durable GTM context.

## Workflow

1. Claim the run concurrency guard for `warpy-gtm-lead-builder`.
2. Load `manifest-index.json` and Apollo exclusion context.
3. Open Duo Copilot suggestions at `https://app.amplemarket.com/dashboard/duo` with Chrome CDP and build the compact Duo priority queue.
4. Review Duo suggestions account by account against manifest, Apollo, suppression, ICP, buyer-authority, and fit-score gates.
5. Click into each promising Duo lead before acceptance, verify title seniority and decision ownership, and capture compact suggested-sequence inspiration as `duo_message_context` when available.
6. Select accepted Duo primaries and adjacent leads where useful, preserving Duo provenance, decision-maker verification, role authority, and compact message context in local state.
7. Record compact rejection or skip decisions for reviewed Duo suggestions that are not picked up, then dismiss those suggestions in Amplemarket when the exact suggestion exposes a safe dismiss/pass/not-interested action.
8. If accepted Duo primaries do not fill the run cap, search people and companies with direct Amplemarket MCP, falling back to Chrome CDP when MCP cannot complete the exact search.
9. Review non-Duo candidates account by account.
10. Select additional primary and adjacent leads where useful.
11. Enrich accepted leads and look up verified business emails for accepted primaries.
12. Add optional X context only when confidence is high.
13. Write trigger, pain hypothesis, proof point, fit score, priority tier, source channel, decision-maker verification, role authority, and Duo provenance/message context when present.
14. Generate a `personalization_packet` for every accepted primary lead using the trigger, persona, customer problem, company-specific bridge, concrete dashboard workflow, recipient-safe warpy.ai bridge, and compact evidence. Use Duo suggested-sequence context only as inspiration, rewritten in `GTM.md` voice.
15. If safe personalized copy cannot be generated, record `personalization_blocker`, skip Apollo enrollment for that lead, and keep processing other leads.
16. Create the temporary Amplemarket list and add accepted leads, using Chrome CDP if the MCP path is limited or failing.
17. Fetch final list metadata for audit only through compact metadata surfaces. Do not fetch full lead-list contents after the local manifest has been written.
18. Generate manifest and CSV artifacts.
19. Apply the Lead Builder cap and import the highest-fit Duo-sourced primaries first, then the highest-fit conventional Amplemarket primaries until the cap is reached.
20. Verify imported contacts in Apollo.
21. Enroll only sequence-eligible primaries that have a ready `personalization_packet` into `Warpy Founder-Led SDR Sequence`.
22. Update the batch manifest and manifest index.
23. Keep adjacent leads in local state for future multithreading.
24. Delete the temporary Amplemarket list when safe, falling back to Chrome CDP if direct MCP does not support or complete deletion. Do not call `get_lead_list` as part of cleanup.
25. Add improvement-log notes only for obvious high-impact bugs or optimizations found during the run.
26. Release the run concurrency guard before the final inbox report.

## Logging

For each run, log:

- batch name
- Amplemarket lead list id
- Duo suggestions reviewed, accepted, rejected, and imported by signal
- Duo reviewed suggestions dismissed, dismissal blockers, and dismissal reasons by signal
- Duo blockers, stale-state notes, or UI access issues
- Duo decision-maker verification rejects and compact message-context capture counts
- accounts reviewed and accepted
- primary leads enriched/imported
- adjacent leads reserved
- import cap used
- average `fit_score`
- accounts excluded for Apollo state, suppression, duplicates, or unverified email
- contacts with X found
- Apollo import and sequence enrollment results
- personalization packets generated, refreshed, blocked, and skipped by reason
- cleanup status and follow-up blockers
- improvement-log notes recorded, deduped, or intentionally omitted

## Success Criteria

A successful run:

- checks Duo Copilot suggestions first and imports the highest-fit Duo-sourced primaries before fallback-sourced leads
- imports only ICP-fit, buyer-verified, sequence-ready primary leads
- preserves compact Duo messaging context without storing or sending raw Duo suggested copy
- generates ready per-lead personalization packets before Apollo enrollment
- skips Apollo enrollment when a primary lead lacks safe personalized copy
- respects the `6` target and `8` hard max for accepted primaries
- preserves full GTM context locally
- keeps adjacent leads available without prematurely sequencing them
- verifies Apollo import and enrollment state
- avoids duplicates and AE-owned accounts
- cleans up temporary Amplemarket transport lists when safe
- records only high-confidence improvement notes, and only when the run exposed a material bug or optimization
