---
"@inkeep/agents-core": patch
"@inkeep/agents-api": patch
---

Attach Postgres connection pools to Vercel Fluid Compute so idle clients can be managed before serverless functions suspend.

This registers the manage and runtime database pools with `attachDatabasePool`, including the raw manage pool used for branch/ref-scoped Dolt work. The change follows Vercel's recommended pooling pattern for Fluid Compute to improve connection reuse and reduce the risk of leaked idle clients across suspended function instances.
