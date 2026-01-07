---
"@inkeep/agents-cli": patch
"@inkeep/agents-core": patch
"@inkeep/agents-manage-api": patch
"@inkeep/agents-manage-ui": patch
"@inkeep/agents-run-api": patch
"@inkeep/agents-sdk": patch
"@inkeep/create-agents": patch
"@inkeep/ai-sdk-provider": patch
---

Disable colorized logs in non-TTY environments like Vercel. Logs now respect the NO_COLOR env var and automatically disable colors when stdout is not a TTY.
