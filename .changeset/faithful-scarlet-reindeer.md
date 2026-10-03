---
"@inkeep/agents-api": patch
"@inkeep/create-agents": patch
---

Fix durable execution in self-hosted Docker deployments: `createAgentsApp()` now starts the workflow world worker, recovers orphaned runs, and starts the scheduler (previously only the default entrypoint did), and the quick start template adds `@workflow/world-postgres` plus a migrate-time schema bootstrap
