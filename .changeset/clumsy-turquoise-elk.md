---
"@inkeep/agents-api": patch
"@inkeep/agents-core": patch
---

Normalize error responses: conversation-media errors now use the standard RFC-7807 envelope (code/title/status/detail) instead of bare {error}; evaluator create/update gives clear 'model/schema is required' messages and rejects non-object model/schema instead of a generic invalid_union dump
