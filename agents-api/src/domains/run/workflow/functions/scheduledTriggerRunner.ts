/**
 * Workflow for running scheduled triggers.
 *
 * This workflow:
 * 1. Pre-creates N pending invocations for upcoming scheduled times
 * 2. Gets the next pending invocation to execute
 * 3. Sleeps until its scheduled time
 * 4. Checks if cancelled (user can cancel during sleep)
 * 5. Executes the agent with retries
 * 6. Replenishes pending invocations to maintain N pending
 * 7. For cron triggers, loops back to step 2
 *
 * IMPORTANT: The main workflow function cannot use any Node.js modules.
 * All Node.js-dependent code must be in step functions.
 */
import { getWorkflowMetadata, sleep } from 'workflow';

export type ScheduledTriggerRunnerPayload = {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
};

// Number of pending invocations to maintain
const PENDING_INVOCATIONS_COUNT = 5;

/**
 * Generate idempotency key for a scheduled execution.
 * This is pure JS, no Node.js modules.
 */
function generateIdempotencyKey(scheduledTriggerId: string, scheduledFor: string): string {
  return `sched_${scheduledTriggerId}_${scheduledFor}`;
}

// Import step functions - these are in a separate file to isolate Node.js dependencies
import {
  calculateNextExecutionStep,
  checkInvocationCancelledStep,
  checkTriggerEnabledStep,
  computeSleepDurationStep,
  createInvocationIdempotentStep,
  executeScheduledTriggerStep,
  getNextPendingInvocationStep,
  incrementAttemptStep,
  logStep,
  markCompletedStep,
  markFailedStep,
  markRunningStep,
  preCreatePendingInvocationsStep,
} from '../steps/scheduledTriggerSteps';

/**
 * Main workflow function - runs a scheduled trigger.
 * For cron triggers, this loops indefinitely until disabled/deleted.
 * For one-time triggers, it executes once and completes.
 *
 * Pre-creates pending invocations so users can cancel specific future runs.
 *
 * IMPORTANT: This function MUST NOT use any Node.js modules directly.
 * Only pure JS and calls to step functions are allowed.
 */
async function _scheduledTriggerRunnerWorkflow(payload: ScheduledTriggerRunnerPayload) {
  'use workflow';

  const { tenantId, projectId, agentId, scheduledTriggerId } = payload;

  // Get the actual workflow run ID from metadata (e.g., wrun_XXXXX)
  // This is stored in the DB and used to detect supersession
  const metadata = getWorkflowMetadata();
  const runnerId = metadata.workflowRunId;

  await logStep('Starting scheduled trigger runner workflow', {
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    runnerId,
  });

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

    if (!enabledCheck.shouldContinue || !enabledCheck.trigger) {
      await logStep('Scheduled trigger workflow stopping', {
        scheduledTriggerId,
        reason: enabledCheck.reason,
      });
      return { status: 'stopped', reason: enabledCheck.reason };
    }

    const trigger = enabledCheck.trigger;
    const isOneTime = !!trigger.runAt;

    // 2. For cron triggers, pre-create pending invocations
    if (!isOneTime && trigger.cronExpression) {
      await preCreatePendingInvocationsStep({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        cronExpression: trigger.cronExpression,
        payload: trigger.payload ?? null,
        targetCount: PENDING_INVOCATIONS_COUNT,
      });
    }

    // 3. Get the next pending invocation to execute
    let invocation = await getNextPendingInvocationStep({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
    });

    // For one-time triggers, create the invocation if it doesn't exist
    if (!invocation && isOneTime && trigger.runAt) {
      const idempotencyKey = generateIdempotencyKey(scheduledTriggerId, trigger.runAt);
      const result = await createInvocationIdempotentStep({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        scheduledFor: trigger.runAt,
        payload: trigger.payload ?? null,
        idempotencyKey,
      });
      invocation = result.invocation;

      // If already processed, we're done
      if (result.alreadyExists && invocation.status !== 'pending') {
        await logStep('One-time trigger already executed', {
          scheduledTriggerId,
          invocationId: invocation.id,
          status: invocation.status,
        });
        return { status: 'already_executed', invocationId: invocation.id };
      }
    }

    // If no pending invocations (all were cancelled), wait a bit and retry
    if (!invocation) {
      await logStep('No pending invocations found, waiting before retry', {
        scheduledTriggerId,
      });
      await sleep(60000); // Wait 1 minute before checking again
      continue;
    }

    await logStep('Got next pending invocation', {
      scheduledTriggerId,
      invocationId: invocation.id,
      scheduledFor: invocation.scheduledFor,
    });

    // 4. Sleep until the invocation's scheduled time
    const sleepMs = await computeSleepDurationStep(invocation.scheduledFor);

    await logStep('Sleeping until scheduled time', {
      scheduledTriggerId,
      invocationId: invocation.id,
      scheduledFor: invocation.scheduledFor,
      sleepMs,
    });

    await sleep(sleepMs);

    // 5. Re-check if trigger is still enabled after sleep
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

    // Refresh trigger config (may have changed during sleep)
    const currentTrigger = postSleepCheck.trigger;

    // 6. Check if invocation was cancelled during sleep
    const cancelCheck = await checkInvocationCancelledStep({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      invocationId: invocation.id,
    });

    if (cancelCheck.cancelled) {
      await logStep('Invocation was cancelled, skipping to next', {
        scheduledTriggerId,
        invocationId: invocation.id,
      });
      // Continue to next iteration to get the next pending invocation
      continue;
    }

    // Defaults for retry settings
    const isValidNumber = (val: unknown): val is number => typeof val === 'number' && val === val;
    const maxRetries = isValidNumber(currentTrigger.maxRetries) ? currentTrigger.maxRetries : 3;
    const retryDelaySeconds = isValidNumber(currentTrigger.retryDelaySeconds)
      ? currentTrigger.retryDelaySeconds
      : 60;
    const timeoutSeconds = isValidNumber(currentTrigger.timeoutSeconds)
      ? currentTrigger.timeoutSeconds
      : 300;

    // 7. Execute with retries
    let attemptNumber = invocation.attemptNumber;
    let lastError: string | null = null;

    const maxAttempts = maxRetries + 1;
    while (attemptNumber <= maxAttempts) {
      // Re-check cancellation before each attempt
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
        break;
      }

      // Mark as running
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
        timeoutSeconds,
      });

      if (result.success) {
        await markCompletedStep({
          tenantId,
          projectId,
          agentId,
          scheduledTriggerId,
          invocationId: invocation.id,
          conversationId: result.conversationId,
        });

        await logStep('Scheduled trigger execution completed', {
          scheduledTriggerId,
          invocationId: invocation.id,
          conversationId: result.conversationId,
        });

        lastError = null;
        break;
      } else {
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
          await sleep(retryDelaySeconds * 1000);
        } else {
          break;
        }
      }
    }

    // Mark as failed if all retries exhausted
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

    // For cron triggers, loop continues to get next pending invocation
  }
}

// Export with workflowId for the build system
export const scheduledTriggerRunnerWorkflow = Object.assign(_scheduledTriggerRunnerWorkflow, {
  workflowId:
    'workflow//src/domains/run/workflow/functions/scheduledTriggerRunner.ts//_scheduledTriggerRunnerWorkflow',
});
