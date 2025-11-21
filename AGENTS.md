# AGENTS.md

## Modes
- **Ask mode:** answers are short, clear, and strictly concise.

## Do
- Keep code **DRY, clean, elegant, small**. No comments. Follow existing patterns only.
- **pnpm** for all JS tasks.
- **React + TS:** use **shadcdn** components everywhere; compose classes with **clsx**; never hard-code colors/tokens.
- Frontend theme tokens live in `frontend/src/index.css`; adjust CSS variables there only.
- **State:** server cache with **@tanstack/react-query**; local state with **zustand** (small slices + selectors).
- **Data fetching:** never in components; use typed client modules; **one file per mutation hook**.
- **Tests:** **Jest + Testing Library**; prefer `findBy*` after render; add `data-testid` when needed; **100% coverage**.
- **Widget `<script>`:** tiny, idempotent init, no globals, no CSS bleed, works without the dashboard.
- **Backend:** **FastAPI**, **SQLAlchemy**, **Redis + RQ** for background jobs, **hCaptcha** server-side verified, **LangChain + Cohere** via existing clients.
- **DB:** write **efficient queries** only; avoid N+1; never full table scans; always use appropriate indexes/limits/projections.
- **Concurrency:** make all operations **idempotent and atomic**; use upserts instead of inserts; implement proper locking; design for high concurrency safety.
- **Environment:** when adding env vars or configuration, support both Docker and non-Docker setups.
- **Logging:** always use `log_info`, `log_error`, `log_warning`, `log_debug` from `core.logger`; never `print()`. Format: `[scope] [method]: message` where scope is controller/service/worker name.

## Don't
- Don’t introduce new patterns, abstractions, or heavy deps.
- Don’t mock components; mock **HTTP layer only**: `apiDashboardMock`, `apiV1Mock`.
- Don’t use `document.querySelectorAll` in tests.

## Commands (file-scoped first)
- **Typecheck TS:** `pnpm tsc --noEmit path/to/file.tsx`
- **Format:** `pnpm prettier --write path/to/file.tsx`
- **Lint TS:** `pnpm eslint --fix path/to/file.tsx`
- **Unit test TS:** `pnpm jest path/to/file.test.tsx --coverage`
- **Py tests:** `pytest path/to/test_*.py -q`
- **Py lint/format** (if configured): `ruff check --fix path/` · `black path/` · `mypy path/`
- **Migrations:** `alembic revision --autogenerate -m "..."` (generate only)
- **Full builds** only when explicitly asked.

## Safety & Permissions
- **Allowed without prompt:** read/list files; file-scoped tsc/eslint/prettier/jest; pytest on a file.
- **Ask first:** package installs; deleting files; git push; full builds; e2e suites; DB-affecting scripts.

## Frontend specifics
- **React Query:** stable array keys; cache boundaries per feature; granular invalidation; retries/timeouts set; one mutation per file.
- **Zustand:** tiny stores; selectors to avoid re-renders; no business logic in components.
- **shadcdn:** use official components and patterns; don’t re-implement primitives.

## Backend specifics
- **FastAPI:** pydantic models; strict types; timeouts/retries on outbound calls; input validation at edges.
- **SQLAlchemy:** explicit columns (no `*`); eager loading (`selectinload`/`joinedload`) to prevent N+1; `EXPLAIN ANALYZE` when optimizing.
- **RQ:** short jobs; idempotent; visibility timeouts; retries with backoff.
- **hCaptcha:** verify server-side for public endpoints.
- **LangChain/Cohere:** small, composable chains; respect configured models/temps; never log secrets or PII.
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
- Title: `feat(scope): short description`.
- Lint/typecheck/tests **green** (JS + Py). **Coverage 100%**.
- Diff small and focused with a brief summary.
