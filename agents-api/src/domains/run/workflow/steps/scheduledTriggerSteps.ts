/**
 * Step functions for scheduled trigger workflow.
 *
 * These step functions have full Node.js access and handle all database
 * operations and external service calls.
 */
import {
  createScheduledTriggerInvocation,
  generateId,
  getProjectScopedRef,
  getScheduledTriggerById,
  getScheduledTriggerInvocationByIdempotencyKey,
  markScheduledTriggerInvocationCompleted,
  markScheduledTriggerInvocationFailed,
  markScheduledTriggerInvocationRunning,
  resolveRef,
  updateScheduledTriggerInvocationStatus,
  withRef,
} from '@inkeep/agents-core';
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CronExpressionParser } = require('cron-parser');
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

  // Query the correct branch for the trigger
  const trigger = await withRef(manageDbPool, resolvedRef, async (db) => {
    return getScheduledTriggerById(db)({
      scopes: {
        tenantId: params.tenantId,
        projectId: params.projectId,
        agentId: params.agentId,
      },
      scheduledTriggerId: params.scheduledTriggerId,
    });
  });

  // If trigger was deleted or disabled, stop the workflow
  if (!trigger || !trigger.enabled) {
    logger.info(
      { scheduledTriggerId: params.scheduledTriggerId, reason: !trigger ? 'deleted' : 'disabled' },
      'Scheduled trigger workflow stopping'
    );
    return { shouldContinue: false, reason: !trigger ? 'deleted' : 'disabled', trigger: null };
  }

  // If workflowRunId changed, this workflow was superseded by a new runner
  if (trigger.workflowRunId && trigger.workflowRunId !== params.runnerId) {
    logger.info(
      { scheduledTriggerId: params.scheduledTriggerId, reason: 'superseded' },
      'Scheduled trigger workflow stopping'
    );
    return { shouldContinue: false, reason: 'superseded', trigger: null };
  }

  // Apply defaults for fields that DoltgreS doesn't honor defaults for
  // Use explicit validation to handle null, undefined, AND NaN values
  // (NaN can occur due to workflow serialization issues)
  const safeMaxRetries = typeof trigger.maxRetries === 'number' && !Number.isNaN(trigger.maxRetries) 
    ? trigger.maxRetries 
    : 3;
  const safeRetryDelaySeconds = typeof trigger.retryDelaySeconds === 'number' && !Number.isNaN(trigger.retryDelaySeconds) 
    ? trigger.retryDelaySeconds 
    : 60;
  const safeTimeoutSeconds = typeof trigger.timeoutSeconds === 'number' && !Number.isNaN(trigger.timeoutSeconds) 
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
 * Step: Mark invocation as completed
 */
export async function markCompletedStep(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  scheduledTriggerId: string;
  invocationId: string;
  conversationId?: string;
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
    conversationId: params.conversationId,
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
  errorMessage: string;
  errorCode?: string;
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
    errorMessage: params.errorMessage,
    errorCode: params.errorCode,
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
    // Call the internal execution endpoint on the main server
    // This runs execution in the proper server context where agentSessionManager works
    const baseUrl = process.env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
    const apiKey = process.env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET || '';

    // URL includes tenant/project/agent in path for middleware compatibility
    // Full path: /run/tenants/{tenantId}/projects/{projectId}/agents/{agentId}/scheduled-triggers/internal/execute
    const url = `${baseUrl}/run/tenants/${params.tenantId}/projects/${params.projectId}/agents/${params.agentId}/scheduled-triggers/internal/execute`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
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

    const result = await response.json() as { success: boolean; conversationId?: string; error?: string };

    if (!response.ok || !result.success) {
      throw new Error(result.error || `HTTP ${response.status}: Execution failed`);
    }

    logger.info(
      { scheduledTriggerId: params.scheduledTriggerId, invocationId: params.invocationId, conversationId: result.conversationId },
      'Scheduled trigger execution completed via HTTP'
    );

    return {
      success: true,
      conversationId: result.conversationId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { ...params, error: errorMessage },
      'Execute scheduled trigger step failed'
    );
    return {
      success: false,
      error: errorMessage,
    };
  }
}
