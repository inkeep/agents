import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type CredentialStoreRegistry,
  commonGetErrorResponses,
  contextValidationMiddleware,
  createApiError,
  createMessage,
  generateId,
  getActiveAgentForConversation,
  getAgentWithDefaultSubAgent,
  getConversationId,
  getRequestExecutionContext,
  getSubAgentById,
  handleContextResolution,
  loggerFactory,
  setActiveAgentForConversation,
} from '@inkeep/agents-core';
import { context as otelContext, propagation, trace } from '@opentelemetry/api';
import { createUIMessageStream, JsonToSseTransformStream } from 'ai';
import { stream } from 'hono/streaming';
import dbClient from '../data/db/dbClient';
import { ExecutionHandler } from '../handlers/executionHandler';
import { getLogger } from '../logger';
import { errorOp } from '../utils/agent-operations';
import { createVercelStreamHelper } from '../utils/stream-helpers';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  requestBody?: any;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('chatDataStream');

const chatDataStreamRoute = createRoute({
  method: 'post',
  path: '/chat',
  tags: ['chat'],
  summary: 'Chat (Vercel Streaming Protocol)',
  description: 'Chat completion endpoint streaming with Vercel data stream protocol.',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            model: z.string().optional(),
            messages: z.array(
              z.object({
                role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
                content: z.any(),
                parts: z
                  .array(
                    z.object({
                      type: z.union([
                        z.enum(['text', 'image', 'audio', 'video', 'file']),
                        z.string().regex(/^data-/, 'Type must start with "data-"'),
                      ]),
                      text: z.string().optional(),
                    })
                  )
                  .optional(),
              })
            ),
            id: z.string().optional(),
            conversationId: z.string().optional(),
            headers: z
              .record(z.string(), z.unknown())
              .optional()
              .describe('Headers data for template processing'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Streamed chat completion',
      headers: z.object({
        'Content-Type': z.string().default('text/plain; charset=utf-8'),
        'x-vercel-ai-data-stream': z.string().default('v1'),
      }),
    },
    ...commonGetErrorResponses,
  },
});
// Apply context validation middleware
app.use('/chat', contextValidationMiddleware(dbClient));

app.openapi(chatDataStreamRoute, async (c) => {
  try {
    // Get execution context from API key authentication
    const executionContext = getRequestExecutionContext(c);
    const { tenantId, projectId, agentId } = executionContext;

    loggerFactory
      .getLogger('chatDataStream')
      .debug({ tenantId, projectId, agentId }, 'Extracted chatDataStream parameters');

    // Get parsed body from middleware (shared across all handlers)
    const body = c.get('requestBody') || {};
    const conversationId = body.conversationId || getConversationId();
    // Add conversation ID to parent span
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes({
        'conversation.id': conversationId,
        'tenant.id': tenantId,
        'agent.id': agentId,
        'project.id': projectId,
      });
    }

    // Update baggage with conversation.id for all child spans
    let currentBag = propagation.getBaggage(otelContext.active());
    if (!currentBag) {
      currentBag = propagation.createBaggage();
    }
    currentBag = currentBag.setEntry('conversation.id', { value: conversationId });
    // Create context with updated baggage and execute within it
    const ctxWithBaggage = propagation.setBaggage(otelContext.active(), currentBag);
    // Execute remaining handler within the baggage context so child spans inherit attributes
    return await otelContext.with(ctxWithBaggage, async () => {
      const agent = await getAgentWithDefaultSubAgent(dbClient)({
        scopes: { tenantId, projectId, agentId },
      });
      if (!agent) {
        throw createApiError({
          code: 'not_found',
          message: 'Agent not found',
        });
      }

      const defaultSubAgentId = agent.defaultSubAgentId;
      const agentName = agent.name;

      if (!defaultSubAgentId) {
        throw createApiError({
          code: 'bad_request',
          message: 'Agent does not have a default agent configured',
        });
      }

      const activeAgent = await getActiveAgentForConversation(dbClient)({
        scopes: { tenantId, projectId },
        conversationId,
      });
      if (!activeAgent) {
        setActiveAgentForConversation(dbClient)({
          scopes: { tenantId, projectId },
          conversationId,
          subAgentId: defaultSubAgentId,
        });
      }
      const subAgentId = activeAgent?.activeSubAgentId || defaultSubAgentId;

      const agentInfo = await getSubAgentById(dbClient)({
        scopes: { tenantId, projectId, agentId },
        subAgentId: subAgentId as string,
      });
      if (!agentInfo) {
        throw createApiError({
          code: 'not_found',
          message: 'Agent not found',
        });
      }

      // Get validated context from middleware (falls back to body.headers if no validation)
      const validatedContext = (c as any).get('validatedContext') || body.headers || {};

      const credentialStores = c.get('credentialStores');

      // Context resolution with intelligent conversation state detection
      await handleContextResolution({
        tenantId,
        projectId,
        agentId,
        conversationId,
        headers: validatedContext,
        dbClient,
        credentialStores,
      });

      // Store last user message
      const lastUserMessage = body.messages.filter((m: any) => m.role === 'user').slice(-1)[0];
      const userText =
        typeof lastUserMessage?.content === 'string'
          ? lastUserMessage.content
          : lastUserMessage?.parts?.map((p: any) => p.text).join('') || '';
      logger.info({ userText, lastUserMessage }, 'userText');
      const messageSpan = trace.getActiveSpan();
      if (messageSpan) {
        messageSpan.setAttributes({
          'message.timestamp': new Date().toISOString(),
          'message.content': userText,
          'agent.name': agentName,
        });
      }
      await createMessage(dbClient)({
        id: generateId(),
        tenantId,
        projectId,
        conversationId,
        role: 'user',
        content: { text: userText },
        visibility: 'user-facing',
        messageType: 'chat',
      });
      if (messageSpan) {
        messageSpan.addEvent('user.message.stored', {
          'message.id': conversationId,
          'database.operation': 'insert',
        });
      }

      // Create UI Message Stream using AI SDK V5
      const dataStream = createUIMessageStream({
        execute: async ({ writer }) => {
          const streamHelper = createVercelStreamHelper(writer);
          try {
            // Check for emit operations header
            const emitOperationsHeader = c.req.header('x-emit-operations');
            const emitOperations = emitOperationsHeader === 'true';

            const executionHandler = new ExecutionHandler();

            const result = await executionHandler.execute({
              executionContext,
              conversationId,
              userMessage: userText,
              initialAgentId: subAgentId,
              requestId: `chatds-${Date.now()}`,
              sseHelper: streamHelper,
              emitOperations,
            });

            if (!result.success) {
              await streamHelper.writeOperation(errorOp('Unable to process request', 'system'));
            }
          } catch (err) {
            logger.error({ err }, 'Streaming error');
            await streamHelper.writeOperation(errorOp('Internal server error', 'system'));
          } finally {
            // Clean up stream helper resources if it has cleanup method
            if ('cleanup' in streamHelper && typeof streamHelper.cleanup === 'function') {
              streamHelper.cleanup();
            }
          }
        },
      });

      c.header('content-type', 'text/event-stream');
      c.header('cache-control', 'no-cache');
      c.header('connection', 'keep-alive');
      c.header('x-vercel-ai-data-stream', 'v2');
      c.header('x-accel-buffering', 'no'); // disable nginx buffering

      return stream(c, (stream) =>
        stream.pipe(
          dataStream
            .pipeThrough(new JsonToSseTransformStream())
            .pipeThrough(new TextEncoderStream())
        )
      );
    });
  } catch (error) {
    logger.error({ error }, 'chatDataStream error');
    throw createApiError({
      code: 'internal_server_error',
      message: 'Failed to process chat completion',
    });
  }
});

export default app;
