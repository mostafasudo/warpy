![Warpy](docs/assets/warpy-readme-banner.png)

## What is Warpy

AI assistant that lets users control your app through chat and dynamic UI.

Warpy is a lightweight assistant customers embed in their SaaS dashboards with a script or framework wrapper. Users ask for work in chat, and Warpy can answer with markdown or generative UI through Warpy components, or customer-native components, then complete workflows through configured tools: backend tools turn the customer's authenticated API endpoints into typed actions, frontend tools run named actions the customer exposes inside their own app, and Screen Autopilot can take over the user's DOM, read the page, click, type, and navigate autonomously when no explicit tool exists. Auth stays scoped to the host app: customer-owned requests can use the user's browser cookies or configured auth headers, and optional signed widget tokens protect widget sessions so actions run with the current user's existing permissions. Warpy also gives teams a dashboard to manage tools, rate limiting, widget styling, security, and more, and agents can control the same configuration through the API. Learn more in [PRODUCT](PRODUCT.md).

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

## Planning

We use the GitHub Project in this repo (Projects tab) for planning and task tracking (no Linear / external PM tools).

## Docs

If you change a feature or surface, update its equivalent doc file in `docs/` when one exists. Keep this README human-facing: it should cover what Warpy is, how to run the dev environment, and only the most relevant project-level pointers. Put implementation details, automation internals, operational runbooks, and edge-case behavior in `docs/`, not here.

Live Chrome-session validation and automation use [docs/chrome-cdp.md](docs/chrome-cdp.md). The direct `scripts/cdp.mjs` CLI keeps one shared Chrome debugging session alive so repeated browser actions do not keep forcing fresh approval prompts.

Agent-specific instructions live in [AGENTS.md](AGENTS.md).

## Landing page

The marketing/landing site lives in the `landing/` submodule ([LevwTech/warpy-landing](https://github.com/LevwTech/warpy-landing)).

## Widget

[![npm](https://img.shields.io/npm/v/%40warpy-ai%2Fwidget?label=npm)](https://www.npmjs.com/package/@warpy-ai/widget)

Tiny, framework-agnostic loader for the Warpy embeddable widget.

This package **does not bundle the widget UI**. It simply injects the Warpy widget `<script>` (`widget.js`) and passes configuration via `data-*` attributes.

### Install

```bash
npm i @warpy-ai/widget
# or
pnpm add @warpy-ai/widget
# or
yarn add @warpy-ai/widget
```

### Quick start (vanilla)

```ts
import { mountWidget } from "@warpy-ai/widget"

const widget = mountWidget({
  agentId: "YOUR_AGENT_UUID",
  baseUrl: "https://YOUR_DASHBOARD_BASE_URL/",
  scriptSrc: "https://cdn.warpy.ai/widget.js",
  components: [
    {
      key: "invoice_summary",
      version: "1",
      render({ mount, props }) {
        mount.textContent = String(props.content || "")
      }
    }
  ]
})

// later
widget.unmount()
```

### React

```tsx
import { Widget } from "@warpy-ai/widget/react"

export function App() {
  return (
    <Widget
      agentId="YOUR_AGENT_UUID"
      baseUrl="https://YOUR_DASHBOARD_BASE_URL/"
      scriptSrc="https://cdn.warpy.ai/widget.js"
      components={[
        { key: "invoice_summary", version: "1", component: InvoiceSummary }
      ]}
    />
  )
}
```

### Vue

```vue
<script setup lang="ts">
import { Widget } from "@warpy-ai/widget/vue"
</script>

<template>
  <Widget
    agentId="YOUR_AGENT_UUID"
    scriptSrc="https://cdn.warpy.ai/widget.js"
    :components="[
      { key: 'invoice_summary', version: '1', component: InvoiceSummary }
    ]"
  />
</template>
```

### Svelte

```svelte
<script>
  import Widget from "@warpy-ai/widget/svelte"
</script>

<Widget
  agentId="YOUR_AGENT_UUID"
  scriptSrc="https://cdn.warpy.ai/widget.js"
  components={[{ key: "invoice_summary", version: "1", component: InvoiceSummary }]}
/>
```

### Script tag (no package)

```html
<script
  src="https://cdn.warpy.ai/widget.js"
  data-agent-id="YOUR_AGENT_UUID"
  data-base-url="https://YOUR_DASHBOARD_BASE_URL/"
></script>
```

### Frontend-only mode (optional)

If you only use frontend actions/context tools and do not need backend endpoint tools or widget token refresh, you can omit `baseUrl`.

```ts
import { mountWidget } from "@warpy-ai/widget"

const widget = mountWidget({
  agentId: "YOUR_AGENT_UUID",
  scriptSrc: "https://cdn.warpy.ai/widget.js"
})
```

### API

#### `mountWidget(options)`

`options`:

- `agentId` (required): Warpy agent UUID
- `baseUrl` (optional): your dashboard base URL (only needed when backend endpoint tools or widget token refresh must call your app backend)
- `scriptSrc` (required): URL to `widget.js` (e.g. `https://cdn.warpy.ai/widget.js`)
- `containerId` (optional): DOM id for the injected widget container
- `components` (optional): output-only native renderers keyed to the component definitions you register in Warpy

Returns:

- `{ unmount() }`: removes the injected container + script

#### Native output components

Native components are optional. Use them only when the widget response mode is set to Native components in the Warpy dashboard. Each registered component must match a component definition in `/widget-components`, including its key, version, props schema, suitability guidance, and constraints. Warpy always sends a complete markdown fallback; if a native renderer is missing, the widget shows that fallback instead.

React, Vue, and Svelte wrappers can adapt framework components passed as `{ key, version, component }`. Angular and vanilla installs should pass `{ key, version, render }` and mount with the app's own lifecycle helpers.

### License

MIT

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
