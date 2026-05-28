![Warpy](docs/assets/warpy-readme-banner.png)

## What is Warpy

Warpy is an AI assistant that lets users control your app through chat and dynamic UI. Learn more in [PRODUCT](PRODUCT.md).

## Prerequisites
- Node.js 20+
- `pnpm` 10+
- Python 3.11+
- Docker (optional but required for the compose workflow)

## Stack
- **Frontend:** Vite, React, TypeScript, pnpm, shadcn/ui, Zustand, Jest, TanStack React Query
- **Widget:** embeddable `<script>`
- **Dashboard:** React SPA
- **Backend:** FastAPI, LangChain, PostgreSQL/PGVector, SQLAlchemy, Redis, RQ, Pytest
- **Knowledge Base:** uploaded files + public websites with source-aware hybrid retrieval
- **Auth:** Clerk
- **Infrastructure:** Docker, AWS ECR, ECS Fargate, Aurora DB

## Planning

We use the GitHub Project in this repo (Projects tab) for planning and task tracking (no Linear / external PM tools).

## Docs

If you change a feature or surface, update its equivalent doc file in `docs/` when one exists. Keep this README human-facing: it should cover what Warpy is, how to run the dev environment, and only the most relevant project-level pointers. Put implementation details, automation internals, operational runbooks, and edge-case behavior in `docs/`, not here.

Live Chrome-session validation and automation use [docs/chrome-cdp.md](docs/chrome-cdp.md). The direct `scripts/cdp.mjs` CLI keeps one shared Chrome debugging session alive so repeated browser actions do not keep forcing fresh approval prompts.

Agent-specific instructions live in [AGENTS.md](AGENTS.md).

## Landing page

The marketing/landing site lives in the `landing/` submodule ([LevwTech/warpy-landing](https://github.com/LevwTech/warpy-landing)).

## Widget npm package

The widget loader package is published as `@warpy-ai/widget`. Source lives in the `widget/` submodule ([warpyai/widget](https://github.com/warpyai/widget)).

- Publish a new version: bump `package.json` version in `widget/`, then `pnpm publish --access public`.

## Non-Docker Setup
### Frontend
Copy `frontend/.env.example` to `frontend/.env` and adjust values before running `pnpm dev`.
```sh
cd frontend
pnpm install
pnpm dev --host
pnpm test
# single file
pnpm test src/__tests__/App.test.tsx
```
Global styling variables live in `frontend/src/index.css`. Update the CSS custom properties there to change theme colors, fonts, and radii across every shadcn/ui component (Tailwind maps those variables in `frontend/tailwind.config.ts`).

### Widget Testing
The easiest way to test the widget is to embed the script tag in `frontend/index.html` before the `</body>` close tag. You may need to reattach the widget every time you make changes.

### Backend
Copy `backend/.env.example` to `backend/.env`, then install dependencies and run tests or the API server.

Install dependencies (pyproject editable with dev extras):
```sh
cd backend
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -e '.[dev]'
```
Alternative install (requirements file):
```sh
python3 -m pip install -r requirements.txt
```

Run the API server:
```sh
uvicorn app.main:app --reload
```

Run the background worker (local Redis/Postgres):
```sh
cd backend
. .venv/bin/activate
rq worker default --with-scheduler --url "${REDIS_URL:-redis://localhost:6379/0}" --worker-class app.workers.no_client_list_worker.NoClientListWorker
```

Run tests:
```sh
python3 -m pytest app/controllers/test_config.py app/controllers/test_endpoints.py -q
python3 -m pytest app/controllers/test_endpoints.py::test_endpoint_crud_flow -q
```

Migrations (run from `backend`):
- `alembic upgrade head` applies pending migrations.
- `alembic revision --autogenerate -m "message"` generates a migration from model diffs.
- `alembic revision -m "message"` creates an empty migration to edit manually.

## Docker Setup
Copy `.env.example` to `.env` (root) and fill in any required keys. The sample values align with the backend and frontend `.env.example` files.

Build and start the full stack:
```sh
docker compose up --build
```

If using compose, run the same Alembic commands inside the backend container.

Run backend tests in Docker:
```sh
docker compose exec backend python3 -m pytest app
docker compose exec backend python3 -m pytest app/controllers/test_endpoints.py::test_endpoint_crud_flow -q
```

Services:
- Frontend (compose): http://localhost:5173
- Backend (compose): http://localhost:8000
- Postgres (port exposed by compose): localhost:5434
- Redis (port exposed by compose): localhost:6380

## Multi-Worktree Workflow
Run multiple branches in parallel with isolated Docker containers and ports:
```sh
pnpm worktree start   # spin up all worktrees
pnpm worktree list    # see URLs per worktree
pnpm worktree stop    # tear down
```
See [docs/worktrees.md](docs/worktrees.md) for full reference (commands, port allocation, promote, clean).
