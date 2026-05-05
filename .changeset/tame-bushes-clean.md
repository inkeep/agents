---
"@inkeep/agents-core": minor
"@inkeep/agents-manage-ui": minor
"@inkeep/agents-api": minor
---

Add outbound webhooks: configure per-project HTTP destinations and receive `conversation.created`, `conversation.updated`, and `feedback.created` events with full conversation context. Webhook payloads mirror the canonical `ConversationDetail` shape now also returned by `GET /conversations/{id}`, so receivers can reuse one TypeScript type for both.
