---
"@inkeep/agents-core": patch
---

Sign out the autoSignIn orphan session created during `db:auth:init` and log session deletions via Better Auth's `databaseHooks.session.delete.after` hook
