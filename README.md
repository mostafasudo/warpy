# Warpy

Embeddable agent widget for dashboards. Bend interfaces into authenticated API actions and UI operations. Learn more in [PRODUCT_VISION.md](PRODUCT_VISION.md).

## Prerequisites
- Node.js 20+
- `pnpm` 10+
- Bun 1+ (only for the vendored `gstack` workflow skills)
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

## Skills
LLM agent skills are stored in `.codex/skills/` (the canonical location). The active tool mirrors in this repo are `.claude`, `.agent`, and `.cursor`, and each exposes symlinks pointing back to `.codex/skills/`.

`gstack` is vendored upstream and kept unmodified at `.codex/skills/gstack/`.

Because upstream `gstack` expects a native `.claude/skills/gstack` install, `.claude/skills/gstack`, `.agent/skills/gstack`, and `.cursor/skills/gstack` are symlinks back to `.codex/skills/gstack`, and the top-level skill names `browse`, `debug`, `design-consultation`, `design-review`, `document-release`, `gstack-upgrade`, `office-hours`, `plan-ceo-review`, `plan-design-review`, `plan-eng-review`, `qa`, `qa-only`, `retro`, `review`, `setup-browser-cookies`, and `ship` are mirrored there as discovery symlinks.

After any gstack reinstall or update, including `/gstack-upgrade`, run `./scripts/sync-gstack-mirrors.sh` from the repo root. It reruns upstream `.codex/skills/gstack/setup` and refreshes the `.claude`, `.agent`, and `.cursor` mirrors while keeping `.codex/skills/gstack/` as the only real repo copy.

## Deployment

Production infrastructure reference: [docs/infra-guide.md](docs/infra-guide.md).

## Planning

We use the GitHub Project in this repo (Projects tab) for planning and task tracking (no Linear / external PM tools).

## Docs
If you change a feature/surface, update its equivalent doc file in `docs/` when one exists.

## Landing page

The marketing/landing site lives in the `landing/` submodule ([LevwTech/warpy-landing](https://github.com/LevwTech/warpy-landing)).

## Widget npm package

The widget loader package is published as `@warpy-ai/widget`. Source lives in the `widget/` submodule ([warpyai/widget](https://github.com/warpyai/widget)).

- Publish a new version: bump `package.json` version in `widget/`, then `pnpm publish --access public`.

## Adding an environment variable

Backend/worker env vars are sourced from GitHub Secrets in production (ECS task definitions get synced on deploy).

- Backend code: add a typed field to `backend/app/core/config.py` (`Settings`). Env var name is the uppercased field name (e.g. `foo_bar` → `FOO_BAR`).
- Local backend: add it to `backend/.env.example` (copy to `backend/.env` when running non-Docker).
- Docker Compose: add it to `.env.example` (copy to `.env`) and thread it into `docker-compose.yml` for any services that need it (`backend`, `worker`, `frontend`).
- Production deploy: add it as a GitHub Secret/Variable and wire it into `.github/workflows/deploy-production.yml` (`Deploy ECS services` step env + `render_task_definition`/`managed_env`).
- Frontend (Vite): add `VITE_*` vars to `frontend/.env.example`, pass as workflow `build-args`, add `ARG/ENV` in `frontend/Dockerfile`, then read via `import.meta.env.VITE_*`.

## Lemon Squeezy (Local development)

Warpy ships with a Lemon Squeezy integration for subscriptions and one-time action top-ups.

- Create a Lemon Squeezy account + Store, then create subscription and one-time top-up variants.
- Set all required `LEMON_SQUEEZY_*` env vars in your environment (API key, Store ID, Variant IDs, webhook secret, optional redirect URL, test mode).
- Setup webhook: use ngrok and set the Lemon webhook URL to `https://<ngrok-host>/webhooks/lemon-squeezy`.
- For testing payments checkout, use Lemon Squeezy test mode: https://docs.lemonsqueezy.com/help/getting-started/test-mode

## Enterprise Accounts (Lemon Squeezy)

How we onboard enterprise customers and create enterprise plans.

- Create an **Enterprise** subscription variant in Lemon Squeezy (a “shell” variant) and set `LEMON_SQUEEZY_ENTERPRISE_VARIANT_ID`.
- Agree on the plan terms with the customer:
  - `customPriceCents` (monthly price, in cents)
  - `monthlyActions` (monthly action quota)
- Generate a checkout link (admin-only):
  - Call `POST /billing/checkout/enterprise` with header `x-warpy-admin-token: <BILLING_ADMIN_TOKEN>` and body `{ "customPriceCents": 12345, "monthlyActions": 100000 }`.
  - Generate the link while authenticated as the customer (Warpy encodes `user_id` in checkout custom data for webhook syncing).
- After purchase, Lemon webhooks sync the subscription in Warpy and set the customer’s monthly quota to `monthlyActions`.
- If you need fixed enterprise tiers, create additional private variants and extend the enterprise checkout endpoint to select the variant per tier.

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

## Optional Widget JWT Auth (Advanced Security)
If you enable **Require signed widget token** on the Agent page, the widget will require a short-lived JWT for `WS /widget/session` runs and protected widget endpoints such as `POST /widget/transcribe`. The widget refreshes it via the configured refresh endpoint path and includes it in the first websocket `chat.request`.

Required backend env:
- `WIDGET_JWT_SECRET` (signing secret for widget JWTs)

Local testing helper (no customer endpoint needed):
- Set `TEST_WIDGET_TOKEN_API_KEY` to your generated **Widget API Key**
- In **Advanced Security → Widget Refresh Endpoint**, set the path to `/test-widget-token` and **Deploy Changes**

`POST /test-widget-token` is for testing only (disabled when `ENVIRONMENT=production`); it proxies `POST /widget-token` using `TEST_WIDGET_TOKEN_API_KEY`.

## Tracing (LangSmith)

If you wish to use LangSmith for tracing:
1. Create an account at [LangSmith](https://smith.langchain.com/).
2. Add your own API key in the `LANGSMITH_API_KEY` environment variable.
