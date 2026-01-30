/**
 * Workflow for running scheduled triggers.
 *
 * This workflow:
 * 1. Calculates the next execution time (from cron expression or runAt)
 * 2. Sleeps until that time using Vercel Workflow's durable sleep
 * 3. Creates an invocation record (idempotent)
 * 4. Executes the agent with retries
 * 5. For cron triggers, loops back to step 1
 *
 * IMPORTANT: The main workflow function cannot use any Node.js modules.
 * All Node.js-dependent code must be in step functions.
 */
import { sleep } from 'workflow';

export type ScheduledTriggerRunnerPayload = {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
};

/**
 * Generate a deterministic runner ID from trigger identifiers.
 * This is pure JS, no Node.js modules.
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
 * Generate idempotency key for a scheduled execution.
 * This is pure JS, no Node.js modules.
 */
function generateIdempotencyKey(scheduledTriggerId: string, scheduledFor: string): string {
  return `sched_${scheduledTriggerId}_${scheduledFor}`;
}

// Import step functions - these are in a separate file to isolate Node.js dependencies
import {
  calculateNextExecutionStep,
  checkTriggerEnabledStep,
  computeSleepDurationStep,
  createInvocationIdempotentStep,
  executeScheduledTriggerStep,
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
 * IMPORTANT: This function MUST NOT use any Node.js modules directly.
 * Only pure JS and calls to step functions are allowed.
 */
async function _scheduledTriggerRunnerWorkflow(payload: ScheduledTriggerRunnerPayload) {
  'use workflow';

  const { tenantId, projectId, agentId, scheduledTriggerId } = payload;

  // Generate deterministic runner ID from trigger identifiers
  const runnerId = generateDeterministicRunnerId(tenantId, projectId, agentId, scheduledTriggerId);

  await logStep('Starting scheduled trigger runner workflow', {
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    runnerId,
  });

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

    if (!enabledCheck.shouldContinue || !enabledCheck.trigger) {
      await logStep('Scheduled trigger workflow stopping', {
        scheduledTriggerId,
        reason: enabledCheck.reason,
      });
      return { status: 'stopped', reason: enabledCheck.reason };
    }

    const trigger = enabledCheck.trigger;

    // 2. Calculate next execution time (relative to lastScheduledFor for cron)
    const { nextExecutionTime, isOneTime } = await calculateNextExecutionStep({
      cronExpression: trigger.cronExpression,
      runAt: trigger.runAt,
      lastScheduledFor,
    });

    // 3. Compute sleep duration right before sleeping (minimizes drift)
    const sleepMs = await computeSleepDurationStep(nextExecutionTime);

    await logStep('Sleeping until next execution', {
      scheduledTriggerId,
      nextExecutionTime,
      sleepMs,
    });

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

    if (!postSleepCheck.shouldContinue || !postSleepCheck.trigger) {
      await logStep('Trigger disabled/deleted during sleep, stopping', {
        scheduledTriggerId,
        reason: postSleepCheck.reason,
      });
      return { status: 'stopped', reason: postSleepCheck.reason };
    }

    // Refresh trigger config (may have changed during sleep)
    const currentTrigger = postSleepCheck.trigger;

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

    await logStep('Invocation created/found', {
      scheduledTriggerId,
      invocationId: invocation.id,
      alreadyExists,
      invocationStatus: invocation.status,
      attemptNumber: invocation.attemptNumber,
    });

    // If invocation was already processed, skip to next iteration
    if (alreadyExists && invocation.status !== 'pending') {
      await logStep('Invocation already processed, continuing to next', {
        scheduledTriggerId,
        invocationId: invocation.id,
        status: invocation.status,
      });

      if (isOneTime) {
        return { status: 'already_executed', invocationId: invocation.id };
      }
      continue;
    }

    // Defaults are applied in checkTriggerEnabledStep, but we use explicit checks
    // here because the '??' operator may not work reliably in workflow context.
    // Also check for NaN which can occur due to workflow serialization issues
    // (NaN comparisons always return false, breaking the retry loop).
    const isValidNumber = (val: unknown): val is number => 
      typeof val === 'number' && val === val; // NaN !== NaN, so this catches NaN
    
    const maxRetries = isValidNumber(currentTrigger.maxRetries) ? currentTrigger.maxRetries : 3;
    const retryDelaySeconds = isValidNumber(currentTrigger.retryDelaySeconds) ? currentTrigger.retryDelaySeconds : 60;
    const timeoutSeconds = isValidNumber(currentTrigger.timeoutSeconds) ? currentTrigger.timeoutSeconds : 300;

    await logStep('DEBUG: Computed retry values', {
      scheduledTriggerId,
      invocationId: invocation.id,
      'currentTrigger.maxRetries': currentTrigger.maxRetries,
      'typeof currentTrigger.maxRetries': typeof currentTrigger.maxRetries,
      'isValidNumber(currentTrigger.maxRetries)': isValidNumber(currentTrigger.maxRetries),
      'computed maxRetries': maxRetries,
      'computed retryDelaySeconds': retryDelaySeconds,
      'computed timeoutSeconds': timeoutSeconds,
      attemptNumber: invocation.attemptNumber,
      maxAttempts: maxRetries + 1,
      'loop condition (attemptNumber <= maxAttempts)': invocation.attemptNumber <= maxRetries + 1,
    });

    // 7. Execute with retries
    let attemptNumber = invocation.attemptNumber;
    let lastError: string | null = null;
    let conversationId: string | null = null;

    // Use explicit comparison to avoid issues with null/undefined in workflow context
    const maxAttempts = maxRetries + 1;
    while (attemptNumber <= maxAttempts) {
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
        // Success - mark completed
        conversationId = result.conversationId ?? null;
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
        break; // Success, exit retry loop
      } else {
        lastError = result.error || 'Unknown error';

        await logStep('Scheduled trigger execution failed', {
          scheduledTriggerId,
          invocationId: invocation.id,
          attemptNumber,
          error: lastError,
        });

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
