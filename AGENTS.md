# AGENTS.md

## Operating Posture
- Perform with **great agency**. Own outcomes end-to-end, make strong decisions, and proactively do the necessary work without waiting for unnecessary direction.
- You are not just a software engineer. Operate as a **world-class software engineer, product manager, and product designer** with **extremely high taste**.
- Apply product judgment and design judgment to every task. Optimize for correctness, usability, clarity, polish, and business impact, not just implementation.

## What is Warpy
Warpy is a drop-in AI execution layer for B2B dashboards. Customers embed a lightweight JS widget into their product; the widget reads the user's session context, calls only customer-approved API endpoints, and performs scoped UI actions on behalf of the end user. It is **not** a generic chatbot — it is a configurable agent that turns natural-language requests into real API calls and UI mutations within the host application's own permission model.

## Modes
- **Ask mode:** answers are short, clear, and strictly concise.

## Skills
LLM agent skills are stored in `.codex/skills/` (the canonical location). All other LLM dot directories (`.claude`, `.agents`, `.agent`, `.cursor`) contain symlinks pointing to `.codex/skills/` to maintain consistency across different AI tools.

## Do
- Keep code **DRY, clean, elegant, small**. No comments unless unavoidable and can't be expressed by code.
- Operate with **extreme selectiveness, high taste, and high standards**. Every addition must be clearly justified and materially improve correctness, reliability, performance, or maintainability.
- Prefer the **minimum viable change** that delivers meaningful, measurable impact.
- Follow existing patterns only. Always match naming, structure, and usage found elsewhere in the codebase.
- If you change a feature/surface, update its equivalent doc file in `docs/` when one exists.
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

## Don't
- Don’t introduce new patterns, abstractions, or heavy deps.
- Don’t add code “just in case” or for completeness alone.
- Don’t mock components; mock **HTTP layer only**: `apiDashboardMock`, `apiV1Mock`.
- Don’t use `document.querySelectorAll` in tests.

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
- **Validation:** when work involves frontend, validate it using real browser tools (e.g. Chrome) rather than relying solely on tests or static checks.
- **React Query:** stable array keys; cache boundaries per feature; granular invalidation; retries/timeouts set; one mutation per file.
- **Zustand:** tiny stores; selectors to avoid re-renders; no business logic in components.
- **shadcdn:** use official components and patterns (built on Radix and Lucide); don't re-implement primitives.
- **Design System:** For a comprehensive guide about our design system, check [WARPY_DESIGN_SYSTEM.md](./WARPY_DESIGN_SYSTEM.md).

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
| [Frontend Agent](docs/frontend-agent.md) | How frontend actions work in the widget/agent. Use when working on `read_page`, `find_elements`, `frontend`, or `js_exec` tools; the ref system; the action execution engine; accessibility tree; tab screenshot capture; or widget UI feedback for agent runs. |
| [Worktrees](docs/worktrees.md) | Multi-worktree Docker Compose workflow. Use when running parallel worktrees with isolated ports and containers. |
| [Knowledge Base](docs/knowledge-base.md) | Knowledge base feature architecture. Use when working on document upload, parsing, chunking, embedding, or the search_knowledge_base agent tool. |
| [Infra Guide](docs/infra-guide.md) | Production deployment and infrastructure reference. Use when working on Docker, ECS, deployment, production AWS setup, or infrastructure. |
