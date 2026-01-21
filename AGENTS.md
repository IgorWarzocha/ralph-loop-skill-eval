# AGENTS.md

This workspace evaluates and iterates on opencode skill prompts using an automated loop.

## Repository Purpose

Tests skill prompt effectiveness by:
1. Generating scenario prompts from skills
2. Running evaluations against those prompts
3. Iterating until all prompts pass evaluation thresholds

## Directory Structure

```
skill/           # Raw skills copied from ~/.config/opencode/skill/
agent/           # Prompt generation workspace
  skill/         # Frontmatter-only skills for prompt generation
  PROMPTS.md     # Generated scenario prompts (output)
loop/            # Evaluation workspace
  skill/         # Frontmatter-only skills for evaluation
  PROMPTS.md     # Prompts being evaluated
  results.md     # Evaluation results
eval/            # TypeScript evaluation scripts
  eval.ts                        # Main evaluation runner
  extract-frontmatter.ts         # Extract skill frontmatter
  merge-frontmatter.ts           # Merge updated skills
  skill-eval.db                  # Embedding cache database
prompts/          # Source prompts for the loop
  scenarios.md    # Scenario generation prompts
  eval.md         # Evaluation iteration prompts
skill-updated/    # Updated skills output (created after successful loop)
```

## Core Commands

### Run Full Loop (Automated)
```
./run-loop.sh --agent build --model opencode/glm-4.7-free
```
Cycles through generation → evaluation → iteration until all prompts pass.

Parameters:
- `--agent` (default: `build`) - opencode agent to use
- `--model` (default: `opencode/glm-4.7-free`) - model to run
- `--threshold` (default: `0.50`) - similarity threshold for skill matching

### Run Step-by-Step (Interactive)
```
./run-loop-step.sh --agent build --model opencode/glm-4.7-free
```
Executes each stage sequentially and stops after eval edit if failures remain.

Resume from eval stage:
```
./run-loop-step.sh --eval
```

## Evaluation System

The eval system uses embedding-based skill matching:

1. **Load skills** from `skill/` directory
2. **Generate prompts** using scenario prompts in `prompts/scenarios.md`
3. **Evaluate** each prompt against available skills using embeddings
4. **Match** top 5 skills per prompt using similarity threshold
5. **Iterate** on failed prompts using `prompts/eval.md` until all pass

Threshold: Controlled by `OC_THRESHOLD` env var (default 0.50). Higher = stricter matching.

## Evaluation Scripts

### `eval/eval.ts`
Main evaluation runner. Loads prompts, skills, and embeddings; runs matching; writes results to `loop/results.md`.

Run directly:
```
cd loop && bun run ../eval/eval.ts
```

### `eval/extract-frontmatter.ts`
Extracts YAML frontmatter from skills, preserving only metadata.

Usage:
```
bun run eval/extract-frontmatter.ts <source-skill-dir> <output-dir>
```

### `eval/merge-frontmatter.ts`
Merges updated frontmatter back into full skill files.

Usage:
```
bun run eval/merge-frontmatter.ts <original-skills> <updated-frontmatter> <output-dir>
```

## Requirements

- `opencode` CLI (use `OC_BIN` env var to override path)
- `bun` runtime for TypeScript scripts
- Skills directory at `~/.config/opencode/skill/`

## Output

Successful loop writes updated skills to `skill-updated/`. Review changes, then copy to config:
```
cp -R skill-updated/* ~/.config/opencode/skill/
```

## Failure States

- "opencode failed to launch within 20s": Script automatically retries
- "Status: FAIL" in `loop/results.md`: Prompts need iteration; loop continues
- Empty `PROMPTS.md`: Scenario generation failed; check agent/ workspace
