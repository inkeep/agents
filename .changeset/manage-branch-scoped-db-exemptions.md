---
"@inkeep/agents-api": patch
---

Exempt manage routes that never read the version-controlled config database (SigNoz proxy, GitHub, entitlements, feedback, tenant apps, project memberships, password reset links) from the branch-scoped database middleware. These routes previously pinned a Doltgres connection for the entire request — including slow external calls — which under load exhausted the connection pool and surfaced as "timeout exceeded when trying to connect" on `/manage` endpoints.
