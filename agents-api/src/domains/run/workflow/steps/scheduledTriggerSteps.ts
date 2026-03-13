/**
 * Step functions for scheduled trigger workflow.
 *
 * These step functions have full Node.js access and handle all database
 * operations and external service calls.
 */
import {
  addConversationIdToInvocation,
  canUseProjectStrict,
  createScheduledTriggerInvocation,
  generateId,
  getProjectScopedRef,
  getScheduledTriggerById,
  getScheduledTriggerInvocationById,
  getScheduledTriggerInvocationByIdempotencyKey,
  interpolateTemplate,
  markScheduledTriggerInvocationCompleted,
  markScheduledTriggerInvocationFailed,
  markScheduledTriggerInvocationRunning,
  type Part,
  resetCancelledInvocationToPending,
  resolveRef,
  updateScheduledTriggerInvocationStatus,
  withRef,
} from '@inkeep/agents-core';
import { manageDbClient } from '../../../../data/db';
import manageDbPool from '../../../../data/db/manageDbPool';
import runDbClient from '../../../../data/db/runDbClient';
import { getLogger } from '../../../../logger';
import { buildTimezoneHeaders, executeAgentAsync } from '../../services/TriggerService';

const logger = getLogger('workflow-scheduled-trigger-steps');

/**
 * Step: Log a message (allows logging from workflow context)
 */
export async function logStep(message: string, data: Record<string, unknown>) {
  'use step';
  logger.info(data, message);
}

/**
 * Step: Check if trigger is still enabled.
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

  const ref = getProjectScopedRef(params.tenantId, params.projectId, 'main');
  const resolvedRef = await resolveRef(manageDbClient)(ref);

  if (!resolvedRef) {
    logger.warn(
      { tenantId: params.tenantId, projectId: params.projectId },
      'Failed to resolve ref for project, treating trigger as deleted'
    );
    return { shouldContinue: false, reason: 'deleted' as const, trigger: null };
  }

  const trigger = await withRef(manageDbPool, resolvedRef, async (db) => {
    return getScheduledTriggerById(db)({
      scopes,
      scheduledTriggerId: params.scheduledTriggerId,
    });
  });

  if (!trigger || !trigger.enabled) {
    logger.info(
      { scheduledTriggerId: params.scheduledTriggerId, reason: !trigger ? 'deleted' : 'disabled' },
      'Scheduled trigger workflow stopping'
    );
    return {
      shouldContinue: false,
      reason: (!trigger ? 'deleted' : 'disabled') as 'deleted' | 'disabled',
      trigger: null,
    };
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

  const ref = getProjectScopedRef(params.tenantId, params.projectId, 'main');
  const resolvedRef = await resolveRef(manageDbClient)(ref);

  if (!resolvedRef) {
    logger.warn(
      { tenantId: params.tenantId, projectId: params.projectId },
      'Failed to resolve ref for project, run will not be associated with a branch'
    );
  }

  const invocationId = generateId();

  const invocation = await createScheduledTriggerInvocation(runDbClient)({
    id: invocationId,
    tenantId: params.tenantId,
    projectId: params.projectId,
    agentId: params.agentId,
    scheduledTriggerId: params.scheduledTriggerId,
    ref: resolvedRef ?? undefined,
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
 * Step: Reset a cancelled invocation back to pending.
 * Used when a restarted workflow finds a cancelled invocation via idempotency
 * that is still scheduled for a future time.
 */
export async function resetInvocationToPendingStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  invocationId: string;
}) {
  'use step';

  const updated = await resetCancelledInvocationToPending(runDbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    scheduledTriggerId: params.scheduledTriggerId,
    invocationId: params.invocationId,
  });

  if (updated) {
    logger.info(
      { scheduledTriggerId: params.scheduledTriggerId, invocationId: params.invocationId },
      'Reset cancelled invocation to pending'
    );
  } else {
    logger.warn(
      { scheduledTriggerId: params.scheduledTriggerId, invocationId: params.invocationId },
      'Skipped reset — invocation status changed concurrently (no longer cancelled)'
    );
  }

  return updated;
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
  runAsUserId?: string | null;
  cronTimezone?: string | null;
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
    runAsUserId,
    cronTimezone,
  } = params;

  if (runAsUserId) {
    try {
      const canUse = await canUseProjectStrict({
        userId: runAsUserId,
        tenantId,
        projectId,
      });

      if (!canUse) {
        logger.warn(
          { scheduledTriggerId, invocationId, runAsUserId, projectId },
          'User no longer has access to project, failing invocation'
        );
        return {
          success: false,
          error: `User ${runAsUserId} no longer has 'use' permission on project ${projectId}. An org admin should update or remove the runAsUserId on this trigger.`,
        };
      }
    } catch (err) {
      logger.error(
        { scheduledTriggerId, invocationId, runAsUserId, projectId, error: err },
        'Failed to check user project access'
      );
      return {
        success: false,
        error: `Permission check failed for user ${runAsUserId}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  logger.info(
    { scheduledTriggerId, invocationId, runAsUserId },
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
        runAsUserId: runAsUserId ?? undefined,
        forwardedHeaders: buildTimezoneHeaders(cronTimezone),
        invocationType: 'scheduled_trigger',
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
