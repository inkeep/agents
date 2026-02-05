/**
 * Step functions for scheduled trigger workflow.
 *
 * These step functions have full Node.js access and handle all database
 * operations and external service calls.
 */
import {
  addConversationIdToInvocation,
  createScheduledTriggerInvocation,
  deletePendingInvocationsForTrigger,
  generateId,
  getProjectScopedRef,
  getScheduledTriggerById,
  getScheduledTriggerInvocationById,
  getScheduledTriggerInvocationByIdempotencyKey,
  getScheduledWorkflowByTriggerId,
  listPendingScheduledTriggerInvocations,
  markScheduledTriggerInvocationCompleted,
  markScheduledTriggerInvocationFailed,
  markScheduledTriggerInvocationRunning,
  resolveRef,
  type ScheduledTriggerInvocation,
  updateScheduledTriggerInvocationStatus,
  withRef,
} from '@inkeep/agents-core';
import { CronExpressionParser } from 'cron-parser';
import { manageDbClient } from 'src/data/db';
import manageDbPool from '../../../../data/db/manageDbPool';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';

const logger = getLogger('workflow-scheduled-trigger-steps');

/**
 * Step: Log a message (allows logging from workflow context)
 */
export async function logStep(message: string, data: Record<string, unknown>) {
  'use step';
  logger.info(data, message);
}

/**
 * Step: Calculate the next execution time relative to a base time.
 * For cron, uses lastScheduledFor as base to prevent drift.
 */
export async function calculateNextExecutionStep(params: {
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
    const interval = CronExpressionParser.parse(cronExpression, { currentDate: baseDate });
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
export async function computeSleepDurationStep(targetTime: string): Promise<number> {
  'use step';

  const target = new Date(targetTime);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();

  // If target is in the past or very soon, use minimum delay
  return Math.max(diffMs, 1000);
}

/**
 * Step: Get the next pending invocation to execute (earliest scheduledFor).
 * Returns null if no pending invocations exist.
 */
export async function getNextPendingInvocationStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
}): Promise<ScheduledTriggerInvocation | null> {
  'use step';

  const invocations = await listPendingScheduledTriggerInvocations(runDbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    scheduledTriggerId: params.scheduledTriggerId,
    limit: 1,
  });

  return invocations[0] || null;
}

/**
 * Step: Delete all pending invocations for a trigger.
 * Used when cron expression changes or trigger is disabled.
 */
export async function deletePendingInvocationsStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
}): Promise<number> {
  'use step';

  const deletedCount = await deletePendingInvocationsForTrigger(runDbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    scheduledTriggerId: params.scheduledTriggerId,
  });

  logger.info(
    { scheduledTriggerId: params.scheduledTriggerId, deletedCount },
    'Deleted pending invocations'
  );

  return deletedCount;
}

/**
 * Step: Check if trigger is still enabled and this runner is authoritative.
 * Uses branch-scoped database queries for DoltgreS compatibility.
 */
export async function checkTriggerEnabledStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  runnerId: string;
}) {
  'use step';

  const scopes = {
    tenantId: params.tenantId,
    projectId: params.projectId,
    agentId: params.agentId,
  };

  // Resolve the branch ref for this project (DoltgreS uses branch-per-project)
  const ref = getProjectScopedRef(params.tenantId, params.projectId, 'main');
  const resolvedRef = await resolveRef(manageDbClient)(ref);

  if (!resolvedRef) {
    logger.warn(
      { tenantId: params.tenantId, projectId: params.projectId },
      'Failed to resolve ref for project, treating trigger as deleted'
    );
    return { shouldContinue: false, reason: 'deleted', trigger: null };
  }

  // Query the correct branch for the trigger and workflow
  const [trigger, workflow] = await withRef(manageDbPool, resolvedRef, async (db) => {
    return Promise.all([
      getScheduledTriggerById(db)({
        scopes,
        scheduledTriggerId: params.scheduledTriggerId,
      }),
      getScheduledWorkflowByTriggerId(db)({
        scopes,
        scheduledTriggerId: params.scheduledTriggerId,
      }),
    ]);
  });

  // If trigger was deleted or disabled, stop the workflow
  if (!trigger || !trigger.enabled) {
    logger.info(
      { scheduledTriggerId: params.scheduledTriggerId, reason: !trigger ? 'deleted' : 'disabled' },
      'Scheduled trigger workflow stopping'
    );
    return { shouldContinue: false, reason: !trigger ? 'deleted' : 'disabled', trigger: null };
  }

  // If workflowRunId changed in the workflow record, this runner was superseded
  if (workflow?.workflowRunId && workflow.workflowRunId !== params.runnerId) {
    logger.info(
      { scheduledTriggerId: params.scheduledTriggerId, reason: 'superseded' },
      'Scheduled trigger workflow stopping'
    );
    return { shouldContinue: false, reason: 'superseded', trigger: null };
  }

  // Apply defaults for fields that DoltgreS doesn't honor defaults for
  // Use explicit validation to handle null, undefined, AND NaN values
  // (NaN can occur due to workflow serialization issues)
  const safeMaxRetries =
    typeof trigger.maxRetries === 'number' && !Number.isNaN(trigger.maxRetries)
      ? trigger.maxRetries
      : 3;
  const safeRetryDelaySeconds =
    typeof trigger.retryDelaySeconds === 'number' && !Number.isNaN(trigger.retryDelaySeconds)
      ? trigger.retryDelaySeconds
      : 60;
  const safeTimeoutSeconds =
    typeof trigger.timeoutSeconds === 'number' && !Number.isNaN(trigger.timeoutSeconds)
      ? trigger.timeoutSeconds
      : 300;

  logger.debug(
    {
      scheduledTriggerId: params.scheduledTriggerId,
      'trigger.maxRetries': trigger.maxRetries,
      'typeof trigger.maxRetries': typeof trigger.maxRetries,
      'isNaN trigger.maxRetries': Number.isNaN(trigger.maxRetries),
      safeMaxRetries,
      safeRetryDelaySeconds,
      safeTimeoutSeconds,
    },
    'Applying defaults in checkTriggerEnabledStep'
  );

  return {
    shouldContinue: true,
    trigger: {
      ...trigger,
      maxRetries: safeMaxRetries,
      retryDelaySeconds: safeRetryDelaySeconds,
      timeoutSeconds: safeTimeoutSeconds,
    },
  };
}

/**
 * Step: Try to create invocation idempotently.
 * Returns existing invocation if already created.
 */
export async function createInvocationIdempotentStep(params: {
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
 * Step: Check if invocation was cancelled before execution
 * Returns true if cancelled (should skip execution), false otherwise
 */
export async function checkInvocationCancelledStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  invocationId: string;
}): Promise<{ cancelled: boolean }> {
  'use step';

  const invocation = await getScheduledTriggerInvocationById(runDbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    scheduledTriggerId: params.scheduledTriggerId,
    invocationId: params.invocationId,
  });

  if (!invocation) {
    logger.warn(
      { scheduledTriggerId: params.scheduledTriggerId, invocationId: params.invocationId },
      'Invocation not found when checking cancellation status'
    );
    return { cancelled: true }; // Treat missing as cancelled
  }

  if (invocation.status === 'cancelled') {
    logger.info(
      { scheduledTriggerId: params.scheduledTriggerId, invocationId: params.invocationId },
      'Invocation was cancelled, skipping execution'
    );
    return { cancelled: true };
  }

  return { cancelled: false };
}

/**
 * Step: Mark invocation as running
 */
export async function markRunningStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  invocationId: string;
}) {
  'use step';

  logger.info(
    { scheduledTriggerId: params.scheduledTriggerId, invocationId: params.invocationId },
    'Marking invocation as running'
  );

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
 * Step: Add a conversation ID to the invocation's conversationIds array
 * Called after each attempt to track all conversations created during retries
 */
export async function addConversationIdStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  invocationId: string;
  conversationId: string;
}) {
  'use step';

  return addConversationIdToInvocation(runDbClient)({
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
 * Step: Mark invocation as completed
 */
export async function markCompletedStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  invocationId: string;
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
  });
}

/**
 * Step: Mark invocation as failed
 */
export async function markFailedStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  invocationId: string;
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
  });
}

/**
 * Step: Increment attempt number for retry
 */
export async function incrementAttemptStep(params: {
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
 * Step: Execute the scheduled trigger via HTTP call to main server.
 *
 * This step makes an HTTP call to the internal execution endpoint instead of
 * executing directly. This is necessary because workflow steps run in a bundled
 * context with their own module instances (including agentSessionManager).
 * By calling the main server via HTTP, execution happens in the correct context
 * where all singletons are shared and event recording works properly.
 */
export async function executeScheduledTriggerStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  invocationId: string;
  messageTemplate?: string | null;
  payload?: Record<string, unknown> | null;
  timeoutSeconds: number;
}): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  'use step';

  logger.info(
    { scheduledTriggerId: params.scheduledTriggerId, invocationId: params.invocationId },
    'Executing scheduled trigger via HTTP'
  );

  try {
    const baseUrl = process.env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
    const apiKey = process.env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET || '';
    const url = `${baseUrl}/run/tenants/${params.tenantId}/projects/${params.projectId}/agents/${params.agentId}/scheduled-triggers/internal/execute`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'x-inkeep-tenant-id': params.tenantId,
        'x-inkeep-project-id': params.projectId,
        'x-inkeep-agent-id': params.agentId,
      },
      body: JSON.stringify({
        scheduledTriggerId: params.scheduledTriggerId,
        invocationId: params.invocationId,
        messageTemplate: params.messageTemplate,
        payload: params.payload,
        timeoutSeconds: params.timeoutSeconds,
      }),
    });

    const result = (await response.json()) as {
      success: boolean;
      conversationId?: string;
      error?: string;
    };

    // Return conversationId even on failure - it's generated before execution starts
    // and we want to link the conversation to the invocation for debugging
    if (!response.ok || !result.success) {
      logger.error(
        {
          scheduledTriggerId: params.scheduledTriggerId,
          invocationId: params.invocationId,
          conversationId: result.conversationId,
          error: result.error,
        },
        'Scheduled trigger execution failed via HTTP'
      );
      return {
        success: false,
        conversationId: result.conversationId,
        error: result.error || `HTTP ${response.status}: Execution failed`,
      };
    }

    logger.info(
      {
        scheduledTriggerId: params.scheduledTriggerId,
        invocationId: params.invocationId,
        conversationId: result.conversationId,
      },
      'Scheduled trigger execution completed via HTTP'
    );

    return {
      success: true,
      conversationId: result.conversationId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ ...params, error: errorMessage }, 'Execute scheduled trigger step failed');
    return {
      success: false,
      error: errorMessage,
    };
  }
}
