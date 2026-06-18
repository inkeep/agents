import { sleep } from 'workflow';
import { logStep } from '../../../run/workflow/steps/scheduledTriggerSteps';
import {
  checkDatasetRunTriggerEnabledStep,
  disableDatasetRunTriggerStep,
  executeDatasetRunStep,
} from '../steps/scheduledDatasetRunSteps';

export type ScheduledDatasetRunPayload = {
  tenantId: string;
  projectId: string;
  datasetRunConfigId: string;
  scheduledTriggerId: string;
  scheduledFor: string;
  ref: string;
  runAsUserId?: string;
  delayBeforeExecutionMs?: number;
};

async function _scheduledDatasetRunWorkflow(payload: ScheduledDatasetRunPayload) {
  'use workflow';

  const {
    tenantId,
    projectId,
    datasetRunConfigId,
    scheduledTriggerId,
    scheduledFor,
    ref,
    runAsUserId: payloadRunAsUserId,
    delayBeforeExecutionMs,
  } = payload;

  await logStep('Starting scheduled dataset run workflow', {
    tenantId,
    projectId,
    datasetRunConfigId,
    scheduledTriggerId,
    scheduledFor,
    ref,
  });

  const enabledCheck = await checkDatasetRunTriggerEnabledStep({
    tenantId,
    projectId,
    datasetRunConfigId,
    scheduledTriggerId,
  });

  if (!enabledCheck.shouldContinue || !enabledCheck.trigger) {
    return { status: 'stopped', reason: enabledCheck.reason };
  }

  const trigger = enabledCheck.trigger;
  const staggerDelayMs = trigger.dispatchDelayMs ?? 0;
  const resolvedRunAsUserId = payloadRunAsUserId ?? trigger.runAsUserId ?? undefined;

  if (delayBeforeExecutionMs && delayBeforeExecutionMs > 0) {
    await sleep(delayBeforeExecutionMs);
  }

  const maxAttempts = trigger.maxRetries + 1;
  let attemptNumber = 1;
  let lastError: string | null = null;

  while (attemptNumber <= maxAttempts) {
    const result = await executeDatasetRunStep({
      tenantId,
      projectId,
      scheduledTriggerId,
      datasetRunConfigId,
      staggerDelayMs,
      scheduledFor,
      ref,
      runAsUserId: resolvedRunAsUserId,
    });

    if (result.success) {
      if (!trigger.cronExpression) {
        await disableDatasetRunTriggerStep({ tenantId, projectId, scheduledTriggerId });
      }
      return { status: 'completed', datasetRunId: result.datasetRunId };
    }

    if (result.configDeleted) {
      await disableDatasetRunTriggerStep({ tenantId, projectId, scheduledTriggerId });
      return { status: 'stopped', reason: 'Dataset run config no longer exists' };
    }

    if (result.configMisconfigured) {
      await disableDatasetRunTriggerStep({ tenantId, projectId, scheduledTriggerId });
      return {
        status: 'stopped',
        reason: result.error ?? 'Configuration error — trigger disabled',
      };
    }

    lastError = result.error || 'Unknown error';

    await logStep('Dataset run attempt failed', {
      scheduledTriggerId,
      attemptNumber,
      error: lastError,
    });

    if (attemptNumber < maxAttempts) {
      attemptNumber++;
      const backoffMultiplier = 2 ** (attemptNumber - 1);
      const jitter = Math.random() * 0.3;
      await sleep(trigger.retryDelaySeconds * 1000 * backoffMultiplier * (1 + jitter));
    } else {
      break;
    }
  }

  if (!trigger.cronExpression) {
    await disableDatasetRunTriggerStep({ tenantId, projectId, scheduledTriggerId });
  }

  return { status: 'failed', error: lastError };
}

export const scheduledDatasetRunWorkflow = Object.assign(_scheduledDatasetRunWorkflow, {
  workflowId:
    'workflow//./src/domains/evals/workflow/functions/scheduledDatasetRun//_scheduledDatasetRunWorkflow',
});
