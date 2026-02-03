import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  cancelPendingInvocationsForTrigger,
  commonGetErrorResponses,
  createApiError,
  createScheduledTrigger,
  deleteScheduledTrigger,
  generateId,
  getScheduledTriggerById,
  getScheduledTriggerInvocationById,
  listScheduledTriggerInvocationsPaginated,
  listScheduledTriggersPaginated,
  markScheduledTriggerInvocationCancelled,
  PaginationQueryParamsSchema,
  ScheduledTriggerApiInsertSchema,
  ScheduledTriggerApiUpdateSchema,
  ScheduledTriggerInvocationListResponse,
  ScheduledTriggerInvocationResponse,
  ScheduledTriggerInvocationStatusEnum,
  ScheduledTriggerListResponse,
  ScheduledTriggerResponse,
  TenantProjectAgentIdParamsSchema,
  TenantProjectAgentParamsSchema,
  updateScheduledTrigger,
} from '@inkeep/agents-core';
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
            schema: ScheduledTriggerListResponse,
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

    // Remove sensitive scope fields from triggers
    const dataWithoutScopes = result.data.map((trigger) => {
      const { tenantId: _tid, projectId: _pid, agentId: _aid, ...rest } = trigger;
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

    // Ensure retry settings have valid values (handle null, undefined, and NaN)
    const maxRetries =
      typeof body.maxRetries === 'number' && !Number.isNaN(body.maxRetries) ? body.maxRetries : 3;
    const retryDelaySeconds =
      typeof body.retryDelaySeconds === 'number' && !Number.isNaN(body.retryDelaySeconds)
        ? body.retryDelaySeconds
        : 60;
    const timeoutSeconds =
      typeof body.timeoutSeconds === 'number' && !Number.isNaN(body.timeoutSeconds)
        ? body.timeoutSeconds
        : 300;

    logger.debug(
      { maxRetries, retryDelaySeconds, timeoutSeconds, bodyMaxRetries: body.maxRetries },
      'Creating trigger with retry settings'
    );

    const trigger = await createScheduledTrigger(db)({
      id,
      tenantId,
      projectId,
      agentId,
      name: body.name,
      description: body.description ?? null,
      enabled: body.enabled !== undefined ? body.enabled : true,
      cronExpression: body.cronExpression ?? null,
      runAt: body.runAt ?? null,
      payload: body.payload ?? null,
      messageTemplate: body.messageTemplate ?? null,
      maxRetries,
      retryDelaySeconds,
      timeoutSeconds,
      createdAt: now,
      updatedAt: now,
    });

    // Start workflow for enabled triggers
    try {
      await onTriggerCreated(trigger, db);
    } catch (err) {
      logger.error(
        { err, tenantId, projectId, agentId, scheduledTriggerId: id },
        'Failed to start workflow for new scheduled trigger'
      );
      // Don't fail the request - trigger is created, workflow can be started later
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
    const scheduleChanged = body.cronExpression !== undefined || body.runAt !== undefined;

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
        runAt: body.runAt,
        payload: body.payload,
        messageTemplate: body.messageTemplate,
        maxRetries: resolveRetryValue(body.maxRetries, existing.maxRetries, 3),
        retryDelaySeconds: resolveRetryValue(body.retryDelaySeconds, existing.retryDelaySeconds, 60),
        timeoutSeconds: resolveRetryValue(body.timeoutSeconds, existing.timeoutSeconds, 300),
      },
    });

    // Handle workflow lifecycle changes
    try {
      await onTriggerUpdated(
        {
          trigger: updatedTrigger,
          previousEnabled,
          scheduleChanged,
        },
        db
      );
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
      await onTriggerDeleted(existing, db);
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

/**
 * ========================================
 * Scheduled Trigger Invocation Endpoints
 * ========================================
 */

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
    // Note: Using runtime DB client (runDbClient) for invocations, not manage DB (c.get('db'))
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

    // Remove sensitive scope fields from invocations
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
    // Note: Using runtime DB client (runDbClient) for invocations, not manage DB (c.get('db'))
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
    console.log('TRIGGER before maxRetries', trigger.maxRetries);
    console.log('TRIGGER before retryDelaySeconds', trigger.retryDelaySeconds);
    console.log('TRIGGER before timeoutSeconds', trigger.timeoutSeconds);
    console.log('TRIGGER', trigger);
    const maxRetries = trigger.maxRetries ?? 3;
    const retryDelaySeconds = trigger.retryDelaySeconds ?? 60;
    const timeoutSeconds = trigger.timeoutSeconds ?? 300;

    // Create a new invocation for the rerun
    const {
      createScheduledTriggerInvocation,
      markScheduledTriggerInvocationRunning,
      markScheduledTriggerInvocationCompleted,
      markScheduledTriggerInvocationFailed,
      updateScheduledTriggerInvocationStatus,
    } = await import('@inkeep/agents-core');

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

    // Execute the trigger asynchronously with retry logic
    // This is fire-and-forget - the client doesn't wait for execution to complete
    const baseUrl = process.env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
    const apiKey = process.env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET || '';
    const executeUrl = `${baseUrl}/run/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers/internal/execute`;

    const scopes = { tenantId, projectId, agentId };

    // Helper to sleep for retries
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // Helper to execute a single attempt
    const executeAttempt = async (): Promise<{
      success: boolean;
      conversationId?: string;
      error?: string;
    }> => {
      const response = await fetch(executeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'x-inkeep-tenant-id': tenantId,
          'x-inkeep-project-id': projectId,
          'x-inkeep-agent-id': agentId,
        },
        body: JSON.stringify({
          scheduledTriggerId,
          invocationId: newInvocationId,
          messageTemplate: trigger.messageTemplate,
          payload: trigger.payload,
          timeoutSeconds,
        }),
      });

      const result = (await response.json()) as {
        success: boolean;
        conversationId?: string;
        error?: string;
      };

      if (response.ok && result.success) {
        return { success: true, conversationId: result.conversationId };
      }
      return {
        success: false,
        error: result.error || `HTTP ${response.status}: Execution failed`,
      };
    };

    // Execute with retries in background (fire-and-forget)
    (async () => {
      const maxAttempts = maxRetries + 1;
      let attemptNumber = 1;
      let lastError: string | null = null;

      while (attemptNumber <= maxAttempts) {
        await markScheduledTriggerInvocationRunning(runDbClient)({
          scopes,
          scheduledTriggerId,
          invocationId: newInvocationId,
        }).catch((err) => {
          logger.error(
            { err, invocationId: newInvocationId, attemptNumber },
            'Failed to mark invocation as running'
          );
        });

        try {
          const result = await executeAttempt();

          if (result.success) {
            // Success - mark completed and exit
            await markScheduledTriggerInvocationCompleted(runDbClient)({
              scopes,
              scheduledTriggerId,
              invocationId: newInvocationId,
              conversationId: result.conversationId,
            });
            logger.info(
              {
                invocationId: newInvocationId,
                conversationId: result.conversationId,
                attemptNumber,
              },
              'Manual rerun completed successfully'
            );
            return; // Exit the retry loop
          }

          // Failure
          lastError = result.error || 'Unknown error';
          logger.warn(
            { invocationId: newInvocationId, attemptNumber, error: lastError, maxAttempts },
            'Manual rerun attempt failed'
          );

          // Check if we have retries left
          if (attemptNumber < maxAttempts) {
            // Increment attempt number in DB
            await updateScheduledTriggerInvocationStatus(runDbClient)({
              scopes,
              scheduledTriggerId,
              invocationId: newInvocationId,
              data: {
                attemptNumber: attemptNumber + 1,
                status: 'pending',
              },
            });

            attemptNumber++;

            logger.info(
              { invocationId: newInvocationId, attemptNumber, retryDelaySeconds },
              'Waiting before retry'
            );

            // Wait before retry
            await sleep(retryDelaySeconds * 1000);
          } else {
            // No more retries
            break;
          }
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          logger.error(
            { err: lastError, invocationId: newInvocationId, attemptNumber },
            'Manual rerun attempt threw exception'
          );

          if (attemptNumber < maxAttempts) {
            await updateScheduledTriggerInvocationStatus(runDbClient)({
              scopes,
              scheduledTriggerId,
              invocationId: newInvocationId,
              data: {
                attemptNumber: attemptNumber + 1,
                status: 'pending',
              },
            }).catch(() => {});

            attemptNumber++;
            await sleep(retryDelaySeconds * 1000);
          } else {
            break;
          }
        }
      }

      // All retries exhausted - mark as failed
      await markScheduledTriggerInvocationFailed(runDbClient)({
        scopes,
        scheduledTriggerId,
        invocationId: newInvocationId,
        errorMessage: lastError || 'All retry attempts failed',
        errorCode: 'EXECUTION_ERROR',
      }).catch((updateErr) => {
        logger.error(
          { updateErr, invocationId: newInvocationId },
          'Failed to mark invocation as failed'
        );
      });

      logger.error(
        {
          invocationId: newInvocationId,
          totalAttempts: attemptNumber,
          maxAttempts,
          lastError,
        },
        'Manual rerun failed after all retry attempts'
      );
    })();

    return c.json({
      success: true,
      newInvocationId,
      originalInvocationId: invocationId,
    });
  }
);

export default app;
