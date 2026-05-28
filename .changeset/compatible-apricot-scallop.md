---
"@inkeep/agents-api": patch
---

Enable Anthropic prompt caching by default at the main agent generation call (gateway and direct mode), gated by the new INKEEP_PROMPT_CACHING_ENABLED env var, and stabilize the cacheable system-prompt prefix across turns
