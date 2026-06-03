---
"@inkeep/agents-core": minor
---

Lift and unify the system-prompt character cap. The agent-level prompt limit is raised from 5,000 to 200,000 characters, and the sub-agent prompt (previously uncapped) now shares the same 200,000-character limit. The cap is enforced consistently across both the standalone REST create/update paths and the full-graph write path, and remains overridable via `AGENTS_VALIDATION_AGENT_PROMPT_MAX_CHARS`. This unblocks large grounding/context documents in agent prompts. The status-update custom-prompt limit (2,000) is unchanged.
