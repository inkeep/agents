---
"@inkeep/agents-api": patch
"@inkeep/agents-core": patch
---

Improve prompt caching to lower LLM input-token cost. The cached system prefix is now byte-stable (the per-request client timestamp moved from the system prompt to the current user message), tool ordering is deterministic, and conversation history is sent as reusable per-message blocks so prior turns read from cache on direct-Anthropic routes instead of being reprocessed each turn. Also fixes a history dedup bug on structured-data turns and adds a distinct telemetry signal for history-block cache participation. Behavior is unchanged for callers; gains apply across providers (explicit Anthropic markers and implicit OpenAI/Google prefix caching).
