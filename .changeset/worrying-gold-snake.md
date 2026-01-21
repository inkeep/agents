---
"@inkeep/agents-core": minor
---

Simplify trigger authentication schema to use headers array format with hashed secrets. Add hashTriggerHeaderValue(), validateTriggerHeaderValue(), and hashAuthenticationHeaders() utilities. Breaking change: old auth types (api_key, basic_auth, bearer_token) removed.
