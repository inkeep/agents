import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  createTrigger,
  deleteTrigger,
  errorSchemaFactory,
  generateId,
  getCredentialReference,
  getTriggerById,
  getTriggerInvocationById,
  hashAuthenticationHeaders,
  listTriggerInvocationsPaginated,
  listTriggersPaginated,
  PaginationQueryParamsSchema,
  PartSchema,
  TenantProjectAgentIdParamsSchema,
  TenantProjectAgentParamsSchema,
  TriggerApiInsertSchema,
  TriggerApiUpdateSchema,
  TriggerInvocationListResponse,
  TriggerInvocationResponse,
  TriggerInvocationStatusEnum,
  TriggerWithWebhookUrlListResponse,
  TriggerWithWebhookUrlResponse,
  updateTrigger,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';
import { dispatchExecution } from '../../run/services/TriggerService';

const logger = getLogger('triggers');

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
  return `${baseUrl}/run/tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${triggerId}`;
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
            schema: TriggerWithWebhookUrlListResponse,
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
    const apiBaseUrl = env.INKEEP_AGENTS_API_URL;

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
          baseUrl: apiBaseUrl,
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
            schema: TriggerWithWebhookUrlResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const { tenantId, projectId, agentId, id } = c.req.valid('param');
    const apiBaseUrl = env.INKEEP_AGENTS_API_URL;

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
          baseUrl: apiBaseUrl,
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
            schema: TriggerWithWebhookUrlResponse,
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
    const apiBaseUrl = env.INKEEP_AGENTS_API_URL;

    const id = body.id || generateId();

    logger.debug({ tenantId, projectId, agentId, triggerId: id }, 'Creating trigger');

    // Validate credential reference exists if provided
    if (body.signingSecretCredentialReferenceId) {
      const credentialRef = await getCredentialReference(db)({
        scopes: { tenantId, projectId },
        id: body.signingSecretCredentialReferenceId,
      });

      if (!credentialRef) {
        throw createApiError({
          code: 'bad_request',
          message: `Credential reference not found: ${body.signingSecretCredentialReferenceId}`,
        });
      }

      // Only project-scoped credentials can be attached to triggers
      if (credentialRef.userId) {
        throw createApiError({
          code: 'bad_request',
          message:
            'Only project-scoped credentials can be attached to triggers. User-scoped credentials are not allowed.',
        });
      }
    }

    // Hash authentication header values before storing
    // The input schema uses { headers: [{name, value}] }, stored as { headers: [{name, valueHash, valuePrefix}] }
    let hashedAuthentication: unknown;
    const authInput = body.authentication as
      | { headers?: Array<{ name: string; value: string }> }
      | undefined;
    if (authInput?.headers && authInput.headers.length > 0) {
      const hashedHeaders = await hashAuthenticationHeaders(authInput.headers);
      hashedAuthentication = { headers: hashedHeaders };
    }

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
      authentication: hashedAuthentication as any,
      signingSecretCredentialReferenceId: body.signingSecretCredentialReferenceId,
      signatureVerification: body.signatureVerification as any,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tenantId: _tid, projectId: _pid, agentId: _aid, ...triggerWithoutScopes } = trigger;

    return c.json(
      {
        data: {
          ...triggerWithoutScopes,
          webhookUrl: generateWebhookUrl({
            baseUrl: apiBaseUrl,
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
            schema: TriggerWithWebhookUrlResponse,
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
    const apiBaseUrl = env.INKEEP_AGENTS_API_URL;

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
      body.signingSecretCredentialReferenceId !== undefined ||
      body.signatureVerification !== undefined;

    if (!hasUpdateFields) {
      throw createApiError({
        code: 'bad_request',
        message: 'No fields to update',
      });
    }

    logger.debug({ tenantId, projectId, agentId, triggerId: id }, 'Updating trigger');

    // Validate credential reference exists if provided
    if (body.signingSecretCredentialReferenceId) {
      const credentialRef = await getCredentialReference(db)({
        scopes: { tenantId, projectId },
        id: body.signingSecretCredentialReferenceId,
      });

      if (!credentialRef) {
        throw createApiError({
          code: 'bad_request',
          message: `Credential reference not found: ${body.signingSecretCredentialReferenceId}`,
        });
      }

      // Only project-scoped credentials can be attached to triggers
      if (credentialRef.userId) {
        throw createApiError({
          code: 'bad_request',
          message:
            'Only project-scoped credentials can be attached to triggers. User-scoped credentials are not allowed.',
        });
      }
    }

    // Handle authentication headers update
    // The update schema supports { headers: [{name, value?, keepExisting?}] }
    // If keepExisting is true, we preserve the existing hashed value
    let hashedAuthentication: unknown;
    const authInput = body.authentication as
      | { headers?: Array<{ name: string; value?: string; keepExisting?: boolean }> }
      | undefined;

    if (authInput?.headers && authInput.headers.length > 0) {
      // Get existing trigger to preserve keepExisting headers
      const existingTrigger = await getTriggerById(db)({
        scopes: { tenantId, projectId, agentId },
        triggerId: id,
      });

      const existingAuth = existingTrigger?.authentication as {
        headers?: Array<{ name: string; valueHash: string; valuePrefix: string }>;
      } | null;

      const hashedHeaders: Array<{ name: string; valueHash: string; valuePrefix: string }> = [];

      for (const header of authInput.headers) {
        if (header.keepExisting) {
          // Find and preserve existing header hash
          const existingHeader = existingAuth?.headers?.find((h) => h.name === header.name);
          if (existingHeader) {
            hashedHeaders.push({
              name: header.name,
              valueHash: existingHeader.valueHash,
              valuePrefix: existingHeader.valuePrefix,
            });
          }
          // If no existing header found, skip this one
        } else if (header.value) {
          // Hash the new value
          const hashed = await hashAuthenticationHeaders([
            { name: header.name, value: header.value },
          ]);
          hashedHeaders.push(hashed[0]);
        }
        // If neither keepExisting nor value, skip this header
      }

      hashedAuthentication = hashedHeaders.length > 0 ? { headers: hashedHeaders } : undefined;
    } else if (body.authentication !== undefined) {
      // Explicitly set to undefined/empty to clear authentication
      hashedAuthentication = body.authentication;
    }

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
        authentication: hashedAuthentication as any,
        signingSecretCredentialReferenceId: body.signingSecretCredentialReferenceId,
        signatureVerification: body.signatureVerification as any,
      },
    });

    if (!updatedTrigger) {
      throw createApiError({
        code: 'not_found',
        message: 'Trigger not found',
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {
      tenantId: _tid,
      projectId: _pid,
      agentId: _aid,
      ...triggerWithoutScopes
    } = updatedTrigger;

    return c.json({
      data: {
        ...triggerWithoutScopes,
        webhookUrl: generateWebhookUrl({
          baseUrl: apiBaseUrl,
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

    logger.debug({ tenantId, projectId, agentId, triggerId: id }, 'Deleting trigger');

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

// Query params for invocation filtering (extends base pagination with status/date filters)
const TriggerInvocationQueryParamsSchema = PaginationQueryParamsSchema.extend({
  status: TriggerInvocationStatusEnum.optional().openapi({
    description: 'Filter by invocation status',
  }),
  from: z.string().datetime().optional().openapi({
    description: 'Start date for filtering (ISO8601)',
  }),
  to: z.string().datetime().optional().openapi({
    description: 'End date for filtering (ISO8601)',
  }),
}).openapi('TriggerInvocationQueryParams');

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
    const { tenantId, projectId, agentId, id: triggerId } = c.req.valid('param');
    const { page, limit, status, from, to } = c.req.valid('query');

    logger.debug(
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
    const { tenantId, projectId, agentId, id: triggerId, invocationId } = c.req.valid('param');

    logger.debug(
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
 * Rerun Trigger
 * Re-executes a trigger with the provided user message (from a previous trace).
 */
app.use('/:id/rerun', async (c, next) => {
  if (c.req.method === 'POST') {
    return requireProjectPermission('use')(c, next);
  }
  return next();
});

app.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/rerun',
    summary: 'Rerun Trigger',
    operationId: 'rerun-trigger',
    tags: ['Triggers'],
    request: {
      params: TenantProjectAgentIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              userMessage: z.string().describe('The user message to send to the agent'),
              messageParts: z
                .array(PartSchema)
                .optional()
                .describe('Optional structured message parts (from original trace)'),
            }),
          },
        },
      },
    },
    responses: {
      202: {
        description: 'Trigger rerun accepted and dispatched',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              invocationId: z.string(),
              conversationId: z.string(),
            }),
          },
        },
      },
      409: errorSchemaFactory('conflict', 'Trigger is disabled'),
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const db = c.get('db');
    const resolvedRef = c.get('resolvedRef');
    const { tenantId, projectId, agentId, id: triggerId } = c.req.valid('param');
    const { userMessage, messageParts: rawMessageParts } = c.req.valid('json');

    logger.info({ tenantId, projectId, agentId, triggerId }, 'Rerunning trigger');

    const trigger = await getTriggerById(db)({
      scopes: { tenantId, projectId, agentId },
      triggerId,
    });

    if (!trigger) {
      throw createApiError({
        code: 'not_found',
        message: 'Trigger not found',
      });
    }

    if (!trigger.enabled) {
      throw createApiError({
        code: 'conflict',
        message: 'Trigger is disabled',
      });
    }

    const messageParts = rawMessageParts ?? [{ kind: 'text' as const, text: userMessage }];

    let invocationId: string;
    let conversationId: string;
    try {
      ({ invocationId, conversationId } = await dispatchExecution({
        tenantId,
        projectId,
        agentId,
        triggerId,
        resolvedRef,
        payload: { _rerun: true },
        transformedPayload: undefined,
        messageParts,
        userMessageText: userMessage,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(
        { err: errorMessage, errorStack, tenantId, projectId, agentId, triggerId },
        'Failed to dispatch trigger rerun execution'
      );
      throw createApiError({
        code: 'internal_server_error',
        message: `Something went wrong. Please contact support.`,
      });
    }

    logger.info(
      { tenantId, projectId, agentId, triggerId, invocationId, conversationId },
      'Trigger rerun dispatched'
    );

    return c.json({ success: true, invocationId, conversationId }, 202);
  }
);

export default app;
