/**
 * Workflow for running scheduled triggers using daisy-chaining.
 *
 * Each run executes a single iteration:
 * 1. Checks if the trigger is still enabled (with adoption for chained runs)
 * 2. Gets or creates the next pending invocation
 * 3. Sleeps until its scheduled time
 * 4. Executes the agent with retries
 * 5. For cron triggers, starts a fresh workflow for the next iteration (daisy-chain)
 *
 */

import {
  getProjectScopedRef,
  getScheduledWorkflowByTriggerId,
  resolveRef,
  updateScheduledWorkflowRunId,
  withRef,
} from '@inkeep/agents-core';
import { manageDbClient } from 'src/data/db';
import { getWorkflowMetadata, sleep } from 'workflow';
import { start } from 'workflow/api';
import manageDbPool from '../../../../data/db/manageDbPool';
import { getLogger } from '../../../../logger';
import {
  addConversationIdStep,
  calculateNextExecutionStep,
  checkInvocationCancelledStep,
  checkTriggerEnabledStep,
  computeSleepDurationStep,
  createFanOutInvocationsStep,
  createInvocationIdempotentStep,
  executeScheduledTriggerStep,
  getNextPendingInvocationStep,
  incrementAttemptStep,
  listAllPendingInvocationsStep,
  logStep,
  markCompletedStep,
  markFailedStep,
  markRunningStep,
  processInvocationBatchStep,
} from '../steps/scheduledTriggerSteps';

const logger = getLogger('workflow-scheduled-trigger-runner');

export type ScheduledTriggerRunnerPayload = {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  lastScheduledFor?: string | null;
  parentRunId?: string | null;
};

/**
 * Generate idempotency key for a scheduled execution.
 */
function generateIdempotencyKey(scheduledTriggerId: string, scheduledFor: string): string {
  return `sched_${scheduledTriggerId}_${scheduledFor}`;
}

async function startNextIterationStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  lastScheduledFor: string;
  currentRunId: string;
}): Promise<string> {
  'use step';

  const newPayload: ScheduledTriggerRunnerPayload = {
    tenantId: params.tenantId,
    projectId: params.projectId,
    agentId: params.agentId,
    scheduledTriggerId: params.scheduledTriggerId,
    lastScheduledFor: params.lastScheduledFor,
    parentRunId: params.currentRunId,
  };

  const run = await start(scheduledTriggerRunnerWorkflow, [newPayload]);

  const scopes = {
    tenantId: params.tenantId,
    projectId: params.projectId,
    agentId: params.agentId,
  };
  const ref = getProjectScopedRef(params.tenantId, params.projectId, 'main');
  const resolvedRef = await resolveRef(manageDbClient)(ref);

  if (resolvedRef) {
    await withRef(manageDbPool, resolvedRef, async (db) => {
      const workflow = await getScheduledWorkflowByTriggerId(db)({
        scopes,
        scheduledTriggerId: params.scheduledTriggerId,
      });
      if (workflow) {
        await updateScheduledWorkflowRunId(db)({
          scopes,
          scheduledWorkflowId: workflow.id,
          workflowRunId: run.runId,
          status: 'running',
        });
      } else {
        logger.warn(
          {
            scheduledTriggerId: params.scheduledTriggerId,
            childRunId: run.runId,
          },
          'Scheduled workflow record not found — child workflow untrackable'
        );
      }
    });
  } else {
    // Child is already running (start() succeeded above) but we can't update
    // the DB with its runId. The child's adoption path will recover.
    logger.warn(
      {
        scheduledTriggerId: params.scheduledTriggerId,
        childRunId: run.runId,
        tenantId: params.tenantId,
        projectId: params.projectId,
      },
      'Failed to resolve ref after chaining — child will self-adopt via parentRunId'
    );
  }

  logger.info(
    {
      scheduledTriggerId: params.scheduledTriggerId,
      parentRunId: params.currentRunId,
      childRunId: run.runId,
    },
    'Chained to next scheduled trigger workflow iteration'
  );

  return run.runId;
}

/**
 * Main workflow function - runs a single iteration of a scheduled trigger.
 * For cron triggers, chains to a fresh workflow run for the next iteration.
 * For one-time triggers, it executes once and completes.
 */
async function _scheduledTriggerRunnerWorkflow(payload: ScheduledTriggerRunnerPayload) {
  'use workflow';

  const { tenantId, projectId, agentId, scheduledTriggerId, lastScheduledFor, parentRunId } =
    payload;
  const metadata = getWorkflowMetadata();
  const runnerId = metadata.workflowRunId;

  await logStep('Starting scheduled trigger runner workflow', {
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    runnerId,
    parentRunId,
  });

  const enabledCheck = await checkTriggerEnabledStep({
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    runnerId,
    parentRunId,
  });

  if (!enabledCheck.shouldContinue || !enabledCheck.trigger) {
    await logStep('Scheduled trigger workflow stopping', {
      scheduledTriggerId,
      reason: enabledCheck.reason,
    });
    return { status: 'stopped', reason: enabledCheck.reason };
  }

  const trigger = enabledCheck.trigger;
  const isOneTime = !!trigger.runAt;
  let invocation = await getNextPendingInvocationStep({
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
  });

  if (!invocation) {
    let scheduledFor: string;

    if (isOneTime) {
      if (!trigger.runAt) {
        await logStep('One-time trigger missing runAt', { scheduledTriggerId });
        return { status: 'error', reason: 'one-time trigger missing runAt' };
      }
      scheduledFor = trigger.runAt;
    } else if (trigger.cronExpression) {
      const { nextExecutionTime } = await calculateNextExecutionStep({
        cronExpression: trigger.cronExpression,
        cronTimezone: trigger.cronTimezone,
        lastScheduledFor: lastScheduledFor ?? null,
      });
      scheduledFor = nextExecutionTime;
    } else {
      await logStep('Trigger missing both cronExpression and runAt', { scheduledTriggerId });
      return { status: 'error', reason: 'trigger missing cronExpression and runAt' };
    }

    const idempotencyKeyPrefix = generateIdempotencyKey(scheduledTriggerId, scheduledFor);

    const audienceConfig = trigger.audienceConfig as { type: 'userList'; userIds: string[] } | null;

    if (audienceConfig?.type === 'userList' && audienceConfig.userIds.length > 0) {
      // --- FAN-OUT PATH: multiple invocations with concurrency control ---
      await createFanOutInvocationsStep({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        scheduledFor,
        payload: trigger.payload ?? null,
        userIds: audienceConfig.userIds,
        idempotencyKeyPrefix,
      });

      const allPending = await listAllPendingInvocationsStep({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
      });

      if (allPending.length === 0) {
        await logStep('Fan-out invocations created but none pending', { scheduledTriggerId });
        return { status: 'already_executed', reason: 'all fan-out invocations already processed' };
      }

      await logStep('Fan-out invocations ready for batch processing', {
        scheduledTriggerId,
        pendingCount: allPending.length,
        maxConcurrent: trigger.maxConcurrentInvocations,
        staggerSeconds: trigger.staggerIntervalSeconds,
      });

      // Sleep until the scheduled time (all fan-out invocations share the same scheduledFor)
      const fanOutSleepMs = await computeSleepDurationStep(allPending[0].scheduledFor);
      await logStep('Sleeping until scheduled time for fan-out batch', {
        scheduledTriggerId,
        scheduledFor: allPending[0].scheduledFor,
        sleepMs: fanOutSleepMs,
      });
      await sleep(fanOutSleepMs);

      // Post-sleep enabled check
      const fanOutPostSleep = await checkTriggerEnabledStep({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        runnerId,
      });

      if (!fanOutPostSleep.shouldContinue || !fanOutPostSleep.trigger) {
        await logStep('Trigger disabled/deleted during sleep, stopping fan-out', {
          scheduledTriggerId,
          reason: fanOutPostSleep.reason,
        });
        return { status: 'stopped', reason: fanOutPostSleep.reason };
      }

      const currentTriggerForBatch = fanOutPostSleep.trigger;

      // Process all pending invocations with concurrency control
      const batchResult = await processInvocationBatchStep({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        invocations: allPending,
        maxConcurrentInvocations: currentTriggerForBatch.maxConcurrentInvocations,
        staggerIntervalSeconds: currentTriggerForBatch.staggerIntervalSeconds,
        maxRetries: currentTriggerForBatch.maxRetries,
        retryDelaySeconds: currentTriggerForBatch.retryDelaySeconds,
        messageTemplate: currentTriggerForBatch.messageTemplate,
        payload: currentTriggerForBatch.payload ?? null,
        timeoutSeconds: currentTriggerForBatch.timeoutSeconds,
        runAsUserId: currentTriggerForBatch.runAsUserId,
        cronTimezone: currentTriggerForBatch.cronTimezone,
      });

      await logStep('Fan-out batch processing complete', {
        scheduledTriggerId,
        ...batchResult,
      });

      // Chain to next iteration for cron triggers
      if (!isOneTime) {
        const preChainCheck = await checkTriggerEnabledStep({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId,
          runnerId,
        });

        if (preChainCheck.shouldContinue) {
          try {
            await startNextIterationStep({
              tenantId,
              projectId,
              agentId,
              scheduledTriggerId,
              lastScheduledFor: scheduledFor,
              currentRunId: runnerId,
            });
          } catch (err) {
            await logStep('Failed to chain to next iteration after fan-out', {
              scheduledTriggerId,
              error: err instanceof Error ? err.message : String(err),
            });
            throw err;
          }
          return { status: 'chained', ...batchResult };
        }

        await logStep('Pre-chain check failed after fan-out, not chaining', {
          scheduledTriggerId,
          reason: preChainCheck.reason,
        });
        return { status: 'stopped', reason: preChainCheck.reason };
      }

      return {
        status: batchResult.failed > 0 ? 'failed' : 'completed',
        ...batchResult,
      };
    }
    // --- SINGLE INVOCATION PATH (unchanged) ---
    const result = await createInvocationIdempotentStep({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      scheduledFor,
      payload: trigger.payload ?? null,
      idempotencyKey: idempotencyKeyPrefix,
    });
    invocation = result.invocation;

    if (isOneTime && result.alreadyExists && invocation.status !== 'pending') {
      await logStep('One-time trigger already executed', {
        scheduledTriggerId,
        invocationId: invocation.id,
        status: invocation.status,
      });
      return { status: 'already_executed', invocationId: invocation.id };
    }
  }

  // --- SINGLE INVOCATION PROCESSING (existing logic, unchanged) ---
  await logStep('Got next pending invocation', {
    scheduledTriggerId,
    invocationId: invocation.id,
    scheduledFor: invocation.scheduledFor,
  });

  const sleepMs = await computeSleepDurationStep(invocation.scheduledFor);

  await logStep('Sleeping until scheduled time', {
    scheduledTriggerId,
    invocationId: invocation.id,
    scheduledFor: invocation.scheduledFor,
    sleepMs,
  });

  await sleep(sleepMs);

  const postSleepCheck = await checkTriggerEnabledStep({
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    runnerId,
  });

  if (!postSleepCheck.shouldContinue || !postSleepCheck.trigger) {
    await logStep('Trigger disabled/deleted during sleep, stopping', {
      scheduledTriggerId,
      reason: postSleepCheck.reason,
    });
    return { status: 'stopped', reason: postSleepCheck.reason };
  }

  const currentTrigger = postSleepCheck.trigger;

  const cancelCheck = await checkInvocationCancelledStep({
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    invocationId: invocation.id,
  });

  if (cancelCheck.cancelled) {
    await logStep('Invocation was cancelled, skipping execution', {
      scheduledTriggerId,
      invocationId: invocation.id,
    });

    if (!isOneTime) {
      try {
        await startNextIterationStep({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId,
          lastScheduledFor: invocation.scheduledFor,
          currentRunId: runnerId,
        });
      } catch (err) {
        await logStep('Failed to chain to next iteration after cancellation', {
          scheduledTriggerId,
          invocationId: invocation.id,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }

    return { status: 'cancelled', invocationId: invocation.id };
  }

  let attemptNumber = invocation.attemptNumber;
  let lastError: string | null = null;

  const maxAttempts = currentTrigger.maxRetries + 1;
  while (attemptNumber <= maxAttempts) {
    const retryCancel = await checkInvocationCancelledStep({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      invocationId: invocation.id,
    });

    if (retryCancel.cancelled) {
      await logStep('Invocation cancelled during retry loop', {
        scheduledTriggerId,
        invocationId: invocation.id,
      });
      lastError = null;
      break;
    }

    await markRunningStep({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      invocationId: invocation.id,
    });

    const result = await executeScheduledTriggerStep({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      invocationId: invocation.id,
      messageTemplate: currentTrigger.messageTemplate,
      payload: currentTrigger.payload ?? null,
      timeoutSeconds: currentTrigger.timeoutSeconds,
      runAsUserId: currentTrigger.runAsUserId,
      cronTimezone: currentTrigger.cronTimezone,
    });

    if (result.conversationId) {
      await addConversationIdStep({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        invocationId: invocation.id,
        conversationId: result.conversationId,
      });
    }

    if (result.success) {
      await markCompletedStep({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        invocationId: invocation.id,
      });

      await logStep('Scheduled trigger execution completed', {
        scheduledTriggerId,
        invocationId: invocation.id,
        conversationId: result.conversationId,
      });

      lastError = null;
      break;
    }

    lastError = result.error || 'Unknown error';

    await logStep('Scheduled trigger execution failed', {
      scheduledTriggerId,
      invocationId: invocation.id,
      attemptNumber,
      error: lastError,
    });

    if (attemptNumber < maxAttempts) {
      await incrementAttemptStep({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        invocationId: invocation.id,
        currentAttempt: attemptNumber,
      });

      attemptNumber++;
      const jitter = Math.random() * 0.3;
      await sleep(currentTrigger.retryDelaySeconds * 1000 * (1 + jitter));
    } else {
      break;
    }
  }

  if (lastError) {
    await markFailedStep({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      invocationId: invocation.id,
    });
  }

  if (isOneTime) {
    return { status: lastError ? 'failed' : 'completed', invocationId: invocation.id };
  }

  const preChainCheck = await checkTriggerEnabledStep({
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    runnerId,
  });

  if (!preChainCheck.shouldContinue) {
    await logStep('Pre-chain check failed, not chaining', {
      scheduledTriggerId,
      reason: preChainCheck.reason,
    });
    return { status: 'stopped', reason: preChainCheck.reason };
  }

  try {
    await startNextIterationStep({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      lastScheduledFor: invocation.scheduledFor,
      currentRunId: runnerId,
    });
  } catch (err) {
    await logStep('Failed to chain to next iteration', {
      scheduledTriggerId,
      invocationId: invocation.id,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  return { status: 'chained', invocationId: invocation.id };
}

// Export with workflowId for the build system
export const scheduledTriggerRunnerWorkflow = Object.assign(_scheduledTriggerRunnerWorkflow, {
  workflowId:
    'workflow//./src/domains/run/workflow/functions/scheduledTriggerRunner//_scheduledTriggerRunnerWorkflow',
});
