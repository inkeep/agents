---
"@inkeep/create-agents": patch
"@inkeep/agents-cli": patch
"@inkeep/agents-manage-api": patch
"@inkeep/agents-manage-ui": patch
"@inkeep/agents-run-api": patch
"@inkeep/agents-core": patch
"@inkeep/agents-sdk": patch
---

@inkeep/create-agents creates inkeep.config.ts in the correct location; model choice of user is respected and user choice replaces any model config from template; model config is done at project level instead of inkeep.config.ts which is reserved for tenant level settings
