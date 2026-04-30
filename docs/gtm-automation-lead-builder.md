# Warpy GTM Lead Builder Automation

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

- Direct Amplemarket MCP: search, enrichment, verified business email lookup, lead-list creation, lead-list retrieval
- Local state: authoritative manifests and account-level control state
- Local artifacts: Apollo import CSVs and audit CSVs
- Apollo authenticated GTM browser workflow: import, verification, sequence enrollment, and adjacent import when multithreading is useful
- Chrome CDP workflow for the user's authenticated GTM browser session: Apollo work, optional X lookup, and any Amplemarket step where direct MCP cannot complete the exact operation

## Programmatic Tool Fallback

Direct MCP is an acceleration path, not a blocker. For every approved GTM platform step that uses MCP, direct MCP, a connector, direct API, script, or other non-browser tooling, use the Chrome CDP workflow for the user's authenticated GTM browser session when that programmatic path is unavailable, limited, unsupported, missing the needed action, stale, or failing.

Do not stop the run just because an MCP cannot perform a step. Use Chrome CDP for the live Amplemarket or Apollo UI when the browser can complete the work. Local manifests, CSVs, and audit artifacts remain local filesystem work.

## Non-Blocking Operating Rule

Keep the automation moving. Do not add backlog gates, schedule gates, arbitrary quotas, duplicate research loops, or tool-preference rules that stop the run when there is still useful sourcing, enrichment, artifact generation, import, or cleanup work to do.

The only enforced throughput cap is:

- target `12` accepted primary leads per run
- hard max `16` accepted primary leads enriched/imported from Amplemarket per run

If fewer than 12 accepted primaries are available, use the smaller number. Do not fill the batch with weak accounts.

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

## Persistent State Contract

Use:

- persistent GTM state: `/Users/levw/.codex/state/warpy-gtm/`
- temporary run artifacts: `/Users/levw/.codex/tmp/warpy-gtm/`

Persistent state:

- `manifest-index.json`
- `manifests/<batch-name>-manifest.json`

The manifest index is keyed by `company_domain`, then `thread_role`. It should store:

- lead identity and role
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
- `get_lead_list`

Always use the Chrome CDP authenticated GTM browser workflow when direct MCP cannot complete the required Amplemarket step, including unsupported actions such as a missing delete operation.

## Search Profile

Use the ICP and persona definitions in `GTM.md`.

Useful company filters:

- B2B SaaS and software companies
- company sizes around `11-50`, `51-200`, and `201-500`
- industries such as software, fintech, healthcare, logistics, HR, analytics, data infrastructure, customer support, and operations platforms

Useful trigger signals:

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
- Warpy pain intensity: adoption drag, onboarding friction, repetitive support, or AI-native pressure
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
- `batch_name`
- `amplemarket_lead_list_id`
- `apollo_import_status`
- `apollo_sequence_status`
- `apollo_contact_stage`
- `apollo_account_stage`

The local manifest is the GTM source of truth for research context. Do not force triggers, hypotheses, or notes into Apollo unless a dedicated free-text custom field has already been validated.

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
- If cleanup cannot be completed safely, leave the list in place and log the blocker.
- The local manifest preserves the durable GTM context.

## Workflow

1. Load `manifest-index.json` and Apollo exclusion context.
2. Search people and companies with direct Amplemarket MCP, falling back to Chrome CDP when MCP cannot complete the exact search.
3. Review candidates account by account.
4. Select primary and adjacent leads where useful.
5. Enrich accepted leads and look up verified business emails for accepted primaries.
6. Add optional X context only when confidence is high.
7. Write trigger, pain hypothesis, proof point, fit score, and priority tier.
8. Create the temporary Amplemarket list and add accepted leads, using Chrome CDP if the MCP path is limited or failing.
9. Fetch final list metadata for audit.
10. Generate manifest and CSV artifacts.
11. Apply the Lead Builder cap and import the highest-fit accepted primaries into Apollo.
12. Verify imported contacts in Apollo.
13. Enroll sequence-eligible primaries into `Warpy Founder-Led SDR Sequence`.
14. Update the batch manifest and manifest index.
15. Keep adjacent leads in local state for future multithreading.
16. Delete the temporary Amplemarket list when safe, falling back to Chrome CDP if direct MCP does not support or complete deletion.

## Logging

For each run, log:

- batch name
- Amplemarket lead list id
- accounts reviewed and accepted
- primary leads enriched/imported
- adjacent leads reserved
- import cap used
- average `fit_score`
- accounts excluded for Apollo state, suppression, duplicates, or unverified email
- contacts with X found
- Apollo import and sequence enrollment results
- cleanup status and follow-up blockers

## Success Criteria

A successful run:

- imports only ICP-fit, sequence-ready primary leads
- respects the `12` target and `16` hard max for accepted primaries
- preserves full GTM context locally
- keeps adjacent leads available without prematurely sequencing them
- verifies Apollo import and enrollment state
- avoids duplicates and AE-owned accounts
- cleans up temporary Amplemarket transport lists when safe
