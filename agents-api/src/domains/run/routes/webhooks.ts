import { OpenAPIHono, z } from '@hono/zod-openapi';
import type {
  CredentialStoreRegistry,
  FullExecutionContext,
  ResolvedRef,
} from '@inkeep/agents-core';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
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
 * Webhook endpoint for trigger invocation
 * POST /tenants/{tenantId}/projects/{projectId}/agents/{agentId}/triggers/{triggerId}
 */
const triggerWebhookRoute = createProtectedRoute({
  method: 'post',
  path: '/tenants/{tenantId}/projects/{projectId}/agents/{agentId}/triggers/{triggerId}',
  tags: ['Webhooks'],
  summary: 'Invoke agent via trigger webhook',
  description:
    'Webhook endpoint for third-party services to invoke an agent via a configured trigger',
  permission: noAuth(),
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
    400: {
      description: 'Invalid request payload',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
            validationErrors: z.array(z.string()).optional(),
          }),
        },
      },
    },
    401: {
      description: 'Missing authentication credentials',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    403: {
      description: 'Invalid authentication credentials or signature',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    404: {
      description: 'Trigger not found or disabled',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    422: {
      description: 'Payload transformation failed',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});

app.openapi(triggerWebhookRoute, async (c) => {
  const { tenantId, projectId, agentId, triggerId } = c.req.valid('param');
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
    if (result.validationErrors) {
      return c.json(
        { error: result.error, validationErrors: result.validationErrors },
        result.status
      );
    }
    return c.json({ error: result.error }, result.status);
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
