---
"@inkeep/agents-manage-ui": patch
"@inkeep/agents-api": patch
---

Keep the cached prompt prefix stable across turns by de-conditioning the artifact-rules system text (it no longer changes shape when a conversation creates its first artifact), and add a guardrail test asserting the per-agent system prefix is byte-identical across turns. Fix conversation-trace reporting to read token, cost, and cache numeric attributes from the raw number map so cost, token counts, and cache HIT/MISS badges are accurate where the typed query previously returned zero.
