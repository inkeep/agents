---
"@inkeep/agents-api": minor
---

Resolve `{{$conversation.id}}` in agent prompts to the current conversation ID. Works with or without a `contextConfig`; propagates through A2A delegation so a child sub-agent resolves to the parent's (user-initiated) conversation ID. Agents whose prompts don't reference `{{$conversation.` see no behavior change.

Edge cases: when `conversationId` is absent, empty, or the literal `'default'` sentinel, the variable resolves to an empty string.

**Note for external A2A callers:** A2A JSON-RPC clients that bypass Inkeep's delegation tool must pass `contextId` in the message body for the variable to resolve to the user's overarching conversation. Without it, the handler falls back to `generateId()` and the variable resolves to an unrelated synthetic ID.
