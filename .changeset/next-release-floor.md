---
"@inkeep/agents-manage-ui": patch
---

Raise the minimum `next` dependency to `^16.4.6` so agent-started dev servers can start normally. Projects created with `@inkeep/create-agents` should raise `pnpm.overrides.next` in their `package.json` to `^16.4.6`.
