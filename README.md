# chat-to-api

Embeddable chat/voice agent that turns natural-language into authenticated API actions. Learn More [here](https://www.notion.so/Natural-Language-to-API-Agent-19dc1bcbe3f58097b047fe03c2f42918?source=copy_link) 📝

## Prerequisites
- Node.js 20+
- `pnpm` 10+
- Python 3.11+
- Docker (optional but required for the compose workflow)

## Stack
- **Frontend:** Vite, React, TypeScript, pnpm, shadcn/ui, Zustand, Jest, TanStack React Query
- **Widget:** embeddable `<script>`
- **Dashboard:** React SPA
- **Backend:** FastAPI, LangChain, PostgreSQL/PGVector, SQLAlchemy, Cohere, Redis, RQ, Pytest, hCaptcha
- **Auth:** Clerk
- **Infrastructure:** Docker, AWS ECR, ECS Fargate, Aurora DB

## Frontend
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

## Backend
Copy `backend/.env.example` to `backend/.env`, then install dependencies and run tests or the API server:
```sh
cd backend
python3 -m pip install -r requirements.txt
PYTHONPATH=app python3 -m pytest
# single file
PYTHONPATH=app python3 -m pytest tests/test_health.py
uvicorn app.main:app --reload
```

## Docker Compose
Copy `.env.example` to `.env` (root) and fill in any required keys. The sample values align with the backend and frontend `.env.example` files.

Build and start the full stack:
```sh
docker compose up --build
```

Services:
- Frontend (compose): http://localhost:5173
- Backend (compose): http://localhost:8000
- Postgres (port exposed by compose): localhost:5432
- Redis (port exposed by compose): localhost:6379
