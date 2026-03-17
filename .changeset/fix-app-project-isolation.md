---
"@inkeep/agents-core": patch
"@inkeep/agents-api": patch
---

Fix project-level auth bypass in app CRUD endpoints — GET, UPDATE, and DELETE now filter by projectId in addition to tenantId, preventing cross-project access within a tenant
