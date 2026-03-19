/**
 * Step functions for scheduled trigger workflow.
 *
 * These step functions have full Node.js access and handle all database
 * operations and external service calls.
 */
import {
  addConversationIdToInvocation,
  canUseProjectStrict,
  countRunningInvocationsForTrigger,
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
  updateScheduledWorkflowRunId,
  withRef,
} from '@inkeep/agents-core';
import { CronExpressionParser } from 'cron-parser';
import { manageDbClient } from 'src/data/db';
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
  parentRunId?: string | null;
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
    // Adoption: parent called start() to create this child but crashed before updating
    // the DB with the child's runId. DB still holds the parent's ID, so adopt it.
    if (params.parentRunId && workflow.workflowRunId === params.parentRunId) {
      try {
        await withRef(manageDbPool, resolvedRef, async (db) => {
          await updateScheduledWorkflowRunId(db)({
            scopes,
            scheduledWorkflowId: workflow.id,
            workflowRunId: params.runnerId,
            status: 'running',
          });
        });
      } catch (err) {
        logger.error(
          {
            scheduledTriggerId: params.scheduledTriggerId,
            parentRunId: params.parentRunId,
            runnerId: params.runnerId,
            error: err instanceof Error ? err.message : String(err),
          },
          'Failed to adopt workflowRunId — step will be retried by workflow framework'
        );
        throw err;
      }
      logger.info(
        {
          scheduledTriggerId: params.scheduledTriggerId,
          parentRunId: params.parentRunId,
          newRunnerId: params.runnerId,
        },
        'Child workflow adopted workflowRunId from parent'
      );
    } else {
      logger.info(
        { scheduledTriggerId: params.scheduledTriggerId, reason: 'superseded' },
        'Scheduled trigger workflow stopping'
      );
      return { shouldContinue: false, reason: 'superseded', trigger: null };
    }
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
 * Step: Create fan-out invocations for a trigger with an audience.
 * Creates one invocation per userId in the audience, each with a unique idempotency key.
 * Returns the count of newly created invocations (skips existing via idempotency).
 */
export async function createFanOutInvocationsStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  scheduledFor: string;
  payload: Record<string, unknown> | null;
  userIds: string[];
  idempotencyKeyPrefix: string;
}): Promise<{ created: number; skipped: number }> {
  'use step';

  const ref = getProjectScopedRef(params.tenantId, params.projectId, 'main');
  const resolvedRef = await resolveRef(manageDbClient)(ref);

  let created = 0;
  let skipped = 0;

  for (const userId of params.userIds) {
    const idempotencyKey = `${params.idempotencyKeyPrefix}_${userId}`;

    const existing = await getScheduledTriggerInvocationByIdempotencyKey(runDbClient)({
      idempotencyKey,
    });

    if (existing) {
      skipped++;
      continue;
    }

    await createScheduledTriggerInvocation(runDbClient)({
      id: generateId(),
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
      scheduledTriggerId: params.scheduledTriggerId,
      ref: resolvedRef ?? undefined,
      status: 'pending',
      scheduledFor: params.scheduledFor,
      resolvedPayload: params.payload,
      idempotencyKey,
      attemptNumber: 1,
      recipientUserId: userId,
    });

    created++;
  }

  logger.info(
    {
      scheduledTriggerId: params.scheduledTriggerId,
      scheduledFor: params.scheduledFor,
      totalUsers: params.userIds.length,
      created,
      skipped,
    },
    'Fan-out invocations created'
  );

  return { created, skipped };
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

/**
 * Step: Count currently running invocations for a trigger.
 * Used by concurrency control to gate new invocation starts.
 */
export async function countRunningInvocationsStep(params: {
  scheduledTriggerId: string;
}): Promise<number> {
  'use step';

  return countRunningInvocationsForTrigger(runDbClient)({
    scheduledTriggerId: params.scheduledTriggerId,
  });
}

/**
 * Step: List ALL pending invocations for a trigger (up to a limit).
 * Used by concurrency-controlled dispatch to get the full work queue.
 */
export async function listAllPendingInvocationsStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
}): Promise<ScheduledTriggerInvocation[]> {
  'use step';

  return listPendingScheduledTriggerInvocations(runDbClient)({
    scopes: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      agentId: params.agentId,
    },
    scheduledTriggerId: params.scheduledTriggerId,
    limit: 100,
  });
}

/**
 * Step: Process a batch of invocations with concurrency control.
 * Launches up to maxConcurrent invocations in parallel, enforces stagger interval,
 * and handles retries independently per invocation.
 * Returns after all invocations in the batch have completed (or failed).
 */
export async function processInvocationBatchStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  invocations: ScheduledTriggerInvocation[];
  maxConcurrentInvocations: number;
  staggerIntervalSeconds: number;
  maxRetries: number;
  retryDelaySeconds: number;
  messageTemplate?: string | null;
  payload?: Record<string, unknown> | null;
  timeoutSeconds: number;
  runAsUserId?: string | null;
  cronTimezone?: string | null;
}): Promise<{
  completed: number;
  failed: number;
  cancelled: number;
}> {
  'use step';

  const {
    tenantId,
    projectId,
    agentId,
    scheduledTriggerId,
    invocations,
    maxConcurrentInvocations,
    staggerIntervalSeconds,
    maxRetries,
    retryDelaySeconds,
    messageTemplate,
    payload,
    timeoutSeconds,
    runAsUserId,
    cronTimezone,
  } = params;

  const scopes = { tenantId, projectId, agentId };
  const staggerMs = staggerIntervalSeconds * 1000;
  let completed = 0;
  let failed = 0;
  let cancelled = 0;

  const processOne = async (invocation: ScheduledTriggerInvocation) => {
    const inv = await getScheduledTriggerInvocationById(runDbClient)({
      scopes,
      scheduledTriggerId,
      invocationId: invocation.id,
    });

    if (!inv || inv.status === 'cancelled') {
      cancelled++;
      return;
    }

    let attemptNumber = inv.attemptNumber;
    const maxAttempts = maxRetries + 1;
    let lastError: string | null = null;

    while (attemptNumber <= maxAttempts) {
      const freshInv = await getScheduledTriggerInvocationById(runDbClient)({
        scopes,
        scheduledTriggerId,
        invocationId: invocation.id,
      });
      if (freshInv?.status === 'cancelled') {
        cancelled++;
        return;
      }

      await markScheduledTriggerInvocationRunning(runDbClient)({
        scopes,
        scheduledTriggerId,
        invocationId: invocation.id,
      });

      const effectiveRunAsUserId = invocation.recipientUserId || runAsUserId;

      const result = await executeScheduledTriggerStep({
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        invocationId: invocation.id,
        messageTemplate,
        payload,
        timeoutSeconds,
        runAsUserId: effectiveRunAsUserId,
        cronTimezone,
      });

      if (result.conversationId) {
        await addConversationIdToInvocation(runDbClient)({
          scopes,
          scheduledTriggerId,
          invocationId: invocation.id,
          conversationId: result.conversationId,
        });
      }

      if (result.success) {
        await markScheduledTriggerInvocationCompleted(runDbClient)({
          scopes,
          scheduledTriggerId,
          invocationId: invocation.id,
        });
        completed++;
        lastError = null;
        return;
      }

      lastError = result.error || 'Unknown error';
      logger.info(
        { scheduledTriggerId, invocationId: invocation.id, attemptNumber, error: lastError },
        'Batch invocation execution failed'
      );

      if (attemptNumber < maxAttempts) {
        await updateScheduledTriggerInvocationStatus(runDbClient)({
          scopes,
          scheduledTriggerId,
          invocationId: invocation.id,
          data: { attemptNumber: attemptNumber + 1, status: 'pending' },
        });
        attemptNumber++;
        const jitter = Math.random() * 0.3;
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelaySeconds * 1000 * (1 + jitter))
        );
      } else {
        break;
      }
    }

    if (lastError) {
      await markScheduledTriggerInvocationFailed(runDbClient)({
        scopes,
        scheduledTriggerId,
        invocationId: invocation.id,
      });
      failed++;
    }
  };

  const pending = [...invocations];
  const inFlight = new Set<Promise<void>>();

  const launchNext = () => {
    const inv = pending.shift();
    if (!inv) return null;
    let resolve: () => void;
    const sentinel = new Promise<void>((r) => {
      resolve = r;
    });
    const task = processOne(inv).finally(() => {
      inFlight.delete(sentinel);
      resolve();
    });
    // Suppress unhandled rejection - errors are tracked inside processOne
    task.catch(() => {});
    inFlight.add(sentinel);
    return sentinel;
  };

  // Launch initial batch up to maxConcurrent, with stagger between each
  for (let i = 0; i < Math.min(maxConcurrentInvocations, invocations.length); i++) {
    launchNext();
    if (staggerMs > 0 && i < maxConcurrentInvocations - 1 && pending.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, staggerMs));
    }
  }

  // As invocations complete, launch more until all are processed
  while (inFlight.size > 0) {
    await Promise.race([...inFlight]);
    // Launch new invocations to fill freed slots, with stagger
    while (pending.length > 0 && inFlight.size < maxConcurrentInvocations) {
      if (staggerMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, staggerMs));
      }
      launchNext();
    }
  }

  logger.info(
    { scheduledTriggerId, completed, failed, cancelled, total: invocations.length },
    'Batch invocation processing complete'
  );

  return { completed, failed, cancelled };
}
