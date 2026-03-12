# Evidence: Scheduled Trigger Lifecycle

**Date:** 2026-03-12
**Sources:** scheduledTriggerRunner.ts, ScheduledTriggerService.ts, scheduledTriggerSteps.ts

## Finding: All scheduling uses the daisy-chain pattern (no native cron)

**Confidence:** CONFIRMED

There is no Vercel Cron, no node-cron, no external scheduler. All scheduling is:
1. Calculated at invocation time via `CronExpressionParser`
2. Executed via workflow-managed durable sleep
3. Chained to next iteration via `start()` calls

## Finding: The daisy-chain start() call has no deploymentId option

**Confidence:** CONFIRMED

```typescript
// scheduledTriggerRunner.ts:78
const run = await start(scheduledTriggerRunnerWorkflow, [newPayload]);
// Two args only — no options object with deploymentId
```

`start()` accepts `(workflow, args, options?)` where `options.deploymentId` could be passed.

## Finding: ScheduledTriggerService has restart capability

**Confidence:** CONFIRMED

`restartScheduledTriggerWorkflow()` (ScheduledTriggerService.ts:202-224) calls `startScheduledTriggerWorkflow()` which creates a new workflow run. Combined with the supersession check in `checkTriggerEnabledStep`, this effectively migrates a trigger to whatever deployment runs the restart.

## Finding: DB tracks all active triggers with workflow state

**Confidence:** CONFIRMED

`scheduledWorkflows` table has: scheduledTriggerId, workflowRunId, status. A query for all `status='running'` records gives the complete list of active triggers that need migration.
