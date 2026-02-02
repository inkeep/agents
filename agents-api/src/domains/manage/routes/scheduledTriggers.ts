import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createScheduledTrigger,
  deleteScheduledTrigger,
  generateId,
  getScheduledTriggerById,
  listScheduledTriggersPaginated,
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
  getScheduledTriggerInvocationById,
  listScheduledTriggerInvocationsPaginated,
  cancelPendingInvocationsForTrigger,
  markScheduledTriggerInvocationCancelled,
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
      maxRetries: body.maxRetries ?? 3,
      retryDelaySeconds: body.retryDelaySeconds ?? 60,
      timeoutSeconds: body.timeoutSeconds ?? 300,
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
    const scheduleChanged =
      body.cronExpression !== undefined ||
      body.runAt !== undefined;

    const previousEnabled = existing.enabled;

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
        maxRetries: body.maxRetries,
        retryDelaySeconds: body.retryDelaySeconds,
        timeoutSeconds: body.timeoutSeconds,
      },
    });

    // Handle workflow lifecycle changes
    try {
      await onTriggerUpdated({
        trigger: updatedTrigger,
        previousEnabled,
        scheduleChanged,
      }, db);
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

export default app;
