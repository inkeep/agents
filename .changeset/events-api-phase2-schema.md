---
"@inkeep/agents-core": minor
---

Phase 2 of the events API: top-level identity + per-turn context columns.

- Add `userProperties` and `properties` jsonb columns to `conversations` and `messages` tables (D36/D37). Migration is purely additive; existing rows start null. `messages.metadata` runtime telemetry stays unchanged; `ConversationMetadata.userContext` remains intact.
- Add helpers in `utils/conversations.ts` for top-level access: `getConversationUserProperties`, `getConversationProperties`, `getMessageUserProperties` (with conversation fallback), `buildConversationUserProperties`. `buildConversationMetadata` now skips writing the `userProperties` argument into `metadata.userContext` and additionally populates `initiatedBy` from execution context.
- Update `createOrGetConversation` and `setActiveAgentForConversation` data-access helpers so chat handlers can persist `userProperties` + `properties` to the new top-level columns (last-write-wins on existing rows). Chat handlers drop widget-synthesized auto-mint identities (`identificationType` of `'ANONYMOUS'` or `'COOKIED'`) and strip the `identificationType` marker from anything they do persist — only host-supplied / SDK-supplied identities reach the database.
- `POST /run/v1/events` resolves event-level `userProperties` from caller body → message anchor → conversation anchor → `null`. There is no auto-fill from the JWT-verified `endUserId`; consumers needing the verified user identity should read `conversation.userId` (the cryptographically verified `sub` claim, populated on every chat turn).
- Add `'event.created'` to `WebhookDestinationEventTypeEnum` for the family-level subscription opted into by destinations that want all events fired through `POST /run/v1/events`.
