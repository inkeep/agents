---
title: Current Scheduled Trigger System Trace
description: End-to-end trace of the current daisy-chain scheduled trigger system — schema, lifecycle, workflow, and deployment pinning behavior.
created: 2026-03-12
last-updated: 2026-03-12
---

# Current System Trace

## Data Model (Two Databases)

### Manage DB (DoltgreSQL — branch-scoped per project)
 
**`scheduled_triggers`** table (manage-schema.ts:166-192):
- PK: `(tenant_id, project_id, agent_id, id)`
- Columns: `enabled`, `cron_expression`, `cron_timezone`, `run_at` (one-shot), `payload`, `message_template`, `max_retries`, `retry_delay_seconds`, `timeout_seconds`, `run_as_user_id`
- FK: cascades from `agents` table

**`scheduled_workflows`** table (manage-schema.ts:194-220):
- PK: `(tenant_id, project_id, agent_id, id)`
- Columns: `workflow_run_id`, `status`, `scheduled_trigger_id`
- FK: cascades from `agents`, FK to `scheduled_triggers`
- Purpose: Tracks the *current* workflow run ID for each trigger (used for supersession/adoption logic)

**Constraint:** All manage DB queries require branch-scoped connections via `withRef(manageDbPool, resolvedRef, callback)`. Cross-project queries require iterating all projects, resolving each branch ref, then querying each branch. Pattern: `triggerCleanup.ts` does exactly this.

### Runtime DB (Postgres — global)

**`scheduled_trigger_invocations`** table (runtime-schema.ts:351-374):
- PK: `(tenant_id, id)`
- Columns: `scheduled_trigger_id`, `status` (pending|running|completed|failed|cancelled), `scheduled_for`, `started_at`, `completed_at`, `resolved_payload`, `conversation_ids`, `attempt_number`, `idempotency_key`
- Unique index on `idempotency_key`
- No FK to manage DB (cross-DB)

## Trigger Lifecycle

### Create (ScheduledTriggerService.ts:229-245)
1. `onTriggerCreated(trigger)` called from manage route
2. If `trigger.enabled`, calls `startScheduledTriggerWorkflow()`
3. `startScheduledTriggerWorkflow()`:
   - Gets or creates `scheduledWorkflows` record in manage DB
   - Calls `start(scheduledTriggerRunnerWorkflow, [payload])` — starts a Vercel Workflow
   - Updates `scheduledWorkflows.workflowRunId` with the new run ID

### Update (ScheduledTriggerService.ts:250-329)
Four cases:
1. Disabled → disabled: no-op
2. Enabled → disabled: `signalStopScheduledTriggerWorkflow()` (clears `workflowRunId`)
3. Disabled → enabled: cancel past pending invocations + start new workflow
4. Still enabled, schedule changed: cancel pending invocations + restart workflow

### Delete (ScheduledTriggerService.ts:335-342)
- `signalStopScheduledTriggerWorkflow()` — clears `workflowRunId`
- Cascade delete handles the manage DB records

## Workflow Execution (scheduledTriggerRunner.ts)

### Single Iteration Flow
```
checkTriggerEnabledStep()
  ↓
getNextPendingInvocationStep() or calculateNextExecutionStep() + createInvocationIdempotentStep()
  ↓
computeSleepDurationStep() → sleep(sleepMs)
  ↓ (WAKE UP — STILL ON ORIGINAL DEPLOYMENT)
checkTriggerEnabledStep() (post-sleep)
  ↓
checkInvocationCancelledStep()
  ↓
executeScheduledTriggerStep() (retry loop with maxRetries)
  ↓
markCompletedStep() or markFailedStep()
  ↓ (if cron, not one-time)
startNextIterationStep() → start(scheduledTriggerRunnerWorkflow, [newPayload])
```

### Daisy-Chain Pattern (startNextIterationStep, lines 59-135)
- Calls `start(scheduledTriggerRunnerWorkflow, [newPayload])` — creates a NEW workflow run
- Updates `scheduledWorkflows.workflowRunId` with the child's run ID
- The child inherits the deployment context of the parent (DEPLOYMENT PINNING)

### Supersession/Adoption (checkTriggerEnabledStep, lines 206-246)
- If `workflow.workflowRunId !== params.runnerId` → this runner was superseded
- Exception: if `workflow.workflowRunId === params.parentRunId` → adoption (parent crashed before DB update)

## Deployment Pinning Problem [CONFIRMED]

1. Trigger created on Deploy A → `start()` creates workflow pinned to Deploy A
2. Deploy B goes live
3. Workflow on Deploy A wakes from sleep → executes with Deploy A's code
4. `startNextIterationStep()` calls `start()` from Deploy A → child pinned to Deploy A
5. Deploy A's code runs **forever** until workflow is manually restarted

The `reenqueueRun()` function in `world.ts` explicitly passes `deploymentId` to `world.queue()`, further reinforcing pinning.

## Workflow World Abstraction (world.ts)

Three worlds:
- `vercel`: Vercel Queues + WDK (production)
- `@workflow/world-postgres`: graphile-worker + Postgres (self-hosted)
- `local`: in-memory (development)

Postgres world does NOT have deployment pinning — it uses long-lived workers that always run the latest code.

## Existing Cron Endpoint (workflowProcess.ts)

`GET /api/workflow/process` — `noAuth()`, sleeps 50s to keep worker alive. This is for the Vercel world to process queued jobs. Currently no `crons` entry in `vercel.json`.

## Cross-Project Iteration Pattern (triggerCleanup.ts)

Established pattern for iterating across all projects in DoltgreSQL:
1. `listProjectsMetadata(runDb)({ tenantId })` — get all projects from runtime DB
2. `resolveProjectMainRefs(db)(tenantId, projectIds)` — resolve branch refs
3. For each `{ projectId, ref }`: `withRef(manageDbPool, ref, callback)` — branch-scoped query
