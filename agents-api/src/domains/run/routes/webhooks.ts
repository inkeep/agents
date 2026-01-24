import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type {
  CredentialStoreRegistry,
  FullExecutionContext,
  ResolvedRef,
} from '@inkeep/agents-core';
import { commonGetErrorResponses, createApiError, type ErrorCodes } from '@inkeep/agents-core';
import { getLogger } from '../../../logger';
import { processWebhook } from '../services/TriggerService';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  executionContext: FullExecutionContext;
  requestBody?: unknown;
  resolvedRef: ResolvedRef;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('webhooks');

/**
 * Map HTTP status codes to error codes for createApiError
 */
function statusToErrorCode(status: 400 | 401 | 403 | 404 | 422 | 500): ErrorCodes {
  const mapping: Record<number, ErrorCodes> = {
    400: 'bad_request',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not_found',
    422: 'unprocessable_entity',
    500: 'internal_server_error',
  };
  return mapping[status];
}

/**
 * Webhook endpoint for trigger invocation
 * POST /tenants/{tenantId}/projects/{projectId}/agents/{agentId}/triggers/{triggerId}
 */
const triggerWebhookRoute = createRoute({
  method: 'post',
  path: '/tenants/{tenantId}/projects/{projectId}/agents/{agentId}/triggers/{triggerId}',
  tags: ['webhooks'],
  summary: 'Invoke agent via trigger webhook',
  description:
    'Webhook endpoint for third-party services to invoke an agent via a configured trigger',
  request: {
    params: z.object({
      tenantId: z.string().describe('Tenant ID'),
      projectId: z.string().describe('Project ID'),
      agentId: z.string().describe('Agent ID'),
      triggerId: z.string().describe('Trigger ID'),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.record(z.string(), z.unknown()).describe('Webhook payload'),
        },
      },
    },
  },
  responses: {
    202: {
      description: 'Webhook accepted and trigger invoked',
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
    ...commonGetErrorResponses,
  },
});

app.openapi(triggerWebhookRoute, async (c) => {
  const { tenantId, projectId, agentId, triggerId } = c.req.param();
  const resolvedRef = c.get('resolvedRef');

  logger.info({ tenantId, projectId, agentId, triggerId }, 'Processing trigger webhook');

  const rawBody = await c.req.text();

  const result = await processWebhook({
    tenantId,
    projectId,
    agentId,
    triggerId,
    resolvedRef,
    rawBody,
    honoContext: c,
  });

  if (!result.success) {
    const errorCode = statusToErrorCode(result.status);
    throw createApiError({
      code: errorCode,
      message: result.error,
      extensions: {
        ...(result.invocationId && { invocationId: result.invocationId }),
        ...(result.validationErrors && { validationErrors: result.validationErrors }),
      },
    });
  }

  logger.info(
    {
      tenantId,
      projectId,
      agentId,
      triggerId,
      invocationId: result.invocationId,
      conversationId: result.conversationId,
    },
    'Trigger webhook accepted, workflow dispatched'
  );

  return c.json(
    { success: true, invocationId: result.invocationId, conversationId: result.conversationId },
    202
  );
});

export default app;
