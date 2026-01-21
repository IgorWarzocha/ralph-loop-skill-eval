# Skill Eval Workspace

Standalone environment for skill prompt generation and evaluation. Loosely based on Ralph Loop principles. Will work until skill descriptions align with use cases, based on embedder matching them up. Copies your global skills, analyses them, generates user scenario prompts, then works on the frontmatter description. When all tests pass, outputs a merged version of the skill, with a refined frontmatter.

Please note that since this is generative AI, I cannot guarantee 100% parsing, so you might need to fix it a bit when done.

## One-Command Loop

```
./run-loop.sh --agent build --model opencode/glm-4.7-free
```

The script copies skills, generates prompts (you must read if they are casual enough and accept/regenerate), runs evals, and loops until all
prompts pass the sniff test.

<img width="1024" height="559" alt="image" src="https://github.com/user-attachments/assets/b56c456b-cd46-443f-b823-9e1d74aefa64" />

## Layout

- `skill/` raw skills copied from a source directory
- `agent/` prompt generator workspace
- `agent/skill/` frontmatter-only skills for prompt generation
- `prompts/` scenario prompts for generating rambly queries
- `loop/` eval workspace (frontmatter-only skills + PROMPTS.md)
- `eval/` evaluation scripts and results

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
