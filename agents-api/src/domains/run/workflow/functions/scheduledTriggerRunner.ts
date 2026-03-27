/**
 * One-shot workflow for executing a single scheduled trigger invocation.
 *
 * Dispatched by the trigger dispatcher. Each invocation is independent:
 * 1. Checks if the trigger is still enabled
 * 2. Creates an invocation record (idempotent)
 * 3. Executes the agent with retries
 * 4. Marks completed or failed
 *
 */

import { getWorkflowMetadata, sleep } from 'workflow';
import {
  addConversationIdStep,
  checkInvocationCancelledStep,
  checkTriggerEnabledStep,
  createInvocationIdempotentStep,
  disableOneTimeTriggerStep,
  executeScheduledTriggerStep,
  incrementAttemptStep,
  logStep,
  markCompletedStep,
  markFailedStep,
  markRunningStep,
} from '../steps/scheduledTriggerSteps';

export type TriggerPayload = {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  scheduledFor: string;
  ref: string;
};

function generateIdempotencyKey(scheduledTriggerId: string, scheduledFor: string): string {
  return `sched_${scheduledTriggerId}_${scheduledFor}`;
}

async function _scheduledTriggerRunnerWorkflow(payload: TriggerPayload) {
  'use workflow';

  const { tenantId, projectId, agentId, scheduledTriggerId, scheduledFor, ref } = payload;
  const metadata = getWorkflowMetadata();
  const runnerId = metadata.workflowRunId;

  await logStep('Starting scheduled trigger workflow', {
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    scheduledFor,
    ref,
    runnerId,
  });

  const enabledCheck = await checkTriggerEnabledStep({
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    runnerId,
  });

  if (!enabledCheck.shouldContinue || !enabledCheck.trigger) {
    return { status: 'stopped', reason: enabledCheck.reason };
  }

  const trigger = enabledCheck.trigger;

  const idempotencyKey = generateIdempotencyKey(scheduledTriggerId, scheduledFor);
  const { invocation, alreadyExists } = await createInvocationIdempotentStep({
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    scheduledFor,
    payload: trigger.payload ?? null,
    idempotencyKey,
  });

  if (alreadyExists && invocation.status !== 'pending') {
    return { status: 'already_executed', invocationId: invocation.id };
  }

  let attemptNumber = invocation.attemptNumber;
  let lastError: string | null = null;
  const maxAttempts = trigger.maxRetries + 1;

  while (attemptNumber <= maxAttempts) {
    const cancelCheck = await checkInvocationCancelledStep({
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      invocationId: invocation.id,
    });

    if (cancelCheck.cancelled) {
      return { status: 'cancelled', invocationId: invocation.id };
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
      messageTemplate: trigger.messageTemplate,
      payload: trigger.payload ?? null,
      timeoutSeconds: trigger.timeoutSeconds,
      runAsUserId: trigger.runAsUserId,
      cronTimezone: trigger.cronTimezone,
      ref,
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
      if (!trigger.cronExpression) {
        await disableOneTimeTriggerStep({ tenantId, projectId, agentId, scheduledTriggerId });
      }
      return { status: 'completed', invocationId: invocation.id };
    }

    lastError = result.error || 'Unknown error';

    await logStep('Execution attempt failed', {
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
      const backoffMultiplier = 2 ** (attemptNumber - 1);
      const jitter = Math.random() * 0.3;
      await sleep(trigger.retryDelaySeconds * 1000 * backoffMultiplier * (1 + jitter));
    } else {
      break;
    }
  }

  await markFailedStep({
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    invocationId: invocation.id,
  });
  if (!trigger.cronExpression) {
    await disableOneTimeTriggerStep({ tenantId, projectId, agentId, scheduledTriggerId });
  }

  return { status: 'failed', invocationId: invocation.id };
}

// Export with workflowId for the build system
export const scheduledTriggerRunnerWorkflow = Object.assign(_scheduledTriggerRunnerWorkflow, {
  workflowId:
    'workflow//./src/domains/run/workflow/functions/scheduledTriggerRunner//_scheduledTriggerRunnerWorkflow',
});
