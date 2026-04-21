---
"@inkeep/agents-api": patch
---

Hydrate artifact references returned by `GET /conversations/:id` so replay matches the shape streaming emits, and drop redundant attachment bookkeeping refs (`toolCallId: message_attachment:*`) that were paired with a sibling `file` part.
