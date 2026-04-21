---
name: Current Scheduled Trigger System
description: Complete mapping of how scheduled triggers work today — schema, dispatch, execution, auth, UI
type: evidence
---

## Database Schema (Runtime DB)

**`scheduled_triggers` table** (`runtime-schema.ts:370-399`):
- PK: `(tenantId, id)`
- Scoped: `tenantId, projectId, agentId`
- Schedule: `cronExpression` XOR `runAt` (mutual exclusivity enforced by Zod)
- Identity: `runAsUserId` (FK → `user.id`, CASCADE delete), `createdBy`
- Dispatch: `nextRunAt` (indexed with `enabled` for scheduler query)
- Config: `messageTemplate`, `payload`, `maxRetries`, `retryDelaySeconds`, `timeoutSeconds`, `ref`

**`scheduled_trigger_invocations` table** (`runtime-schema.ts:401-425`):
- PK: `(tenantId, id)`
- Links to trigger via `scheduledTriggerId` (no FK constraint — just varchar)
- Idempotency: `idempotencyKey` = `sched_{triggerId}_{scheduledFor}` (unique index)
- Status: `pending → running → completed|failed|cancelled`
- Tracks: `conversationIds` (array, grows across retries), `attemptNumber`

**`scheduler_state` table** (`runtime-schema.ts:427-431`):
- Singleton row tracking active scheduler workflow run ID
- Used for supersession on deploy

## Dispatch Flow

1. **SchedulerService** starts a long-lived workflow on API boot (3s delay)
2. **schedulerWorkflow** ticks every 60s, checks it's still the active scheduler, calls `dispatchDueTriggersStep()`
3. **triggerDispatcher.dispatchDueTriggers()**: queries `findDueScheduledTriggersAcrossProjects()` — `WHERE enabled=true AND nextRunAt <= NOW()`
4. For each due trigger, **dispatchSingleTrigger()**:
   - Builds `TriggerPayload`: `{ tenantId, projectId, agentId, scheduledTriggerId, scheduledFor, ref }`
   - Starts `scheduledTriggerRunnerWorkflow` with that payload
   - Immediately advances `nextRunAt` (cron: compute next; one-time: set null)
   - Fire-and-forget — doesn't wait for execution

## Execution Flow (per trigger)

**scheduledTriggerRunnerWorkflow** (`scheduledTriggerRunner.ts`):
1. Check trigger still enabled
2. Create invocation (idempotent via key)
3. Check not cancelled
4. Retry loop (up to `maxRetries + 1`):
   - Mark running
   - **executeScheduledTriggerStep**: permission check → build message → create conversation → execute agent
   - If success → mark completed; if fail → backoff and retry
5. If one-time trigger → disable after completion

**runAsUserId usage in execution** (`scheduledTriggerSteps.ts:416-444`):
- `canUseProjectStrict({ userId: runAsUserId, tenantId, projectId })` — re-validated at execution time
- Timezone fetched from user profile, forwarded as headers
- Execution context: `metadata.initiatedBy = { type: 'user', id: runAsUserId }`
- If no runAsUserId: `metadata.initiatedBy = { type: 'api_key', id: triggerId }`

## Auth & Permissions

**Trigger CRUD** (`triggerHelpers.ts`):
- `validateRunAsUserId()`: rejects system/apikey IDs; non-admins can only set to self; admins can delegate to any member with project 'use' permission
- `assertCanMutateTrigger()`: admins can mutate any; non-admins only their own (createdBy or runAsUserId match)

**At execution time**: Only checks `USE` permission via SpiceDB. System users and apikey: users bypass.

## UI (scheduled-trigger-form.tsx)

**Create mode (admin)**:
- Multi-select user dropdown → creates N separate triggers (one per user)
- Each named: `{baseName} ({userName})`
- Bulk creation via `Promise.allSettled()` of N API calls

**Edit mode OR non-admin**: Single-select dropdown for runAsUserId

## User Lifecycle

- FK `runAsUserId → user.id` with CASCADE delete: removing user deletes all their triggers
- Also: `deleteScheduledTriggersByRunAsUserId()` function for explicit cleanup
- No notification or audit when triggers are cascade-deleted

## Key Constraints

- One `runAsUserId` per trigger (scalar varchar field)
- Idempotency key format `sched_{triggerId}_{scheduledFor}` — tied to single trigger ID
- Invocation table has no `runAsUserId` field — it's resolved from the trigger at execution time
- Dispatch query is global: `findDueScheduledTriggersAcrossProjects()` with no tenant filter
