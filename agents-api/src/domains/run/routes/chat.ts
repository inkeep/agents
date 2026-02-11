import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type CredentialStoreRegistry,
  createApiError,
  createMessage,
  createOrGetConversation,
  type FullExecutionContext,
  generateId,
  getActiveAgentForConversation,
  getConversationId,
  setActiveAgentForConversation,
} from '@inkeep/agents-core';
import { context as otelContext, propagation, trace } from '@opentelemetry/api';
import { streamSSE } from 'hono/streaming';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { contextValidationMiddleware, handleContextResolution } from '../context';
import { ExecutionHandler } from '../handlers/executionHandler';
import { toolApprovalUiBus } from '../services/ToolApprovalUiBus';
import type { ContentItem, Message } from '../types/chat';
import { errorOp } from '../utils/agent-operations';
import {
  resolveAnonymousUser,
  writeAnonymousConversationRelationships,
} from '../utils/anonymous-user';
import { createSSEStreamHelper } from '../utils/stream-helpers';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  executionContext: FullExecutionContext;
  requestBody?: any;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('completionsHandler');

const chatCompletionsRoute = createRoute({
  method: 'post',
  path: '/completions',
  tags: ['Chat'],
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

app.use('/completions', contextValidationMiddleware);

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
    const executionContext = c.get('executionContext');
    const { tenantId, projectId, agentId } = executionContext;

    getLogger('chat').debug(
      {
        tenantId,
        agentId,
      },
      'Extracted chat parameters from API key context'
    );

    const body = c.get('requestBody') || {};
    const conversationId = body.conversationId || getConversationId();

    // Extract target context headers (for copilot/chat-to-edit scenarios)
    const targetTenantId = c.req.header('x-target-tenant-id');
    const targetProjectId = c.req.header('x-target-project-id');
    const targetAgentId = c.req.header('x-target-agent-id');

    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes({
        'conversation.id': conversationId,
        'tenant.id': tenantId,
        'agent.id': agentId,
        'project.id': projectId,
        ...(targetTenantId && { 'target.tenant.id': targetTenantId }),
        ...(targetProjectId && { 'target.project.id': targetProjectId }),
        ...(targetAgentId && { 'target.agent.id': targetAgentId }),
      });
    }

    let currentBag = propagation.getBaggage(otelContext.active());
    if (!currentBag) {
      currentBag = propagation.createBaggage();
    }
    currentBag = currentBag.setEntry('conversation.id', { value: conversationId });
    const ctxWithBaggage = propagation.setBaggage(otelContext.active(), currentBag);
    return await otelContext.with(ctxWithBaggage, async () => {
      const fullAgent = executionContext.project.agents[agentId];
      if (!fullAgent) {
        throw createApiError({
          code: 'not_found',
          message: 'Agent not found',
        });
      }

      const agent = fullAgent;
      let defaultSubAgentId: string;

      const agentKeys = Object.keys((fullAgent.subAgents as Record<string, any>) || {});
      const firstAgentId = agentKeys.length > 0 ? agentKeys[0] : '';
      defaultSubAgentId = (fullAgent.defaultSubAgentId as string) || firstAgentId; // Use first agent if no defaultSubAgentId

      if (!defaultSubAgentId) {
        throw createApiError({
          code: 'not_found',
          message: 'No default agent found in agent',
        });
      }

      const anonUser = await resolveAnonymousUser(executionContext);
      if (anonUser?.isNew && anonUser.token) {
        c.header('x-anonymous-token', anonUser.token);
      }

      await createOrGetConversation(runDbClient)({
        tenantId,
        projectId,
        id: conversationId,
        agentId: agentId,
        activeSubAgentId: defaultSubAgentId,
        anonymousUserId: anonUser?.anonymousUserId,
        ref: executionContext.resolvedRef,
      });

      if (anonUser) {
        await writeAnonymousConversationRelationships({
          conversationId,
          anonymousUserId: anonUser.anonymousUserId,
          projectId,
        });
      }

      const activeAgent = await getActiveAgentForConversation(runDbClient)({
        scopes: { tenantId, projectId },
        conversationId,
      });
      if (!activeAgent) {
        await setActiveAgentForConversation(runDbClient)({
          scopes: { tenantId, projectId },
          conversationId,
          agentId: agentId,
          subAgentId: defaultSubAgentId,
          ref: executionContext.resolvedRef,
        });
      }
      const subAgentId = activeAgent?.activeSubAgentId || defaultSubAgentId;

      const agentInfo = executionContext.project.agents[agentId]?.subAgents[subAgentId];

      if (!agentInfo) {
        throw createApiError({
          code: 'not_found',
          message: 'Agent not found',
        });
      }

      const validatedContext = (c as any).get('validatedContext') || body.headers || {};

      const credentialStores = c.get('credentialStores');

      await handleContextResolution({
        executionContext,
        conversationId,
        headers: validatedContext,
        credentialStores,
      });

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
        // Add user information from execution context metadata if available
        if (executionContext.metadata?.initiatedBy) {
          messageSpan.setAttribute('user.type', executionContext.metadata.initiatedBy.type);
          messageSpan.setAttribute('user.id', executionContext.metadata.initiatedBy.id);
        }
      }
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

      if (messageSpan) {
        messageSpan.addEvent('user.message.stored', {
          'message.id': conversationId,
          'database.operation': 'insert',
        });
      }

      return streamSSE(c, async (stream) => {
        const chunkString = (s: string, size = 16) => {
          const out: string[] = [];
          for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
          return out;
        };

        let unsubscribe: (() => void) | undefined;
        try {
          const sseHelper = createSSEStreamHelper(stream, requestId, timestamp);

          await sseHelper.writeRole();

          const seenToolCalls = new Set<string>();
          const seenOutputs = new Set<string>();

          unsubscribe = toolApprovalUiBus.subscribe(requestId, async (event) => {
            if (event.type === 'approval-needed') {
              if (seenToolCalls.has(event.toolCallId)) return;
              seenToolCalls.add(event.toolCallId);

              await sseHelper.writeToolInputStart({
                toolCallId: event.toolCallId,
                toolName: event.toolName,
              });

              const inputText = JSON.stringify(event.input ?? {});
              for (const part of chunkString(inputText, 16)) {
                await sseHelper.writeToolInputDelta({
                  toolCallId: event.toolCallId,
                  inputTextDelta: part,
                });
              }

              await sseHelper.writeToolInputAvailable({
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                input: event.input ?? {},
                providerMetadata: event.providerMetadata,
              });

              await sseHelper.writeToolApprovalRequest({
                approvalId: event.approvalId,
                toolCallId: event.toolCallId,
              });
            } else if (event.type === 'approval-resolved') {
              if (seenOutputs.has(event.toolCallId)) return;
              seenOutputs.add(event.toolCallId);

              if (event.approved) {
                await sseHelper.writeToolOutputAvailable({
                  toolCallId: event.toolCallId,
                  output: { status: 'approved' },
                });
              } else {
                await sseHelper.writeToolOutputDenied({ toolCallId: event.toolCallId });
              }
            }
          });

          logger.info({ subAgentId }, 'Starting execution');

          const emitOperationsHeader = c.req.header('x-emit-operations');
          const emitOperations = emitOperationsHeader === 'true';

          // Extract headers to forward to MCP servers (for user session auth)
          // Transform cookie -> x-forwarded-cookie since downstream services expect it
          // Note: Do NOT forward the authorization header - it causes issues with internal A2A requests
          // because the user's JWT token is not valid for those internal service-to-service calls
          const forwardedHeaders: Record<string, string> = {};
          const xForwardedCookie = c.req.header('x-forwarded-cookie');
          const cookie = c.req.header('cookie');
          const clientTimezone = c.req.header('x-inkeep-client-timezone');
          const clientTimestamp = c.req.header('x-inkeep-client-timestamp');

          // Priority: x-forwarded-cookie (explicit) > cookie (browser-sent)
          // Transform cookie to x-forwarded-cookie for downstream forwarding
          if (xForwardedCookie) {
            forwardedHeaders['x-forwarded-cookie'] = xForwardedCookie;
          } else if (cookie) {
            forwardedHeaders['x-forwarded-cookie'] = cookie;
          }

          // Forward client timezone and timestamp together (both required, with validation)
          if (clientTimezone && clientTimestamp) {
            // Validate timezone format
            const isValidTimezone =
              clientTimezone.length < 100 && /^[A-Za-z0-9_/\-+]+$/.test(clientTimezone);
            // Validate ISO 8601 timestamp format: "2026-01-16T19:45:30.123Z"
            const isValidTimestamp =
              clientTimestamp.length < 50 &&
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(clientTimestamp);

            if (isValidTimezone && isValidTimestamp) {
              forwardedHeaders['x-inkeep-client-timezone'] = clientTimezone;
              forwardedHeaders['x-inkeep-client-timestamp'] = clientTimestamp;
            } else {
              logger.warn(
                {
                  clientTimezone: isValidTimezone
                    ? clientTimezone
                    : clientTimezone.substring(0, 100),
                  clientTimestamp: isValidTimestamp
                    ? clientTimestamp
                    : clientTimestamp.substring(0, 50),
                  isValidTimezone,
                  isValidTimestamp,
                },
                'Invalid client timezone or timestamp format, ignoring both'
              );
            }
          } else if (clientTimezone || clientTimestamp) {
            logger.warn(
              { hasTimezone: !!clientTimezone, hasTimestamp: !!clientTimestamp },
              'Client timezone and timestamp must both be present, ignoring'
            );
          }

          const executionHandler = new ExecutionHandler();
          const result = await executionHandler.execute({
            executionContext,
            conversationId,
            userMessage,
            initialAgentId: subAgentId,
            requestId,
            sseHelper,
            emitOperations,
            forwardedHeaders,
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
        } finally {
          try {
            unsubscribe?.();
          } catch (_e) {}
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
