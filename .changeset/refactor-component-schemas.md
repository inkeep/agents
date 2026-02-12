---
"@inkeep/agents-api": patch
"@inkeep/agents-manage-ui": patch
"@inkeep/agents-core": patch
---

Refactor artifact and data component validation to use centralized Zod schemas from agents-core. This eliminates duplicate validation logic and improves consistency across the codebase.