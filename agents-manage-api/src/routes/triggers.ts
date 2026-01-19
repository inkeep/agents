import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createTrigger,
  deleteTrigger,
  generateId,
  getTriggerById,
  getTriggerInvocationById,
  listTriggerInvocationsPaginated,
  listTriggersPaginated,
  PaginationQueryParamsSchema,
  TenantProjectAgentIdParamsSchema,
  TenantProjectAgentParamsSchema,
  TriggerApiInsertSchema,
  TriggerApiSelectSchema,
  TriggerApiUpdateSchema,
  TriggerInvocationApiSelectSchema,
  TriggerInvocationStatusEnum,
  updateTrigger,
} from '@inkeep/agents-core';
import runDbClient from '../data/db/runDbClient';
import { env } from '../env';
import { getLogger } from '../logger';
import { requirePermission } from '../middleware/require-permission';
import type { BaseAppVariables } from '../types/app';
import { speakeasyOffsetLimitPagination } from './shared';

const logger = getLogger('triggers');

const app = new OpenAPIHono<{ Variables: BaseAppVariables }>();

// Response schemas
const TriggerResponse = z.object({
  data: TriggerApiSelectSchema.extend({
    webhookUrl: z.string().describe('Fully qualified webhook URL for this trigger'),
  }),
});

const TriggerListResponse = z.object({
  data: z.array(
    TriggerApiSelectSchema.extend({
      webhookUrl: z.string().describe('Fully qualified webhook URL for this trigger'),
    })
  ),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
  }),
});

// Apply permission middleware by HTTP method
app.use('/', async (c, next) => {
  if (c.req.method === 'POST') {
    return requirePermission({ trigger: ['create'] })(c, next);
  }
  return next();
});

app.use('/:id', async (c, next) => {
  if (c.req.method === 'PATCH') {
    return requirePermission({ trigger: ['update'] })(c, next);
  }
  if (c.req.method === 'DELETE') {
    return requirePermission({ trigger: ['delete'] })(c, next);
  }
  return next();
});

/**
 * Generate webhook URL for a trigger
 */
function generateWebhookUrl(params: {
  baseUrl: string;
  tenantId: string;
  projectId: string;
  agentId: string;
  triggerId: string;
}): string {
  const { baseUrl, tenantId, projectId, agentId, triggerId } = params;
  return `${baseUrl}/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${triggerId}`;
}

/**
 * List Triggers for an Agent
 */
app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'List Triggers',
    operationId: 'list-triggers',
    tags: ['Triggers'],
    request: {
      params: TenantProjectAgentParamsSchema,
      query: PaginationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of triggers retrieved successfully',
        content: {
          'application/json': {
            schema: TriggerListResponse,
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
    const runApiBaseUrl = env.INKEEP_AGENTS_RUN_API_URL;

    const result = await listTriggersPaginated(db)({
      scopes: { tenantId, projectId, agentId },
      pagination: { page, limit },
    });

    // Add webhookUrl to each trigger and exclude sensitive scope fields
    const dataWithWebhookUrl = result.data.map((trigger) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tenantId: _tid, projectId: _pid, agentId: _aid, ...triggerWithoutScopes } = trigger;
      return {
        ...triggerWithoutScopes,
        webhookUrl: generateWebhookUrl({
          baseUrl: runApiBaseUrl,
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
        }),
      };
    });

    return c.json({
      data: dataWithWebhookUrl,
      pagination: result.pagination,
    });
  }
);

/**
 * Get Trigger by ID
 */
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Trigger',
    operationId: 'get-trigger-by-id',
    tags: ['Triggers'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Trigger found',
        content: {
          'application/json': {
            schema: TriggerResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const runApiBaseUrl = env.INKEEP_AGENTS_RUN_API_URL;

    const trigger = await getTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId: id,
    });

    if (!trigger) {
      throw createApiError({
        code: 'not_found',
        message: 'Trigger not found',
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tenantId: _tid, projectId: _pid, agentId: _aid, ...triggerWithoutScopes } = trigger;

    return c.json({
      data: {
        ...triggerWithoutScopes,
        webhookUrl: generateWebhookUrl({
          baseUrl: runApiBaseUrl,
          tenantId,
          projectId,
          agentId,
          triggerId: trigger.id,
        }),
      },
    });
  }
);

/**
 * Create Trigger
 */
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: 'Create Trigger',
    operationId: 'create-trigger',
    tags: ['Triggers'],
    request: {
      params: TenantProjectAgentParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: TriggerApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Trigger created successfully',
        content: {
          'application/json': {
            schema: TriggerResponse,
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
    const runApiBaseUrl = env.INKEEP_AGENTS_RUN_API_URL;

    const id = body.id || generateId();

    logger.info({ tenantId, projectId, agentId, triggerId: id }, 'Creating trigger');

    const trigger = await createTrigger(db)({
      id,
      tenantId,
      projectId,
      agentId,
      name: body.name,
      description: body.description,
      enabled: body.enabled !== undefined ? body.enabled : true,
      inputSchema: body.inputSchema,
      outputTransform: body.outputTransform,
      messageTemplate: body.messageTemplate,
      authentication: body.authentication,
      signingSecret: body.signingSecret,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tenantId: _tid, projectId: _pid, agentId: _aid, ...triggerWithoutScopes } = trigger;

    return c.json(
      {
        data: {
          ...triggerWithoutScopes,
          webhookUrl: generateWebhookUrl({
            baseUrl: runApiBaseUrl,
            tenantId,
            projectId,
            agentId,
            triggerId: trigger.id,
          }),
        },
      },
      201
    );
  }
);

/**
 * Update Trigger
 */
app.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    summary: 'Update Trigger',
    operationId: 'update-trigger',
    tags: ['Triggers'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: TriggerApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Trigger updated successfully',
        content: {
          'application/json': {
            schema: TriggerResponse,
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
    const runApiBaseUrl = env.INKEEP_AGENTS_RUN_API_URL;

    // Check if any update fields were actually provided
    // We check each field explicitly to avoid issues with Zod defaults
    const hasUpdateFields =
      body.name !== undefined ||
      body.description !== undefined ||
      body.enabled !== undefined ||
      body.inputSchema !== undefined ||
      body.outputTransform !== undefined ||
      body.messageTemplate !== undefined ||
      body.authentication !== undefined ||
      body.signingSecret !== undefined;

    if (!hasUpdateFields) {
      throw createApiError({
        code: 'bad_request',
        message: 'No fields to update',
      });
    }

    logger.info({ tenantId, projectId, agentId, triggerId: id }, 'Updating trigger');

    const updatedTrigger = await updateTrigger(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId: id,
      data: {
        name: body.name,
        description: body.description,
        enabled: body.enabled,
        inputSchema: body.inputSchema,
        outputTransform: body.outputTransform,
        messageTemplate: body.messageTemplate,
        authentication: body.authentication,
        signingSecret: body.signingSecret,
      },
    });

    if (!updatedTrigger) {
      throw createApiError({
        code: 'not_found',
        message: 'Trigger not found',
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tenantId: _tid, projectId: _pid, agentId: _aid, ...triggerWithoutScopes } =
      updatedTrigger;

    return c.json({
      data: {
        ...triggerWithoutScopes,
        webhookUrl: generateWebhookUrl({
          baseUrl: runApiBaseUrl,
          tenantId,
          projectId,
          agentId,
          triggerId: updatedTrigger.id,
        }),
      },
    });
  }
);

/**
 * Delete Trigger
 */
app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Trigger',
    operationId: 'delete-trigger',
    tags: ['Triggers'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Trigger deleted successfully',
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');

    logger.info({ tenantId, projectId, agentId, triggerId: id }, 'Deleting trigger');

    // First check if the trigger exists
    const existing = await getTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId: id,
    });

    if (!existing) {
      throw createApiError({
        code: 'not_found',
        message: 'Trigger not found',
      });
    }

    await deleteTrigger(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId: id,
    });

    return c.body(null, 204);
  }
);

/**
 * ========================================
 * Trigger Invocation Endpoints
 * ========================================
 */

// Response schemas for invocations
const TriggerInvocationResponse = z.object({
  data: TriggerInvocationApiSelectSchema,
});

const TriggerInvocationListResponse = z.object({
  data: z.array(TriggerInvocationApiSelectSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number(),
  }),
});

// Query params for invocation filtering
const TriggerInvocationQueryParamsSchema = PaginationQueryParamsSchema.extend({
  status: TriggerInvocationStatusEnum.optional(),
  from: z.string().datetime().optional().describe('Start date for filtering (ISO8601)'),
  to: z.string().datetime().optional().describe('End date for filtering (ISO8601)'),
});

/**
 * List Trigger Invocations
 */
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/invocations',
    summary: 'List Trigger Invocations',
    operationId: 'list-trigger-invocations',
    tags: ['Triggers'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
      query: TriggerInvocationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'List of trigger invocations retrieved successfully',
        content: {
          'application/json': {
            schema: TriggerInvocationListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    // Note: Using runtime DB client (runDbClient) for invocations, not manage DB (c.get('db'))
    const { tenantId, projectId, agentId, id: triggerId } = c.req.valid('param');
    const { page, limit, status, from, to } = c.req.valid('query');

    logger.info(
      { tenantId, projectId, agentId, triggerId, status, from, to },
      'Listing trigger invocations'
    );

    const result = await listTriggerInvocationsPaginated(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId,
      pagination: { page, limit },
      filters: {
        status,
        from,
        to,
      },
    });

    // Remove sensitive scope fields from invocations
    const dataWithoutScopes = result.data.map((invocation) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
 * Get Trigger Invocation by ID
 */
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/invocations/{invocationId}',
    summary: 'Get Trigger Invocation',
    operationId: 'get-trigger-invocation-by-id',
    tags: ['Triggers'],
    request: {
      params: TenantProjectAgentIdParamsSchema.extend({
        invocationId: z.string().describe('Trigger Invocation ID'),
      }),
    },
    responses: {
      200: {
        description: 'Trigger invocation found',
        content: {
          'application/json': {
            schema: TriggerInvocationResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    // Note: Using runtime DB client (runDbClient) for invocations, not manage DB (c.get('db'))
    const { tenantId, projectId, agentId, id: triggerId, invocationId } = c.req.valid('param');

    logger.info(
      { tenantId, projectId, agentId, triggerId, invocationId },
      'Getting trigger invocation'
    );

    const invocation = await getTriggerInvocationById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      triggerId,
      invocationId,
    });

    if (!invocation) {
      throw createApiError({
        code: 'not_found',
        message: 'Trigger invocation not found',
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tenantId: _tid, projectId: _pid, agentId: _aid, ...invocationWithoutScopes } =
      invocation;

    return c.json({
      data: invocationWithoutScopes,
    });
  }
);

export default app;
