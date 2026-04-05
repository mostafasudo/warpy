# Warpy GTM Lead Builder Automation

## Objective

Use Amplemarket as the sourcing and enrichment layer, then push clean, sequence-ready leads into Apollo without manual list building.

This automation exists to keep Apollo focused on execution while Amplemarket handles search and enrichment.

## Source Of Truth

Always read these first:

1. `GTM.md`
2. `docs/gtm-automation-lead-builder.md`

Use these skills while working:

- [$revops](/Users/levw/Desktop/Levw/warpy/.codex/skills/marketing/revops/SKILL.md)
- [$cold-email](/Users/levw/Desktop/Levw/warpy/.codex/skills/marketing/cold-email/SKILL.md)
- [$social-content](/Users/levw/Desktop/Levw/warpy/.codex/skills/marketing/social-content/SKILL.md)

Use the direct `amplemarket` MCP namespace whenever possible.

Prefer:

- `mcp__amplemarket__*`

Do not prefer:

- `mcp__codex_apps__amplemarket_*`

unless the direct `amplemarket` MCP is unavailable.

## Systems

- Direct Amplemarket MCP: search, enrichment, list creation, list retrieval
- Persistent local GTM state: manifest index plus authoritative per-batch manifests
- Local run artifacts: create Apollo import files plus audit CSVs from MCP output
- Apollo browser flow: primary import, import verification, sequence enrollment, and optional later adjacent import
- Chrome CDP: Apollo work, optional X / Twitter lookup, and Amplemarket temp-list cleanup when needed

## Primary Rules

1. Build around accounts, not raw contacts.
2. For each account, select exactly:
   - `1 primary lead`
   - `1 adjacent lead`
3. Do not add more than `2 contacts` per account in a single batch.
4. Do not add an account if it already has an active primary contact in the Apollo sequence.
5. Do not add a contact already active in Apollo, already imported recently for the same motion, or currently blocked by Apollo contact stages.
6. `LinkedIn URL` is required.
7. A verified real work email is required for any `primary` lead that will be imported into Apollo. Skip generic aliases such as `info@`, `hello@`, `support@`, `team@`, skip free-mail addresses, and skip risky unverified guesses for sequence entry.
8. `X / Twitter URL` is optional. Try to find it, but do not block the batch if it cannot be found with high confidence.
9. The automation should prefer quality over volume.
10. The persistent local manifest state is the source of truth for GTM context.
11. Import only `primary` leads into Apollo during the lead-builder run unless a separate adjacent-holding path has already been proven reliable.
12. Amplemarket list names must be neutral and must not contain `Warpy`.
13. Amplemarket lead lists are temporary and should be deleted when no longer needed.
14. Default throughput target is `6 primary leads` per run.
15. Hard cap is `8 primary leads` per run.
16. Never lower the quality bar to hit the target.
17. Before importing anything into Apollo, check open pending manual tasks for `Warpy Founder-Led SDR Sequence`.
18. Before importing anything into Apollo, check the mailbox and domain used by this sequence in Apollo Deliverability Suite. If the mailbox is not ready, warmed, authenticated, or has unresolved critical issues, import `0` new primaries and stop after artifact generation.
19. If Apollo has more than `20` open pending manual tasks, import `0` new primaries and stop after artifact generation.
20. If Apollo has `10-20` open pending manual tasks, cap the run at `4` new primaries.
21. The final import cap is the lowest of the backlog cap, the mailbox sending headroom, and the count of high-fit verified-email primaries in the batch.
22. Do not import any account that is already in AE-owned reply handling, has an open opportunity, is in an Apollo exclusion stage, or has a recent positive reply in Apollo.
23. If an account has an explicit negative reply, unsubscribe, or clear rejection signal, suppress new automated outreach to that account for at least `60 days` unless manually overridden.

## Persistent State Contract

Use two local directories with different purposes:

- Persistent GTM state: `/Users/levw/.codex/state/warpy-gtm/`
- Temporary run artifacts: `/Users/levw/.codex/tmp/warpy-gtm/`

Persistent GTM state must include:

- `manifest-index.json`
- `manifests/<batch-name>-manifest.json`

The persistent manifest index is the durable lookup layer for the task executor. It should be keyed by `company_domain`, then by `thread_role`, and should point to the latest accepted lead, manifest path, batch name, Apollo import status, and account control state for that role.

The index should also preserve account-level control fields:

- `account_status`: `active`, `ae_owned`, `cooldown`, `suppressed`
- `fit_score`
- `priority_tier`
- `last_imported_at`
- `last_positive_reply_at`
- `last_negative_reply_at`
- `suppression_until`
- `apollo_account_owner`
- `active_sequence_contact_email`
- `apollo_account_stage`
- `sequence_ruleset_block_reason`

Temporary run artifacts should include:

- `<batch-name>-full.csv`
- `<batch-name>-primaries-core.csv`
- `<batch-name>-adjacents-core.csv`

## Direct MCP Capability Map

Use the direct Amplemarket MCP for:

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

Do not use the browser for these steps unless the MCP fails.

Still use browser / local execution for:

- optional X / Twitter lookup
- Apollo CSV import
- Apollo people-search verification
- Apollo sequence enrollment
- optional later adjacent import

## Apollo Control-Plane Contract

Apollo must enforce the same guardrails that exist in local state.

Required sequence controls:

- Use a dedicated Apollo ruleset for `Warpy Founder-Led SDR Sequence`.
- Exclude contacts in `Replied`, `Interested`, `Do Not Contact`, and `Bad Data`.
- Exclude accounts in `Active Opportunity`, `Current Client`, `Do Not Prospect`, and any custom AE handoff stage such as `AE Owned` or `Automation Suppressed`.
- Keep contact and account stages synchronized with the automation decisions so Apollo can stop sends even if the local manifest is stale.
- Treat deliverability readiness as a hard gate before import and enrollment, not as a reporting afterthought.

## Amplemarket MCP Search Profile

Primary sourcing path:

- use direct `search_people`
- use direct `search_companies` only when company-level narrowing is needed before people selection

Default company filters:

- `company_sizes`: `11-50`, `51-200`, `201-500`
- `company_types`: `B2B`
- preferred `company_industries`:
  - `Software Development`
  - `Technology, Information and Internet`
  - `IT Services and IT Consulting`
  - `Financial Services`
  - `Hospitals and Health Care`
  - `Transportation, Logistics, Supply Chain and Storage`
  - `Human Resources Services`
  - `Business Intelligence Platforms`
  - `Data Infrastructure and Analytics`

Preferred company-description keywords when useful:

- `dashboard`
- `analytics`
- `workflow`
- `platform`
- `reporting`
- `support`
- `onboarding`
- `AI`

Recommended `company_exclude_keywords` when search quality is drifting toward bad-fit accounts:

- `agency`
- `consulting`
- `outsourcing`
- `services`
- `managed services`
- `recruiting`
- `marketing agency`
- `web design`
- `consumer`
- `ecommerce agency`

Use these Amplemarket MCP signals as ranking inputs when available, not hard requirements:

- `job_openings` for:
  - `Product Manager`
  - `Customer Success`
  - `Support`
  - `Implementation`
  - `Solutions Engineer`
  - `AI`
- positive `headcount_growth`
- recent company `news` tied to launches, hiring, or partnerships
- recent funding only when it supports the rest of the ICP fit instead of replacing it

Persona-specific title bundles:

- Product Lead:
  - `Head of Product`
  - `VP Product`
  - `Vice President Product`
  - `Director of Product`
  - `Product Manager`
  - `Senior Product Manager`
- Support Lead:
  - `Head of Support`
  - `VP Support`
  - `Vice President Support`
  - `Director of Support`
  - `Head of Customer Support`
  - `VP Customer Experience`
- Technical Lead:
  - `CTO`
  - `Chief Technology Officer`
  - `VP Engineering`
  - `Vice President Engineering`
  - `Head of Engineering`
  - `Engineering Director`
  - `Founder`
  - `Co-Founder`
- CS/Growth Lead:
  - `VP Customer Success`
  - `Vice President Customer Success`
  - `Head of Customer Success`
  - `Director of Customer Success`
  - `Head of Growth`
  - `Growth Lead`
  - `Onboarding Lead`

Use the ICP and persona definitions from `GTM.md`.

Primary-lead preference inside an accepted account:

- prefer the most senior persona who clearly owns the visible KPI
- prefer Support or Product leadership before individual-contributor PMs
- use Technical Lead as primary only when the trigger is truly AI-native, security, or integration-led
- keep CS/Growth as the default adjacent persona unless the trigger is explicitly onboarding or activation

Browser fallback only:

- `https://app.amplemarket.com/dashboard/search?search_view_key=f2ef6e7ef8aeb1d21ba870724ab65cf5ddbad43a&tab=people`

Do not treat the browser saved search as the primary source of truth.

## Account Scoring And Prioritization

Score each viable account before import.

Use this rubric:

- `0-3` dashboard complexity and workflow density
- `0-2` Warpy pain intensity: support deflection, onboarding friction, feature adoption drag
- `0-2` trigger strength and recency
- `0-2` persona quality: seniority, ownership, and likely buying influence
- `0-1` channel surface quality: recent LinkedIn activity, clear public context, or strong X presence

Total:

- `9-10`: `Tier 1`
- `7-8`: `Tier 2`
- `6 or below`: skip unless manually overridden

Import order:

- import highest `fit_score` first
- break ties by stronger trigger and better channel surface
- if backlog caps the run, keep lower-ranked accepted accounts in the manifest state but do not import them

## Batch Naming Convention

Use separate naming conventions:

Amplemarket temporary list name:

`LB | YYYY-MM-DD | Batch NN`

Apollo and local artifact batch name:

`Warpy | Lead Builder | YYYY-MM-DD | Batch NN`

Examples:

- Amplemarket: `LB | 2026-04-05 | Batch 01`
- Apollo/local: `Warpy | Lead Builder | 2026-04-05 | Batch 01`

Do not use the Apollo/local name inside Amplemarket.

## Authoritative Batch Manifest Schema

The authoritative local manifest must include these fields:

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

Write the manifest to the persistent local state directory and treat it as the GTM source of truth for:

- persona
- thread role
- trigger
- pain hypothesis
- proof point
- fit score
- priority tier
- X availability
- adjacent lead lookup for Day 8 multithreading
- Apollo import state
- Apollo sequence enrollment state
- email verification quality
- Apollo stage state used for send blocking

## Apollo Import Contract

Apollo import files should use Apollo-native field names, not internal Warpy labels.

Default primary import columns:

- `contact first name`
- `contact last name`
- `contact email`
- `contact title`
- `account name`
- `contact linkedin url`
- `twitter url`

Optional:

- `account website` if available and clean
- a Warpy-owned free-text Apollo custom field only if its type has already been validated

Import behavior requirements:

- use Apollo-native field names so imports auto-map cleanly
- prefer update-existing-record behavior when Apollo offers it instead of creating near-duplicate people
- verify the contact and account stage remain sequence-eligible before enrollment
- do not enroll any contact until the mailbox tied to the sequence has healthy sending status

Do not map GTM context into Apollo by default.

Do not use existing Apollo picklist custom fields for GTM notes, triggers, or hypotheses.

## Apollo Validation Learnings

The live test run established these rules:

- Apollo auto-maps more reliably when CSV headers match Apollo's own field labels.
- Apollo list creation is not a reliable verification surface and should not be part of the critical path.
- Apollo list-detail pages may trigger Cloudflare or other blocking UX, so avoid depending on them.
- Existing Apollo custom fields must be type-checked before use. A picklist field is not acceptable for GTM context blobs.
- Verify import success by checking imported contacts in Apollo People or by using the sequence enrollment flow, not by watching a list row count.
- Apollo stages and sequence rulesets should be part of the protection layer, not just reporting metadata.
- Apollo mailbox health must be green enough to add new leads. Do not trade deliverability for volume.

## Amplemarket Cleanup Contract

Amplemarket lead lists are temporary batch containers only.

Cleanup rule:

- if Apollo import and verification succeeds, delete the Amplemarket lead list immediately after verification
- if the run intentionally stops after artifact generation, delete the Amplemarket lead list after confirming the manifest and CSV files were written successfully
- if artifact creation or Apollo verification is uncertain, keep the list and log the blocker instead of deleting prematurely

Deletion method:

- prefer direct MCP for list creation and retrieval
- use browser cleanup for deletion if the direct MCP does not expose a delete operation

The local manifest already preserves the GTM context, so Amplemarket should not be treated as long-term storage.

## Persona Mapping

Map each lead to one of:

- `Product Lead`
- `Support Lead`
- `Technical Lead`
- `CS/Growth Lead`

The `primary` lead should usually be one of:

- Product Lead
- Support Lead
- Technical Lead

The `adjacent` lead should usually be:

- a different persona at the same account
- chosen to support the Day 8 multithread touch in `GTM.md`

Do not multithread weak accounts just because an adjacent lead exists.

## Trigger And Hypothesis Rules

For every exported contact, create:

- `trigger`: one real research signal
- `pain_hypothesis`: one likely Warpy-relevant pain
- `proof_point`: one reason the account is plausible for Warpy now

Good trigger examples:

- product complexity visible on site or screenshots
- advanced reporting or workflow-heavy UI
- hiring across product, support, onboarding, or AI
- public messaging about activation, support scale, or AI-native roadmap
- a relevant LinkedIn post from the lead
- recent hiring for product, support, onboarding, implementation, or AI roles

Bad trigger examples:

- generic “fast-growing company”
- generic “saw your profile”
- no actual signal tied to Warpy

## Suppression And Handoff Rules

Treat Apollo as the authority for reply ownership and active sales motion.

Skip the account if any of these are true:

- any contact at the account has replied positively and the thread is now AE-owned
- any contact at the account has a booked meeting or open opportunity
- Apollo clearly shows the account is in an active human sales conversation
- the account is under a local suppression window in `manifest-index.json`

Cooldown rules:

- positive reply or active opportunity: suppress all new automation for that account until manually released
- explicit no, unsubscribe, or clear negative reply: suppress the account for at least `60 days`
- recent completed sequence with no reply: do not restart a fresh outbound motion to the same account for at least `45 days`

## Workflow

1. Load `manifest-index.json` and build the current suppression set before sourcing.
2. Use the direct Amplemarket MCP to search for people and, when useful, companies that match the GTM ICP and target personas.
3. Review candidates account by account, not just row by row.
4. For each viable account:
   - choose `1 primary lead`
   - choose `1 adjacent lead`
   - confirm LinkedIn is present
   - confirm the primary email is a verified real work email, not a generic alias, free-mail address, or risky guess
   - enrich the selected leads with the direct MCP
   - reveal the email through the direct MCP only for accepted leads
   - try to find X if the person is clearly active there
   - write `trigger`, `pain_hypothesis`, and `proof_point`
   - compute `fit_score` and `priority_tier`
5. Sort accepted accounts by `fit_score`, then by trigger strength and channel surface quality.
6. Create an Amplemarket lead list using the direct MCP and the Amplemarket naming convention.
7. Add all accepted leads to that lead list through the direct MCP.
8. Fetch the final lead list metadata through the direct MCP for audit and ownership confirmation.
9. Check open pending manual tasks in Apollo for `Warpy Founder-Led SDR Sequence`, review Apollo deliverability readiness for the sending mailbox, and compute the run cap:
   - `0` primaries if backlog is greater than `20`
   - up to `4` primaries if backlog is `10-20`
   - target `6`, hard max `8`, if backlog is below `10`
   - lower the cap further if mailbox headroom or healthy verified-email supply is smaller
10. Generate local artifacts:
   - `<batch-name>-manifest.json` as the authoritative GTM source of truth
   - `<batch-name>-full.csv` for audit and inspection
   - `<batch-name>-primaries-core.csv` for Apollo primary import
   - `<batch-name>-adjacents-core.csv` for later on-demand adjacent import
11. Write state and artifacts to:
   - `/Users/levw/.codex/state/warpy-gtm/manifests/`
   - `/Users/levw/.codex/state/warpy-gtm/manifest-index.json`
   - `/Users/levw/.codex/tmp/warpy-gtm/`
12. If the computed run cap is `0`, stop after artifact generation, update the manifest index, log the backlog blocker, and delete the temporary Amplemarket lead list under the cleanup contract.
13. Open Apollo in the browser and import only the capped primary CSV subset.
14. Verify that the primary contacts exist in Apollo by searching for their imported emails in Apollo People and confirming they are still in sequence-eligible contact and account stages.
15. Enroll only the verified primary contacts that pass the Apollo ruleset and mailbox-health checks into `Warpy Founder-Led SDR Sequence`.
16. Update the per-batch manifest and the persistent manifest index with Apollo import and sequence status, fit score, priority tier, email verification state, and any account suppression or stage state found in Apollo.
17. Keep adjacent leads in the persistent manifest and adjacent CSV until the multithread step actually needs them.
18. Delete the temporary Amplemarket lead list once the run no longer needs it under the cleanup contract above.

## X / Twitter Lookup Rule

Try to find a matching X profile only when:

- the lead is clearly active on X
- the identity match is strong
- the account is high-quality enough to justify the lookup

Do not guess.

If confidence is low, leave `twitter_url` blank and continue.

## Dedupe Rules

Before import, check Apollo for:

- the same email
- the same LinkedIn URL
- an already-active primary lead at the same account
- a recent batch with the same company domain
- an existing `primary` or `adjacent` record for that company domain in `manifest-index.json`
- any recent positive reply, open opportunity, or AE-owned human conversation at the account
- any active cooldown or suppression window for that account
- any Apollo contact or account stage that would block the sequence ruleset

Skip duplicates instead of creating conflicts.

## Success Criteria

The run is successful only if:

1. every imported contact matches the Warpy ICP
2. every account has at most `1 primary` and `1 adjacent` lead
3. every contact has a clear persona
4. every contact has a real `trigger`, `pain_hypothesis`, and `proof_point`
5. every imported primary lead has a verified work email
6. the local manifest exists and preserves the full GTM context for every accepted lead
7. the persistent manifest index exists and is updated for every accepted account
8. only primary leads are imported and enrolled into the live Apollo sequence during the lead-builder run
9. adjacent leads remain available in the persistent manifest state and adjacent import file for future multithreading
10. the Amplemarket lead list exists and matches the accepted batch
11. the Apollo primary import file is ready without manual cleanup
12. the run respects the backlog-based and mailbox-health-based import cap
13. imported accounts are the highest-fit eligible accounts in the accepted batch
14. no suppressed, AE-owned, reply-active, or stage-blocked account is imported

## Failure / Skip Rules

Skip the account if:

- product complexity is too weak
- the dashboard is not central to customer value
- there is no plausible Warpy pain
- there is no valid lead in the target personas
- the business is primarily an agency, consultancy, outsourcing shop, or services firm rather than a product-led B2B SaaS company
- the product is mainly consumer, marketplace, or offline-operations driven with no clear dashboard-centered user workflow
- Apollo already has an active sequence motion for that account
- Apollo import would require mapping into an unvalidated custom field type

## Logging

For each run, log:

- batch name
- amplemarket lead list id
- number of accounts reviewed
- number of accounts accepted
- number of primary leads imported
- number of adjacent leads reserved
- open Apollo manual task backlog at run start
- computed primary import cap
- mailbox health status and any deliverability blocker
- average `fit_score`
- number of accounts skipped for suppression or AE ownership
- number of accounts skipped for stage blocks or unverified email
- number of duplicates skipped
- number of contacts with X found
- any failures that need follow-up
