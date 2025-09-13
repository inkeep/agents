import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  type CredentialStoreRegistry,
  contextValidationMiddleware,
  createMessage,
  createOrGetConversation,
  getActiveAgentForConversation,
  getAgentById,
  getAgentGraphWithDefaultAgent,
  getFullGraph,
  getRequestExecutionContext,
  handleContextResolution,
  setActiveAgentForConversation,
} from '@inkeep/agents-core';
// import { Hono } from 'hono';
import { trace } from '@opentelemetry/api';
import { streamSSE } from 'hono/streaming';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';
import { ExecutionHandler } from '../handlers/executionHandler';
import { getLogger } from '../logger';
import type { ContentItem, Message } from '../types/chat';
import { createSSEStreamHelper } from '../utils/stream-helpers';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  requestBody?: any;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('completionsHandler');

// Define the OpenAPI route schema
const chatCompletionsRoute = createRoute({
  method: 'post',
  path: '/completions',
  tags: ['chat'],
  summary: 'Create chat completion',
  description:
    'Creates a new chat completion with streaming SSE response using the configured agent graph',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            model: z.string().describe('The model to use for the completion'),
            messages: z
              .array(
                z.object({
                  role: z
                    .enum(['system', 'user', 'assistant', 'function', 'tool'])
                    .describe('The role of the message'),
                  content: z
                    .union([
                      z.string(),
                      z.array(
                        z.strictObject({
                          type: z.string(),
                          text: z.string().optional(),
                        })
                      ),
                    ])
                    .describe('The message content'),
                  name: z.string().optional().describe('The name of the message sender'),
                })
              )
              .describe('The conversation messages'),
            temperature: z.number().optional().describe('Controls randomness (0-1)'),
            top_p: z.number().optional().describe('Controls nucleus sampling'),
            n: z.number().optional().describe('Number of completions to generate'),
            stream: z.boolean().optional().describe('Whether to stream the response'),
            max_tokens: z.number().optional().describe('Maximum tokens to generate'),
            presence_penalty: z.number().optional().describe('Presence penalty (-2 to 2)'),
            frequency_penalty: z.number().optional().describe('Frequency penalty (-2 to 2)'),
            logit_bias: z.record(z.string(), z.number()).optional().describe('Token logit bias'),
            user: z.string().optional().describe('User identifier'),
            conversationId: z.string().optional().describe('Conversation ID for multi-turn chat'),
            tools: z.array(z.string()).optional().describe('Available tools'),
            runConfig: z.record(z.string(), z.unknown()).optional().describe('Run configuration'),
            requestContext: z
              .record(z.string(), z.unknown())
              .optional()
              .describe(
                'Context data for template processing (validated against context config schema)'
              ),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Streaming chat completion response in Server-Sent Events format',
      headers: z.object({
        'Content-Type': z.string().default('text/event-stream'),
        'Cache-Control': z.string().default('no-cache'),
        Connection: z.string().default('keep-alive'),
      }),
      content: {
        'text/event-stream': {
          schema: z.string().describe('Server-Sent Events stream with chat completion chunks'),
        },
      },
    },
    400: {
      description: 'Invalid request context or parameters',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
            details: z
              .array(
                z.object({
                  field: z.string(),
                  message: z.string(),
                  value: z.unknown().optional(),
                })
              )
              .optional(),
          }),
        },
      },
    },
    404: {
      description: 'Agent graph or agent not found',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
  },
});

// Apply context validation middleware
app.use('/completions', contextValidationMiddleware(dbClient));

app.openapi(chatCompletionsRoute, async (c) => {
  getLogger('chat').info(
    {
      path: c.req.path,
      method: c.req.method,
      params: c.req.param(),
    },
    'Chat route accessed'
  );

  const otelHeaders = {
    traceparent: c.req.header('traceparent'),
    tracestate: c.req.header('tracestate'),
    baggage: c.req.header('baggage'),
  };

  logger.info(
    {
      otelHeaders,
      path: c.req.path,
      method: c.req.method,
    },
    'OpenTelemetry headers: chat'
  );
  try {
    // Get execution context from API key authentication
    const executionContext = getRequestExecutionContext(c);
    const { tenantId, projectId, graphId } = executionContext;

    getLogger('chat').debug(
      {
        tenantId,
        graphId,
      },
      'Extracted chat parameters from API key context'
    );

    // Get conversationId from request body or generate new one
    const body = c.get('requestBody') || {};
    const conversationId = body.conversationId || nanoid();

    // Get the graph from the full graph system first, fall back to legacy system
    const fullGraph = await getFullGraph(dbClient)({
      scopes: { tenantId, projectId },
      graphId,
    });

    let agentGraph: any;
    let defaultAgentId: string;

    if (fullGraph) {
      // Use full graph system
      agentGraph = {
        id: fullGraph.id,
        name: fullGraph.name,
        tenantId,
        projectId,
        defaultAgentId: fullGraph.defaultAgentId,
      };
      const agentKeys = Object.keys((fullGraph.agents as Record<string, any>) || {});
      const firstAgentId = agentKeys.length > 0 ? agentKeys[0] : '';
      defaultAgentId = (fullGraph.defaultAgentId as string) || firstAgentId; // Use first agent if no defaultAgentId
    } else {
      // Fall back to legacy system
      agentGraph = await getAgentGraphWithDefaultAgent(dbClient)({
        scopes: { tenantId, projectId },
        graphId,
      });
      if (!agentGraph) {
        return c.json({ error: 'Agent graph not found' }, 404);
      }
      defaultAgentId = agentGraph.defaultAgentId || '';
    }

    if (!defaultAgentId) {
      return c.json({ error: 'No default agent found in graph' }, 404);
    }

    // Get or create conversation with the default agent
    await createOrGetConversation(dbClient)({
      tenantId,
      projectId,
      id: conversationId,
      activeAgentId: defaultAgentId,
    });

    const activeAgent = await getActiveAgentForConversation(dbClient)({
      scopes: { tenantId, projectId },
      conversationId,
    });
    if (!activeAgent) {
      // Use the default agent from the graph instead of headAgentId
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

    logger.info(
      {
        tenantId,
        graphId,
        conversationId,
        defaultAgentId,
        activeAgentId: activeAgent?.activeAgentId || 'none',
        hasContextConfig: !!agentGraph.contextConfigId,
        hasRequestContext: !!body.requestContext,
        hasValidatedContext: !!validatedContext,
        validatedContextKeys: Object.keys(validatedContext),
      },
      'parameters'
    );

    const requestId = `chatcmpl-${Date.now()}`;
    const timestamp = Math.floor(Date.now() / 1000);

    // Extract user message for context
    const lastUserMessage = body.messages
      .filter((msg: Message) => msg.role === 'user')
      .slice(-1)[0];
    const userMessage = lastUserMessage ? getMessageText(lastUserMessage.content) : '';

    const messageSpan = trace.getActiveSpan();
    if (messageSpan) {
      messageSpan.setAttributes({
        'message.content': userMessage,
        'message.timestamp': Date.now(),
      });
    }

    // Store the user message in the database
    await createMessage(dbClient)({
      id: nanoid(),
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
    if (messageSpan) {
      messageSpan.addEvent('user.message.stored', {
        'message.id': conversationId,
        'database.operation': 'insert',
      });
    }

    // Use Hono's streamSSE helper for proper SSE formatting
    return streamSSE(c, async (stream) => {
      // Create SSE stream helper
      const sseHelper = createSSEStreamHelper(stream, requestId, timestamp);

      // Start with the role
      await sseHelper.writeRole();

      logger.info({ agentId }, 'Starting execution');

      // Use the execution handler
      const executionHandler = new ExecutionHandler();
      const result = await executionHandler.execute({
        executionContext,
        conversationId,
        userMessage,
        initialAgentId: agentId,
        requestId,
        sseHelper,
      });

      logger.info(
        { result },
        `Execution completed: ${result.success ? 'success' : 'failed'} after ${result.iterations} iterations`
      );

      if (!result.success) {
        // If execution failed and no error was already streamed, send a default error
        await sseHelper.writeError(
          'Sorry, I was unable to process your request at this time. Please try again.'
        );
      }

      // Complete the stream
      await sseHelper.complete();
    });
  } catch (error) {
    console.error('❌ Error in chat completions endpoint:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return c.json(
      {
        error: 'Failed to process chat completion',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

// Helper function to extract text from content
const getMessageText = (content: string | ContentItem[]): string => {
  if (typeof content === 'string') {
    return content;
  }

  // For content arrays, extract text from all text items
  return content
    .filter((item) => item.type === 'text' && item.text)
    .map((item) => item.text)
    .join(' ');
};

export default app;
