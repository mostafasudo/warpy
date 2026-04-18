#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CANONICAL_SKILLS_DIR="$ROOT_DIR/.codex/skills"
GSTACK_DIR="$CANONICAL_SKILLS_DIR/gstack"
MIRRORS=( ".claude/skills" ".agent/skills" ".cursor/skills" )
CLAUDE_GSTACK_DIR="$ROOT_DIR/.claude/skills/gstack"
BACKUP_DIR=""

restore_backup_on_error() {
  status=$?
  if [ "$status" -ne 0 ] && [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
    rm -rf "$GSTACK_DIR"
    mv "$BACKUP_DIR" "$GSTACK_DIR"
  fi
  exit "$status"
}

trap restore_backup_on_error EXIT

has_skill() {
  needle="$1"
  for skill_name in "${skill_names[@]}"; do
    if [ "$skill_name" = "$needle" ]; then
      return 0
    fi
  done
  return 1
}

is_generated_skill_wrapper() {
  target="$1"

  [ -d "$target" ] || return 1
  [ ! -L "$target" ] || return 1
  [ -L "$target/SKILL.md" ] || return 1

  count="$(find "$target" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"
  [ "$count" = "1" ]
}

sync_skill_entrypoints() {
  dir="$1"
  replace_real_targets="$2"

  for skill_name in "${skill_names[@]}"; do
    target="$dir/$skill_name"
    if [ -e "$target" ] && [ ! -L "$target" ]; then
      if [ "$replace_real_targets" = "yes" ] || is_generated_skill_wrapper "$target"; then
        rm -rf "$target"
      else
        continue
      fi
    fi
    ln -snf "gstack/$skill_name" "$target"
  done

  while IFS= read -r existing_link; do
    link_name="$(basename "$existing_link")"
    [ "$link_name" = "gstack" ] && continue

    if ! has_skill "$link_name"; then
      target="$(readlink "$existing_link" || true)"
      case "$target" in
        gstack/*) rm -f "$existing_link" ;;
      esac
    fi
  done < <(find "$dir" -mindepth 1 -maxdepth 1 -type l | sort)
}

if [ -e "$CLAUDE_GSTACK_DIR" ] && [ ! -L "$CLAUDE_GSTACK_DIR" ]; then
  BACKUP_DIR="$CANONICAL_SKILLS_DIR/.gstack-backup.$$.$RANDOM"
  mv "$GSTACK_DIR" "$BACKUP_DIR"
  mv "$CLAUDE_GSTACK_DIR" "$GSTACK_DIR"
fi

if [ ! -d "$GSTACK_DIR" ]; then
  echo "gstack not found at $GSTACK_DIR" >&2
  exit 1
fi

(
  cd "$GSTACK_DIR"
  ./setup
)

skill_names=()
while IFS= read -r skill_dir; do
  skill_names+=( "$(basename "$skill_dir")" )
done < <(find -H "$GSTACK_DIR" -mindepth 1 -maxdepth 1 \( -type d -o -type l \) -exec test -f "{}/SKILL.md" ';' -print | sort)

sync_skill_entrypoints "$CANONICAL_SKILLS_DIR" "no"

for mirror in "${MIRRORS[@]}"; do
  mirror_dir="$ROOT_DIR/$mirror"
  mkdir -p "$mirror_dir"

  gstack_link="$mirror_dir/gstack"
  if [ -e "$gstack_link" ] && [ ! -L "$gstack_link" ]; then
    rm -rf "$gstack_link"
  fi
  ln -snf "../../.codex/skills/gstack" "$gstack_link"
  sync_skill_entrypoints "$mirror_dir" "yes"
done

if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
  rm -rf "$BACKUP_DIR"
fi

trap - EXIT
echo "gstack mirrors synced: ${skill_names[*]}"
