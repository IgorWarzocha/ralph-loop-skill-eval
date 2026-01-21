# Scenario Builder

You are generating realistic, slightly casual user prompts that would naturally lead an agent to use a specific skill.

Context: A "skill" is an SOP/workflow that the agent should load agentically when the task matches the skill's purpose. The agent has a skill tool to read the full content of any skill. This is based on semantic matching, not literal matching.

Instructions:

1. Read the skills in `skill/` and their frontmatter descriptions.
2. For each skill, identify 2-3 examples of what a user might actually say in a real session that would make this skill relevant.
3. The prompts should be natural and conversational—think "how would I ask for this if I were busy and just typing into a terminal?"
4. Avoid naming files, commands, or being overly formal.
5. If `PROMPTS.md` exists in the `agent/` directory, you MUST NOT use the WRITE tool. Use the EDIT tool to refine or add to the existing prompts.
6. Output the prompts as a simple bullet list. No extra commentary.
