/**
 * Service for managing scheduled trigger workflows.
 *
 * Handles starting, stopping, and restarting workflow runners
 * when scheduled triggers are created, updated, or deleted.
 */
import { start } from 'workflow/api';
import {
  getScheduledWorkflowByTriggerId,
  createScheduledWorkflow,
  updateScheduledWorkflowRunId,
  generateId,
  type ScheduledTrigger,
  type ScheduledWorkflow,
  type AgentsManageDatabaseClient,
} from '@inkeep/agents-core';
import { manageDbClient } from 'src/data/db';
import { getLogger } from '../../../logger';
import {
  scheduledTriggerRunnerWorkflow,
  type ScheduledTriggerRunnerPayload,
} from '../workflow/functions/scheduledTriggerRunner';

const logger = getLogger('ScheduledTriggerService');

/**
 * Get or create a scheduled workflow for a trigger.
 * Returns the workflow.
 * @param db - Optional branch-scoped database client. If not provided, uses manageDbClient.
 */
async function getOrCreateScheduledWorkflow(
  params: {
    tenantId: string;
    projectId: string;
    agentId: string;
    scheduledTriggerId: string;
    triggerName: string;
  },
  db?: AgentsManageDatabaseClient
): Promise<ScheduledWorkflow> {
  const { tenantId, projectId, agentId, scheduledTriggerId, triggerName } = params;
  const scopes = { tenantId, projectId, agentId };
  const dbClient = db ?? manageDbClient;

  // Check if workflow already exists for this trigger
  const existingWorkflow = await getScheduledWorkflowByTriggerId(dbClient)({
    scopes,
    scheduledTriggerId,
  });

  if (existingWorkflow) {
    return existingWorkflow;
  }

  // Create new workflow for this trigger
  const workflow = await createScheduledWorkflow(dbClient)({
    tenantId,
    projectId,
    agentId,
    id: generateId(),
    name: `Workflow for ${triggerName}`,
    scheduledTriggerId,
  });

  return workflow;
}

/**
 * Start a workflow runner for a scheduled trigger.
 * Returns the runner ID.
 * @param db - Optional branch-scoped database client. If not provided, uses manageDbClient.
 */
export async function startScheduledTriggerWorkflow(
  params: {
    tenantId: string;
    projectId: string;
    agentId: string;
    scheduledTriggerId: string;
    triggerName: string;
  },
  db?: AgentsManageDatabaseClient
): Promise<string> {
  const { tenantId, projectId, agentId, scheduledTriggerId, triggerName } = params;
  const scopes = { tenantId, projectId, agentId };
  const dbClient = db ?? manageDbClient;

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
  }, dbClient);

  // Start the workflow and capture the actual run ID
  // The start() function returns a Run object with a runId property (e.g., wrun_XXXXX)
  const run = await start(scheduledTriggerRunnerWorkflow, [payload]);
  const workflowRunId = run.runId;

  // Store the actual workflow run ID and set status to running
  await (updateScheduledWorkflowRunId(dbClient) as any)({
    scopes,
    scheduledWorkflowId: workflow.id,
    workflowRunId,
    status: 'running',
  });

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId, workflowRunId, scheduledWorkflowId: workflow.id },
    'Scheduled trigger workflow started'
  );

  return workflowRunId;
}

/**
 * Signal a workflow runner to stop by clearing its runner ID.
 * The workflow checks the workflowRunId before each execution,
 * so setting it to null effectively signals the workflow to stop.
 * @param db - Optional branch-scoped database client. If not provided, uses manageDbClient.
 */
export async function signalStopScheduledTriggerWorkflow(
  params: {
    tenantId: string;
    projectId: string;
    agentId: string;
    scheduledTriggerId: string;
  },
  db?: AgentsManageDatabaseClient
): Promise<void> {
  const { tenantId, projectId, agentId, scheduledTriggerId } = params;
  const scopes = { tenantId, projectId, agentId };
  const dbClient = db ?? manageDbClient;

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId },
    'Signaling scheduled trigger workflow to stop'
  );

  // Find the workflow for this trigger
  const workflow = await getScheduledWorkflowByTriggerId(dbClient)({
    scopes,
    scheduledTriggerId,
  });

  if (workflow) {
    // Clear the workflow run ID - this signals the workflow to stop
    await updateScheduledWorkflowRunId(dbClient)({
      scopes,
      scheduledWorkflowId: workflow.id,
      workflowRunId: null,
    });
  }

  logger.info(
    { tenantId, projectId, agentId, scheduledTriggerId },
    'Scheduled trigger workflow stop signaled'
  );
}

/**
 * Restart a workflow runner (signal old to stop and start new).
 * Used when trigger configuration changes.
 * @param db - Optional branch-scoped database client. If not provided, uses manageDbClient.
 */
export async function restartScheduledTriggerWorkflow(
  params: {
    tenantId: string;
    projectId: string;
    agentId: string;
    scheduledTriggerId: string;
    triggerName: string;
  },
  db?: AgentsManageDatabaseClient
): Promise<string> {
  const { tenantId, projectId, agentId, scheduledTriggerId, triggerName } = params;

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
    triggerName,
  }, db);
}

/**
 * Handle trigger creation - start workflow if enabled.
 * @param db - Optional branch-scoped database client. If not provided, uses manageDbClient.
 */
export async function onTriggerCreated(
  trigger: ScheduledTrigger,
  db?: AgentsManageDatabaseClient
): Promise<void> {
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
  }, db);
}

/**
 * Handle trigger update - restart workflow if needed.
 * @param db - Optional branch-scoped database client. If not provided, uses manageDbClient.
 */
export async function onTriggerUpdated(
  params: {
    trigger: ScheduledTrigger;
    previousEnabled: boolean;
    scheduleChanged: boolean;
  },
  db?: AgentsManageDatabaseClient
): Promise<void> {
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
    }, db);
    return;
  }

  // Case 3: Disabled -> enabled = start workflow
  if (!previousEnabled && trigger.enabled) {
    await startScheduledTriggerWorkflow({
      tenantId: trigger.tenantId,
      projectId: trigger.projectId,
      agentId: trigger.agentId,
      scheduledTriggerId: trigger.id,
      triggerName: trigger.name,
    }, db);
    return;
  }

  // Case 4: Still enabled but schedule changed = restart workflow
  if (scheduleChanged) {
    await restartScheduledTriggerWorkflow({
      tenantId: trigger.tenantId,
      projectId: trigger.projectId,
      agentId: trigger.agentId,
      scheduledTriggerId: trigger.id,
      triggerName: trigger.name,
    }, db);
  }
}

/**
 * Handle trigger deletion - signal workflow to stop.
 * The workflow will be automatically deleted via cascade when the trigger is deleted.
 * @param db - Optional branch-scoped database client. If not provided, uses manageDbClient.
 */
export async function onTriggerDeleted(
  trigger: ScheduledTrigger,
  db?: AgentsManageDatabaseClient
): Promise<void> {
  // Signal the workflow to stop - it will be cascade deleted with the trigger
  await signalStopScheduledTriggerWorkflow({
    tenantId: trigger.tenantId,
    projectId: trigger.projectId,
    agentId: trigger.agentId,
    scheduledTriggerId: trigger.id,
  }, db);
}
