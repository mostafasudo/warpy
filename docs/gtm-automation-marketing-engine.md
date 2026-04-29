# Warpy Marketing GTM Engine Automation

## Objective

Turn fresh product and tech signals into smart, human LinkedIn and X drafts without becoming a news bot or a generic founder-content machine.

This automation keeps a steady founder-led point of view in market while preserving taste, specificity, and Warpy's voice.

## Source Of Truth

Read first:

1. `GTM.md`
2. `docs/gtm-automation-marketing-engine.md`

Relevant marketing skills:

- `.codex/skills/marketing/social-content/SKILL.md`
- `.codex/skills/marketing/content-strategy/SKILL.md`
- `.codex/skills/marketing/copy-editing/SKILL.md`

## Systems

- Buffer MCP: channel lookup, recent-post lookup, draft creation
- Chrome CDP: source browsing, reference-account browsing, taste checks
- Smart source intake: HN, TechCrunch, product pages, release posts, founder/operator posts, and other relevant current sources
- Persistent marketing state: `/Users/levw/.codex/state/warpy-marketing-gtm/`

Do not store Buffer tokens in repo files. Use `BUFFER_MCP_TOKEN` locally.

## Programmatic Tool Fallback

Use Buffer MCP and other non-browser tooling when they can complete the exact step. If any MCP, connector, direct API, script, agent tool, or source-fetching path is unavailable, limited, unsupported for the needed action, stale, unauthenticated, or failing, load `docs/chrome-cdp.md` and fall back to the Chrome CDP user browser before marking the step blocked.

For Buffer, use the live Buffer UI through Chrome CDP when MCP channel lookup, recent-post lookup, or draft creation is limited or failing. If both MCP and Chrome CDP cannot safely complete draft creation, write a local draft artifact and log the browser blocker.

## Non-Blocking Operating Rule

Do not impose fixed output quotas, topic quotas, channel quotas, schedule gates, or duplicate-window limits that prevent useful drafting.

Create as many strong drafts as the available ideas justify for the configured channels. If a source, channel, or tool is unavailable, first try the Chrome CDP browser fallback for that external surface, then use the next viable source or produce a local draft artifact with a clear log entry instead of stopping the whole run.

## Channels

Default channels:

- LinkedIn: Abdel personal LinkedIn
- X: `LevwTech`

Treat each channel as its own writing surface. Do not copy-paste the same text across channels.

Publishing behavior belongs to the automation or Buffer configuration. This doc assumes draft creation unless a separate explicit publish workflow exists.

Do not use this workflow to leave public LinkedIn comments. LinkedIn work here is draft/post creation only unless a separate like-only engagement task exists. X/Twitter public comments are allowed only when a separate engagement workflow explicitly calls for them.

## Persistent State

Use:

- `post-ledger.jsonl`
- `topic-memory.json`
- `reference-notes.json`

`post-ledger.jsonl` records:

- `created_at`
- `core_thesis`
- `topic_fingerprint`
- `source_urls`
- channel copy
- Buffer post ids or local artifact paths
- `status`

`topic-memory.json` tracks prior angles, companies, launches, and theses to reduce repetition.

`reference-notes.json` stores distilled taste patterns from strong operators. Store patterns, not copied lines.

## Source Intake

Start with current product and tech signals:

- `https://news.ycombinator.com/`
- `https://techcrunch.com/latest/`
- original product, company, or release pages when they sharpen the take
- relevant founder/operator posts or linked articles

Reference accounts for taste calibration:

- `https://x.com/LoganTGott`
- `https://x.com/AdamrahmanGTM`
- `https://x.com/itsalexvacca`
- `https://x.com/paolo_scales`

Use reference accounts to calibrate hook sharpness, specificity, and human framing. Do not mimic their rhythm, reuse their lines, or let them override Warpy's voice.

## Topic Selection

Good topic zones:

- products adding conversational input to complex dashboards without replacing the existing UI
- launches that show software capturing intent faster while keeping the UI as the output layer
- patterns that reveal low feature adoption in complex tools
- software that does the task for the user instead of only explaining it
- real buyer questions, objections, or product shifts around embedded AI, action-taking agents, or dashboard adoption

Weak topic zones:

- funding posts with no product angle
- generic AI news with no product implication
- viral drama with no useful takeaway
- anything that only restates the news
- any angle that mainly exists to sneak in a Warpy pitch

Choose ideas with:

- a concrete observation
- a reason Warpy has standing to comment
- enough evidence for the confidence level of the claim
- a new angle relative to recent posts and local memory

If the Warpy bridge is weak, keep the post broad or choose a better idea.

## Voice

All copy follows `GTM.md`.

Hard reminders:

- lowercase by default
- informal and a little rough
- no em dashes or semicolons
- no corporate thought-leadership cadence
- no arrogant certainty
- humble framing for opinions
- concrete examples or observed patterns when possible
- no forced Warpy mention
- never frame chat as replacing the product UI
- when relevant, frame chat as the input layer and the existing UI as the output surface

## Drafting Rules

Every post must say something specific.

LinkedIn:

- lead with the thought or pattern, not bait
- use short paragraphs
- avoid links in the body unless intentional
- make the support visible when the claim is broad
- stop one step before the product pitch on broad commentary

X:

- adapt the thesis into a sharper, shorter surface
- use a single post or thread based on what the idea needs
- keep confidence proportional to the evidence
- do not force product positioning into a short post

## Self-Improving Taste Loop

When useful, scan reference accounts and record only distilled patterns:

- hook shape
- specificity
- evidence quality
- how they turn market movement into a human point of view
- what felt save-worthy, useful, or too templated

Do not update reference notes just to show activity.

## Workflow

1. Read `GTM.md` and this file.
2. Pull recent Buffer posts when available, falling back to Chrome CDP if Buffer MCP lookup is limited or failing.
3. Read local memory from `topic-memory.json`.
4. Check reference accounts when useful.
5. Fetch current product and tech signals.
6. Open original sources where needed.
7. Build a shortlist of candidate topics.
8. Remove stale, repetitive, unsupported, derivative, or forced-Warpy angles.
9. Draft channel-native copy for the strongest ideas.
10. Sanity-check each draft for evidence, humility, and voice.
11. Save drafts to Buffer when available, falling back from Buffer MCP to the Chrome CDP Buffer UI when needed, or write local draft artifacts if Buffer cannot be safely reached.
12. Update `post-ledger.jsonl`, `topic-memory.json`, and `reference-notes.json` as appropriate.

## Manual Work Outside Automation

These stay human-owned unless a separate workflow explicitly changes that:

- replies to comments
- inbound DMs
- deciding when a draft deserves a PDF carousel or larger asset
- live conversations created by a post

## Logging

For each run, log:

- sources checked
- topics considered
- drafts created by channel
- drafts saved to Buffer or local artifact path
- topics rejected and why
- reference notes added
- tool or source failures with fallback used

## Success Criteria

A successful run:

- creates strong channel-native drafts without fixed output caps
- avoids duplicate takes and disguised product pitches
- stays inside Warpy's voice
- supports claims with appropriate evidence
- records local memory so the next run gets sharper
- falls back gracefully when one source or tool is unavailable
