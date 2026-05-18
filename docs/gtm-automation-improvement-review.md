# warpy.ai GTM Improvement Review Automation

## Objective

Review high-confidence GTM improvement notes once per week, cluster the real problems, and produce a focused optimization plan that improves autonomous interested-lead generation.

This automation does not run sourcing, send outreach, enroll leads, or mutate GTM platforms. It is a planning and prioritization loop for the Lead Builder and Task Executor.

## Source Of Truth

Read first:

1. `GTM.md`
2. `docs/gtm-automation-improvement-review.md`
3. `docs/gtm-automation-lead-builder.md`
4. `docs/gtm-automation-task-executor.md`

## Systems

- Improvement report CLI: `scripts/gtm-improvement-log.mjs report --days 90`
- Improvement log: `/Users/levw/.codex/state/warpy-gtm/improvement-log.jsonl`
- Improvement index: `/Users/levw/.codex/state/warpy-gtm/improvement-log-index.json`
- Review output directory: `/Users/levw/.codex/state/warpy-gtm/improvement-reviews/`

## Review Standard

Optimize for the main goal: more interested leads while keeping the pipeline autonomous, safe, and high-quality.

Prioritize:

- `p1` safety/autonomy bugs that can cause bad sends, duplicate sends, lost sends, or stuck runs
- recurring `p2` issues that reduce accepted lead volume, sequence completion, personalization quality, or platform reliability
- clear optimizations with concrete fixes and expected payoff

Deprioritize:

- speculative ideas
- one-off friction with no recurrence or no clear fix
- stylistic preferences
- broad "make it better" notes
- optimizations that add operational complexity without clear impact

## Workflow

1. Run `node scripts/gtm-improvement-log.mjs report --days 90`.
2. Inspect the top open items, counts by priority/category/impact area, recurrence counts, evidence, and artifact paths.
3. Cluster related notes by root cause. Treat duplicate fingerprints and repeated occurrences as stronger signals.
4. Select at most three high-leverage improvement opportunities for the week. Select fewer when the backlog is weak.
5. For each selected opportunity, write:
   - problem statement
   - evidence and affected automation
   - why it matters for interested-lead generation or autonomy
   - recommended fix
   - implementation scope
   - validation plan
   - rollout and risk notes
6. For rejected or deferred items, give a short reason.
7. Write a compact markdown review artifact under `/Users/levw/.codex/state/warpy-gtm/improvement-reviews/YYYY-MM-DD-review.md`.
8. Open an inbox item summarizing selected fixes, deferred items, artifact path, and any urgent `p1` recommendation.

## Output Shape

Use this structure in the review artifact:

```md
# GTM Improvement Review - YYYY-MM-DD

## Summary

- open items reviewed:
- selected fixes:
- urgent risks:

## Selected

### 1. Title

- priority:
- source:
- evidence:
- impact:
- recommended fix:
- scope:
- validation:
- risk:

## Deferred

- title: reason

## Noisy Or Invalid Notes

- title: reason
```

## Resolution Policy

Do not mark improvement-log items resolved unless the fix is already implemented and verified in the repo or local automation state. If resolving, use:

```sh
node scripts/gtm-improvement-log.mjs resolve --fingerprint <fingerprint> --resolution-note "verified by ..."
```

When in doubt, leave the note open and explain the uncertainty in the review artifact.
