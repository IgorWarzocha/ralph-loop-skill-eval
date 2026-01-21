#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OC_BIN="${OC_BIN:-opencode}"
OC_AGENT="build"
OC_MODEL="opencode/glm-4.7-free"
OC_THRESHOLD="0.50"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)
      OC_AGENT="$2"
      shift 2
      ;;
    --model)
      OC_MODEL="$2"
      shift 2
      ;;
    --threshold)
      OC_THRESHOLD="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

export OC_THRESHOLD

SKILL_SRC="$HOME/.config/opencode/skill"
if [[ ! -d "$SKILL_SRC" ]]; then
  echo "Skill source not found at $SKILL_SRC" >&2
  exit 1
fi
UPDATED_DIR="$ROOT_DIR/skill-updated"

mkdir -p "$ROOT_DIR/skill" "$ROOT_DIR/agent" "$ROOT_DIR/agent/skill" "$ROOT_DIR/loop" "$ROOT_DIR/loop/skill"

echo "Installing dependencies"
(cd "$ROOT_DIR" && npm install)

rm -rf "$ROOT_DIR/skill"/*
cp -R "$SKILL_SRC"/. "$ROOT_DIR/skill"

bun run "$ROOT_DIR/eval/extract-frontmatter.ts" "$ROOT_DIR/skill" "$ROOT_DIR/agent/skill"

SCENARIOS_PATH="$ROOT_DIR/prompts/scenarios.md"
EVAL_PATH="$ROOT_DIR/prompts/eval.md"

run_opencode() {
  local cwd="$1"
  local prompt="$2"
  # Fix for corrupted cache error
  rm -rf "$HOME/.cache/opencode"

  if [[ ! -f "$prompt" ]]; then
    echo "Prompt file not found: $prompt" >&2
    return 1
  fi

  while true; do
    # Launch in background to monitor first output (launch success)
    (cd "$cwd" && OPENCODE_CONFIG_DIR="$cwd" OPENCODE_CWD="$cwd" "$OC_BIN" run --agent "$OC_AGENT" --model "$OC_MODEL" < "$prompt") &
    local pid=$!

    # Wait up to 20s for the process to at least exist and be running
    local count=0
    local launched=false
    while [[ $count -lt 20 ]]; do
      if ! kill -0 $pid 2>/dev/null; then
        # Process died early
        break
      fi
      # If we see any output or the process is still alive after a few seconds,
      # we assume it launched correctly.
      if [[ $count -gt 2 ]]; then
        launched=true
        break
      fi
      sleep 1
      count=$((count + 1))
    done

    if [[ "$launched" == "true" ]]; then
      # Wait for the actual completion without a timeout
      wait $pid
      return $?
    else
      echo "opencode failed to launch within 20s; retrying..."
      kill -9 $pid 2>/dev/null || true
      wait $pid 2>/dev/null || true
      continue
    fi
  done
}

while true; do
  run_opencode "$ROOT_DIR/agent" "$SCENARIOS_PATH"
  
  echo "Please read $ROOT_DIR/agent/PROMPTS.md."
  echo "Prompts ready to use. Regenerate? (y/n)"
  read -r response
  if [[ "$response" != "y" ]]; then
    break
  fi
done

if [[ -f "$ROOT_DIR/agent/PROMPTS.md" ]]; then
  cp "$ROOT_DIR/agent/PROMPTS.md" "$ROOT_DIR/loop/PROMPTS.md"
fi
bun run "$ROOT_DIR/eval/extract-frontmatter.ts" "$ROOT_DIR/skill" "$ROOT_DIR/loop/skill"

while true; do
  if [[ -f "$ROOT_DIR/agent/PROMPTS.md" ]]; then
    cp "$ROOT_DIR/agent/PROMPTS.md" "$ROOT_DIR/loop/PROMPTS.md"
  fi
  (cd "$ROOT_DIR/loop" && bun run "../eval/eval.ts")
  if ! rg -q "Status: FAIL" "$ROOT_DIR/loop/results.md"; then
    echo "All prompts passed."
    bun run "$ROOT_DIR/eval/merge-frontmatter.ts" "$SKILL_SRC" "$ROOT_DIR/loop/skill" "$UPDATED_DIR"
    echo "Updated skills written to: $UPDATED_DIR"
    echo "Please review these changes and copy them to your config:"
    echo "  cp -R $UPDATED_DIR/* ~/.config/opencode/skill/"
    exit 0
  fi
  run_opencode "$ROOT_DIR/loop" "$EVAL_PATH"
done
