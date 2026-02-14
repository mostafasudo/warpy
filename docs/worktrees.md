# Multi-Worktree Docker Compose

Run multiple git worktrees in parallel, each with isolated Docker containers and ports.

| Command | What it does |
|---------|-------------|
| `pnpm worktree start` | Build and start containers for all worktrees |
| `pnpm worktree stop` | Stop containers for all worktrees |
| `pnpm worktree list` | Print URLs and ports for every worktree |
| `pnpm worktree promote <index>` | Merge a worktree branch into the current branch |
| `pnpm worktree clean` | Stop containers and remove all worktrees except current |

## Commands

### `pnpm worktree start`

Starts Docker Compose for every worktree except main. For each worktree it:

1. Syncs `docker-compose.yml`, Dockerfiles, alembic config, and `.env` from main (always fresh)
2. Stops any stale `*-wt-*` containers
3. Assigns isolated ports (see table below)
4. Sets `COMPOSE_PROJECT_NAME` to `{repo}-wt-{index}-{branch}`
5. Sets `VITE_API_URL` to point at the worktree's backend port
6. Runs `docker compose up -d --build`

### `pnpm worktree stop`

Runs `docker compose down` for every non-main worktree.

### `pnpm worktree list`

Prints all worktrees with their branch, path, project name, and localhost URLs.

### `pnpm worktree promote <index>`

Copies all changed files from a worktree into the current branch as uncommitted changes.

Aborts if any of those files already have uncommitted changes locally, so existing work is never overwritten. Commit or stash local changes first if there's a conflict.

Run `pnpm worktree list` to find the index.

### `pnpm worktree clean`

Stops containers and removes all worktrees except the current one. Prunes stale worktree refs.

## Port allocation

Main worktree uses default ports (unset env = defaults in `docker-compose.yml`). Each additional worktree N gets `base + N`:

| Service  | Main (default) | Worktree N    |
|----------|---------------|---------------|
| Postgres | 5434          | 15434 + N     |
| Redis    | 6380          | 16380 + N     |
| Backend  | 8000          | 18000 + N     |
| Frontend | 5173          | 15173 + N     |

## Project naming

`COMPOSE_PROJECT_NAME` follows the pattern `{repo}-wt-{index}-{branch}`, lowercased with non-alphanumeric characters replaced by hyphens.

## How it works

`docker-compose.yml` uses `${VAR:-default}` syntax for all host ports. The worktree script copies a fresh `.env` from main and appends `POSTGRES_PORT`, `REDIS_PORT`, `BACKEND_PORT`, `FRONTEND_PORT`, and `VITE_API_URL` before calling `docker compose up`. The frontend Dockerfile and Vite config read `FRONTEND_PORT` to bind the dev server to the correct port inside the container.
