---
name: Design Constraints for Multi-User Triggers
description: Technical and product constraints that shape the design space for multi-user scheduled triggers
type: evidence
---

## Schema Constraints

1. **PK structure**: `(tenantId, id)` — trigger ID is unique within tenant
2. **runAsUserId is scalar**: Single varchar field, FK to user.id with cascade delete
3. **nextRunAt is singular**: One timestamp per trigger — scheduler queries `enabled=true AND nextRunAt <= NOW()`
4. **Invocations link to trigger**: `scheduledTriggerId` in invocations table, but no FK constraint
5. **Idempotency key**: `sched_{triggerId}_{scheduledFor}` — must be unique per invocation

## Dispatch Constraints

1. **Scheduler ticks every 60s**: Finds all due triggers in one query, dispatches each
2. **One workflow per dispatch**: `scheduledTriggerRunnerWorkflow` receives `TriggerPayload` with a single `scheduledTriggerId`
3. **Fire-and-forget**: Dispatcher immediately advances `nextRunAt` after starting workflow — doesn't wait
4. **Idempotent**: If workflow restarts, idempotency key prevents duplicate invocations

## Execution Constraints

1. **Permission checked at execution time**: `canUseProjectStrict()` for runAsUserId
2. **One conversation per execution attempt**: `generateId()` creates unique conversationId
3. **Timezone resolution**: Fetches user profile timezone to forward as headers
4. **Retry loop**: Per-invocation, not per-user — all retries share the same invocation

## Product Constraints

1. **Same config for all users**: No per-user payload/template customization
2. **Admin-only multi-user creation**: Non-admins can only create triggers for themselves
3. **User lifecycle**: Removing a user should cleanly remove their association, not the entire trigger
4. **Observability**: Need to track per-user execution status independently

## Key Design Decisions Needed

- **Join table vs array column**: How to store the trigger ↔ user association
- **Dispatch fan-out**: Where in the pipeline does 1 trigger become N executions?
- **Invocation tracking**: One invocation per user, or one parent invocation with child records?
- **Idempotency**: New key format to include userId
- **User lifecycle**: What happens when a user is removed from a multi-user trigger vs deleted entirely?
- **API shape**: How does the create/update API accept multiple users?
- **Backward compatibility**: Migration path from existing single-user triggers
