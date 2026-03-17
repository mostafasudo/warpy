# AGENTS.md

## Operating Posture
- Perform with **great agency**. Own outcomes end-to-end, make strong decisions, and proactively do the necessary work without waiting for unnecessary direction.
- Try to spawn subagents proactively whenever they can help you do more work in parallel and increase throughput.
- Have agency to improve your own `AGENTS.md` and docs when doing so will materially improve future agent behavior, clarity, or outcomes.
- You are not just a software engineer. Operate as a **world-class software engineer, product manager, and product designer** with **extremely high taste**.
- Apply product judgment and design judgment to every task. Optimize for correctness, usability, clarity, polish, and business impact, not just implementation.

## Core Values (Widget & Product)

- **Minimal Intrusion:** The widget must be as vanilla and minimal as possible. It must avoid being invasive to the user's dashboard and styling. Warpy overlays, morphs, and acts, but never disrupts or overwrites the host product experience.
- **End-User Simplicity:** Anything surfaced to end users (our customers' users) must be extremely simple and non-technical—no jargon.
- **Host Design Inheritance:** We use as much as possible from the existing customer host page. Infer their design tokens—fonts, colors, spacing—and reuse them so the widget feels native to the dashboard.

## Default Flow (Non-Trivial Tasks)
**It is incredibly important that the agent follow this flow for any non-trivial task.** Do not skip steps.

1. Brainstorm toward the best product outcome with `/plan-ceo-review`
2. Create the plan using plan mode, `docs/mega-plan-review.md`, and `/plan-eng-review`
3. Implement the plan and finish all TODOs
4. Run the full frontend and backend testing sweep
5. Run the code review tool/skill for a careful review with `/review`
6. If there are review comments to address, apply `docs/receiving-code-review.md` before making those changes
7. Call other relevant skills such as `/browse`, `/qa`, `/qa-design-review`, `/retro`, and `/document-release` when they materially improve the outcome and keep documentation up to date

## What is Warpy
Warpy is a drop-in AI execution layer for B2B dashboards. Customers embed a lightweight JS widget into their product; the widget reads the user's session context, calls only customer-approved API endpoints, and performs scoped UI actions on behalf of the end user. It is **not** a generic chatbot — it is a configurable agent that turns natural-language requests into real API calls and UI mutations within the host application's own permission model.

## Monorepo Structure
This repo contains three projects as submodules or top-level directories:

| Directory | Repo | Purpose |
|-----------|------|---------|
| `frontend/` + `backend/` | (this repo) | Core platform — dashboard, API, agent engine, and all backend services. |
| `docs-site/` | `docs` (submodule) | Public Mintlify documentation site for customers and implementers. |
| `landing/` | `warpy-landing` (submodule) | Public marketing site / landing page. |
| `widget/` | `widget` (submodule) | The embeddable JS widget that customers drop into their dashboards. |

Submodules have their own git history. Commit inside the submodule first, then update the reference in the parent repo.
`docs-site/` is public customer-facing documentation. Do not put internal-only implementation details, engineering notes, or private operational guidance there.

## Modes
- **Ask mode:** answers are short, clear, and strictly concise.

## Skills
LLM agent skills are stored in `.codex/skills/` (the canonical location). The active tool mirrors in this repo are `.claude`, `.agent`, and `.cursor`, and each exposes symlinks pointing back to `.codex/skills/`.
- `gstack` is vendored upstream and kept unmodified at `.codex/skills/gstack/`.
- Because upstream `gstack` expects a native `.claude/skills/gstack` install, `.claude/skills/gstack`, `.agent/skills/gstack`, and `.cursor/skills/gstack` are symlinks back to `.codex/skills/gstack`, and the top-level skill names `browse`, `qa`, `qa-only`, `review`, `ship`, `plan-ceo-review`, `plan-eng-review`, `setup-browser-cookies`, `retro`, and `gstack-upgrade` are mirrored there as symlinks for skill discovery.
- After any gstack reinstall or update, including `/gstack-upgrade`, run `./scripts/sync-gstack-mirrors.sh` from the repo root. It reruns upstream `.codex/skills/gstack/setup` and refreshes the `.claude`, `.agent`, and `.cursor` mirrors while keeping `.codex/skills/gstack/` as the only real repo copy.
- The default browser-validation rule in this repo still comes from `docs/chrome-cdp.md`; use `gstack` when a task explicitly calls for those workflow skills.

## Do
- Keep code **DRY, clean, elegant, small**. No comments unless unavoidable and can't be expressed by code.
- Code must be **efficient, performant, and as scalable as possible** (i.e., easy to extend and build upon, and able to smoothly support millions of users) at all times.
- Operate with **extreme selectiveness, high taste, and high standards**. Every addition must be clearly justified and materially improve correctness, reliability, performance, or maintainability.
- Whenever your changes make any code or test dead or unused, remove that code or test so the codebase only contains what is relevant and necessary.
- Follow existing patterns only. Always match naming, structure, and usage found elsewhere in the codebase.
- When you change a feature or surface, update the equivalent doc file in `docs/` (internal documentation) when one exists. If the change affects public-facing product behavior or setup, also update the corresponding public documentation in `docs-site/`. Always keep `AGENTS.md` and the project `README.md` up to date.
- Keep the public docs in `docs-site/` automatically up to date whenever product behavior, setup, UI copy, tooling, security, or user-facing flows change. Only customer-facing information should be in `docs-site/`; put all internal implementation details in `docs/`, not in public docs.
- Whenever browser access is needed for validation, debugging, reproduction, or automation, load `docs/chrome-cdp.md` first and prefer that live Chrome session workflow over separate browser instances.
- **When the instruction says "ship it", that means:**  
  run all tests, then commit and push the changes (excluding any changes to `frontend/index.html`).  
  After you push, monitor the deployment until it completes, and keep checking the health of the deployment to ensure it is healthy.
- **pnpm** for all JS tasks.
- **React + TS:** use **shadcdn** components everywhere; compose classes with **clsx**; never hard-code colors/tokens.
- Frontend theme tokens live in `frontend/src/index.css`; adjust CSS variables there only.
- **State:** server cache with **@tanstack/react-query**; local state with **zustand** (small slices + selectors).
- **Data fetching:** never in components; use typed client modules; **one file per mutation hook**.
- **Tests:** **Jest + Testing Library**; prefer `findBy*` after render; add `data-testid` when needed; **100% coverage**.
- Keep **100% test coverage** for frontend and backend; when changing any existing file, adjust tests to stay green.
- **Backend tests (local):** activate `backend/.venv` then `python3 -m pytest app`
- **Backend tests (docker):** `docker compose exec backend python3 -m pytest app`
- **Widget `<script>`:** tiny, idempotent init, no globals, no CSS bleed, works without the dashboard.
- **White-labeling:** the widget runs on customers' dashboards and must be fully white-label-ready. Never hard-code "Warpy" (or any Warpy branding) in user-facing widget output. Any product name shown to end users must come from a configurable value that defaults to "Warpy" only when the customer hasn't set their own.
- **Backend:** **FastAPI**, **SQLAlchemy**, **Redis + RQ** for background jobs, **LangChain** via existing clients.
- **DB:** write **efficient queries** only; avoid N+1; never full table scans; always use appropriate indexes/limits/projections.
- **Concurrency:** make all operations **idempotent and atomic**; use upserts instead of inserts; implement proper locking; design for high concurrency safety.
- **Environment:** when adding env vars or configuration, support both Docker and non-Docker setups.
- **Logging:** always use `log_info`, `log_error`, `log_warning`, `log_debug` from `core.logger`; never `print()`. Format: `[scope] [method]: message` where scope is controller/service/worker name.

## Adding env vars
- Add the field to `backend/app/core/config.py` (`Settings`) and keep types/defaults strict.
- Update `.env.example` (root, for Docker Compose) and `backend/.env.example` (non-Docker backend).
- Thread it into `docker-compose.yml` for every service that needs it.
- Production: add the GitHub Secret/Variable and wire it into `.github/workflows/deploy-production.yml` (`Deploy ECS services` step env + `render_task_definition`/`managed_env`). Backend/worker ECS env vars are overwritten from GitHub on deploy.
- Frontend: `VITE_*` vars are build-time; update `frontend/.env.example`, workflow `build-args`, and `frontend/Dockerfile` `ARG/ENV`.

## Agent AWS & GitHub Access
- The root `.env` is the source of truth for agent access. Keep `AWS_ACCESS_KEY`, `AWS_SECRET_KEY`, `AWS_REGION`, and `GITHUB_TOKEN` there.
- Use `node scripts/with-agent-env.mjs <command> ...` for any AWS CLI, GitHub CLI, or other tooling that should inherit repo credentials. Do not rely on `aws configure`, `gh auth login`, or machine-specific global credential state.
- `scripts/with-agent-env.mjs` loads the repo root `.env` and maps repo env names to official CLI names:
  `AWS_ACCESS_KEY` -> `AWS_ACCESS_KEY_ID`
  `AWS_SECRET_KEY` -> `AWS_SECRET_ACCESS_KEY`
  `AWS_REGION` -> `AWS_DEFAULT_REGION`
  `GITHUB_TOKEN` -> `GH_TOKEN`
- If the CLIs are missing on macOS, install them with `brew install gh awscli`.
- Agents should proactively use `gh` and `aws` when deployment or production verification matters, especially for:
  GitHub Actions deploy checks, failed workflow logs, ECS service health, CloudWatch logs, ECR image verification, and general infrastructure inspection.
- Standard verification commands:
  `node scripts/with-agent-env.mjs gh auth status`
  `node scripts/with-agent-env.mjs aws sts get-caller-identity`
- Common GitHub Actions commands:
  `node scripts/with-agent-env.mjs gh run list --workflow deploy-production.yml --limit 5`
  `node scripts/with-agent-env.mjs gh run view <run-id> --log-failed`
  `node scripts/with-agent-env.mjs gh api repos/{owner}/{repo}/actions/runs --jq '.workflow_runs[0] | {status, conclusion, headBranch: .head_branch, updatedAt: .updated_at}'`
- Common AWS operational commands:
  `node scripts/with-agent-env.mjs aws logs describe-log-groups --log-group-name-prefix /ecs/warpy-prod-`
  `node scripts/with-agent-env.mjs aws logs tail /ecs/warpy-prod-backend --since 30m`
  `node scripts/with-agent-env.mjs aws ecs list-clusters`
  `node scripts/with-agent-env.mjs aws ecs list-services --cluster <cluster-name-or-arn>`
- Never print secrets into docs, issues, or commits. Use the wrapper, inspect only the command output you need, and keep `.env` untracked.

## Don't
- Don’t introduce new patterns, abstractions, or heavy deps.
- Don’t add code “just in case” or for completeness alone.
- Don’t mock components; mock **HTTP layer only**: `apiDashboardMock`, `apiV1Mock`.
- Don’t use `document.querySelectorAll` in tests.
- Don’t give `frontend/index.html` review weight. Treat changes there as local testing noise, ignore them during review, and never push that file unless the user explicitly asks for it.

## Commands (file-scoped first)
- **Typecheck TS:** `pnpm tsc --noEmit path/to/file.tsx`
- **Format:** `pnpm prettier --write path/to/file.tsx`
- **Lint TS:** `pnpm eslint --fix path/to/file.tsx`
- **Unit test TS:** `pnpm jest path/to/file.test.tsx --coverage`
- **Py tests:** `pytest path/to/test_*.py -q`
- **Py lint/format** (if configured): `ruff check --fix path/` · `black path/` · `mypy path/`
- **Migrations:** `alembic upgrade head` (apply) · `alembic revision --autogenerate -m "..."` (generate from models) · `alembic revision -m "..."` (empty draft)
- **Full builds** only when explicitly asked.

## Safety & Permissions
- **Allowed without prompt:** read/list files; file-scoped tsc/eslint/prettier/jest; pytest on a file.
- **Ask first:** package installs; deleting files; git push; full builds; e2e suites; DB-affecting scripts.

## Frontend specifics
- **Validation:** when work involves frontend, validate it using a real browser rather than relying solely on tests or static checks. Load `docs/chrome-cdp.md` first and prefer that Chrome CDP workflow whenever browser access, inspection, validation, or automation is needed.
- **React Query:** stable array keys; cache boundaries per feature; granular invalidation; retries/timeouts set; one mutation per file.
- **Zustand:** tiny stores; selectors to avoid re-renders; no business logic in components.
- **shadcdn:** use official components and patterns (built on Radix and Lucide); don't re-implement primitives.
- **Design System:** For a comprehensive guide about our design system, check [DESIGN.md](./DESIGN.md).

## Backend specifics
- **FastAPI:** pydantic models; strict types; timeouts/retries on outbound calls; input validation at edges.
- **SQLAlchemy:** explicit columns (no `*`); eager loading (`selectinload`/`joinedload`) to prevent N+1; `EXPLAIN ANALYZE` when optimizing.
- **RQ:** short jobs; idempotent; visibility timeouts; retries with backoff.
- **LangChain:** clean, composable chains; respect configured models/temps; never log secrets or PII.
- **Clerk auth:** use `session: ClerkSession = Depends(require_clerk_session)` in endpoints; session contains `id`, `user_id`, `status`.
- **Logging patterns:**
  - Controllers: `log_info("ControllerName", "method_name", "message")`
  - Services: `log_info("ServiceName", "method_name", "message")`
  - Workers: `log_info("WorkerName", "job_name", "message")`
  - Errors: `log_error("scope", "method", "message", exc=exception)` (always include exception)
  - Extra context: pass as kwargs: `log_info("scope", "method", "msg", user_id=uid, request_id=rid)`

## Tools
- Use **shadcdn MCP tools** when needed.
- You add shadcdn components such as `pnpm dlx shadcn@latest add label`

## PR checklist
- Lint/typecheck/tests **green** (JS + Py). **Coverage 100%**.
- Diff small and focused with a brief summary.

## Docs
**Load only when needed.**

| Doc | When to load |
|-----|--------------|
| [Backend Conventions](docs/prompt-engineering.md) | Reference guide for prompt engineering best practices. Use when creating, modifying, or optimizing LLM agent system prompts, tool descriptions, parameter descriptions, or any AI instruction text. Apply when writing prompts for Claude, GPT, or other language models. |
| [Mega Plan Review](docs/mega-plan-review.md) | Use for non-trivial work during planning, after drafting the initial implementation plan and before writing code. Review the draft plan against this document to verify scope, edge cases, failure modes, tests, observability, and rollout posture. |
| [Receiving Code Review](docs/receiving-code-review.md) | Use when asked to address code review comments, before implementing reviewer suggestions, especially if the feedback seems unclear or technically questionable. Load this to verify feedback against the codebase and respond with technical rigor instead of performative agreement. |
| [Chrome CDP](docs/chrome-cdp.md) | Default browser guide. Load this whenever you need browser access for validation, inspection, reproduction, or automation so you can work against the user's live Chrome session instead of a separate browser instance. |
| [Frontend Agent](docs/frontend-agent.md) | How frontend actions work in the widget/agent. Use when working on `read_page`, `find_elements`, `frontend`, or `js_exec` tools; the ref system; the action execution engine; accessibility tree; tab screenshot capture; or widget UI feedback for agent runs. |
| [Worktrees](docs/worktrees.md) | Multi-worktree Docker Compose workflow. Use when running parallel worktrees with isolated ports and containers. |
| [Knowledge Base](docs/knowledge-base.md) | Knowledge base feature architecture. Use when working on document upload, parsing, chunking, embedding, or the search_knowledge_base agent tool. |
| [Infra Guide](docs/infra-guide.md) | Production deployment and infrastructure reference. Use when working on Docker, ECS, deployment, production AWS setup, or infrastructure. |
