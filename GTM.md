# Sales, marketing & GTM

## Operating rule

For any sales, marketing, or GTM task, read this file first, then check the marketing skills pack in `.codex/skills/marketing/`. In the agent mirrors, that pack appears as `.claude/skills/marketing/`, `.agent/skills/marketing/`, and `.cursor/skills/marketing/`. Keep those skills grouped under the single `marketing` folder so they stay separate from the coding skill namespace.

## What is Warpy

Warpy is an embeddable AI assistant for complex B2B dashboards. Users ask for what they need in plain language, and Warpy helps them get it done inside the product by filtering, sorting, navigating, grouping, adding columns, and taking approved actions within the boundaries the customer defines.

Warpy's product stance is not that chat replaces the UI. Today, chat is the lowest-friction input layer for user intent, while the existing product UI remains the best output layer for structured results, navigation, confirmation, and safe action review. Longer term, the UI can become more dynamic and adaptive, but the near-term story is input through chat, output through the product.

The main GTM value prop is increasing dashboard adoption and helping more users reach value from the product they already have. Warpy makes the dashboard feel AI-native without the team building an internal agent stack from scratch. Lower support volume is real, but it is a secondary benefit, not the core edge.

## Voice

For outbound emails, LinkedIn messages, connection notes, comments, and follow-up copy in this GTM system:

- default to all lowercase
- keep it informal and a little rough around the edges
- do not clean up the punctuation too much
- do not use em dashes
- do not use semicolons
- do not sound polished, corporate, or sales-trained
- do not sound arrogant, cocky, or like you are declaring industry truth from nowhere
- do not use hype, exclamation-heavy copy, or marketing adjectives
- when writing an opinion, prefer humble framing like `i think`, `i keep noticing`, `it seems like`, or `one pattern i keep seeing`
- back the thought with a real example, product pattern, source, or observed behavior whenever possible
- do not make sweeping claims unless the post clearly supports them with real evidence
- keep it short, direct, and human

This is an intentional style rule, not a mistake to fix.

## Ideal customer profile / ICP

Warpy’s ideal customer is a growth-stage B2B SaaS startup with a highly complex, feature-rich, data-dense web dashboard where users regularly filter, segment, navigate, and take actions but typically only use a small fraction of the product’s capabilities. These companies often operate in vertical SaaS sectors such as fintech, healthcare, logistics, or HR, usually have around 10–200 employees (sometimes scaling to 500) and roughly $5M–$50M in ARR, and are experiencing classic scaling pains: high volumes of repetitive “how do I…” support tickets, low adoption of advanced features, and growing pressure to make the product AI-native. The primary buyers are tech-savvy founders, CTOs, heads of product, VPs of product, growth leads, or support leaders who care deeply about improving feature adoption, reducing onboarding friction, protecting net revenue retention, and lowering support costs while accelerating user time-to-value. Technically, these companies run modern frontends such as React, Vue, or Angular with well-documented REST APIs, making it easy to embed Warpy with a single snippet or lightweight widget while exposing approved endpoints and permission boundaries. Warpy is especially compelling when the dashboard is central to customer value but usability gaps limit engagement, and the company wants to turn more users into power users without building an internal AI agent stack—allowing an in-app AI guide to deflect support tickets, increase product engagement, and handle a significant portion of support queries directly inside the product.

## Competitive context

Warpy’s main direct competitor today is [Crow AI](https://usecrow.ai). Use Crow AI as the default reference point when doing competitive GTM work, objection handling, positioning, or sales enablement unless a task explicitly calls for a different competitor set.

## Default sequence strategy for SDR outreach work

### Apollo implementation

This GTM sequence is already built in Apollo as [`Warpy Founder-Led SDR Sequence`](https://app.apollo.io/#/sequences/69d153277282c2001550d75f).

Use that Apollo sequence as the operational version for outbound execution. If this strategy changes here, update the Apollo sequence so the live workflow stays in sync with this document.

Apollo notes:

- The sequence includes the full GTM cadence below.
- Manual steps in Apollo are written as detailed task notes so reps know exactly what to do.
- X / Twitter, multithreading, and asset-send steps are represented as Apollo action items with explicit instructions because Apollo does not provide a native X task type in the sequence builder.
- The sequence is configured to use the `Late Morning Local` schedule in Apollo.

### Apollo control-plane requirements

Treat Apollo as the execution control plane, not just the send surface.

Required Apollo setup:

- The sequence must run on a dedicated ruleset that halts or skips sends for contacts in `Replied`, `Interested`, `Do Not Contact`, and `Bad Data`.
- The sequence ruleset must also halt or skip sends for accounts in `Active Opportunity`, `Current Client`, `Do Not Prospect`, and any custom account stage used for AE-owned manual follow-up such as `AE Owned` or `Automation Suppressed`.
- Apollo contact and account stages should be updated intentionally so the sequence ruleset can enforce the handoff automatically instead of relying only on local state.
- Before each lead-builder run, confirm the mailbox and domain used by this sequence are healthy in Apollo Deliverability Suite: authenticated, warmed or ready, under sending limits, and free of unresolved critical recommendations.
- If Apollo deliverability health is degraded, do not import or enroll new contacts until the mailbox issue is fixed.
- Sequence analytics should be reviewed at the sequence and mailbox level, not just globally. Protect reply rate first, then volume.

### Automated GTM pipeline

Warpy uses:

- direct `amplemarket` MCP for lead generation, ICP search, enrichment, lead-list creation, and local CSV preparation
- `Apollo` for contact storage, sequencing, task management, and outbound execution
- `Codex automations` as the operating layer that moves leads from Amplemarket into Apollo and clears pending Apollo manual tasks through the live browser
- the account executive as the manual owner of replies, active conversations, and deal follow-up inside Apollo

The automation source docs are:

- [docs/gtm-automation-lead-builder.md](docs/gtm-automation-lead-builder.md)
- [docs/gtm-automation-task-executor.md](docs/gtm-automation-task-executor.md)

Pipeline rules:

- Build around accounts, not random contact dumps.
- For each target account, select exactly `1 primary lead` and `1 adjacent lead`.
- Import only the `primary` lead into Apollo by default.
- Keep the `adjacent` lead in the persistent local GTM state and import it only when the Day 8 multithread motion is actually ready, unless a separate Apollo holding workflow has already been validated.
- Do not import or sequence an account that is already in human-owned reply handling, has an open opportunity, or has a recent positive reply in Apollo.
- If an account gives an explicit no, unsubscribe, or negative reply, suppress new automated outreach to that account for at least `60 days` unless manually overridden.
- `LinkedIn URL` is required.
- A verified real work email is required for any primary lead that will enter the sequence. Do not import generic aliases, risky guesses, or personal free-mail addresses.
- `X / Twitter` is optional. Use it when it is clearly the better channel, not as a forced requirement.
- Every imported contact should carry a persona, a real trigger, a pain hypothesis, and a proof point.
- Every accepted account should also carry a `fit_score` and `priority_tier`, and the lead builder should import the highest-scoring accounts first.
- The GTM research context lives in the persistent local GTM state, not in Apollo by default.
- Do not force GTM context into Apollo unless a dedicated free-text custom field has already been validated.
- Use Apollo-native CSV headers for imports so the importer auto-maps cleanly.
- Do not rely on Apollo list row counts or list-detail pages as the verification step.
- Amplemarket lead lists are temporary transport objects and must not include the word `Warpy` in their names.
- Delete temporary Amplemarket lead lists after the local artifacts are safely written and the Apollo import is verified, or after the run intentionally stops at artifact generation and the local files have been confirmed.
- Prefer the direct `mcp__amplemarket__*` namespace for Amplemarket work.
- Do not default to the browser for Amplemarket if the direct MCP can do the job.
- Lead Builder throughput target is `6 primary leads` per run, with a hard max of `8`, and never force-fill weak accounts just to hit quota.
- Before each Lead Builder run, check open pending manual tasks in Apollo for `Warpy Founder-Led SDR Sequence`.
- Before each Lead Builder run, also check Apollo mailbox health and available sending headroom for the mailbox tied to this sequence.
- If Apollo has more than `20` open manual tasks, import `0` new primaries in that run.
- If Apollo has `10-20` open manual tasks, cap the run at `4` new primaries.
- The final import cap is the lowest of the backlog cap, the available mailbox headroom, and the number of high-quality verified-email accounts in the batch.
- Task execution must be idempotent. Keep a persistent local action ledger so a retry never re-sends the same LinkedIn, X, or email action if the browser action succeeded but Apollo task completion failed.
- Persistent GTM state lives under `/Users/levw/.codex/state/warpy-gtm/`.
- Temporary CSV artifacts live under `/Users/levw/.codex/tmp/warpy-gtm/`.
- When due-task volume is high, prioritize tasks that move conversations forward: manual emails, multithread steps, earned DMs, asset sends, connection requests, then low-friction social touches.
- The task executor must respect both per-run caps and daily caps for social actions so a `30-minute` cron never over-saturates LinkedIn or X.
- The task executor must never automate reply handling, objection handling, or live back-and-forth. Those remain AE-owned in Apollo.

Lead-builder split by execution layer:

- Direct Amplemarket MCP: search people, search companies, enrich people, reveal emails, create lead lists, retrieve lead lists, and prepare the structured batch data.
- Local Codex execution: maintain the persistent manifest index, write the authoritative per-batch manifest, and generate the Apollo import CSV files.
- Browser / Chrome CDP: optional X lookup plus Apollo primary import, Apollo people-search verification, direct sequence enrollment, on-demand adjacent import when multithreading is due, Apollo task execution, and Amplemarket temp-list cleanup when deletion is needed.

Recommended automation cadence:

- `Lead Builder automation`: once every weekday morning
- `Task Executor automation`: every `30 minutes` on weekdays

Recommended schedules:

- Lead Builder: weekdays at `9:00 AM` in the target market timezone
- Task Executor: every `30 minutes` on weekdays, but only act on tasks that are already due in Apollo
- For social actions, if the lead's local time is visible and outside `8:00 AM` to `6:00 PM`, skip the action until the next run even if the cron is active

### Lead definitions

| Lead | Who they are | Main angle |
| --- | --- | --- |
| PL | Product Lead — VP Product, Head of Product, Product Manager | Feature adoption, time-to-value, advanced feature usage |
| SL | Support Lead — Head/VP of Support, CX Lead | Deflect repetitive “how do I…” tickets |
| TL | Technical Lead — CTO, VP Eng, Founder | AI-native product, secure integration, no internal agent-stack build |
| CL | CS/Growth Lead — VP CS, Growth Lead, Onboarding Lead | Faster activation, onboarding, expansion, power-user behavior |

Primary lead selection rules:

- Default to the highest-ownership persona tied to the visible trigger.
- Prefer senior Product or Support leadership for broad adoption and support-pain triggers.
- Use Technical Lead as the primary only when the trigger is clearly AI-native, security, integration, or internal-build risk.
- Use CS/Growth as adjacent by default unless the trigger is explicitly activation, onboarding, or expansion-led.
- Individual-contributor PM titles are fallback primaries, not the default, unless the company is small and the signal is unusually strong.

### Best combined sequence

Pick the best-fit primary lead first, then add 1 adjacent lead only if the account is still automation-eligible and the primary motion has not converted.

| Day | Channel | Who is the lead | Action / messaging | Objective / Notes |
| --- | --- | --- | --- | --- |
| 0 | Research / intro | Primary lead + 1 adjacent lead | Find 1 real trigger, 1 pain hypothesis, 1 proof point. Check for a mutual intro first. | Warm intro beats cold. This defines the whole sequence. |
| 1 | LinkedIn | Primary lead | Like/comment on a recent post with a real insight. No pitch. | Build familiarity first. |
| 2 | Email 1 | Primary lead | Short, trigger-led, pain-first email. CTA: "want me to send a quick breakdown?" | Send in their local late morning. Do not ask for a demo yet. Keep the message focused on dashboard adoption and getting more done through chat. |
| 3 | LinkedIn | Primary lead | Send connection request. Use blank request or a very specific note only. | No generic connection-note pitch. |
| 5 | LinkedIn / X | Primary lead | Second light social touch. If active on X, reply there; if not, do another LinkedIn engagement. | X is optional, not required. |
| 6 | Email 2 | Primary lead | New angle by persona: PL = adoption, SL = ticket deflection, TL = AI-native without internal build. | Each touch must change angle. Keep the message anchored in users getting more value from the dashboard, with support reduction as a secondary outcome. |
| 7 | LinkedIn DM | Primary lead (if connected) | "thanks for connecting. noticed [trigger]. happy to send a quick breakdown of where chat could help users do more in the dashboard" | Very short, permission-based DM. Keep it lowercase and informal. |
| 8 | Email / LinkedIn | Adjacent lead (PL / SL / TL / CL) | Start multithreading with a different KPI angle only if the primary has not replied, the account is still sequence-eligible, and the adjacent lead is a true second owner. | Same account, different pain. Do not pile on weak accounts. |
| 10 | Email 3 | Primary lead | Add proof: short case study, metric, or a concrete workflow a user could complete through chat in their UI. | Fresh value only. No repeated pitch. |
| 12 | X DM / LinkedIn DM | Whoever engaged most | Only DM if earned: open DMs, follow-back, or prior engagement. | Tie it to the public interaction. Keep it very short. |
| 14 | Email 4 or LinkedIn DM 2 | Most engaged lead | Send the asset: breakdown, screenshot, 60-sec Loom, use-case note, benchmark. | Follow the channel where they showed interest. The asset should show how users could do more through chat inside the dashboard. |
| 17 | Email | Primary or adjacent lead | Pure value touch: ungated resource, breakdown, benchmark, or useful note. No hard CTA. | This is the “give” touch. Lead with adoption and product usage, not support ops. |
| 21 | Email | Primary lead | Close-the-loop email: "seems like this isnt a priority right now or i missed the mark" | Polite breakup. Leaves the door open. Keep it lowercase and informal, and point back to helping users get more done in the dashboard. |

Best-practice rules baked into this sequence: warm intro first, protect deliverability before adding volume, use Apollo-native stage and ruleset guardrails, multithread only when the account still justifies it, every touch adds a new angle, X only if the buyer is clearly active, and founder-led outreach is preferred for Warpy.

## Marketing GTM engine

Warpy also runs a founder-led marketing engine in parallel with the outbound sales engine.

The job of this engine is not to become a content mill. The job is to keep publishing smart, human takes on product, AI, dashboards, and software behavior so the market starts associating Warpy with a clear point of view.

The automation source doc is:

- [docs/gtm-automation-marketing-engine.md](docs/gtm-automation-marketing-engine.md)

Marketing stack:

- `Buffer MCP` for LinkedIn and X draft creation
- `Codex automation` as the operating layer
- `Chrome CDP` for reference browsing and taste checks
- local memory in `/Users/levw/.codex/state/warpy-marketing-gtm/`

### Marketing operating rules

- post from the founder or personal profile on LinkedIn, not the company page
- keep the founder profile positioned around one clear topic and one clear outcome
- lead with the thought or the pattern, not bait
- default to broader tech, AI, product, and UI shifts, then plug Warpy only when the bridge is real
- default to zero product mentions on broad market stories. the post should still work if Warpy disappeared from the page entirely
- do not force every post to mention Warpy
- if the source story is only loosely related to Warpy, keep the post broad and do not contort it into a Warpy angle
- if the Warpy bridge is not obvious within one or two sentences, remove it or skip the topic
- do not use a broad source story as a pretext to restate Warpy positioning
- if the strongest line in the draft is really just a disguised Warpy pitch, cut it
- do not end broad commentary posts with product-specific workflow examples unless the source itself clearly earns that move
- if the post has no real thought beyond the news itself, do not post it
- if the post has a thought but no supporting example, source, or observed pattern, soften it or drop it
- optimize for saves, comments, DMs, and profile visits, not likes
- do not put links in the LinkedIn post body
- use human comments on other relevant posts as a daily distribution habit
- reply to comments quickly in the first hour after a post goes live
- turn buyer questions, objections, launch patterns, and product shifts into content
- keep one strong PDF carousel pinned in the LinkedIn featured section as an evergreen explainer, but do not make carousel generation part of the v1 automation
- keep a self-improving taste loop by checking sharp GTM and founder operators regularly, then extracting patterns instead of copying their phrasing

### Marketing content pillars

Use these as the default zones for post ideas:

- AI-native dashboards adding a conversational input layer without throwing away the existing UI
- users only using a small slice of feature-rich products
- chat as the fastest input path to product adoption, activation, and time-to-value
- embedded AI that takes actions, not just answers questions
- product and UX shifts that show software moving from menu-hunting to intent capture while the structured UI remains the output surface
- smart commentary on launches, interface changes, or product strategy shifts that say something real about where software is going

### Marketing automation contract

The v1 marketing engine is intentionally narrow:

- run once every weekday morning at `8:30 AM` `Africa/Cairo`
- create exactly `1` core idea pair per run
- write exactly `2` Buffer drafts when a topic clears the quality bar:
  - `1` LinkedIn draft for Abdel's personal LinkedIn
  - `1` X draft for `LevwTech`
- keep the system draft-only for now
- prefer silence over weak content

### Marketing self-improving loop

Use a recurring taste-calibration pass as part of the automation.

Reference accounts:

- `https://x.com/LoganTGott`
- `https://x.com/AdamrahmanGTM`
- `https://x.com/itsalexvacca`
- `https://x.com/paolo_scales`

Rules:

- use Chrome CDP to check recent posts and linked articles from these operators
- extract patterns like hook shape, framing, specificity, contrarian takes, and how they turn market movement into a human point of view
- extract how they support a thought with specifics instead of just sounding loud
- store only distilled notes and pattern summaries in local state
- this step is optional, not mandatory. if there is nothing meaningfully new or better, do not add anything
- do not add a new note, pattern, or rule just for the sake of saying the system is improving
- never copy lines, structure, or claims too closely
- use these accounts to sharpen quality standards, not to turn Warpy into a clone of any one creator

### Marketing quality bar

Every post should feel like a person noticed something and has an opinion on it.

Reject posts that sound like:

- bland news summaries
- forced founder wisdom
- polished corporate thought leadership
- obvious AI slop
- generic "this changes everything" commentary
- arrogant certainty with no backing
- a disguised product pitch with no actual observation

Every accepted post should have:

- one concrete pattern, opinion, or takeaway
- one supporting example, product pattern, or real source behind the thought unless the claim is intentionally small and personal
- one reason a smart person would save it, send it, or DM about it
- channel-specific copy instead of copy-pasted LinkedIn and X versions

### Marketing cadence and ownership

- `Warpy Marketing Engine`: weekday draft generation only
- founder comment replies in the first hour: manual
- daily thoughtful commenting on relevant posts: manual
- inbound DMs and follow-up conversations: manual
