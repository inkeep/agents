/**
 * Workflow for running scheduled triggers.
 *
 * This workflow:
 * 1. Calculates the next execution time (from cron expression or runAt)
 * 2. Sleeps until that time using Vercel Workflow's durable sleep
 * 3. Creates an invocation record (idempotent)
 * 4. Executes the agent with retries
 * 5. For cron triggers, loops back to step 1
 */
import { sleep } from 'workflow';
import {
  createScheduledTriggerInvocation,
  generateId,
  getScheduledTriggerById,
  getScheduledTriggerInvocationByIdempotencyKey,
  markScheduledTriggerInvocationCompleted,
  markScheduledTriggerInvocationFailed,
  markScheduledTriggerInvocationRunning,
  updateScheduledTriggerInvocationStatus,
} from '@inkeep/agents-core';
import { manageDbClient } from 'src/data/db';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { executeScheduledTrigger } from '../steps/executeScheduledTrigger';
import cronParser from 'cron-parser';

const logger = getLogger('workflow-scheduled-trigger-runner');

export type ScheduledTriggerRunnerPayload = {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
};

/**
 * Generate a deterministic runner ID from trigger identifiers.
 * This ensures the same trigger always produces the same runner ID.
 */
function generateDeterministicRunnerId(
  tenantId: string,
  projectId: string,
  agentId: string,
  scheduledTriggerId: string
): string {
  return `runner_${tenantId}_${projectId}_${agentId}_${scheduledTriggerId}`;
}

/**
 * Step: Calculate the next execution time relative to a base time.
 * For cron, uses lastScheduledFor as base to prevent drift.
 */
async function calculateNextExecutionStep(params: {
  cronExpression?: string | null;
  runAt?: string | null;
  lastScheduledFor?: string | null;
}): Promise<{ nextExecutionTime: string; isOneTime: boolean }> {
  'use step';

  const { cronExpression, runAt, lastScheduledFor } = params;

  if (runAt) {
    // One-time trigger - use the runAt time
    return { nextExecutionTime: runAt, isOneTime: true };
  }

  if (cronExpression) {
    // Cron trigger - calculate next occurrence relative to last execution
    // This prevents drift when workflow wakes late or runs long
    const baseDate = lastScheduledFor ? new Date(lastScheduledFor) : new Date();
    const interval = cronParser.parse(cronExpression, { currentDate: baseDate });
    const nextDate = interval.next();
    const nextIso = nextDate.toISOString();
    if (!nextIso) {
      throw new Error('Failed to calculate next execution time from cron expression');
    }
    return { nextExecutionTime: nextIso, isOneTime: false };
  }

  throw new Error('Trigger must have either cronExpression or runAt');
}

/**
 * Step: Compute sleep duration right before sleeping (minimizes drift).
 * Returns milliseconds to sleep.
 */
async function computeSleepDurationStep(targetTime: string): Promise<number> {
  'use step';

  const target = new Date(targetTime);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();

  // If target is in the past or very soon, use minimum delay
  return Math.max(diffMs, 1000);
}

/**
 * Step: Check if trigger is still enabled and this runner is authoritative.
 */
async function checkTriggerEnabledStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  runnerId: string;
}) {
  'use step';

  const trigger = await getScheduledTriggerById(manageDbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    scheduledTriggerId: params.scheduledTriggerId,
  });

  // If trigger was deleted or disabled, stop the workflow
  if (!trigger || !trigger.enabled) {
    return { shouldContinue: false, reason: !trigger ? 'deleted' : 'disabled', trigger: null };
  }

  // If workflowRunId changed, this workflow was superseded by a new runner
  if (trigger.workflowRunId && trigger.workflowRunId !== params.runnerId) {
    return { shouldContinue: false, reason: 'superseded', trigger: null };
  }

  return { shouldContinue: true, trigger };
}

/**
 * Step: Try to create invocation idempotently.
 * Returns existing invocation if already created.
 */
async function createInvocationIdempotentStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  scheduledFor: string;
  payload: Record<string, unknown> | null;
  idempotencyKey: string;
}) {
  'use step';

  // Check if invocation already exists
  const existing = await getScheduledTriggerInvocationByIdempotencyKey(runDbClient)({
    idempotencyKey: params.idempotencyKey,
  });

  if (existing) {
    logger.info(
      { scheduledTriggerId: params.scheduledTriggerId, idempotencyKey: params.idempotencyKey },
      'Invocation already exists, skipping creation'
    );
    return { invocation: existing, alreadyExists: true };
  }

  const invocationId = generateId();

  const invocation = await createScheduledTriggerInvocation(runDbClient)({
    id: invocationId,
    tenantId: params.tenantId,
    projectId: params.projectId,
    agentId: params.agentId,
    scheduledTriggerId: params.scheduledTriggerId,
    status: 'pending',
    scheduledFor: params.scheduledFor,
    resolvedPayload: params.payload,
    idempotencyKey: params.idempotencyKey,
    attemptNumber: 1,
  });

  logger.info(
    {
      tenantId: params.tenantId,
      projectId: params.projectId,
      scheduledTriggerId: params.scheduledTriggerId,
      invocationId,
      scheduledFor: params.scheduledFor,
    },
    'Created scheduled trigger invocation'
  );

  return { invocation, alreadyExists: false };
}

/**
 * Step: Mark invocation as running
 */
async function markRunningStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  invocationId: string;
}) {
  'use step';

  return markScheduledTriggerInvocationRunning(runDbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    scheduledTriggerId: params.scheduledTriggerId,
    invocationId: params.invocationId,
  });
}

/**
 * Step: Mark invocation as completed
 */
async function markCompletedStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  invocationId: string;
  conversationId?: string;
}) {
  'use step';

  return markScheduledTriggerInvocationCompleted(runDbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    scheduledTriggerId: params.scheduledTriggerId,
    invocationId: params.invocationId,
    conversationId: params.conversationId,
  });
}

/**
 * Step: Mark invocation as failed
 */
async function markFailedStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  invocationId: string;
  errorMessage: string;
  errorCode?: string;
}) {
  'use step';

  return markScheduledTriggerInvocationFailed(runDbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    scheduledTriggerId: params.scheduledTriggerId,
    invocationId: params.invocationId,
    errorMessage: params.errorMessage,
    errorCode: params.errorCode,
  });
}

/**
 * Step: Increment attempt number for retry
 */
async function incrementAttemptStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  invocationId: string;
  currentAttempt: number;
}) {
  'use step';

  await updateScheduledTriggerInvocationStatus(runDbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    scheduledTriggerId: params.scheduledTriggerId,
    invocationId: params.invocationId,
    data: {
      attemptNumber: params.currentAttempt + 1,
      status: 'pending',
    },
  });
}

/**
 * Generate idempotency key for a scheduled execution
 */
function generateIdempotencyKey(
  scheduledTriggerId: string,
  scheduledFor: string
): string {
  // Use trigger ID + scheduled time to ensure exactly-once execution
  return `sched_${scheduledTriggerId}_${scheduledFor}`;
}

/**
 * Main workflow function - runs a scheduled trigger.
 * For cron triggers, this loops indefinitely until disabled/deleted.
 * For one-time triggers, it executes once and completes.
 */
async function _scheduledTriggerRunnerWorkflow(payload: ScheduledTriggerRunnerPayload) {
  'use workflow';

  const { tenantId, projectId, agentId, scheduledTriggerId } = payload;

  // Generate deterministic runner ID from trigger identifiers
  const runnerId = generateDeterministicRunnerId(tenantId, projectId, agentId, scheduledTriggerId);

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId, runnerId },
    'Starting scheduled trigger runner workflow'
  );

  // Track last scheduled time for cron calculation (prevents drift)
  let lastScheduledFor: string | null = null;

  // Main execution loop
  while (true) {
    // 1. Check if trigger is still enabled and we're the authoritative runner
    const enabledCheck = await checkTriggerEnabledStep({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      runnerId,
    });

    if (!enabledCheck.shouldContinue) {
      logger.info(
        { scheduledTriggerId, reason: enabledCheck.reason },
        'Scheduled trigger workflow stopping'
      );
      return { status: 'stopped', reason: enabledCheck.reason };
    }

    const trigger = enabledCheck.trigger!;

    // 2. Calculate next execution time (relative to lastScheduledFor for cron)
    const { nextExecutionTime, isOneTime } = await calculateNextExecutionStep({
      cronExpression: trigger.cronExpression,
      runAt: trigger.runAt,
      lastScheduledFor,
    });

    // 3. Compute sleep duration right before sleeping (minimizes drift)
    const sleepMs = await computeSleepDurationStep(nextExecutionTime);

    logger.info(
      { scheduledTriggerId, nextExecutionTime, sleepMs },
      'Sleeping until next execution'
    );

    // 4. Sleep until execution time
    await sleep(sleepMs);

    // 5. Re-check if trigger is still enabled after sleep
    const postSleepCheck = await checkTriggerEnabledStep({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      runnerId,
    });

    if (!postSleepCheck.shouldContinue) {
      logger.info(
        { scheduledTriggerId, reason: postSleepCheck.reason },
        'Trigger disabled/deleted during sleep, stopping'
      );
      return { status: 'stopped', reason: postSleepCheck.reason };
    }

    // Refresh trigger config (may have changed during sleep)
    const currentTrigger = postSleepCheck.trigger!;

    // 6. Generate idempotency key and create invocation (idempotent)
    const idempotencyKey = generateIdempotencyKey(scheduledTriggerId, nextExecutionTime);

    const { invocation, alreadyExists } = await createInvocationIdempotentStep({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      scheduledFor: nextExecutionTime,
      payload: currentTrigger.payload ?? null,
      idempotencyKey,
    });

    // Update lastScheduledFor for next cron calculation
    lastScheduledFor = nextExecutionTime;

    // If invocation was already processed, skip to next iteration
    if (alreadyExists && invocation.status !== 'pending') {
      logger.info(
        { scheduledTriggerId, invocationId: invocation.id, status: invocation.status },
        'Invocation already processed, continuing to next'
      );

      if (isOneTime) {
        return { status: 'already_executed', invocationId: invocation.id };
      }
      continue;
    }

    // 7. Execute with retries
    const maxRetries = currentTrigger.maxRetries;
    const retryDelaySeconds = currentTrigger.retryDelaySeconds;
    let attemptNumber = invocation.attemptNumber;
    let lastError: string | null = null;

    while (attemptNumber <= maxRetries + 1) {
      // Mark as running
      await markRunningStep({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        invocationId: invocation.id,
      });

      try {
        const result = await executeScheduledTrigger({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId,
          invocationId: invocation.id,
          messageTemplate: currentTrigger.messageTemplate,
          payload: currentTrigger.payload ?? null,
          timeoutSeconds: currentTrigger.timeoutSeconds,
        });

        // Success - mark completed
        await markCompletedStep({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId,
          invocationId: invocation.id,
          conversationId: result.conversationId,
        });

        logger.info(
          { scheduledTriggerId, invocationId: invocation.id, conversationId: result.conversationId },
          'Scheduled trigger execution completed'
        );

        lastError = null;
        break; // Success, exit retry loop

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        logger.error(
          { scheduledTriggerId, invocationId: invocation.id, attemptNumber, error: lastError },
          'Scheduled trigger execution failed'
        );

        // Check if we have retries left
        if (attemptNumber < maxRetries + 1) {
          // Increment attempt and wait before retry
          await incrementAttemptStep({
            tenantId,
            projectId,
            agentId,
            scheduledTriggerId,
            invocationId: invocation.id,
            currentAttempt: attemptNumber,
          });

          attemptNumber++;

          // Wait before retrying
          await sleep(retryDelaySeconds * 1000);
        } else {
          // No more retries
          break;
        }
      }
    }

    // If we exited with an error, mark as failed
    if (lastError) {
      await markFailedStep({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        invocationId: invocation.id,
        errorMessage: lastError,
        errorCode: 'EXECUTION_ERROR',
      });
    }

    // 8. For one-time triggers, we're done
    if (isOneTime) {
      return { status: lastError ? 'failed' : 'completed', invocationId: invocation.id };
    }

    // For cron triggers, loop continues to calculate next execution
  }
}

// Export with workflowId for the build system
export const scheduledTriggerRunnerWorkflow = Object.assign(_scheduledTriggerRunnerWorkflow, {
  workflowId:
    'workflow//src/domains/run/workflow/functions/scheduledTriggerRunner.ts//_scheduledTriggerRunnerWorkflow',
});
