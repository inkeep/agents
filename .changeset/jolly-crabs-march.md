---
"@inkeep/agents-work-apps": patch
"@inkeep/agents-core": patch
"@inkeep/agents-api": patch
---

agents-core: Add isUniqueConstraintError and throwIfUniqueConstraintError helpers to normalize unique constraint error detection across PostgreSQL and Doltgres

agents-api: Fix duplicate resource creation returning 500 instead of 409 when Doltgres reports unique constraint violations as MySQL errno 1062

agents-work-apps: Fix concurrent user mapping creation returning 500 instead of succeeding silently when a duplicate mapping already exists
