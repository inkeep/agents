---
"@inkeep/agents-api": patch
"@inkeep/agents-manage-ui": patch
---

Phase 2 of the events API: chat-handler propagation, dispatch wiring, and webhook UI.

- Chat handlers (`/run/api/chat`, `/run/v1/chat/completions`, `/run/api/chat-data-stream`) now write `body.userProperties` and the new `body.properties` to top-level `conversations.userProperties` and `conversations.properties` columns (D36 — and stop writing `userProperties` into `metadata.userContext`). User-message inserts snapshot `userProperties` to `messages.userProperties` per D37.
- `conversationFormatter.formatConversationDetail` now reads `userProperties` and `properties` from the new top-level columns. The webhook payload wire shape is unchanged.
- `POST /run/v1/events` now resolves `userProperties` and `properties` via the D38 chain (caller → message → conversation → endUserId → null) and dispatches to webhook destinations subscribed to the new `event.created` family (fire-and-forget, errors logged without blocking the response).
- The webhook destination create/edit form in `agents-manage-ui` exposes a `Event Created` checkbox alongside the existing event-type options.
