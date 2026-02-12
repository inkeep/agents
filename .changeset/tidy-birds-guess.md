---
"@inkeep/agents-sdk": minor
"@inkeep/agents-core": minor
"@inkeep/agents-api": minor
"@inkeep/agents-cli": minor
"@inkeep/agents-manage-ui": minor
---

## Agent Skills

Skills are reusable instruction blocks that can be attached to sub-agents to govern behavior, reasoning, and tool usage.

### Features

- **Visual Builder**: Create, edit, and delete skills from the new Skills page. Attach skills to sub-agents via the sidepane picker with drag-to-reorder support.

- **TypeScript SDK**: 
  - New `SkillDefinition` and `SkillReference` types
  - `loadSkills(directoryPath)` helper to load skills from `SKILL.md` files
  - `skills` config option on `SubAgent` and `Project`

- **API**: New CRUD endpoints for skills (`/skills`) and sub-agent skill associations (`/sub-agent-skills`)

- **CLI**: `inkeep pull` now generates skill files in the `skills/` directory

### Loading Modes

- **Always loaded**: Skill content is included in every prompt
- **On-demand**: Skill appears as an outline in the system prompt and can be loaded via the built-in `load_skill` tool when needed

### SKILL.md Format

```md
---
name: "my-skill"
description: "When to use this skill"
metadata:
  author: org
  version: "1.0"
---

Skill content in markdown...
