/**
 * Service for managing scheduled trigger workflows.
 *
 * Handles starting, stopping, and restarting workflow runners
 * when scheduled triggers are created, updated, or deleted.
 */

import {
  cancelPastPendingInvocationsForTrigger,
  cancelPendingInvocationsForTrigger,
  createScheduledWorkflow,
  generateId,
  getProjectScopedRef,
  getScheduledWorkflowByTriggerId,
  resolveRef,
  type ScheduledTrigger,
  type ScheduledWorkflow,
  updateScheduledWorkflowRunId,
  withRef,
} from '@inkeep/agents-core';
import { manageDbClient } from 'src/data/db';
import manageDbPool from 'src/data/db/manageDbPool';
import runDbClient from 'src/data/db/runDbClient';
import { start } from 'workflow/api';
import { getLogger } from '../../../logger';
import {
  type ScheduledTriggerRunnerPayload,
  scheduledTriggerRunnerWorkflow,
} from '../workflow/functions/scheduledTriggerRunner';

const logger = getLogger('ScheduledTriggerService');

/**
 * Get or create a scheduled workflow for a trigger.
 * Uses branch-scoped database connection for DoltgreSQL compatibility.
 */
async function getOrCreateScheduledWorkflow(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  triggerName: string;
}): Promise<ScheduledWorkflow> {
  const { tenantId, projectId, agentId, scheduledTriggerId, triggerName } = params;
  const scopes = { tenantId, projectId, agentId };

  // Get branch-scoped ref for proper DoltgreSQL query context
  const ref = getProjectScopedRef(tenantId, projectId, 'main');
  const resolvedRef = await resolveRef(manageDbClient)(ref);

  if (!resolvedRef) {
    throw new Error(`Failed to resolve ref for project ${projectId}`);
  }

  return withRef(manageDbPool, resolvedRef, async (db) => {
    // Check if workflow already exists for this trigger
    const existingWorkflow = await getScheduledWorkflowByTriggerId(db)({
      scopes,
      scheduledTriggerId,
    });

    if (existingWorkflow) {
      return existingWorkflow;
    }

    // Create new workflow for this trigger
    const workflow = await createScheduledWorkflow(db)({
      tenantId,
      projectId,
      agentId,
      id: generateId(),
      name: `Workflow for ${triggerName}`,
      scheduledTriggerId,
    });

    return workflow;
  });
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
  triggerName: string;
}): Promise<string> {
  const { tenantId, projectId, agentId, scheduledTriggerId, triggerName } = params;
  const scopes = { tenantId, projectId, agentId };

  const payload: ScheduledTriggerRunnerPayload = {
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
  };

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId },
    'Starting scheduled trigger workflow'
  );

  // Get or create the scheduled workflow for this trigger
  const workflow = await getOrCreateScheduledWorkflow({
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    triggerName,
  });
  const run = await start(scheduledTriggerRunnerWorkflow, [payload]);
  const workflowRunId = run.runId;

  // Get branch-scoped ref for proper DoltgreSQL query context
  const ref = getProjectScopedRef(tenantId, projectId, 'main');
  const resolvedRef = await resolveRef(manageDbClient)(ref);
  if (!resolvedRef) {
    throw new Error(`Failed to resolve ref for project ${projectId}`);
  }

  await withRef(manageDbPool, resolvedRef, async (db) => {
    await (updateScheduledWorkflowRunId(db) as any)({
      scopes,
      scheduledWorkflowId: workflow.id,
      workflowRunId,
      status: 'running',
    });
  });

  logger.info(
    {
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      workflowRunId,
      scheduledWorkflowId: workflow.id,
    },
    'Scheduled trigger workflow started'
  );

  return workflowRunId;
}

/**
 * Signal a workflow runner to stop by clearing its runner ID.
 */
export async function signalStopScheduledTriggerWorkflow(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
}): Promise<void> {
  const { tenantId, projectId, agentId, scheduledTriggerId } = params;
  const scopes = { tenantId, projectId, agentId };

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId },
    'Signaling scheduled trigger workflow to stop'
  );

  // Get branch-scoped ref for proper DoltgreSQL query context
  const ref = getProjectScopedRef(tenantId, projectId, 'main');
  const resolvedRef = await resolveRef(manageDbClient)(ref);
  if (!resolvedRef) {
    logger.warn(
      { tenantId, projectId, agentId, scheduledTriggerId },
      'Failed to resolve ref, cannot signal workflow stop'
    );
    return;
  }

  await withRef(manageDbPool, resolvedRef, async (db) => {
    // Find the workflow for this trigger
    const workflow = await getScheduledWorkflowByTriggerId(db)({
      scopes,
      scheduledTriggerId,
    });

    if (workflow) {
      await updateScheduledWorkflowRunId(db)({
        scopes,
        scheduledWorkflowId: workflow.id,
        workflowRunId: null,
      });
    }
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
  triggerName: string;
}): Promise<string> {
  const { tenantId, projectId, agentId, scheduledTriggerId, triggerName } = params;

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId },
    'Restarting scheduled trigger workflow'
  );

  // Starting a new workflow automatically supersedes the old one bc of new workflow runId
  return startScheduledTriggerWorkflow({
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    triggerName,
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
    triggerName: trigger.name,
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
  // (past invocations will be cleaned up when re-enabled)
  if (previousEnabled && !trigger.enabled) {
    await signalStopScheduledTriggerWorkflow({
      tenantId: trigger.tenantId,
      projectId: trigger.projectId,
      agentId: trigger.agentId,
      scheduledTriggerId: trigger.id,
    });
    return;
  }

  // Case 3: Disabled -> enabled = cancel past pending invocations and start workflow
  if (!previousEnabled && trigger.enabled) {
    // Cancel any pending invocations that are now in the past
    const cancelledCount = await cancelPastPendingInvocationsForTrigger(runDbClient)({
      scopes: {
        tenantId: trigger.tenantId,
        projectId: trigger.projectId,
        agentId: trigger.agentId,
      },
      scheduledTriggerId: trigger.id,
    });

    if (cancelledCount > 0) {
      logger.info(
        { scheduledTriggerId: trigger.id, cancelledCount },
        'Cancelled past pending invocations on trigger re-enable'
      );
    }

    await startScheduledTriggerWorkflow({
      tenantId: trigger.tenantId,
      projectId: trigger.projectId,
      agentId: trigger.agentId,
      scheduledTriggerId: trigger.id,
      triggerName: trigger.name,
    });
    return;
  }

  // Case 4: Still enabled but schedule changed = cancel pending and restart workflow
  if (scheduleChanged) {
    const cancelledCount = await cancelPendingInvocationsForTrigger(runDbClient)({
      scopes: {
        tenantId: trigger.tenantId,
        projectId: trigger.projectId,
        agentId: trigger.agentId,
      },
      scheduledTriggerId: trigger.id,
    });

    if (cancelledCount > 0) {
      logger.info(
        { scheduledTriggerId: trigger.id, cancelledCount },
        'Cancelled pending invocations on schedule change'
      );
    }

    await restartScheduledTriggerWorkflow({
      tenantId: trigger.tenantId,
      projectId: trigger.projectId,
      agentId: trigger.agentId,
      scheduledTriggerId: trigger.id,
      triggerName: trigger.name,
    });
  }
}

/**
 * Handle trigger deletion - signal workflow to stop.
 * The workflow will be automatically deleted via cascade when the trigger is deleted.
 */
export async function onTriggerDeleted(trigger: ScheduledTrigger): Promise<void> {
  await signalStopScheduledTriggerWorkflow({
    tenantId: trigger.tenantId,
    projectId: trigger.projectId,
    agentId: trigger.agentId,
    scheduledTriggerId: trigger.id,
  });
}
