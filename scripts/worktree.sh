#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)"
REPO_NAME="$(basename "$REPO_ROOT")"

BASE_POSTGRES_PORT=15434
BASE_REDIS_PORT=16380
BASE_BACKEND_PORT=18000
BASE_FRONTEND_PORT=15173

sanitize() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//'
}

get_worktrees() {
  git -C "$REPO_ROOT" worktree list --porcelain | awk '/^worktree /{print $2}'
}

get_worktree_branch() {
  git -C "$1" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached"
}

compose_name() {
  local idx="$1" branch="$2"
  sanitize "${REPO_NAME}-wt-${idx}-${branch}"
}

port_for() {
  local base="$1" idx="$2"
  echo $((base + idx))
}

ensure_worktree_files() {
  local wt_dir="$1"
  local always_sync=(
    "docker-compose.yml"
    "backend/Dockerfile.dev"
    "backend/Dockerfile"
    "backend/alembic.ini"
    "frontend/Dockerfile.dev"
    "frontend/Dockerfile"
  )
  for f in "${always_sync[@]}"; do
    local dir
    dir="$(dirname "$wt_dir/$f")"
    mkdir -p "$dir"
    if [[ -f "$REPO_ROOT/$f" ]]; then
      cp "$REPO_ROOT/$f" "$wt_dir/$f"
    fi
  done
  if [[ -d "$REPO_ROOT/backend/alembic" ]]; then
    rm -rf "$wt_dir/backend/alembic"
    cp -r "$REPO_ROOT/backend/alembic" "$wt_dir/backend/alembic"
  fi
  if [[ -f "$REPO_ROOT/.env" ]]; then
    cp "$REPO_ROOT/.env" "$wt_dir/.env"
  elif [[ -f "$REPO_ROOT/.env.example" ]]; then
    cp "$REPO_ROOT/.env.example" "$wt_dir/.env"
  fi
}

stop_stale_wt_containers() {
  local containers
  containers=$(docker ps -aq --filter "label=com.docker.compose.project" --filter "name=-wt-" 2>/dev/null || true)
  if [[ -n "$containers" ]]; then
    echo "Stopping stale worktree containers ..."
    docker rm -f $containers 2>/dev/null || true
  fi
  local networks
  networks=$(docker network ls -q --filter "name=${REPO_NAME}-wt-" 2>/dev/null || true)
  if [[ -n "$networks" ]]; then
    docker network rm $networks 2>/dev/null || true
  fi
  local volumes
  volumes=$(docker volume ls -q --filter "name=${REPO_NAME}-wt-" 2>/dev/null || true)
  if [[ -n "$volumes" ]]; then
    docker volume rm $volumes 2>/dev/null || true
  fi
}

cmd_start() {
  local worktrees
  worktrees=()
  while IFS= read -r line; do worktrees+=("$line"); done < <(get_worktrees)

  if [[ ${#worktrees[@]} -lt 2 ]]; then
    echo "No extra worktrees found (only main). Create one with: git worktree add ../branch-name branch-name"
    exit 0
  fi

  stop_stale_wt_containers

  local idx=0
  for wt in "${worktrees[@]}"; do
    if [[ "$wt" == "$REPO_ROOT" ]]; then
      continue
    fi
    idx=$((idx + 1))

    local branch
    branch="$(get_worktree_branch "$wt")"
    local project
    project="$(compose_name "$idx" "$branch")"

    local pg_port be_port fe_port rd_port
    pg_port="$(port_for $BASE_POSTGRES_PORT "$idx")"
    rd_port="$(port_for $BASE_REDIS_PORT "$idx")"
    be_port="$(port_for $BASE_BACKEND_PORT "$idx")"
    fe_port="$(port_for $BASE_FRONTEND_PORT "$idx")"

    echo "=== Worktree $idx: $branch ==="
    echo "  Path:     $wt"
    echo "  Project:  $project"
    echo "  Ports:    pg=$pg_port redis=$rd_port backend=$be_port frontend=$fe_port"

    ensure_worktree_files "$wt"

    {
      echo ""
      echo "POSTGRES_PORT=$pg_port"
      echo "REDIS_PORT=$rd_port"
      echo "BACKEND_PORT=$be_port"
      echo "FRONTEND_PORT=$fe_port"
      echo "VITE_API_URL=http://localhost:${be_port}"
    } >> "$wt/.env"

    (
      cd "$wt"
      export COMPOSE_PROJECT_NAME="$project"
      docker compose up -d --build
    )

    echo ""
  done
}

cmd_stop() {
  local worktrees
  worktrees=()
  while IFS= read -r line; do worktrees+=("$line"); done < <(get_worktrees)

  local idx=0
  for wt in "${worktrees[@]}"; do
    if [[ "$wt" == "$REPO_ROOT" ]]; then
      continue
    fi
    idx=$((idx + 1))

    local branch
    branch="$(get_worktree_branch "$wt")"
    local project
    project="$(compose_name "$idx" "$branch")"

    echo "Stopping $project ..."
    (
      cd "$wt"
      COMPOSE_PROJECT_NAME="$project" docker compose down
    )
  done
}

cmd_list() {
  local worktrees
  worktrees=()
  while IFS= read -r line; do worktrees+=("$line"); done < <(get_worktrees)

  printf "%-6s %-40s %s\n" "INDEX" "WORKTREE" "URL"
  printf "%-6s %-40s %s\n" "-" "main" "http://localhost:5173"

  local idx=0
  for wt in "${worktrees[@]}"; do
    if [[ "$wt" == "$REPO_ROOT" ]]; then
      continue
    fi
    idx=$((idx + 1))

    local branch
    branch="$(get_worktree_branch "$wt")"
    local fe_port
    fe_port="$(port_for $BASE_FRONTEND_PORT "$idx")"

    printf "%-6s %-40s %s\n" "$idx" "$branch" "http://localhost:$fe_port"
  done
}

cmd_promote() {
  local target_idx="${1:-}"
  if [[ -z "$target_idx" ]]; then
    echo "Usage: worktree.sh promote <index>"
    echo "Run 'worktree.sh list' to see worktree indices."
    exit 1
  fi

  local worktrees
  worktrees=()
  while IFS= read -r line; do worktrees+=("$line"); done < <(get_worktrees)

  local idx=0
  local target_wt=""
  local target_branch=""
  for wt in "${worktrees[@]}"; do
    if [[ "$wt" == "$REPO_ROOT" ]]; then
      continue
    fi
    idx=$((idx + 1))
    if [[ "$idx" == "$target_idx" ]]; then
      target_wt="$wt"
      target_branch="$(get_worktree_branch "$wt")"
      break
    fi
  done

  if [[ -z "$target_wt" ]]; then
    echo "Worktree index $target_idx not found."
    exit 1
  fi

  local current_branch
  current_branch="$(get_worktree_branch "$REPO_ROOT")"

  echo "Promoting worktree $target_idx ($target_branch) into $current_branch"
  echo "Copying changed files from worktree ..."

  local merge_base
  merge_base="$(git -C "$REPO_ROOT" merge-base "$current_branch" "$target_branch")"

  local files
  files="$(git -C "$target_wt" diff --name-only "$merge_base" HEAD)"
  if ! git -C "$target_wt" diff --quiet || ! git -C "$target_wt" diff --cached --quiet; then
    files="$(printf '%s\n%s' "$files" "$(git -C "$target_wt" diff --name-only HEAD)")"
  fi
  files="$(echo "$files" | sort -u | grep -v '^$')"

  if [[ -z "$files" ]]; then
    echo "No changes to promote."
    exit 0
  fi

  local dirty
  dirty="$(git -C "$REPO_ROOT" diff --name-only HEAD 2>/dev/null || true)"
  if ! git -C "$REPO_ROOT" diff --cached --quiet 2>/dev/null; then
    dirty="$(printf '%s\n%s' "$dirty" "$(git -C "$REPO_ROOT" diff --cached --name-only HEAD)")"
  fi
  dirty="$(echo "$dirty" | sort -u | grep -v '^$' || true)"

  if [[ -n "$dirty" ]]; then
    local conflicts=""
    while IFS= read -r f; do
      if echo "$dirty" | grep -qxF "$f"; then
        conflicts="$(printf '%s\n  %s' "$conflicts" "$f")"
      fi
    done <<< "$files"

    if [[ -n "$conflicts" ]]; then
      echo "Abort: the following files have uncommitted changes in $current_branch and would be overwritten:"
      echo "$conflicts"
      echo ""
      echo "Commit or stash your local changes first, then re-run promote."
      exit 1
    fi
  fi

  while IFS= read -r f; do
    if [[ -f "$target_wt/$f" ]]; then
      mkdir -p "$(dirname "$REPO_ROOT/$f")"
      cp "$target_wt/$f" "$REPO_ROOT/$f"
    else
      rm -f "$REPO_ROOT/$f"
    fi
  done <<< "$files"

  echo "Promote complete. Changes are uncommitted in $current_branch."
}

cmd_cleanup() {
  local worktrees
  worktrees=()
  while IFS= read -r line; do worktrees+=("$line"); done < <(get_worktrees)

  local current_wt
  current_wt="$(git rev-parse --show-toplevel)"

  local idx=0
  for wt in "${worktrees[@]}"; do
    if [[ "$wt" == "$REPO_ROOT" ]]; then
      continue
    fi
    idx=$((idx + 1))

    if [[ "$wt" == "$current_wt" ]]; then
      continue
    fi

    local branch
    branch="$(get_worktree_branch "$wt")"
    local project
    project="$(compose_name "$idx" "$branch")"

    echo "Stopping containers for $project ..."
    (
      cd "$wt"
      COMPOSE_PROJECT_NAME="$project" docker compose down 2>/dev/null || true
    )

    echo "Removing worktree: $wt"
    git -C "$REPO_ROOT" worktree remove "$wt" --force 2>/dev/null || echo "Warning: could not remove $wt"
  done

  git -C "$REPO_ROOT" worktree prune
  echo "Cleanup complete."
}

usage() {
  cat <<'EOF'
Usage: worktree.sh <command> [args]

Commands:
  start             Start Docker Compose for all worktrees (except main)
  stop              Stop Docker Compose for all worktrees
  list              List all worktrees with their URLs and ports
  promote <index>   Merge a worktree branch into the current branch
  clean             Stop containers and remove all worktrees except current

Port bases (worktree N gets base + N):
  Postgres  15434
  Redis     16380
  Backend   18000
  Frontend  15173

Main worktree uses default ports (5434, 6380, 8000, 5173).
EOF
}

case "${1:-}" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  list)    cmd_list ;;
  promote) cmd_promote "${2:-}" ;;
  clean)   cmd_cleanup ;;
  *)       usage ;;
esac
