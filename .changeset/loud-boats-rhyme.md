---
"@inkeep/agents-manage-ui": patch
---

When using `@inkeep/agents-manage-ui` as dependency we are getting following error:
Failed to load external module pino-51ec28aa490c8dec: Error: Cannot find module 'pino-51ec28aa490c8dec'

because Turbopack appends hash for server-only packages listed in `serverExternalPackages`
