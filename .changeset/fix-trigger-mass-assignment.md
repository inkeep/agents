---
"@inkeep/agents-core": patch
---

Strip tenantId/projectId/agentId from trigger, scheduled trigger, and scheduled workflow update schemas to prevent cross-tenant reassignment via mass assignment
