---
"@inkeep/agents-api": patch
---

Fix org-level permission checks (requirePermission) for OAuth user JWT principals: authorize from the resolved org role via the shared access-control definitions instead of a better-auth session lookup, so project create/delete works for MCP/OAuth callers (not just session/UI); map authz denials to 403 instead of 500
