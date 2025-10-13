# AGENTS.md

## Modes
- **Ask mode:** answers are short, clear, and strictly concise.

## Do
- Keep code **clean, elegant, small**. No comments. Follow existing patterns only.
- **pnpm** for all JS tasks.
- **React + TS:** use **shadcdn** components everywhere; compose classes with **clsx**; never hard-code colors/tokens.
- Frontend theme tokens live in `frontend/src/index.css`; adjust CSS variables there only.
- **State:** server cache with **@tanstack/react-query**; local state with **zustand** (small slices + selectors).
- **Data fetching:** never in components; use typed client modules; **one file per mutation hook**.
- **Tests:** **Jest + Testing Library**; prefer `findBy*` after render; add `data-testid` when needed; **100% coverage**.
- **Widget `<script>`:** tiny, idempotent init, no globals, no CSS bleed, works without the dashboard.
- **Backend:** **FastAPI**, **SQLAlchemy**, **Redis + RQ** for background jobs, **hCaptcha** server-side verified, **LangChain + Cohere** via existing clients.
- **DB:** write **efficient queries** only; avoid N+1; never full table scans; always use appropriate indexes/limits/projections.

## Don't
- Don’t introduce new patterns, abstractions, or heavy deps.
- Don’t mock components; mock **HTTP layer only**: `apiDashboardMock`, `apiV1Mock`.
- Don’t use `document.querySelectorAll` in tests.

## Migrations (Postgres/Aurora + PGVector)
- **Always generate files; never run them** in PRs.
- Use **`IF NOT EXISTS`** wherever possible.
- **Don’t validate foreign keys** (`NOT VALID`).
- Create/drop indexes **CONCURRENTLY** (e.g., Alembic `postgresql_concurrently=True`; raw SQL if needed).
- Vector cols: maintain proper indexes (e.g., IVFFLAT) and tune lists per table size.

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

## Tools
- Use **shadcdn MCP tools** when needed.
- You add shadcdn components such as `pnpm dlx shadcn@latest add label`

## PR checklist
- Title: `feat(scope): short description`.
- Lint/typecheck/tests **green** (JS + Py). **Coverage 100%**.
- Diff small and focused with a brief summary.
