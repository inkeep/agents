---
title: Conversation Identity Gaps
description: How conversations are created and queried today, and what's missing for per-user conversation history.
created: 2026-03-02
last-updated: 2026-03-02
---

## Conversations Table

**File:** `packages/agents-core/src/db/runtime/runtime-schema.ts:105-119`

- `userId` column: `varchar('user_id', { length: 256 })` — NULLABLE, never populated
- Primary key: `(tenantId, projectId, id)` — NOT scoped by userId
- No index on `userId` (would need one for efficient per-user queries)

**Confidence:** CONFIRMED (read from source)

## Conversation Creation — userId Never Passed

Every conversation creation point in the codebase omits `userId`:

1. **Chat route** (`agents-api/src/domains/run/routes/chat.ts:245-252`):
   ```typescript
   await createOrGetConversation(runDbClient)({
     tenantId, projectId, id: conversationId,
     agentId, activeSubAgentId, ref,
     // NO userId
   });
   ```

2. **MCP route** (`agents-api/src/domains/run/routes/mcp.ts`):
   ```typescript
   // NO userId
   ```

3. **Trigger service** (`agents-api/src/domains/run/services/TriggerService.ts`):
   ```typescript
   // NO userId
   ```

**Confidence:** CONFIRMED (grep for all `createOrGetConversation` calls)

## Data Access Layer Supports userId Filtering

**File:** `packages/agents-core/src/data-access/runtime/conversations.ts`

`listConversations()` accepts an optional `userId` parameter and uses it as a WHERE filter.
`createOrGetConversation()` accepts optional `userId` in input.

The plumbing exists — it's just not wired up.

**Confidence:** CONFIRMED (read from source)

## What's Needed for Per-User Conversation History

1. **Pass userId during conversation creation** — extract from end-user JWT `sub` claim
2. **Add index on (tenantId, projectId, userId)** — for efficient per-user queries
3. **Expose a "my conversations" API** — filter by authenticated end-user's `sub`
4. **Handle anonymous → authenticated transition** — what happens to conversations started anonymously when user logs in?

## Identity Available in Execution Context (But Not Used)

For playground/Slack paths, `executionContext.metadata.initiatedBy.id` contains the user ID.
For API key paths, this is NOT set.

The app credential model would need to populate a `userId` (or `endUserId`) in the execution context when an end-user JWT is present.

**Confidence:** CONFIRMED (read from source)
