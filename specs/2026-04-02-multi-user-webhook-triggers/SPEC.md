# Multi-User Webhook Triggers

**Status:** Ready for Implementation
**Created:** 2026-04-02
**Author:** AI + Human collaborative spec
**Prior art:** `specs/2026-03-31-multi-user-scheduled-triggers/SPEC.md` — same data model pattern

---

## 1. Problem Statement

**Situation:** Webhook triggers have the same 1-trigger-per-user limitation that scheduled triggers had. The UI bulk-creates N separate triggers for N users, leading to configuration drift, management overhead, and no centralized control.

**Complication:** The multi-user pattern is proven for scheduled triggers (join table, fan-out, per-user tracking). Webhook triggers differ architecturally: they live in the manage database (Doltgres, versioned config) rather than runtime (Postgres) and execute via inline async promises rather than durable workflows.

**Resolution:** Add a `trigger_users` join table in the manage database following the established pattern, with fan-out execution on webhook invocation, staggered delays, and the same sub-resource API + UI patterns.

---

## 2. Goals

1. A single webhook trigger can run as multiple users
2. Centralized management — update config once, applies to all users
3. Per-user execution on each webhook invocation (fan-out)
4. Clean user lifecycle — adding/removing users without affecting the trigger
5. Backward compatible — existing single-user webhook triggers unchanged
6. Consistent with scheduled trigger multi-user patterns (API, UI, auth rules)

## 3. Non-Goals

- Per-user payload customization (use separate triggers)
- Per-user authentication/signature config
- Webhook idempotency key support (`X-Idempotency-Key` header) — future work
- Changes to scheduled triggers (already done)

---

## 4. Current State

See `evidence/current-system.md` for full details.

**Key facts:**
- `runAsUserId` is a plain `varchar(256)` with no FK (manage DB has no user table)
- Webhook execution: `processWebhook()` → `dispatchExecution()` → `executeAgentAsync()` — inline async, returns 202
- **Invocation tracking exists**: `trigger_invocations` table in runtime DB tracks every webhook execution (status: pending → success/failed, payload, conversationId, error). History endpoints: `GET /triggers/{id}/invocations` (paginated list) and `GET /triggers/{id}/invocations/{invocationId}` (detail). Created by `dispatchExecution()` in TriggerService.ts.
- UI bulk-creates N triggers for N users (same pattern scheduled triggers had)
- User cleanup on org removal: `deleteTriggersByRunAsUserId()` within `withRef()` — app-driven, not FK cascade
- **Gap:** No cleanup on project member removal (same gap we fixed for scheduled triggers)

---

## 5. Target State

A webhook trigger has a set of associated user IDs. When the webhook fires:
1. Webhook endpoint receives HTTP POST (same as today)
2. Authentication and signature verification happen once (trigger-level)
3. Fan-out: one execution per associated user
4. Each execution gets its own conversationId and runs with the user's identity/timezone
5. Webhook returns 202 with all invocation details
6. Optional `dispatchDelayMs` staggers executions to avoid MCP rate limits

---

## 6. Proposed Design

### 6.1 Data Model: Join Table (Manage DB)

**New table: `trigger_users`** in manage-schema.ts

```typescript
export const triggerUsers = pgTable(
  'trigger_users',
  {
    ...agentScoped,
    triggerId: varchar('trigger_id', { length: 256 }).notNull(),
    userId: varchar('user_id', { length: 256 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.projectId, table.agentId, table.triggerId, table.userId] }),
    foreignKey({
      columns: [table.tenantId, table.projectId, table.agentId, table.triggerId],
      foreignColumns: [triggers.tenantId, triggers.projectId, triggers.agentId, triggers.id],
      name: 'trigger_users_trigger_fk',
    }).onDelete('cascade'),
    index('trigger_users_user_idx').on(table.userId),
    index('trigger_users_trigger_idx').on(table.tenantId, table.projectId, table.agentId, table.triggerId),
  ]
);
```

**Key differences from `scheduled_trigger_users`:**
- Lives in **manage DB (Doltgres)** — versioned with trigger config, branch-scoped
- **No FK to user.id** — manage DB cannot reference auth DB. `userId` is a plain string.
- Follows manage-side join table patterns (agentScoped, composite FK to triggers table with CASCADE)
- Cleanup on user removal is app-driven (via `withRef()` + explicit delete), not DB CASCADE

**Changes to `triggers` table:**
- `runAsUserId` column: kept during transition, same backfill+deprecate strategy
- New field: `dispatchDelayMs` (integer, optional) — same as scheduled triggers

### 6.2 Webhook Fan-Out Execution

**Current flow:**
```
webhook POST → processWebhook → dispatchExecution → 1 executeAgentAsync → 202 {conversationId, invocationId}
```

**New flow:**
```
webhook POST → processWebhook → resolve user list → N dispatchExecution calls → 202 {invocations: [...]}
```

**Implementation in webhooks.ts / TriggerService.ts:**
1. After `processWebhook()` validates auth/signature/payload, query `trigger_users` join table
2. If join table has users → fan out to N users
3. If join table empty but `trigger.runAsUserId` set → legacy single-user path
4. If neither → execute without user context (current behavior preserved — many webhook triggers legitimately have no user). Only auto-disabled triggers with empty user set (from last-user removal) are skipped.
5. Each execution gets its own `conversationId` and `invocationId`
6. `dispatchDelayMs` stagger: each execution promise sleeps `position × dispatchDelayMs` before starting (same pattern as manual Run Now)

**Runtime note for `dispatchDelayMs`:**
- This is acceptable for v1 because it matches the current webhook execution model (`dispatchExecution()` + background promise), rather than introducing a new queue/workflow architecture just for staggered fan-out.
- In Vercel (`waitUntil`) and long-lived Node server environments, delayed background execution is expected to work normally.
- In unsupported serverless environments where post-response async work is not guaranteed, delayed executions are **best-effort** and later staggered runs may be dropped if the instance is reclaimed.
- This limitation is acceptable for the first pass. If durable delayed fan-out becomes mission-critical, revisit with a queue/workflow-backed design.

**Partial failure and retry semantics:**

Fan-out uses a **per-user `dispatchExecution()`** pattern:
1. Resolve the final user list from `trigger_users`
2. For each user, call `dispatchExecution()` once with that user's `runAsUserId` and computed stagger delay
3. Each successful `dispatchExecution()` call creates one invocation record and schedules one background execution before returning
4. Collect the successful invocation results and return 202 with those invocation details
5. If a per-user `dispatchExecution()` call fails before creating its invocation, that user is omitted from the response; already-created invocations remain accepted

This means:
- **202 = accepted for processing** for the invocation rows returned in `invocations` (not "completed successfully"). Same semantics as today.
- Partial background failures are visible via invocation status, not the webhook response.
- Partial pre-response dispatch failures are possible. The endpoint is **best-effort**, not all-or-nothing.
- **No idempotency** — every webhook POST creates new invocations, matching current single-user behavior. If a caller retries after a partial success, already-created invocations may be duplicated. Callers who need dedup implement it on their side. Idempotency key support (`X-Idempotency-Key` header) is future work.

**Response shape change:**
```typescript
// Always return array format (breaking change — all consumers update):
{ invocations: Array<{ conversationId: string, invocationId: string, runAsUserId: string | null }> }

// Single-user triggers: array with 1 element
// Multi-user triggers: array with N elements
// No-user triggers: array with 1 element (runAsUserId: null)
```

### 6.3 Invocation Tracking

Webhook triggers already have a `trigger_invocations` table in the runtime DB (`runtime-schema.ts:212-232`) with status tracking, payload capture, and history endpoints. With multi-user:

**Add `runAsUserId` to `trigger_invocations` table:**
```sql
ALTER TABLE trigger_invocations
ADD COLUMN run_as_user_id varchar(256);
```

- Same pattern as `scheduled_trigger_invocations.run_as_user_id` — denormalized, no FK, preserves history even if user deleted
- Each user's execution in a fan-out creates its own invocation record
- Existing invocation list endpoint (`GET /triggers/{id}/invocations`) can filter/group by `runAsUserId`

**Invocation creation in fan-out:**
- `dispatchExecution()` remains the unit of work for a single user execution
- Fan-out calls `dispatchExecution()` N times, once per resolved user
- Each successful call creates one invocation row, returns one `{ conversationId, invocationId }` pair, and tracks its own status independently

### 6.4 Rerun Semantics

The existing `POST /triggers/{id}/rerun` endpoint (line 761 in triggers.ts) reads `trigger.runAsUserId` for the rerun execution. With multi-user, this field is null — users are in the join table. The endpoint must be updated.

**Rerun from trigger endpoint (`POST /triggers/{id}/rerun`):**
- Currently accepts `{ userMessage, messageParts }` in the request body
- Add optional `runAsUserId` to the request body
- If `runAsUserId` provided: validate user is associated with the trigger (in join table), execute as that user only. Does NOT fan out.
- If `runAsUserId` not provided and trigger has join table users: reject with 400 ("Multi-user trigger requires runAsUserId for rerun")
- If `runAsUserId` not provided and trigger has legacy scalar `runAsUserId`: use that (backward compat)
- If neither: execute without user context (current behavior for no-user triggers)

**Rerun from conversation trace UI:**
- The conversation page already knows `invocationType` and calls `rerunTriggerAction()` for webhook triggers
- The UI should pass the `runAsUserId` from the conversation's execution context (available in span attributes as `trigger.run_as_user_id`)
- This ensures the rerun executes as the same user who ran the original conversation

**Authorization:** Same as scheduled trigger rerun — `validateRunNowDelegation` checks the resolved `runAsUserId`. Non-admins can only rerun as themselves.

### 6.5 API Changes

**Create (POST) — same pattern as scheduled triggers:**
- Accepts `runAsUserIds` array alongside deprecated `runAsUserId`
- Mutual exclusion: cannot provide both
- If `runAsUserIds` provided: validate all users, create trigger, then write to `trigger_users` join table (within branch context)
- If `runAsUserId` (deprecated) provided: validate, create trigger, write single entry to join table
- Accepts `dispatchDelayMs` (integer 0-5000, optional)
- Response includes `runAsUserIds`, `userCount`
- Deprecated `runAsUserId` returns null for multi-user triggers

**Update (PATCH):**
- Accepts `runAsUserIds` array — replaces join table users via set/replace (within branch context)
- Mutual exclusion with `runAsUserId`
- `hasUpdateFields` check expanded to include `runAsUserIds` and `dispatchDelayMs`
- `assertCanMutateTrigger` already handles multi-user via shared helper
- Validation: all users in `runAsUserIds` checked for org membership + project 'use' permission

**Delete (DELETE):**
- No changes needed — FK CASCADE on `trigger_users.triggerId` handles join table cleanup automatically when trigger is deleted

**Sub-resource endpoints:**
```
GET    /triggers/{id}/users
PUT    /triggers/{id}/users          { userIds: [...] }
POST   /triggers/{id}/users          { userId: "..." }
DELETE /triggers/{id}/users/{userId}
```
- All operations within branch context (`withRef()`)
- PUT uses delete-all + insert-new pattern (same as scheduled triggers)
- If PUT/DELETE results in empty user set → auto-disable trigger

**Rerun (POST /{id}/rerun):**
- Add optional `runAsUserId` to request body
- Multi-user triggers require `runAsUserId` — reject with 400 if missing
- Single-user and no-user triggers: backward compat (existing behavior)

**Authorization rules:** Identical to scheduled triggers (Decision 19 from prior spec). Non-admin can only include self; any foreign user requires admin.

### 6.6 User Lifecycle

**User removed from project:**
- Hook in `projectMembers.ts` DELETE endpoint (extends the existing cleanup we added for scheduled triggers)
- Call `removeUserFromProjectTriggerUsers()` — removes from `trigger_users` for all triggers in that project
- If last user removed → auto-disable trigger (`enabled = false`)
- Operates within `withRef()` branch context for manage DB

**User removed from org:**
- Extend existing `cleanupUserTriggers()` in triggerCleanup.ts
- Add cleanup of `trigger_users` rows alongside existing `deleteTriggersByRunAsUserId()`
- Both operations within the same `withRef()` branch context

### 6.7 UI Changes

Same changes as scheduled triggers:
- Create mode: single API call with `runAsUserIds` array (remove bulk-create)
- Edit mode: multi-select with add/remove via sub-resource endpoints
- Trigger list: show user count for multi-user triggers
- `dispatchDelayMs` field (advanced setting)

### 6.8 Branch Scoping

All manage DB operations go through `withRef()`:
- Join table CRUD: queries within branch context
- Cleanup operations: resolve project main branch, execute within `withRef()`, auto-commit
- Webhook execution: trigger is loaded within branch context, user list queried in same context

---

## 7. Migration Strategy

1. **Phase 1: Schema** — Add `trigger_users` table + `dispatch_delay_ms` column. Generate migration.
2. **Phase 2: Backfill** — Script to copy `runAsUserId` values into join table rows.
3. **Phase 3: Dual-read** — Execution reads join table first, falls back to `runAsUserId`.
4. **Phase 4: API + UI** — `runAsUserIds` on create/update, sub-resource endpoints, UI changes.
5. **Phase 5: Deprecate** — Stop writing to `runAsUserId` column.

---

## 8. Decision Log

| # | Decision | Status | Reversibility | Evidence |
|---|----------|--------|---------------|----------|
| 1 | Join table in manage DB (not runtime) — follows the trigger | LOCKED | 1-way door (schema) | Webhook triggers are versioned config in Doltgres. User associations are config, not state. |
| 2 | No FK to user.id — app-driven cleanup | LOCKED | 1-way door (schema) | Manage DB cannot reference auth DB. Matches existing pattern for all manage-side user references. |
| 3 | Fan-out on webhook invocation — same as scheduled trigger dispatch | LOCKED | Reversible | Each user gets independent execution. Webhook returns all invocation IDs. |
| 4 | Response shape: always `{ invocations: [...] }` — breaking change | LOCKED | 1-way door (API) | Consistent shape regardless of user count. Single-user returns 1-element array. |
| 5 | `dispatchDelayMs` on webhook triggers — same stagger pattern | LOCKED | Reversible | Promise-based delay (same as manual Run Now), not workflow sleep. |
| 6 | Auto-disable on last user removed | LOCKED | Reversible | Consistent with scheduled trigger behavior (Decision 2 from prior spec). |
| 7 | Extend project member removal cleanup for webhook trigger_users | LOCKED | Reversible | Closes the same permission gap for webhook triggers. |
| 8 | Authorization rules identical to scheduled triggers | LOCKED | 1-way door (security) | Non-admin can only include self. Admin required for delegation. |
| 9 | Branch-scoped operations for all join table CRUD | LOCKED | N/A | Required by Doltgres architecture — not a choice. |
| 10 | Webhook response always returns `{ invocations: [...] }` — breaking change | LOCKED | 1-way door (API) | Consistent shape. Single-user returns 1-element array. All consumers must update. |
| 11 | No-user triggers execute without user context (backward compat) | LOCKED | Reversible | Many existing webhooks have no runAsUserId. Only auto-disabled (last-user-removed) triggers skip. |
| 12 | Best-effort 202 for partial failures — no all-or-nothing semantics | LOCKED | Reversible | 202 = accepted. Background failures update invocation status. Matches current single-user semantics. |
| 13 | No idempotency on webhook dispatch — duplicate-on-retry accepted | DIRECTED | Reversible | Current behavior for single-user. X-Idempotency-Key is future work. |
| 14 | Fan-out calls `dispatchExecution()` once per user; each call creates its own invocation before scheduling background execution | LOCKED | Reversible | Matches the current service abstraction. Keeps invocation creation and async execution coupled in one unit of work. |
| 15 | Rerun executes as the original user only, never fans out | LOCKED | Reversible | Same as scheduled trigger rerun (Decision 18 from prior spec). Rerun endpoint requires `runAsUserId` for multi-user triggers. |
| 16 | Rerun from UI passes `runAsUserId` from conversation context | LOCKED | Reversible | Conversation span attributes contain `trigger.run_as_user_id`. UI resolves and passes to rerun endpoint. |

---

## 9. Risks / Unknowns

| Risk | Impact | Mitigation |
|------|--------|------------|
| No FK CASCADE on user deletion | Orphaned rows in trigger_users | App-driven cleanup in cleanupUserTriggers() — same pattern as existing manage-side user references |
| Doltgres migration complexity | Schema change requires branch-aware migration | Follow existing manage DB migration patterns |
| Webhook response shape change | Breaking for ALL consumers — response is now always `{ invocations: [...] }` | Coordinate with SDK/API consumers. Clear in changelog + migration guide. |
| Branch context overhead | Extra query per webhook invocation (join table lookup) | Single indexed query within existing branch context — negligible |
| `dispatchDelayMs` in unsupported serverless runtimes | Later delayed executions may not start if post-response async work is not preserved | Accept for v1. Document as best-effort outside Vercel/long-lived servers; revisit with queue/workflow if stronger guarantees are needed |

---

## 10. Scope

**In Scope:**
- `trigger_users` join table in manage DB
- `dispatchDelayMs` column on triggers
- Webhook fan-out execution (1 webhook → N user executions)
- Response shape: `{ invocations: [...] }` for multi-user
- API: `runAsUserIds` on create/update + sub-resource endpoints
- UI: multi-user management (same patterns as scheduled triggers)
- User lifecycle cleanup (project removal + org removal)
- Backfill migration script

**Out of Scope:**
- Invocation tracking table for webhooks (stateless by design)
- Per-user authentication/signature config
- Per-user payload customization
- Changes to scheduled triggers

---

## 11. Agent Constraints

**SCOPE:**
- `packages/agents-core/src/db/manage/manage-schema.ts` — new join table + dispatchDelayMs column
- `packages/agents-core/src/db/runtime/runtime-schema.ts` — add runAsUserId to trigger_invocations
- `packages/agents-core/src/data-access/manage/triggers.ts` — join table data access
- `packages/agents-core/src/data-access/runtime/triggerInvocations.ts` — pass runAsUserId on creation
- `packages/agents-core/src/data-access/manage/triggerCleanup.ts` — extend cleanup
- `packages/agents-core/src/validation/schemas.ts` — webhook trigger schemas
- `agents-api/src/domains/manage/routes/triggers.ts` — API changes + sub-resource routes
- `agents-api/src/domains/manage/routes/triggerHelpers.ts` — shared with scheduled triggers (already has validateRunAsUserIds)
- `agents-api/src/domains/manage/routes/projectMembers.ts` — extend cleanup hook
- `agents-api/src/domains/run/routes/webhooks.ts` — fan-out execution
- `agents-api/src/domains/run/services/TriggerService.ts` — multi-user dispatch
- `agents-manage-ui/src/components/triggers/trigger-form.tsx` — UI changes
- `drizzle/` — manage DB migrations

**EXCLUDE:**
- Scheduled trigger system (already done)
- Auth/SpiceDB changes

**STOP_IF:**
- Doltgres migration affects existing trigger data
- Branch-scoped operations introduce deadlocks or conflicts

**ASK_FIRST:**
- Any changes to webhook authentication or signature verification flow
- Changes to the webhook public endpoint auth model
