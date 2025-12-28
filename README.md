# Warpy

Embeddable agent widget for dashboards. Bend interfaces into authenticated API actions and UI operations. Learn more at https://warpy.ai.

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
- **Auth:** Clerk
- **Infrastructure:** Docker, AWS ECR, ECS Fargate, Aurora DB

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
rq worker default --url "${REDIS_URL:-redis://localhost:6379/0}"
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

## Optional Widget JWT Auth (Advanced Security)
If you enable **Require signed widget token** on the Agent page, the widget will require a short‑lived JWT for `/widget/chat` (and will refresh it via the configured refresh endpoint path).

Required backend env:
- `WIDGET_JWT_SECRET` (signing secret for widget JWTs)

Local testing helper (no customer endpoint needed):
- Set `TEST_WIDGET_TOKEN_API_KEY` to your generated **Widget API Key**
- In **Advanced Security → Widget Refresh Endpoint**, set the path to `/test-widget-token` and **Deploy Changes**

`POST /test-widget-token` is for testing only (disabled when `ENVIRONMENT=production`); it proxies `POST /widget-token` using `TEST_WIDGET_TOKEN_API_KEY`.
