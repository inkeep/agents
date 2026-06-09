---
"@inkeep/agents-core": patch
---

Add set-based runtime data-access helpers for conversation enrichment — `getConversationsByIds`, `getFirstUserMessageByConversations`, and `getLastAssistantMessageByConversations` — that batch-fetch in a single query instead of per-conversation lookups. Add `listEvaluationRunsByRunConfigId` so callers can filter runs in the database instead of in JS. Export the existing `extractMessageText` helper so callers can extract text from both the `text` and A2A `parts` content formats.
