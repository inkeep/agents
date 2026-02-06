import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  addConversationIdToInvocation,
  cancelPendingInvocationsForTrigger,
  commonGetErrorResponses,
  createApiError,
  createScheduledTrigger,
  createScheduledTriggerInvocation,
  deleteScheduledTrigger,
  generateId,
  getProjectScopedRef,
  getScheduledTriggerById,
  getScheduledTriggerInvocationById,
  getScheduledTriggerRunInfoBatch,
  interpolateTemplate,
  listScheduledTriggerInvocationsPaginated,
  listScheduledTriggersPaginated,
  listUpcomingInvocationsForAgentPaginated,
  markScheduledTriggerInvocationCancelled,
  markScheduledTriggerInvocationCompleted,
  markScheduledTriggerInvocationFailed,
  markScheduledTriggerInvocationRunning,
  PaginationQueryParamsSchema,
  type Part,
  resolveRef,
  ScheduledTriggerApiInsertSchema,
  ScheduledTriggerApiUpdateSchema,
  ScheduledTriggerInvocationListResponse,
  ScheduledTriggerInvocationResponse,
  ScheduledTriggerInvocationStatusEnum,
  ScheduledTriggerResponse,
  ScheduledTriggerWithRunInfoListResponse,
  TenantProjectAgentIdParamsSchema,
  TenantProjectAgentParamsSchema,
  updateScheduledTrigger,
  updateScheduledTriggerInvocationStatus,
} from '@inkeep/agents-core';
import { manageDbClient } from '../../../data/db';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';
import {
  onTriggerCreated,
  onTriggerDeleted,
  onTriggerUpdated,
} from '../../run/services/ScheduledTriggerService';
import { executeAgentAsync } from '../../run/services/TriggerService';

const logger = getLogger('scheduled-triggers');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

// Apply permission middleware by HTTP method
app.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

app.use('/:id', async (c, next) => {
  if (c.req.method === 'PATCH') {
    return requireProjectPermission('edit')(c, next);
  }
  if (c.req.method === 'DELETE') {
    return requireProjectPermission('edit')(c, next);
  }
  return next();
});

/**
 * List Scheduled Triggers for an Agent
 */
app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Scheduled Triggers',
    operationId: 'list-scheduled-triggers',
    tags: ['Scheduled Triggers'],
    request: {
      params: TenantProjectAgentParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of scheduled triggers retrieved successfully',
        content: {
          'application/json': {
            schema: ScheduledTriggerWithRunInfoListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');

    const result = await listScheduledTriggersPaginated(db)({
      scopes: { tenantId, projectId, agentId },
      pagination: { page, limit },
    });

    // Fetch run info for all triggers in a single batch query
    const triggerIds = result.data.map((trigger) => ({
      agentId,
      triggerId: trigger.id,
    }));

    const runInfoMap = await getScheduledTriggerRunInfoBatch(runDbClient)({
      scopes: { tenantId, projectId },
      triggerIds,
    });

    const dataWithRunInfo = result.data.map((trigger) => {
      const { tenantId: _tid, projectId: _pid, agentId: _aid, ...rest } = trigger;
      const runInfo = runInfoMap.get(trigger.id) || {
        lastRunAt: null,
        lastRunStatus: null,
        lastRunConversationIds: [],
        nextRunAt: null,
      };
      return {
        ...rest,
        ...runInfo,
      };
    });

    return c.json({
      data: dataWithRunInfo,
      pagination: result.pagination,
    });
  }
);

// Query params for upcoming runs (across all triggers)
const UpcomingRunsQueryParamsSchema = PaginationQueryParamsSchema.extend({
  includeRunning: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true')
    .openapi({
      description: 'Include currently running invocations in results',
    }),
}).openapi('UpcomingRunsQueryParams');

/**
 * List Upcoming Runs Across All Scheduled Triggers
 * Dashboard endpoint to view all pending/running invocations for an agent
 */
app.openapi(
  createRoute({
    method: 'get',
    path: '/upcoming-runs',
    summary: 'List Upcoming Runs',
    operationId: 'list-upcoming-scheduled-runs',
    tags: ['Scheduled Triggers'],
    request: {
      params: TenantProjectAgentParamsSchema,
      query: UpcomingRunsQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of upcoming scheduled runs retrieved successfully',
        content: {
          'application/json': {
            schema: ScheduledTriggerInvocationListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const { page, limit, includeRunning } = c.req.valid('query');

    logger.info(
      { tenantId, projectId, agentId, includeRunning, page, limit },
      'Listing upcoming scheduled runs across all triggers'
    );

    const result = await listUpcomingInvocationsForAgentPaginated(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      pagination: { page, limit },
      includeRunning: includeRunning ?? true,
    });

    logger.info(
      { count: result.data.length, total: result.pagination.total, tenantId, projectId, agentId },
      'Upcoming runs query result'
    );

    const dataWithoutScopes = result.data.map((invocation) => {
      const { tenantId: _tid, projectId: _pid, agentId: _aid, ...rest } = invocation;
      return rest;
    });

    return c.json({
      data: dataWithoutScopes,
      pagination: result.pagination,
    });
  }
);

/**
 * Get Scheduled Trigger by ID
 */
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Scheduled Trigger',
    operationId: 'get-scheduled-trigger-by-id',
    tags: ['Scheduled Triggers'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Scheduled trigger found',
        content: {
          'application/json': {
            schema: ScheduledTriggerResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');

    const trigger = await getScheduledTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
    });

    if (!trigger) {
      throw createApiError({
        code: 'not_found',
        message: 'Scheduled trigger not found',
      });
    }

    const { tenantId: _tid, projectId: _pid, agentId: _aid, ...triggerWithoutScopes } = trigger;

    return c.json({
      data: triggerWithoutScopes,
    });
  }
);

/**
 * Create Scheduled Trigger
 */
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Scheduled Trigger',
    operationId: 'create-scheduled-trigger',
    tags: ['Scheduled Triggers'],
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ScheduledTriggerApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Scheduled trigger created successfully',
        content: {
          'application/json': {
            schema: ScheduledTriggerResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId } = c.req.valid('param');
    const body = c.req.valid('json');

    const id = body.id || generateId();

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId: id },
      'Creating scheduled trigger'
    );

    const now = new Date().toISOString();

    const trigger = await createScheduledTrigger(db)({
      id,
      tenantId,
      projectId,
      agentId,
      name: body.name,
      description: body.description ?? null,
      enabled: body.enabled ?? true,
      cronExpression: body.cronExpression ?? null,
      cronTimezone: body.cronTimezone ?? 'UTC',
      runAt: body.runAt ?? null,
      payload: body.payload ?? null,
      messageTemplate: body.messageTemplate ?? null,
      maxRetries: body.maxRetries,
      retryDelaySeconds: body.retryDelaySeconds,
      timeoutSeconds: body.timeoutSeconds,
      createdAt: now,
      updatedAt: now,
    });

    // Start workflow for enabled triggers
    try {
      await onTriggerCreated(trigger);
    } catch (err) {
      logger.error(
        { err, tenantId, projectId, agentId, scheduledTriggerId: id },
        'Failed to start workflow for new scheduled trigger'
      );
    }

    const { tenantId: _tid, projectId: _pid, agentId: _aid, ...triggerWithoutScopes } = trigger;

    return c.json(
      {
        data: triggerWithoutScopes,
      },
      201
    );
  }
);

/**
 * Update Scheduled Trigger
 */
app.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    summary: 'Update Scheduled Trigger',
    operationId: 'update-scheduled-trigger',
    tags: ['Scheduled Triggers'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: ScheduledTriggerApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Scheduled trigger updated successfully',
        content: {
          'application/json': {
            schema: ScheduledTriggerResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const body = c.req.valid('json');

    // Check if any update fields were actually provided
    const hasUpdateFields =
      body.name !== undefined ||
      body.description !== undefined ||
      body.enabled !== undefined ||
      body.cronExpression !== undefined ||
      body.cronTimezone !== undefined ||
      body.runAt !== undefined ||
      body.payload !== undefined ||
      body.messageTemplate !== undefined ||
      body.maxRetries !== undefined ||
      body.retryDelaySeconds !== undefined ||
      body.timeoutSeconds !== undefined;

    if (!hasUpdateFields) {
      throw createApiError({
        code: 'bad_request',
        message: 'No fields to update',
      });
    }

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId: id },
      'Updating scheduled trigger'
    );

    // Get existing trigger to check if it exists
    const existing = await getScheduledTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
    });

    if (!existing) {
      throw createApiError({
        code: 'not_found',
        message: 'Scheduled trigger not found',
      });
    }

    // Determine if schedule changed (affects workflow timing)
    const scheduleChanged =
      body.cronExpression !== undefined ||
      body.cronTimezone !== undefined ||
      body.runAt !== undefined;

    const previousEnabled = existing.enabled;

    // For retry settings: if provided, validate; if null/undefined, keep existing or use default
    const resolveRetryValue = (
      bodyValue: number | null | undefined,
      existingValue: number | null,
      defaultValue: number
    ): number => {
      if (typeof bodyValue === 'number' && !Number.isNaN(bodyValue)) {
        return bodyValue;
      }
      if (bodyValue === undefined) {
        // Not provided in update - keep existing or use default
        return existingValue ?? defaultValue;
      }
      // Explicitly null - use default
      return defaultValue;
    };

    const updatedTrigger = await updateScheduledTrigger(db)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
      data: {
        name: body.name,
        description: body.description,
        enabled: body.enabled,
        cronExpression: body.cronExpression,
        cronTimezone: body.cronTimezone,
        runAt: body.runAt,
        payload: body.payload,
        messageTemplate: body.messageTemplate,
        maxRetries: resolveRetryValue(body.maxRetries, existing.maxRetries, 3),
        retryDelaySeconds: resolveRetryValue(
          body.retryDelaySeconds,
          existing.retryDelaySeconds,
          60
        ),
        timeoutSeconds: resolveRetryValue(body.timeoutSeconds, existing.timeoutSeconds, 300),
      },
    });

    // Handle workflow lifecycle changes
    try {
      await onTriggerUpdated({
        trigger: updatedTrigger,
        previousEnabled,
        scheduleChanged,
      });
    } catch (err) {
      logger.error(
        { err, tenantId, projectId, agentId, scheduledTriggerId: id },
        'Failed to update workflow for scheduled trigger'
      );
      // Don't fail the request - trigger is updated, workflow state can be fixed
    }

    const {
      tenantId: _tid,
      projectId: _pid,
      agentId: _aid,
      ...triggerWithoutScopes
    } = updatedTrigger;

    return c.json({
      data: triggerWithoutScopes,
    });
  }
);

/**
 * Delete Scheduled Trigger
 */
app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Scheduled Trigger',
    operationId: 'delete-scheduled-trigger',
    tags: ['Scheduled Triggers'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Scheduled trigger deleted successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId: id },
      'Deleting scheduled trigger'
    );

    // First check if the trigger exists
    const existing = await getScheduledTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
    });

    if (!existing) {
      throw createApiError({
        code: 'not_found',
        message: 'Scheduled trigger not found',
      });
    }

    // Cancel any pending invocations before deleting the trigger
    const cancelledCount = await cancelPendingInvocationsForTrigger(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
    });

    if (cancelledCount > 0) {
      logger.info(
        { tenantId, projectId, agentId, scheduledTriggerId: id, cancelledCount },
        'Cancelled pending invocations before deleting scheduled trigger'
      );
    }

    // Cancel active workflow
    try {
      await onTriggerDeleted(existing);
    } catch (err) {
      logger.error(
        { err, tenantId, projectId, agentId, scheduledTriggerId: id },
        'Failed to cancel workflow for deleted scheduled trigger'
      );
      // Continue with deletion - workflow will stop on its own eventually
    }

    await deleteScheduledTrigger(db)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId: id,
    });

    return c.body(null, 204);
  }
);

// Query params for invocation filtering (extends base pagination with status/date filters)
const ScheduledTriggerInvocationQueryParamsSchema = PaginationQueryParamsSchema.extend({
  status: ScheduledTriggerInvocationStatusEnum.optional().openapi({
    description: 'Filter by invocation status',
  }),
  from: z.string().datetime().optional().openapi({
    description: 'Start date for filtering (ISO8601)',
  }),
  to: z.string().datetime().optional().openapi({
    description: 'End date for filtering (ISO8601)',
  }),
}).openapi('ScheduledTriggerInvocationQueryParams');

/**
 * List Scheduled Trigger Invocations
 */
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/invocations',
    summary: 'List Scheduled Trigger Invocations',
    operationId: 'list-scheduled-trigger-invocations',
    tags: ['Scheduled Triggers'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
      query: ScheduledTriggerInvocationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of scheduled trigger invocations retrieved successfully',
        content: {
          'application/json': {
            schema: ScheduledTriggerInvocationListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const { tenantId, projectId, agentId, id: scheduledTriggerId } = c.req.valid('param');
    const { page, limit, status, from, to } = c.req.valid('query');

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId, status, from, to },
      'Listing scheduled trigger invocations'
    );

    const result = await listScheduledTriggerInvocationsPaginated(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
      pagination: { page, limit },
      filters: {
        status,
        from,
        to,
      },
    });

    const dataWithoutScopes = result.data.map((invocation) => {
      const { tenantId: _tid, projectId: _pid, agentId: _aid, ...rest } = invocation;
      return rest;
    });

    return c.json({
      data: dataWithoutScopes,
      pagination: result.pagination,
    });
  }
);

/**
 * Get Scheduled Trigger Invocation by ID
 */
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/invocations/{invocationId}',
    summary: 'Get Scheduled Trigger Invocation',
    operationId: 'get-scheduled-trigger-invocation-by-id',
    tags: ['Scheduled Triggers'],
    request: {
      params: TenantProjectAgentIdParamsSchema.extend({
        invocationId: z.string().describe('Scheduled Trigger Invocation ID'),
      }),
    },
    responses: {
      200: {
        description: 'Scheduled trigger invocation found',
        content: {
          'application/json': {
            schema: ScheduledTriggerInvocationResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const {
      tenantId,
      projectId,
      agentId,
      id: scheduledTriggerId,
      invocationId,
    } = c.req.valid('param');

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId, invocationId },
      'Getting scheduled trigger invocation'
    );

    const invocation = await getScheduledTriggerInvocationById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
      invocationId,
    });

    if (!invocation) {
      throw createApiError({
        code: 'not_found',
        message: 'Scheduled trigger invocation not found',
      });
    }

    const {
      tenantId: _tid,
      projectId: _pid,
      agentId: _aid,
      ...invocationWithoutScopes
    } = invocation;

    return c.json({
      data: invocationWithoutScopes,
    });
  }
);

/**
 * Cancel Scheduled Trigger Invocation
 */
app.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/invocations/{invocationId}/cancel',
    summary: 'Cancel Scheduled Trigger Invocation',
    operationId: 'cancel-scheduled-trigger-invocation',
    tags: ['Scheduled Triggers'],
    request: {
      params: TenantProjectAgentIdParamsSchema.extend({
        invocationId: z.string().describe('Scheduled Trigger Invocation ID'),
      }),
    },
    responses: {
      200: {
        description: 'Scheduled trigger invocation cancelled successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              invocationId: z.string(),
              previousStatus: z.string().optional(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const {
      tenantId,
      projectId,
      agentId,
      id: scheduledTriggerId,
      invocationId,
    } = c.req.valid('param');

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId, invocationId },
      'Cancelling scheduled trigger invocation'
    );

    // Get the invocation
    const invocation = await getScheduledTriggerInvocationById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
      invocationId,
    });

    if (!invocation) {
      throw createApiError({
        code: 'not_found',
        message: 'Invocation not found',
      });
    }

    // Check if invocation can be cancelled
    if (invocation.status === 'completed' || invocation.status === 'failed') {
      throw createApiError({
        code: 'bad_request',
        message: `Cannot cancel invocation with status: ${invocation.status}`,
      });
    }

    if (invocation.status === 'cancelled') {
      return c.json({
        success: true,
        invocationId,
        previousStatus: 'cancelled',
      });
    }

    const previousStatus = invocation.status;

    // Mark as cancelled
    await markScheduledTriggerInvocationCancelled(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
      invocationId,
    });

    logger.info(
      { tenantId, projectId, agentId, scheduledTriggerId, invocationId, previousStatus },
      'Scheduled trigger invocation cancelled'
    );

    return c.json({
      success: true,
      invocationId,
      previousStatus,
    });
  }
);

/**
 * Rerun Scheduled Trigger Invocation
 * Creates a new invocation and executes it immediately (manual rerun of a past run)
 */
app.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/invocations/{invocationId}/rerun',
    summary: 'Rerun Scheduled Trigger Invocation',
    operationId: 'rerun-scheduled-trigger-invocation',
    tags: ['Scheduled Triggers'],
    request: {
      params: TenantProjectAgentIdParamsSchema.extend({
        invocationId: z.string().describe('Scheduled Trigger Invocation ID to rerun'),
      }),
    },
    responses: {
      200: {
        description: 'Scheduled trigger invocation rerun initiated successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              newInvocationId: z.string(),
              originalInvocationId: z.string(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const {
      tenantId,
      projectId,
      agentId,
      id: scheduledTriggerId,
      invocationId,
    } = c.req.valid('param');

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId, invocationId },
      'Rerunning scheduled trigger invocation'
    );

    // Get the original invocation to verify it exists
    const originalInvocation = await getScheduledTriggerInvocationById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
      invocationId,
    });

    if (!originalInvocation) {
      throw createApiError({
        code: 'not_found',
        message: 'Invocation not found',
      });
    }

    // Only allow rerun of completed, failed, or cancelled invocations
    if (originalInvocation.status === 'pending' || originalInvocation.status === 'running') {
      throw createApiError({
        code: 'bad_request',
        message: `Cannot rerun invocation with status: ${originalInvocation.status}. Wait for it to complete or cancel it first.`,
      });
    }

    // Get the trigger configuration for execution parameters
    const trigger = await getScheduledTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
    });

    if (!trigger) {
      throw createApiError({
        code: 'not_found',
        message: 'Scheduled trigger not found',
      });
    }

    // Apply defaults for retry configuration (handles null values from older triggers)
    const maxRetries = trigger.maxRetries ?? 3;
    const retryDelaySeconds = trigger.retryDelaySeconds ?? 60;
    const timeoutSeconds = trigger.timeoutSeconds ?? 300;

    // Create a new invocation for the rerun
    const newInvocationId = generateId();
    const now = new Date().toISOString();

    await createScheduledTriggerInvocation(runDbClient)({
      id: newInvocationId,
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      status: 'pending',
      scheduledFor: now,
      idempotencyKey: `manual-rerun-${invocationId}-${Date.now()}`,
      attemptNumber: 1,
      createdAt: now,
    });

    logger.info(
      {
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        originalInvocationId: invocationId,
        newInvocationId,
        maxRetries,
        retryDelaySeconds,
      },
      'Created new invocation for manual rerun with retry support'
    );

    const scopes = { tenantId, projectId, agentId };

    // Execute in background (fire-and-forget) with retry support
    setImmediate(async () => {
      try {
        await markScheduledTriggerInvocationRunning(runDbClient)({
          scopes,
          scheduledTriggerId,
          invocationId: newInvocationId,
        });

        // Resolve project ref
        const ref = getProjectScopedRef(tenantId, projectId, 'main');
        const resolvedRef = await resolveRef(manageDbClient)(ref);
        if (!resolvedRef) {
          throw new Error(`Failed to resolve ref for project ${projectId}`);
        }

        // Build message from template
        const effectivePayload = trigger.payload ?? {};
        const userMessage = trigger.messageTemplate
          ? interpolateTemplate(trigger.messageTemplate, effectivePayload)
          : JSON.stringify(effectivePayload);

        const messageParts: Part[] = [];
        if (trigger.messageTemplate) {
          messageParts.push({ kind: 'text', text: userMessage });
        }
        messageParts.push({
          kind: 'data',
          data: effectivePayload,
          metadata: { source: 'scheduled-trigger', triggerId: scheduledTriggerId },
        });

        // Execute with retries (same logic as workflow)
        const maxAttempts = maxRetries + 1;
        let attemptNumber = 1;
        let lastError: string | null = null;

        // Helper to execute with timeout
        const executeWithTimeout = async (conversationId: string): Promise<void> => {
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
              invocationId: newInvocationId,
              conversationId,
              userMessage,
              messageParts,
              resolvedRef,
            }),
            timeoutPromise,
          ]);
        };

        while (attemptNumber <= maxAttempts) {
          const conversationId = generateId();
          let success = false;

          try {
            await executeWithTimeout(conversationId);
            success = true;
          } catch (execErr) {
            lastError = execErr instanceof Error ? execErr.message : String(execErr);
            logger.error(
              { invocationId: newInvocationId, attemptNumber, error: lastError },
              'Manual rerun failed with error'
            );
          }

          // Always save conversation ID after each attempt (even on failure)
          await addConversationIdToInvocation(runDbClient)({
            scopes,
            scheduledTriggerId,
            invocationId: newInvocationId,
            conversationId,
          }).catch(() => {});

          if (success) {
            await markScheduledTriggerInvocationCompleted(runDbClient)({
              scopes,
              scheduledTriggerId,
              invocationId: newInvocationId,
            });
            logger.info(
              { invocationId: newInvocationId, conversationId, attemptNumber },
              'Manual rerun completed'
            );
            lastError = null;
            break;
          }

          // Retry logic
          if (attemptNumber < maxAttempts) {
            // Increment attempt number in DB
            await updateScheduledTriggerInvocationStatus(runDbClient)({
              scopes,
              scheduledTriggerId,
              invocationId: newInvocationId,
              data: {
                attemptNumber: attemptNumber + 1,
                status: 'running',
              },
            }).catch(() => {});

            attemptNumber++;
            // Sleep before retry
            await new Promise((resolve) => setTimeout(resolve, retryDelaySeconds * 1000));
          } else {
            break;
          }
        }

        // Mark as failed if all retries exhausted
        if (lastError) {
          await markScheduledTriggerInvocationFailed(runDbClient)({
            scopes,
            scheduledTriggerId,
            invocationId: newInvocationId,
          }).catch(() => {});
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error({ invocationId: newInvocationId, error }, 'Manual rerun setup failed');

        await markScheduledTriggerInvocationFailed(runDbClient)({
          scopes,
          scheduledTriggerId,
          invocationId: newInvocationId,
        }).catch(() => {});
      }
    });

    return c.json({
      success: true,
      newInvocationId,
      originalInvocationId: invocationId,
    });
  }
);

/**
 * Run Scheduled Trigger Now
 * Creates a new invocation and executes it immediately (manual trigger)
 */
app.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/run',
    summary: 'Run Scheduled Trigger Now',
    operationId: 'run-scheduled-trigger-now',
    tags: ['Scheduled Triggers'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Scheduled trigger run initiated successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              invocationId: z.string(),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id: scheduledTriggerId } = c.req.valid('param');

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId },
      'Running scheduled trigger now'
    );

    // Get the trigger configuration
    const trigger = await getScheduledTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
    });

    if (!trigger) {
      throw createApiError({
        code: 'not_found',
        message: 'Scheduled trigger not found',
      });
    }

    // Apply defaults for retry configuration
    const maxRetries = trigger.maxRetries ?? 1;
    const retryDelaySeconds = trigger.retryDelaySeconds ?? 60;
    const timeoutSeconds = trigger.timeoutSeconds ?? 900;

    // Create a new invocation
    const invocationId = generateId();
    const now = new Date().toISOString();

    await createScheduledTriggerInvocation(runDbClient)({
      id: invocationId,
      tenantId,
      projectId,
      agentId,
      scheduledTriggerId,
      status: 'pending',
      scheduledFor: now,
      idempotencyKey: `manual-run-${scheduledTriggerId}-${Date.now()}`,
      attemptNumber: 1,
      createdAt: now,
    });

    logger.info(
      {
        tenantId,
        projectId,
        agentId,
        scheduledTriggerId,
        invocationId,
        maxRetries,
        retryDelaySeconds,
      },
      'Created new invocation for manual run'
    );

    const scopes = { tenantId, projectId, agentId };

    // Execute in background (fire-and-forget) with retry support
    setImmediate(async () => {
      try {
        await markScheduledTriggerInvocationRunning(runDbClient)({
          scopes,
          scheduledTriggerId,
          invocationId,
        });

        // Resolve project ref
        const ref = getProjectScopedRef(tenantId, projectId, 'main');
        const resolvedRef = await resolveRef(manageDbClient)(ref);
        if (!resolvedRef) {
          throw new Error(`Failed to resolve ref for project ${projectId}`);
        }

        // Build message from template
        const effectivePayload = trigger.payload ?? {};
        const userMessage = trigger.messageTemplate
          ? interpolateTemplate(trigger.messageTemplate, effectivePayload)
          : JSON.stringify(effectivePayload);

        const messageParts: Part[] = [];
        if (trigger.messageTemplate) {
          messageParts.push({ kind: 'text', text: userMessage });
        }
        messageParts.push({
          kind: 'data',
          data: effectivePayload,
          metadata: { source: 'scheduled-trigger', triggerId: scheduledTriggerId },
        });

        // Execute with retries
        const maxAttempts = maxRetries + 1;
        let attemptNumber = 1;
        let lastError: string | null = null;

        // Helper to execute with timeout
        const executeWithTimeout = async (conversationId: string): Promise<void> => {
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
        };

        while (attemptNumber <= maxAttempts) {
          const conversationId = generateId();
          let success = false;

          try {
            await executeWithTimeout(conversationId);
            success = true;
          } catch (execErr) {
            lastError = execErr instanceof Error ? execErr.message : String(execErr);
            logger.error(
              { invocationId, attemptNumber, error: lastError },
              'Manual run failed with error'
            );
          }

          // Always save conversation ID after each attempt
          await addConversationIdToInvocation(runDbClient)({
            scopes,
            scheduledTriggerId,
            invocationId,
            conversationId,
          }).catch(() => {});

          if (success) {
            await markScheduledTriggerInvocationCompleted(runDbClient)({
              scopes,
              scheduledTriggerId,
              invocationId,
            });
            logger.info({ invocationId, conversationId, attemptNumber }, 'Manual run completed');
            lastError = null;
            break;
          }

          // Retry logic
          if (attemptNumber < maxAttempts) {
            await updateScheduledTriggerInvocationStatus(runDbClient)({
              scopes,
              scheduledTriggerId,
              invocationId,
              data: {
                attemptNumber: attemptNumber + 1,
                status: 'running',
              },
            }).catch(() => {});

            attemptNumber++;
            await new Promise((resolve) => setTimeout(resolve, retryDelaySeconds * 1000));
          } else {
            break;
          }
        }

        // Mark as failed if all retries exhausted
        if (lastError) {
          await markScheduledTriggerInvocationFailed(runDbClient)({
            scopes,
            scheduledTriggerId,
            invocationId,
          }).catch(() => {});
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error({ invocationId, error }, 'Manual run setup failed');

        await markScheduledTriggerInvocationFailed(runDbClient)({
          scopes,
          scheduledTriggerId,
          invocationId,
        }).catch(() => {});
      }
    });

    return c.json({
      success: true,
      invocationId,
    });
  }
);

export default app;
