/**
 * Service for managing scheduled trigger workflows.
 *
 * Handles starting, stopping, and restarting workflow runners
 * when scheduled triggers are created, updated, or deleted.
 */
import { start } from 'workflow/api';
import {
  updateScheduledTriggerWorkflowId,
  type ScheduledTrigger,
} from '@inkeep/agents-core';
import { manageDbClient } from 'src/data/db';
import { getLogger } from '../../../logger';
import {
  scheduledTriggerRunnerWorkflow,
  type ScheduledTriggerRunnerPayload,
} from '../workflow/functions/scheduledTriggerRunner';

const logger = getLogger('ScheduledTriggerService');

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
 * Start a workflow runner for a scheduled trigger.
 * Returns the runner ID.
 */
export async function startScheduledTriggerWorkflow(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
}): Promise<string> {
  const { tenantId, projectId, agentId, scheduledTriggerId } = params;

  // Generate deterministic runner ID
  const runnerId = generateDeterministicRunnerId(tenantId, projectId, agentId, scheduledTriggerId);

  const payload: ScheduledTriggerRunnerPayload = {
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
  };

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId, runnerId },
    'Starting scheduled trigger workflow'
  );

  // Update the trigger with the runner ID first
  // This ensures the workflow can verify it's authoritative when it starts
  await updateScheduledTriggerWorkflowId(manageDbClient)({
    scopes: { tenantId, projectId, agentId },
    scheduledTriggerId,
    workflowRunId: runnerId,
  });

  // Start the workflow
  await start(scheduledTriggerRunnerWorkflow, [payload]);

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId, runnerId },
    'Scheduled trigger workflow started'
  );

  return runnerId;
}

/**
 * Signal a workflow runner to stop by clearing its runner ID.
 * The workflow checks the workflowRunId before each execution,
 * so setting it to null effectively signals the workflow to stop.
 */
export async function signalStopScheduledTriggerWorkflow(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
}): Promise<void> {
  const { tenantId, projectId, agentId, scheduledTriggerId } = params;

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId },
    'Signaling scheduled trigger workflow to stop'
  );

  // Clear the workflow run ID - this signals the workflow to stop
  await updateScheduledTriggerWorkflowId(manageDbClient)({
    scopes: { tenantId, projectId, agentId },
    scheduledTriggerId,
    workflowRunId: null,
  });

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId },
    'Scheduled trigger workflow stop signaled'
  );
}

/**
 * Restart a workflow runner (signal old to stop and start new).
 * Used when trigger configuration changes.
 */
export async function restartScheduledTriggerWorkflow(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
}): Promise<string> {
  const { tenantId, projectId, agentId, scheduledTriggerId } = params;

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId },
    'Restarting scheduled trigger workflow'
  );

  // Starting a new workflow automatically supersedes the old one
  // because the workflowRunId will change
  return startScheduledTriggerWorkflow({
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
  });
}

/**
 * Handle trigger creation - start workflow if enabled.
 */
export async function onTriggerCreated(trigger: ScheduledTrigger): Promise<void> {
  if (!trigger.enabled) {
    logger.info(
      { scheduledTriggerId: trigger.id },
      'Trigger created but disabled, not starting workflow'
    );
    return;
  }

  await startScheduledTriggerWorkflow({
    tenantId: trigger.tenantId,
    projectId: trigger.projectId,
    agentId: trigger.agentId,
    scheduledTriggerId: trigger.id,
  });
}

/**
 * Handle trigger update - restart workflow if needed.
 */
export async function onTriggerUpdated(params: {
  trigger: ScheduledTrigger;
  previousEnabled: boolean;
  scheduleChanged: boolean;
}): Promise<void> {
  const { trigger, previousEnabled, scheduleChanged } = params;

  // Case 1: Disabled -> still disabled = no action
  if (!previousEnabled && !trigger.enabled) {
    return;
  }

  // Case 2: Enabled -> disabled = signal workflow to stop
  if (previousEnabled && !trigger.enabled) {
    await signalStopScheduledTriggerWorkflow({
      tenantId: trigger.tenantId,
      projectId: trigger.projectId,
      agentId: trigger.agentId,
      scheduledTriggerId: trigger.id,
    });
    return;
  }

  // Case 3: Disabled -> enabled = start workflow
  if (!previousEnabled && trigger.enabled) {
    await startScheduledTriggerWorkflow({
      tenantId: trigger.tenantId,
      projectId: trigger.projectId,
      agentId: trigger.agentId,
      scheduledTriggerId: trigger.id,
    });
    return;
  }

  // Case 4: Still enabled but schedule changed = restart workflow
  if (scheduleChanged) {
    await restartScheduledTriggerWorkflow({
      tenantId: trigger.tenantId,
      projectId: trigger.projectId,
      agentId: trigger.agentId,
      scheduledTriggerId: trigger.id,
    });
  }
}

/**
 * Handle trigger deletion - signal workflow to stop.
 */
export async function onTriggerDeleted(trigger: ScheduledTrigger): Promise<void> {
  if (trigger.workflowRunId) {
    await signalStopScheduledTriggerWorkflow({
      tenantId: trigger.tenantId,
      projectId: trigger.projectId,
      agentId: trigger.agentId,
      scheduledTriggerId: trigger.id,
    });
  }
}
