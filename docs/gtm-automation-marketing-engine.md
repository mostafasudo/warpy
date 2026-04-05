# Warpy Marketing GTM Engine Automation

## Objective

Turn fresh product and tech signals into smart, human draft posts for LinkedIn and X without becoming a news bot or a cringe founder-content machine.

This automation exists to keep a steady founder-led point of view in market while preserving quality, taste, and voice.

## Source Of Truth

Always read these first:

1. `GTM.md`
2. `docs/gtm-automation-marketing-engine.md`

Use these skills while working:

- [$social-content](/Users/levw/Desktop/Levw/warpy/.codex/skills/marketing/social-content/SKILL.md)
- [$content-strategy](/Users/levw/Desktop/Levw/warpy/.codex/skills/marketing/content-strategy/SKILL.md)
- [$copy-editing](/Users/levw/Desktop/Levw/warpy/.codex/skills/marketing/copy-editing/SKILL.md)

Use Buffer MCP for post lookup and draft creation.

Use Chrome CDP for reference browsing and taste checks.

## Systems

- Buffer MCP: draft creation, channel lookup, recent-post lookup
- Chrome CDP: browse reference accounts, source pages, and live platform context
- Smart source intake: HN, TechCrunch Latest, and source product pages or release posts when needed
- Persistent local marketing state in `/Users/levw/.codex/state/warpy-marketing-gtm/`
- Reference-account calibration loop: recent GTM-creator posts plus extracted taste notes

## Buffer MCP Setup

Do not store the Buffer token in repo files.

Use a local env var:

- `BUFFER_MCP_TOKEN`

Local setup command:

```bash
codex mcp add buffer --url https://mcp.buffer.com/mcp --bearer-token-env-var BUFFER_MCP_TOKEN
```

Verification command:

```bash
codex mcp list
```

Expected result:

- `buffer` appears as an enabled MCP
- auth mode uses `Bearer token`

## Channels

Default v1 channels:

- LinkedIn: Abdel personal LinkedIn
- X: `LevwTech`

The automation should treat these as separate writing surfaces, not as a copy-paste pair.

## Scheduling Contract

Default automation:

- name: `Warpy Marketing Engine`
- schedule: weekdays at `8:30 AM` `Africa/Cairo`
- output: `1` core idea pair only
- publish mode: Buffer drafts only

Per-run output contract:

- either `0` drafts with a logged skip reason
- or exactly `2` drafts from `1` shared thesis:
  - `1` LinkedIn draft
  - `1` X draft

Do not auto-queue posts in v1.

## Persistent State Contract

Use:

- `/Users/levw/.codex/state/warpy-marketing-gtm/post-ledger.jsonl`
- `/Users/levw/.codex/state/warpy-marketing-gtm/topic-memory.json`
- `/Users/levw/.codex/state/warpy-marketing-gtm/reference-notes.json`

`post-ledger.jsonl` is the run-by-run record. Each accepted draft pair should log:

- `created_at`
- `core_thesis`
- `topic_fingerprint`
- `source_urls`
- `linkedin_copy`
- `x_copy`
- `buffer_linkedin_post_id`
- `buffer_x_post_id`
- `status`

`topic-memory.json` is the anti-duplication layer. It should keep the last meaningful angles, companies, launches, and theses that were already used.

`reference-notes.json` is the self-improving taste layer. It should keep distilled pattern notes from strong operators, not copied copy.

## Source Intake Rules

Start with smart, current sources:

1. `https://news.ycombinator.com/`
2. `https://techcrunch.com/latest/`

Then open the original product, company, or release page only when needed to sharpen the take.

Use Chrome CDP for reference browsing and taste grounding, especially these reference accounts:

- `https://x.com/LoganTGott`
- `https://x.com/AdamrahmanGTM`
- `https://x.com/itsalexvacca`
- `https://x.com/paolo_scales`

Also open linked articles or posts from those accounts when they add real substance to the take.

Do not blindly mirror those creators. Use them only to calibrate hook sharpness, clarity, specificity, and what feels human.

Do not use reference creators as permission to write louder than the evidence supports.

## Self-Improving Taste Loop

At the start of each run, before picking a topic:

1. check recent posts from the reference accounts
2. extract what felt sharp or worth noticing
3. write distilled notes into `reference-notes.json`
4. use those notes to raise the quality bar for this run

This step is optional.

If there is nothing meaningfully new, sharper, or worth preserving from the reference scan:

- do not add any new note
- do not update local reference notes just to show activity
- do not invent a new rule for the sake of saying the system is self-improving

What to extract:

- how they frame a market shift into one clear thought
- how specific the hook is
- whether the post gives a save-worthy takeaway
- whether the post has a real opinion instead of a recap
- how they support the opinion with examples, specifics, or observed behavior
- which structures feel human vs templated

What not to do:

- do not paraphrase their post into yours
- do not mimic one creator's rhythm too closely
- do not reuse their examples unless the source itself is the thing you are commenting on
- do not let reference content override the Warpy voice

## Topic Selection Rules

The system is hybrid by default:

- mostly broader tech, AI, product, and UI shifts
- Warpy appears only when the bridge is natural
- if the bridge is weak, keep the post broad instead of forcing a Warpy angle
- broad source stories get at most one light extrapolation into software behavior. they do not get turned into a disguised Warpy pitch
- default to no product mention unless the source is directly about dashboards, embedded AI actions, product UX, or a buyer objection Warpy clearly addresses

Good topic zones:

- products adding conversational input to complex dashboards without replacing the existing UI
- launches that show software capturing intent faster while keeping the product UI as the output layer
- patterns that reveal low feature adoption in complex tools
- examples of software doing the task for the user instead of explaining the task
- product shifts, objections, or real buyer questions that point to how software is changing

Weak topic zones:

- funding posts with no actual product angle
- generic AI news with no product implication
- viral drama with no useful takeaway
- anything that could be reposted without adding a thought

## Scoring And Quality Bar

Before drafting, pull recent Buffer posts across both channels and check local memory.

Reject any idea that:

- overlaps materially with the last `45 days` of Buffer posts
- repeats a macro take already used in the last `90 days` without a real new event
- has no concrete opinion, pattern, or takeaway
- only restates the news
- feels too derivative of a recent reference-account post
- makes a strong claim without enough support
- needs a forced Warpy bridge to feel relevant
- mainly exists to restate Warpy positioning through a weak source hook
- fails the swap test: any generic AI company could post it unchanged and pretend it is about them

Choose the top idea only if it passes all three tests:

1. it is relevant to product, AI, dashboards, UX, or software behavior
2. it is meaningfully new relative to recent posts
3. it has an actual human thought in it

If no topic passes, do not post.

## Voice Rules

All recipient-facing copy must follow `GTM.md`.

Hard rules:

- default to lowercase
- keep it informal and a little rough
- do not over-clean punctuation
- never use em dashes
- never use semicolons
- do not sound corporate, polished, or sales-trained
- do not sound cocky, arrogant, or overly certain
- keep it short, direct, and human
- prefer humble framing like `i think`, `i keep noticing`, `it seems like`, or `one pattern i keep seeing` when making an argument
- support the thought with a real source, example, product pattern, or observed behavior whenever possible
- do not force a Warpy mention
- do not force a Warpy analogy, product tie-in, or disguised pitch onto a broadly interesting story
- broad commentary posts should stand on their own even if Warpy is never mentioned
- never frame chat as replacing the product UI
- when the concept comes up, frame chat as the input layer and the existing UI as the output layer today
- if mentioning the long-term product direction, describe it as a more dynamic UI, not a plain chat window replacing the app

## Drafting Rules

Every post must say something.

LinkedIn rules:

- value-first opening, not bait
- `3-6` short paragraphs
- no link in the body
- one clear thought, pattern, or observation
- avoid sounding like you are announcing the future as fact
- if the claim is broad, make the support visible in the post
- write for saves, thoughtful comments, and DMs
- for broad market commentary, stop one step earlier than the product pitch

X rules:

- adapt the same thesis into a sharper, shorter version
- single post by default
- no thread unless the idea genuinely needs it
- do not copy the LinkedIn draft line for line
- keep the confidence level proportional to the evidence
- do not squeeze product positioning into a short post just because the source touched AI

Non-cringe filters:

- no bland news summaries
- no "this changes everything" phrasing
- no generic thought-leadership cadence
- no hot takes written with more certainty than the evidence deserves
- no smug or superior framing
- no forced Warpy plug
- no empty inspirational ending
- no CTA if the post does not earn one

## Workflow

1. Read `GTM.md` and this file.
2. Pull recent Buffer posts across LinkedIn and X.
3. Read local memory from `topic-memory.json`.
4. Check recent posts from the reference accounts and update `reference-notes.json`.
5. Fetch latest HN and TechCrunch signals.
6. Open source product pages or release pages only when needed.
7. Use Chrome CDP for taste checks and reference browsing when useful.
8. Build a shortlist of candidate topics.
9. Reject duplicates, stale angles, weak takes, and derivative takes.
10. Reject any draft angle that sounds louder or more certain than the supporting evidence allows.
11. Choose exactly `1` idea only if it clears the quality bar.
12. Write:
    - `1` LinkedIn draft
    - `1` X draft
13. Sanity-check both drafts for humility, evidence, and tone before saving.
14. Save both drafts to Buffer.
15. Write the result to `post-ledger.jsonl`.
16. Update `topic-memory.json`.

## Manual Habits That Stay Outside Automation

These stay manual in v1:

- replying to comments in the first hour after a post goes live
- thoughtful daily commenting on other relevant posts
- inbound DM handling
- deciding when a draft deserves a PDF carousel or deeper asset

## Success Criteria

A good run:

- creates exactly `2` Buffer drafts or intentionally creates none
- avoids duplicate news and duplicate takes
- gets sharper over time because reference-account notes raise the standard without turning the posts into copies
- produces non-identical LinkedIn and X drafts from the same thesis
- stays inside the Warpy voice
- makes claims with the right confidence level and visible support
- says something concrete enough to earn a save, share, comment, or DM

## Failure / Skip Rules

Skip the run if:

- Buffer MCP is unavailable
- the source intake fails
- recent-post history cannot be checked
- no topic clears the quality bar
- the generated copy sounds like news recap sludge, corporate content, or forced product promotion
- the generated copy sounds too arrogant, too certain, or under-supported for the strength of the claim

When skipping, log the reason in the local state instead of forcing a weak draft.
