---
"@inkeep/agents-api": patch
---

Exempt more manage-domain routes that never read the branch-scoped manage DB from the branch-scoped DB middleware, so they no longer pin a Doltgres branch-checkout connection for the duration of the request. Newly exempt: the conversations family (list/detail/bounds/media), api-keys, the nested app auth-keys router, credential-stores, project permissions, mcp-catalog, third-party-mcp-servers, and evals evaluation-results. Scoping stays narrow where a sibling under the same prefix still uses the manage DB (`/apps` CRUD, the other `/evals/*` routers, and `/credentials`).
