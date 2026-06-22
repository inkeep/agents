---
"@inkeep/agents-api": patch
---

Fix user-profile routes rejecting OAuth/MCP bearer tokens. The `users` route group (mounted at the same `/api/users` prefix as the user-profile routes, and registered first) used a wildcard session-only auth gate that 401'd every OAuth/MCP bearer caller before the profile route ran. Its auth is now scoped to its own endpoints so it no longer shadows the user-profile routes, which authenticate with `manageBearerOrSessionAuth`. The `users` endpoints remain session-only (no widening), and per-route ownership/admin checks are unchanged. Also add a destructive-default warning to the update-skill MCP tool description.
