import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  type CredentialStoreRegistry,
  contextValidationMiddleware,
  createApiError,
  createMessage,
  createOrGetConversation,
  executeInBranch,
  generateId,
  getActiveAgentForConversation,
  getAgentWithDefaultSubAgent,
  getConversationId,
  getFullAgent,
  getRequestExecutionContext,
  getSubAgentById,
  handleContextResolution,
  setActiveAgentForConversation,
} from '@inkeep/agents-core';
import { context as otelContext, propagation, trace } from '@opentelemetry/api';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';
import { ExecutionHandler } from '../handlers/executionHandler';
import { getLogger } from '../logger';
import type { ContentItem, Message } from '../types/chat';
import { errorOp } from '../utils/agent-operations';
import { createSSEStreamHelper } from '../utils/stream-helpers';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  requestBody?: any;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('completionsHandler');

const chatCompletionsRoute = createRoute({
  method: 'post',
  path: '/completions',
  tags: ['chat'],
  summary: 'Create chat completion',
  description:
    'Creates a new chat completion with streaming SSE response using the configured agent',
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
            headers: z
              .record(z.string(), z.unknown())
              .optional()
              .describe(
                'Headers data for template processing (validated against context config schema)'
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
      description: 'Agent or agent not found',
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
    const executionContext = getRequestExecutionContext(c);
    const { tenantId, projectId, agentId, ref } = executionContext;

    getLogger('chat').debug(
      {
        tenantId,
        agentId,
      },
      'Extracted chat parameters from API key context'
    );

    const body = c.get('requestBody') || {};
    const conversationId = body.conversationId || getConversationId();

    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes({
        'conversation.id': conversationId,
        'tenant.id': tenantId,
        'agent.id': agentId,
        'project.id': projectId,
      });
    }

    let currentBag = propagation.getBaggage(otelContext.active());
    if (!currentBag) {
      currentBag = propagation.createBaggage();
    }
    currentBag = currentBag.setEntry('conversation.id', { value: conversationId });
    const ctxWithBaggage = propagation.setBaggage(otelContext.active(), currentBag);
    return await otelContext.with(ctxWithBaggage, async () => {
      const fullAgent = await executeInBranch({ dbClient, ref }, async (db) => {
        return await getFullAgent(db)({
          scopes: { tenantId, projectId, agentId },
        });
      });

      let agent: any;
      let defaultSubAgentId: string;

      if (fullAgent) {
        agent = {
          id: fullAgent.id,
          name: fullAgent.name,
          tenantId,
          projectId,
          defaultSubAgentId: fullAgent.defaultSubAgentId,
        };
        const agentKeys = Object.keys((fullAgent.subAgents as Record<string, any>) || {});
        const firstAgentId = agentKeys.length > 0 ? agentKeys[0] : '';
        defaultSubAgentId = (fullAgent.defaultSubAgentId as string) || firstAgentId; // Use first agent if no defaultSubAgentId
      } else {
        agent = await executeInBranch({ dbClient, ref }, async (db) => {
          return await getAgentWithDefaultSubAgent(db)({
            scopes: { tenantId, projectId, agentId },
          });
        });
        if (!agent) {
          throw createApiError({
            code: 'not_found',
            message: 'Agent not found',
          });
        }
        defaultSubAgentId = agent.defaultSubAgentId || '';
      }

      if (!defaultSubAgentId) {
        throw createApiError({
          code: 'not_found',
          message: 'No default agent found in agent',
        });
      }

      await executeInBranch(
        { dbClient, ref, autoCommit: true, commitMessage: 'Create or get conversation' },
        async (db) => {
          return await createOrGetConversation(db)({
            tenantId,
            projectId,
            id: conversationId,
            activeSubAgentId: defaultSubAgentId,
          });
        }
      );

      const activeAgent = await executeInBranch({ dbClient, ref }, async (db) => {
        return await getActiveAgentForConversation(db)({
          scopes: { tenantId, projectId },
          conversationId,
        });
      });
      if (!activeAgent) {
        await executeInBranch(
          { dbClient, ref, autoCommit: true, commitMessage: 'Set active agent for conversation' },
          async (db) => {
            return await setActiveAgentForConversation(db)({
              scopes: { tenantId, projectId },
              conversationId,
              subAgentId: defaultSubAgentId,
            });
          }
        );
      }
      const subAgentId = activeAgent?.activeSubAgentId || defaultSubAgentId;

      const agentInfo = await executeInBranch({ dbClient, ref }, async (db) => {
        return await getSubAgentById(db)({
          scopes: { tenantId, projectId, agentId },
          subAgentId: subAgentId,
        });
      });

      if (!agentInfo) {
        throw createApiError({
          code: 'not_found',
          message: 'Agent not found',
        });
      }

      const validatedContext = (c as any).get('validatedContext') || body.headers || {};

      const credentialStores = c.get('credentialStores');

      await executeInBranch(
        { dbClient, ref, autoCommit: true, commitMessage: 'Handle context resolution' },
        async (db) => {
          return await handleContextResolution({
            tenantId,
            projectId,
            agentId,
            conversationId,
            headers: validatedContext,
            dbClient: db,
            credentialStores,
          });
        }
      );

      logger.info(
        {
          tenantId,
          projectId,
          agentId,
          conversationId,
          defaultSubAgentId,
          activeSubAgentId: activeAgent?.activeSubAgentId || 'none',
          hasContextConfig: !!agent.contextConfigId,
          hasHeaders: !!body.headers,
          hasValidatedContext: !!validatedContext,
          validatedContextKeys: Object.keys(validatedContext),
        },
        'parameters'
      );

      const requestId = `chatcmpl-${Date.now()}`;
      const timestamp = Math.floor(Date.now() / 1000);

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
      await executeInBranch(
        { dbClient, ref, autoCommit: true, commitMessage: 'Create user message' },
        async (db) => {
          return await createMessage(db)({
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
        }
      );

      if (messageSpan) {
        messageSpan.addEvent('user.message.stored', {
          'message.id': conversationId,
          'database.operation': 'insert',
        });
      }

      return streamSSE(c, async (stream) => {
        try {
          const sseHelper = createSSEStreamHelper(stream, requestId, timestamp);

          await sseHelper.writeRole();

          logger.info({ subAgentId }, 'Starting execution');

          const emitOperationsHeader = c.req.header('x-emit-operations');
          const emitOperations = emitOperationsHeader === 'true';

          const executionHandler = new ExecutionHandler();
          const result = await executionHandler.execute({
            executionContext,
            conversationId,
            userMessage,
            initialAgentId: subAgentId,
            requestId,
            sseHelper,
            emitOperations,
          });

          logger.info(
            { result },
            `Execution completed: ${result.success ? 'success' : 'failed'} after ${result.iterations} iterations`
          );

          if (!result.success) {
            await sseHelper.writeOperation(
              errorOp(
                'Sorry, I was unable to process your request at this time. Please try again.',
                'system'
              )
            );
          }

          await sseHelper.complete();
        } catch (error) {
          logger.error(
            {
              error: error instanceof Error ? error.message : error,
              stack: error instanceof Error ? error.stack : undefined,
            },
            'Error during streaming execution'
          );

          try {
            const sseHelper = createSSEStreamHelper(stream, requestId, timestamp);
            await sseHelper.writeOperation(
              errorOp(
                'Sorry, I was unable to process your request at this time. Please try again.',
                'system'
              )
            );
            await sseHelper.complete();
          } catch (streamError) {
            logger.error({ streamError }, 'Failed to write error to stream');
          }
        }
      });
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Error in chat completions endpoint before streaming'
    );

    if (error && typeof error === 'object' && 'status' in error) {
      throw error;
    }

    throw createApiError({
      code: 'internal_server_error',
      message: error instanceof Error ? error.message : 'Failed to process chat completion',
    });
  }
});

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
