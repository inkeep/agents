import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type {
  CredentialStoreRegistry,
  FullExecutionContext,
  ResolvedRef,
} from '@inkeep/agents-core';
import {
  createApiError,
  createMessage,
  createOrGetConversation,
  createTriggerInvocation,
  generateId,
  getConversationId,
  getFullProjectWithRelationIds,
  getTriggerById,
  interpolateTemplate,
  JsonTransformer,
  setActiveAgentForConversation,
  updateTriggerInvocationStatus,
  verifySigningSecret,
  verifyTriggerAuth,
  withRef,
} from '@inkeep/agents-core';
import { context as otelContext, propagation, trace } from '@opentelemetry/api';
import Ajv from 'ajv';
import manageDbPool from '../../../data/db/manageDbPool';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { ExecutionHandler } from '../handlers/executionHandler';
import { createSSEStreamHelper } from '../utils/stream-helpers';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  executionContext: FullExecutionContext;
  requestBody?: unknown;
  resolvedRef: ResolvedRef;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('webhooks');
const ajv = new Ajv({ allErrors: true });

/**
 * Webhook endpoint for trigger invocation
 * POST /tenants/:tenantId/projects/:projectId/agents/:agentId/triggers/:triggerId
 */
const triggerWebhookRoute = createRoute({
  method: 'post',
  path: '/tenants/:tenantId/projects/:projectId/agents/:agentId/triggers/:triggerId',
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
  },
});

app.openapi(triggerWebhookRoute, async (c) => {
  const { tenantId, projectId, agentId, triggerId } = c.req.param();
  const resolvedRef = c.get('resolvedRef');

  logger.info({ tenantId, projectId, agentId, triggerId }, 'Processing trigger webhook');

  try {
    const trigger = await withRef(manageDbPool, resolvedRef, (db) =>
      getTriggerById(db)({
        scopes: { tenantId, projectId, agentId },
        triggerId,
      })
    );

    if (!trigger) {
      throw createApiError({
        code: 'not_found',
        message: `Trigger ${triggerId} not found`,
      });
    }

    // Check if trigger is enabled
    if (!trigger.enabled) {
      throw createApiError({
        code: 'not_found',
        message: 'Trigger is disabled',
      });
    }

    // Get request body text for signature verification and parsing
    const bodyText = await c.req.text();
    const payload = bodyText ? JSON.parse(bodyText) : {};

    // Verify authentication (now async due to hash comparison)
    if (trigger.authentication) {
      const authResult = await verifyTriggerAuth(c, trigger.authentication as any);
      if (!authResult.success) {
        if (authResult.status === 401) {
          return c.json({ error: authResult.message || 'Unauthorized' }, 401);
        }
        return c.json({ error: authResult.message || 'Forbidden' }, 403);
      }
    }

    // Verify signing secret if configured
    if (trigger.signingSecret) {
      const signatureResult = verifySigningSecret(c, trigger.signingSecret, bodyText);
      if (!signatureResult.success) {
        return c.json({ error: signatureResult.message || 'Invalid signature' }, 403);
      }
    }

    // Validate payload against inputSchema
    if (trigger.inputSchema) {
      const validate = ajv.compile(trigger.inputSchema);
      const valid = validate(payload);

      if (!valid) {
        const errors = validate.errors?.map((err) => `${err.instancePath} ${err.message}`);
        return c.json(
          {
            error: 'Payload validation failed',
            validationErrors: errors,
          },
          400
        );
      }
    }

    // Transform payload using outputTransform configuration
    let transformedPayload = payload;
    if (trigger.outputTransform) {
      try {
        transformedPayload = await JsonTransformer.transformWithConfig(
          payload,
          trigger.outputTransform
        );
        logger.debug({ triggerId, tenantId, projectId }, 'Payload transformation successful');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          { triggerId, tenantId, projectId, error: errorMessage },
          'Payload transformation failed'
        );
        return c.json({ error: `Payload transformation failed: ${errorMessage}` }, 422);
      }
    }

    // Interpolate message template with transformed payload
    const interpolatedMessage = trigger.messageTemplate
      ? interpolateTemplate(trigger.messageTemplate, transformedPayload)
      : JSON.stringify(transformedPayload);

    // Generate IDs
    const conversationId = getConversationId();
    const invocationId = generateId();

    // Create trigger invocation record (status: pending) - uses runtime DB
    await createTriggerInvocation(runDbClient)({
      id: invocationId,
      triggerId,
      tenantId,
      projectId,
      agentId,
      conversationId,
      status: 'pending',
      requestPayload: payload,
      transformedPayload,
    });

    logger.info(
      { tenantId, projectId, agentId, triggerId, invocationId, conversationId },
      'Trigger invocation created'
    );

    // Fire-and-forget: Invoke agent asynchronously
    // We don't await this, so the webhook returns immediately with 202
    invokeAgentAsync({
      tenantId,
      projectId,
      agentId,
      triggerId,
      invocationId,
      conversationId,
      userMessage: interpolatedMessage,
      resolvedRef,
    }).catch((error) => {
      // Log error but don't throw (fire-and-forget)
      logger.error(
        { error, tenantId, projectId, agentId, triggerId, invocationId },
        'Async agent invocation failed'
      );
    });

    logger.info(
      { tenantId, projectId, agentId, triggerId, invocationId, conversationId },
      'Trigger webhook accepted, agent invocation initiated'
    );

    return c.json(
      {
        success: true,
        invocationId,
      },
      202
    );
  } catch (error) {
    logger.error({ error, tenantId, projectId, agentId, triggerId }, 'Webhook processing failed');
    throw error;
  }
});

/**
 * Invokes an agent asynchronously for a trigger invocation.
 * This function creates a conversation, stores the user message,
 * and executes the agent using ExecutionHandler.
 * It updates the trigger invocation status based on success/failure.
 */
async function invokeAgentAsync(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  triggerId: string;
  invocationId: string;
  conversationId: string;
  userMessage: string;
  resolvedRef: ResolvedRef;
}) {
  const {
    tenantId,
    projectId,
    agentId,
    triggerId,
    invocationId,
    conversationId,
    userMessage,
    resolvedRef,
  } = params;

  // Create a new tracer for trigger invocations
  const tracer = trace.getTracer('trigger-invocation');

  // Create a new root span for the trigger invocation (since this runs async after HTTP request completes)
  return await tracer.startActiveSpan(
    'trigger.invocation',
    {
      attributes: {
        'conversation.id': conversationId,
        'tenant.id': tenantId,
        'project.id': projectId,
        'agent.id': agentId,
        // Trigger-specific attributes to identify this as a trigger invocation
        'invocation.type': 'trigger',
        'trigger.id': triggerId,
        'trigger.invocation.id': invocationId,
        // User message attributes for SigNoz conversation queries
        'message.content': userMessage,
        'message.timestamp': new Date().toISOString(),
      },
    },
    async (span) => {
      // Set up baggage so all child spans inherit the key attributes
      // The BaggageSpanProcessor will automatically copy these to span attributes
      let currentBag = propagation.getBaggage(otelContext.active());
      if (!currentBag) {
        currentBag = propagation.createBaggage();
      }
      currentBag = currentBag.setEntry('conversation.id', { value: conversationId });
      currentBag = currentBag.setEntry('tenant.id', { value: tenantId });
      currentBag = currentBag.setEntry('project.id', { value: projectId });
      currentBag = currentBag.setEntry('agent.id', { value: agentId });
      // Trigger-specific baggage entries - propagate to all child spans
      currentBag = currentBag.setEntry('invocation.type', { value: 'trigger' });
      currentBag = currentBag.setEntry('trigger.id', { value: triggerId });
      currentBag = currentBag.setEntry('trigger.invocation.id', { value: invocationId });
      const ctxWithBaggage = propagation.setBaggage(otelContext.active(), currentBag);

      // Execute the entire invocation within the traced context
      return await otelContext.with(ctxWithBaggage, async () => {
        try {
          logger.info(
            { tenantId, projectId, agentId, triggerId, invocationId, conversationId },
            'Starting async agent invocation'
          );

          // Load full project with agents to build execution context
          const project = await withRef(manageDbPool, resolvedRef, async (db) => {
            return await getFullProjectWithRelationIds(db)({
              scopes: { tenantId, projectId },
            });
          });

          if (!project) {
            throw createApiError({
              code: 'not_found',
              message: `Project ${projectId} not found`,
            });
          }

          // Get the agent from project
          const fullAgent = project.agents[agentId];
          if (!fullAgent) {
            throw createApiError({
              code: 'not_found',
              message: `Agent ${agentId} not found`,
            });
          }

          // Determine default sub-agent
          logger.debug(
            {
              tenantId,
              projectId,
              agentId,
              defaultSubAgentId: fullAgent.defaultSubAgentId,
              subAgentKeys: Object.keys((fullAgent.subAgents as Record<string, any>) || {}),
              subAgentsCount: Object.keys((fullAgent.subAgents as Record<string, any>) || {})
                .length,
            },
            'Debug: Agent and sub-agent info'
          );

          const agentKeys = Object.keys((fullAgent.subAgents as Record<string, any>) || {});
          const firstAgentId = agentKeys.length > 0 ? agentKeys[0] : '';
          const defaultSubAgentId = (fullAgent.defaultSubAgentId as string) || firstAgentId;

          if (!defaultSubAgentId) {
            throw createApiError({
              code: 'not_found',
              message: 'No default sub-agent found',
            });
          }

          // Build execution context for trigger invocation
          const executionContext: FullExecutionContext = {
            tenantId,
            projectId,
            agentId,
            baseUrl: env.INKEEP_AGENTS_API_URL || 'http://localhost:3002',
            apiKey: '', // Triggers don't use API keys
            apiKeyId: 'trigger-invocation', // Placeholder since triggers don't use API keys
            resolvedRef,
            project,
            metadata: {
              initiatedBy: {
                type: 'api_key',
                id: triggerId,
              },
            },
          };

          // Create conversation in runtime database
          await createOrGetConversation(runDbClient)({
            tenantId,
            projectId,
            id: conversationId,
            agentId,
            activeSubAgentId: defaultSubAgentId,
            ref: executionContext.resolvedRef,
          });

          // Set active agent for conversation
          await setActiveAgentForConversation(runDbClient)({
            scopes: { tenantId, projectId },
            conversationId,
            agentId,
            subAgentId: defaultSubAgentId,
            ref: executionContext.resolvedRef,
          });

          logger.info(
            { conversationId, agentId, defaultSubAgentId },
            'Conversation created and agent set'
          );

          // Create user message in conversation
          await createMessage(runDbClient)({
            id: generateId(),
            tenantId,
            projectId,
            conversationId,
            role: 'user',
            content: {
              text: userMessage,
            },
            visibility: 'user-facing',
            messageType: 'chat',
          });

          logger.info({ conversationId, invocationId }, 'User message created');

          // Execute the agent using ExecutionHandler
          // Note: We use a null stream helper since this is fire-and-forget (no SSE streaming)
          const requestId = `trigger-${invocationId}`;
          const timestamp = Math.floor(Date.now() / 1000);

          // Create a no-op stream helper since triggers don't stream responses back
          // The HonoSSEStream interface requires writeSSE and sleep methods
          const noOpStreamHelper = createSSEStreamHelper(
            {
              writeSSE: async () => {},
              sleep: async () => {},
            },
            requestId,
            timestamp
          );

          const executionHandler = new ExecutionHandler();
          await executionHandler.execute({
            executionContext,
            conversationId,
            userMessage,
            initialAgentId: agentId,
            requestId,
            sseHelper: noOpStreamHelper,
            emitOperations: false,
          });

          // Update trigger invocation status to success - uses runtime DB
          await updateTriggerInvocationStatus(runDbClient)({
            scopes: { tenantId, projectId, agentId },
            triggerId,
            invocationId,
            data: {
              status: 'success',
            },
          });

          logger.info(
            { tenantId, projectId, agentId, triggerId, invocationId, conversationId },
            'Agent invocation completed successfully'
          );
          span.end();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          logger.error(
            { error, tenantId, projectId, agentId, triggerId, invocationId },
            'Agent invocation failed'
          );

          // Record error on span
          span.recordException(error instanceof Error ? error : new Error(errorMessage));
          span.setStatus({ code: 2, message: errorMessage }); // SpanStatusCode.ERROR = 2

          // Update trigger invocation status to failed - uses runtime DB
          try {
            await updateTriggerInvocationStatus(runDbClient)({
              scopes: { tenantId, projectId, agentId },
              triggerId,
              invocationId,
              data: {
                status: 'failed',
                errorMessage,
              },
            });
          } catch (updateError) {
            logger.error(
              { updateError, invocationId },
              'Failed to update trigger invocation status to failed'
            );
          }

          span.end();
          throw error;
        }
      });
    }
  );
}

export default app;
