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
  interpolateTemplate,
  listPendingScheduledTriggerInvocations,
  markScheduledTriggerInvocationCompleted,
  markScheduledTriggerInvocationFailed,
  markScheduledTriggerInvocationRunning,
  type Part,
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
import { executeAgentAsync } from '../../services/TriggerService';

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
 */
export async function calculateNextExecutionStep(params: {
  cronExpression?: string | null;
  cronTimezone?: string | null;
  runAt?: string | null;
  lastScheduledFor?: string | null;
}): Promise<{ nextExecutionTime: string; isOneTime: boolean }> {
  'use step';

  const { cronExpression, cronTimezone, runAt, lastScheduledFor } = params;

  if (runAt) {
    // One-time trigger - use the runAt time
    return { nextExecutionTime: runAt, isOneTime: true };
  }

  if (cronExpression) {
    const baseDate = lastScheduledFor ? new Date(lastScheduledFor) : new Date();
    const interval = CronExpressionParser.parse(cronExpression, {
      currentDate: baseDate,
      tz: cronTimezone || 'UTC',
    });
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
 * Step: Compute sleep duration
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

  return {
    shouldContinue: true,
    trigger,
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
 * Step: Execute the scheduled trigger using executeAgentAsync.
 *
 * Uses the shared executeAgentAsync from TriggerService which includes
 * proper tracing, error handling, and conversation management.
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

  const {
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    invocationId,
    messageTemplate,
    payload,
    timeoutSeconds,
  } = params;

  logger.info(
    { scheduledTriggerId, invocationId },
    'Executing scheduled trigger via executeAgentAsync'
  );

  // Generate conversation ID upfront so we can return it even on failure
  const conversationId = generateId();

  try {
    // Resolve the project ref
    const ref = getProjectScopedRef(tenantId, projectId, 'main');
    const resolvedRef = await resolveRef(manageDbClient)(ref);

    if (!resolvedRef) {
      return {
        success: false,
        conversationId,
        error: `Failed to resolve ref for project ${projectId}`,
      };
    }

    // Build user message from template
    const effectivePayload = payload ?? {};
    let userMessage: string;
    if (messageTemplate) {
      userMessage = interpolateTemplate(messageTemplate, effectivePayload);
    } else {
      userMessage = JSON.stringify(effectivePayload);
    }

    // Create message parts
    const messageParts: Part[] = [];
    if (messageTemplate) {
      messageParts.push({ kind: 'text', text: userMessage });
    }
    messageParts.push({
      kind: 'data',
      data: effectivePayload,
      metadata: { source: 'scheduled-trigger', triggerId: scheduledTriggerId },
    });

    // Execute with timeout
    const timeoutMs = timeoutSeconds * 1000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Execution timed out after ${timeoutSeconds}s`)),
        timeoutMs
      );
    });

    await Promise.race([
      executeAgentAsync({
        tenantId,
        projectId,
        agentId,
        triggerId: scheduledTriggerId,
        invocationId,
        conversationId,
        userMessage,
        messageParts,
        resolvedRef,
      }),
      timeoutPromise,
    ]);

    logger.info(
      { scheduledTriggerId, invocationId, conversationId },
      'Scheduled trigger execution completed'
    );

    return {
      success: true,
      conversationId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { scheduledTriggerId, invocationId, conversationId, error: errorMessage },
      'Execute scheduled trigger step failed'
    );
    return {
      success: false,
      conversationId,
      error: errorMessage,
    };
  }
}
