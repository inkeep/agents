/**
 * Workflow for running scheduled triggers.
 *
 * This workflow:
 * 1. Gets or creates the next pending invocation
 * 2. Sleeps until its scheduled time
 * 3. Checks if cancelled (user can cancel during sleep)
 * 4. Executes the agent with retries
 * 5. For cron triggers, loops back to step 1
 *
 */
import { getWorkflowMetadata, sleep } from 'workflow';

export type ScheduledTriggerRunnerPayload = {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
};

/**
 * Generate idempotency key for a scheduled execution.
 */
function generateIdempotencyKey(scheduledTriggerId: string, scheduledFor: string): string {
  return `sched_${scheduledTriggerId}_${scheduledFor}`;
}

// Import step functions - these are in a separate file to isolate Node.js dependencies
import {
  calculateNextExecutionStep,
  checkInvocationCancelledStep,
  addConversationIdStep,
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
} from '../steps/scheduledTriggerSteps';

/**
 * Main workflow function - runs a scheduled trigger.
 * For cron triggers, this loops indefinitely until disabled/deleted.
 * For one-time triggers, it executes once and completes.
 *
 */
async function _scheduledTriggerRunnerWorkflow(payload: ScheduledTriggerRunnerPayload) {
  'use workflow';

  const { tenantId, projectId, agentId, scheduledTriggerId } = payload;
  const metadata = getWorkflowMetadata();
  const runnerId = metadata.workflowRunId;

  await logStep('Starting scheduled trigger runner workflow', {
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    runnerId,
  });

  // Track the last scheduled time for cron calculations
  let lastScheduledFor: string | null = null;

  // Main execution loop
  while (true) {
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

    // Get any existing pending invocation
    let invocation = await getNextPendingInvocationStep({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
    });

    // Create invocation if none exists
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
          lastScheduledFor,
        });
        scheduledFor = nextExecutionTime;
      } else {
        await logStep('Trigger missing both cronExpression and runAt', { scheduledTriggerId });
        return { status: 'error', reason: 'trigger missing cronExpression and runAt' };
      }

      const idempotencyKey = generateIdempotencyKey(scheduledTriggerId, scheduledFor);
      const result = await createInvocationIdempotentStep({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        scheduledFor,
        payload: trigger.payload ?? null,
        idempotencyKey,
      });
      invocation = result.invocation;

      // For one-time triggers, check if already processed
      if (isOneTime && result.alreadyExists && invocation.status !== 'pending') {
        await logStep('One-time trigger already executed', {
          scheduledTriggerId,
          invocationId: invocation.id,
          status: invocation.status,
        });
        return { status: 'already_executed', invocationId: invocation.id };
      }
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

      // Save conversation ID immediately after each attempt
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
      });
    }

    // Track this invocation's scheduled time for next cron calculation
    lastScheduledFor = invocation.scheduledFor;

    // For one-time triggers, we're done
    if (isOneTime) {
      return { status: lastError ? 'failed' : 'completed', invocationId: invocation.id };
    }

    // For cron triggers, loop continues to create/get next invocation
  }
}

// Export with workflowId for the build system
export const scheduledTriggerRunnerWorkflow = Object.assign(_scheduledTriggerRunnerWorkflow, {
  workflowId:
    'workflow//src/domains/run/workflow/functions/scheduledTriggerRunner.ts//_scheduledTriggerRunnerWorkflow',
});
