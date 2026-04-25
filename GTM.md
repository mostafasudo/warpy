# Sales, Marketing, and GTM

## Operating Rule

For any sales, marketing, or GTM task, read this file first, then check the marketing skills pack in `.codex/skills/marketing/`.

Automation source docs:

- [Lead Builder](docs/gtm-automation-lead-builder.md)
- [Task Executor](docs/gtm-automation-task-executor.md)
- [Marketing Engine](docs/gtm-automation-marketing-engine.md)

## What Warpy Is

Warpy is a drop-in AI execution layer for complex B2B dashboards. Customers embed a lightweight widget into their product, expose approved APIs and UI actions, and let end users ask for work in plain language.

Warpy does not replace the product UI. Chat is the low-friction intent input. The host product remains the output surface for structured results, navigation, review, and safe action confirmation.

The core GTM promise is dashboard adoption: more users reaching value, using advanced workflows, and getting work done without menu hunting. Lower support volume matters, but it is a secondary outcome.

## Voice

For outbound emails, LinkedIn messages, X posts, comments, and follow-up copy:

- default to lowercase
- keep it informal and a little rough
- avoid polished corporate phrasing
- do not use em dashes or semicolons
- do not sound arrogant, hypey, or sales-trained
- use humble framing for opinions: `i think`, `i keep noticing`, `it seems like`, `one pattern i keep seeing`
- back the thought with a real example, product pattern, source, or observed behavior when possible
- keep it short, direct, and human

This is intentional. Do not "clean it up" into standard sales copy.

## ICP

Best-fit accounts are B2B SaaS companies where the dashboard is central to customer value and the product is complex enough that users regularly filter, segment, navigate, configure, or take actions.

Strong fit signals:

- feature-rich, data-dense, workflow-heavy dashboards
- users only adopting a small slice of the product
- repetitive "how do i..." support or onboarding friction
- pressure to look AI-native without building an internal agent stack
- modern web frontend and documented APIs
- vertical SaaS categories such as fintech, healthcare, logistics, HR, analytics, data infrastructure, customer support, or operations software

Typical company shape is growth-stage B2B SaaS, often around 10-500 employees and roughly $5M-$50M ARR. Treat those ranges as targeting guidance, not hard exclusion rules.

Primary buyer personas:

| Persona | Titles | Main Angle |
| --- | --- | --- |
| Product Lead | VP Product, Head of Product, Director of Product, Product Manager | Feature adoption, time-to-value, advanced workflow usage |
| Support Lead | Head/VP Support, CX Lead, Customer Support leader | Fewer repetitive "how do i..." tickets and faster self-serve help |
| Technical Lead | CTO, VP Eng, Head of Engineering, Founder | AI-native product experience without building an internal agent stack |
| CS/Growth Lead | VP CS, Head of Growth, Onboarding Lead | Activation, onboarding, expansion, power-user behavior |

## Competitive Context

Use [Crow AI](https://usecrow.ai) as the default direct competitor reference for positioning, objection handling, sales enablement, and competitive GTM work unless a task calls for a different competitor set.

## Outbound System

Apollo is the outbound execution control plane. The live sequence is [`Warpy Founder-Led SDR Sequence`](https://app.apollo.io/#/sequences/69d153277282c2001550d75f).

Amplemarket is the sourcing and enrichment layer. Codex automations move clean leads into Apollo and execute pending manual tasks through the live browser. The AE owns replies, objections, live conversations, and opportunities.

Pipeline rules:

- build account-first, not from random contact dumps
- choose the best primary lead for the trigger and keep an adjacent lead available when useful
- import the primary lead first and hold adjacent context locally until multithreading is actually useful
- each accepted account needs a persona, trigger, pain hypothesis, proof point, `fit_score`, and `priority_tier`
- use verified work email for email sequencing and do not send to generic aliases, personal free-mail, or risky guesses
- LinkedIn is the main social context surface. X is useful only when the buyer is clearly active there
- do not automate outreach to contacts or accounts in Apollo states that indicate reply ownership, active opportunity, current customer, do-not-contact, bad data, or manual AE ownership
- keep Apollo stages and local GTM state synchronized so either system can prevent unsafe sends

The only enforced throughput cap in the GTM automation system is the Lead Builder cap: target `12` accepted primary leads and import/enrich no more than `16` accepted primary leads per run. Do not add other per-run, per-day, per-channel, schedule, topic, or task limits that could stop the three automations from continuing their work.

## Sequence Strategy

Pick the best-fit primary lead first. Use the adjacent lead only when the account still justifies multithreading and the primary motion has not converted.

| Day | Channel | Lead | Intent |
| --- | --- | --- | --- |
| 0 | Research / intro | Primary + adjacent context | Find a real trigger, pain hypothesis, proof point, and possible warm intro. |
| 1 | LinkedIn | Primary | Like or comment on a recent relevant post. No pitch. |
| 2 | Email 1 | Primary | Short trigger-led email. Ask if they want a quick breakdown. |
| 3 | LinkedIn | Primary | Send a blank or highly specific connection request. No generic pitch note. |
| 5 | LinkedIn / X | Primary | Light second social touch on the channel that fits their activity. |
| 6 | Email 2 | Primary | New persona angle: adoption, support deflection, or AI-native product experience. |
| 7 | LinkedIn DM | Primary if connected | Short permission-based DM tied to the trigger. |
| 8 | Email / LinkedIn | Adjacent if justified | Multithread with a different KPI angle only if the account is still eligible. |
| 10 | Email 3 | Primary | Add proof, a workflow example, or a concise use-case note. |
| 12 | X DM / LinkedIn DM | Most engaged lead | Earned DM only when public engagement or open DMs make it natural. |
| 14 | Email / DM | Most engaged lead | Send the most useful asset or breakdown for that persona. |
| 17 | Email | Primary or adjacent | Pure value touch. No hard CTA. |
| 21 | Email | Primary | Polite close-the-loop email. |

Every touch should add a new angle. Lead with dashboard adoption and product usage. Mention support reduction only when the persona or trigger makes it the natural hook.

## GTM State

Sales automation state:

- persistent state: `/Users/levw/.codex/state/warpy-gtm/`
- temporary artifacts: `/Users/levw/.codex/tmp/warpy-gtm/`

Marketing automation state:

- persistent state: `/Users/levw/.codex/state/warpy-marketing-gtm/`

Amplemarket lead lists are temporary transport objects. Their names must stay neutral and must not include `Warpy`. Delete temporary lists after local artifacts and Apollo import state are safely recorded.

## Marketing Engine

Warpy runs a founder-led marketing engine alongside outbound. Its job is to publish smart, human takes on product, AI, dashboards, and software behavior so the market associates Warpy with a clear point of view.

Operating principles:

- post from the founder or personal profile on LinkedIn, not the company page
- lead with the thought or pattern, not bait
- default to broader tech, AI, product, and UI shifts
- mention Warpy only when the bridge is natural
- broad commentary should still work if Warpy disappeared from the page
- never turn a loose source story into a disguised product pitch
- do not put links in the LinkedIn post body unless there is a deliberate reason
- optimize for saves, thoughtful comments, DMs, and profile visits
- use reference creators to raise taste, not to copy lines, structure, or claims

Content pillars:

- AI-native dashboards adding conversational input without throwing away the existing UI
- users only using a small slice of feature-rich products
- chat as the fastest input path to adoption, activation, and time-to-value
- embedded AI that takes approved actions, not just answers questions
- product and UX shifts from menu hunting to intent capture while the structured UI remains the output surface
- smart commentary on launches, interface changes, and product strategy shifts that show where software is going

Reference accounts for taste calibration:

- `https://x.com/LoganTGott`
- `https://x.com/AdamrahmanGTM`
- `https://x.com/itsalexvacca`
- `https://x.com/paolo_scales`

Every accepted post should have one concrete pattern, opinion, or takeaway and enough support that a smart reader would save, reply, or DM about it.
