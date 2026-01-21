# Skill Eval Workspace

Standalone environment for skill prompt generation and evaluation.

## Layout

- `skill/` raw skills copied from a source directory
- `agent/` prompt generator workspace
- `agent/skill/` frontmatter-only skills for prompt generation
- `prompts/` scenario prompts for generating rambly queries
- `loop/` eval workspace (frontmatter-only skills + PROMPTS.md)
- `eval/` evaluation scripts and results

## One-Command Loop

```
./run-loop.sh --agent build --model opencode/glm-4.7-free
```

The script copies skills, generates prompts (5 passes), runs evals, and loops until all
prompts pass.

### Parameters

- `--agent` (default: `build`)
- `--model` (default: `opencode/glm-4.7-free`)
- `--threshold` (default: `0.50`)

Example:

```
./run-loop.sh --agent build --model opencode/glm-4.7-free --threshold 0.60
```

## Step-by-Step Loop

```
./run-loop-step.sh --agent build --model opencode/glm-4.7-free
```

This runs each stage sequentially and stops after the eval edit pass if failures remain,
so you can inspect the workspace.

### Resume from Eval

If you have already generated prompts and want to skip straight to the evaluation loop:

```
./run-loop-step.sh --eval
```
