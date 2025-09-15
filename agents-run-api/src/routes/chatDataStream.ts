import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type CredentialStoreRegistry,
  commonGetErrorResponses,
  contextValidationMiddleware,
  createMessage,
  getActiveAgentForConversation,
  getAgentById,
  getAgentGraphWithDefaultAgent,
  getRequestExecutionContext,
  handleContextResolution,
  setActiveAgentForConversation,
} from '@inkeep/agents-core';
import { trace } from '@opentelemetry/api';
import { createUIMessageStream, JsonToSseTransformStream } from 'ai';
import { stream } from 'hono/streaming';
import { nanoid } from 'nanoid';
import dbClient from '../data/db/dbClient';
import { ExecutionHandler } from '../handlers/executionHandler';
import { getLogger } from '../logger';
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
            requestContext: z
              .record(z.string(), z.unknown())
              .optional()
              .describe('Context data for template processing'),
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
    const { tenantId, projectId, graphId } = executionContext;

    // Get parsed body from middleware (shared across all handlers)
    const body = c.get('requestBody') || {};
    const conversationId = body.conversationId || nanoid();
    // Add conversation ID to parent span
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes({
        'conversation.id': conversationId,
        'tenant.id': tenantId,
        'graph.id': graphId,
        'project.id': projectId,
      });
    }

    const agentGraph = await getAgentGraphWithDefaultAgent(dbClient)({
      scopes: { tenantId, projectId },
      graphId,
    });
    if (!agentGraph) {
      return c.json({ error: 'Agent graph not found' }, 404);
    }

    const defaultAgentId = agentGraph.defaultAgentId;
    const graphName = agentGraph.name;

    const activeAgent = await getActiveAgentForConversation(dbClient)({
      scopes: { tenantId, projectId },
      conversationId,
    });
    if (!activeAgent) {
      setActiveAgentForConversation(dbClient)({
        scopes: { tenantId, projectId },
        conversationId,
        agentId: defaultAgentId,
      });
    }
    const agentId = activeAgent?.activeAgentId || defaultAgentId;

    const agentInfo = await getAgentById(dbClient)({
      scopes: { tenantId, projectId },
      agentId: agentId as string,
    });
    if (!agentInfo) {
      return c.json({ error: 'Agent not found' }, 404);
    }

    // Get validated context from middleware (falls back to body.context if no validation)
    const validatedContext = (c as any).get('validatedContext') || body.requestContext || {};
    const credentialStores = c.get('credentialStores');

    // Context resolution with intelligent conversation state detection
    await handleContextResolution(
      tenantId,
      projectId,
      conversationId,
      graphId,
      validatedContext,
      dbClient,
      credentialStores
    );

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
        'graph.name': graphName,
      });
    }
    await createMessage(dbClient)({
      id: nanoid(),
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
          const executionHandler = new ExecutionHandler();

          const result = await executionHandler.execute({
            executionContext,
            conversationId,
            userMessage: userText,
            initialAgentId: agentId,
            requestId: `chatds-${Date.now()}`,
            sseHelper: streamHelper,
          });

          if (!result.success) {
            await streamHelper.writeError('Unable to process request');
          }
        } catch (err) {
          logger.error({ err }, 'Streaming error');
          await streamHelper.writeError('Internal server error');
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

    const spanContext = trace.getActiveSpan()?.spanContext();
    if (spanContext) {
      c.header('trace-id', spanContext.traceId);
    }

    return stream(c, (stream) =>
      stream.pipe(
        dataStream.pipeThrough(new JsonToSseTransformStream()).pipeThrough(new TextEncoderStream())
      )
    );
  } catch (error) {
    logger.error({ error }, 'chatDataStream error');
    return c.json({ error: 'Failed to process chat completion' }, 500);
  }
});

export default app;
