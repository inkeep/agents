---
"@inkeep/agents-api": patch
---

Bind tenantId to the OAuth session on the /mcp management server: drop tenantId from tool input schemas and inject it from the authenticated user's token, so MCP agents no longer pass (or mis-pass) it
