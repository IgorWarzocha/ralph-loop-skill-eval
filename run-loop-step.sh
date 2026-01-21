#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OC_BIN="${OC_BIN:-opencode}"
OC_AGENT="build"
OC_MODEL="opencode/glm-4.7-free"
OC_THRESHOLD="0.50"
SKILL_SRC="$HOME/.config/opencode/skill"
START_EVAL=false

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
    --eval)
      START_EVAL=true
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

export OC_THRESHOLD

if [[ "$START_EVAL" == "false" ]]; then
  if [[ ! -d "$SKILL_SRC" ]]; then
    echo "Skill source not found at $SKILL_SRC" >&2
    exit 1
  fi

  mkdir -p "$ROOT_DIR/skill" "$ROOT_DIR/agent" "$ROOT_DIR/agent/skill" "$ROOT_DIR/loop" "$ROOT_DIR/loop/skill"

  echo "Step 0: Install dependencies"
  (cd "$ROOT_DIR" && bun install)

  echo "Step 1: Copy global skills to skill/"
  rm -rf "$ROOT_DIR/skill"/*
  cp -R "$SKILL_SRC"/. "$ROOT_DIR/skill"

  echo "Step 2: Extract frontmatter into agent/skill/"
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

  echo "Step 3: Run scenario prompts pass and update PROMPTS.md"
  while true; do
    run_opencode "$ROOT_DIR/agent" "$SCENARIOS_PATH"
    
    echo "Please read $ROOT_DIR/agent/PROMPTS.md."
    echo "Prompts ready to use. Regenerate? (y/n)"
    read -r response
    if [[ "$response" != "y" ]]; then
      break
    fi
  done

  echo "Step 4: Copy prompts into loop/ and extract frontmatter into loop/skill/"
  cp "$ROOT_DIR/agent/PROMPTS.md" "$ROOT_DIR/loop/PROMPTS.md"
  bun run "$ROOT_DIR/eval/extract-frontmatter.ts" "$ROOT_DIR/skill" "$ROOT_DIR/loop/skill"
else
  # Ensure paths and function are available when starting from eval
  SCENARIOS_PATH="$ROOT_DIR/prompts/scenarios.md"
  EVAL_PATH="$ROOT_DIR/prompts/eval.md"

  run_opencode() {
    local cwd="$1"
    local prompt="$2"
    rm -rf "$HOME/.cache/opencode"
    if [[ ! -f "$prompt" ]]; then
      echo "Prompt file not found: $prompt" >&2
      return 1
    fi
    while true; do
      (cd "$cwd" && OPENCODE_CONFIG_DIR="$cwd" OPENCODE_CWD="$cwd" "$OC_BIN" run --agent "$OC_AGENT" --model "$OC_MODEL" < "$prompt") &
      local pid=$!
      local count=0
      local launched=false
      while [[ $count -lt 20 ]]; do
        if ! kill -0 $pid 2>/dev/null; then break; fi
        if [[ $count -gt 2 ]]; then launched=true; break; fi
        sleep 1
        count=$((count + 1))
      done
      if [[ "$launched" == "true" ]]; then
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
fi

echo "Step 5: Run eval"
(cd "$ROOT_DIR/loop" && bun run "../eval/eval.ts")

echo "Step 6: If FAIL, run eval agent pass"
if rg -q "Status: FAIL" "$ROOT_DIR/loop/results.md"; then
  run_opencode "$ROOT_DIR/loop" "$EVAL_PATH"
  echo "Re-run Step 5 after edits."
  exit 1
fi

echo "Step 7: Write updated skills"
bun run "$ROOT_DIR/eval/merge-frontmatter.ts" "$SKILL_SRC" "$ROOT_DIR/loop/skill" "$ROOT_DIR/skill-updated"
echo "Updated skills written to: $ROOT_DIR/skill-updated"
echo "Please review these changes and copy them to your config:"
echo "  cp -R $ROOT_DIR/skill-updated/* ~/.config/opencode/skill/"
