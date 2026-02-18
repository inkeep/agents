import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type CredentialStoreRegistry,
  commonGetErrorResponses,
  createApiError,
  createMessage,
  type FullExecutionContext,
  generateId,
  getActiveAgentForConversation,
  getConversation,
  getConversationId,
  loggerFactory,
  type Part,
  PartSchema,
  setActiveAgentForConversation,
} from '@inkeep/agents-core';
import { context as otelContext, propagation, trace } from '@opentelemetry/api';
import { createUIMessageStream, JsonToSseTransformStream } from 'ai';
import { stream } from 'hono/streaming';
import runDbClient from '../../../data/db/runDbClient';
import { flushBatchProcessor } from '../../../instrumentation';
import { getLogger } from '../../../logger';
import { contextValidationMiddleware, handleContextResolution } from '../context';
import { ExecutionHandler } from '../handlers/executionHandler';
import { pendingToolApprovalManager } from '../services/PendingToolApprovalManager';
import { toolApprovalUiBus } from '../services/ToolApprovalUiBus';
import { ImageUrlSchema } from '../types/chat';
import { errorOp } from '../utils/agent-operations';
import { extractTextFromParts, getMessagePartsFromVercelContent } from '../utils/message-parts';
import { createBufferingStreamHelper, createVercelStreamHelper } from '../utils/stream-helpers';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  requestBody?: any;
  executionContext: FullExecutionContext;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('chatDataStream');

const chatDataStreamRoute = createRoute({
  method: 'post',
  path: '/chat',
  tags: ['Chat'],
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
                    z.union([
                      z.object({
                        type: z.literal('text'),
                        text: z.string(),
                      }),
                      z.object({
                        type: z.literal('image'),
                        text: ImageUrlSchema,
                      }),
                      z.object({
                        type: z.union([
                          z.enum(['audio', 'video', 'file']),
                          z.string().regex(/^data-/, 'Type must start with "data-"'),
                        ]),
                        text: z.string().optional(),
                      }),
                      // Special-case: tool approval response part (sent by client)
                      z.object({
                        type: z.string().regex(/^tool-/, 'Type must start with "tool-"'),
                        toolCallId: z.string(),
                        state: z.any(),
                        approval: z
                          .object({
                            id: z.string(),
                            approved: z.boolean().optional(),
                            reason: z.string().optional(),
                          })
                          .optional(),
                        input: z.any().optional(),
                        callProviderMetadata: z.any().optional(),
                      }),
                      // Allow step markers used by client payloads
                      z.object({
                        type: z.literal('step-start'),
                      }),
                    ])
                  )
                  .optional(),
              })
            ),
            id: z.string().optional(),
            conversationId: z.string().optional(),
            stream: z.boolean().optional().describe('Whether to stream the response').default(true),
            max_tokens: z.number().optional().describe('Maximum tokens to generate'),
            headers: z
              .record(z.string(), z.unknown())
              .optional()
              .describe('Headers data for template processing'),
            runConfig: z.record(z.string(), z.unknown()).optional().describe('Run configuration'),
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
app.use('/chat', contextValidationMiddleware);

app.openapi(chatDataStreamRoute, async (c) => {
  try {
    // Get execution context from API key authentication
    const executionContext = c.get('executionContext');
    const { tenantId, projectId, agentId } = executionContext;

    loggerFactory
      .getLogger('chatDataStream')
      .debug({ tenantId, projectId, agentId }, 'Extracted chatDataStream parameters');

    const body = c.req.valid('json');

    const approvalPart = (body.messages || [])
      .flatMap((m: any) => m?.parts || [])
      .find((p: any) => p?.state === 'approval-responded' && typeof p?.toolCallId === 'string');

    const isApprovalResponse = !!approvalPart;

    // Fast-path: allow client to respond to tool approvals via the same /chat endpoint.
    // This should NOT start a new agent execution. The original stream continues separately.
    if (isApprovalResponse) {
      const conversationId = body.conversationId;
      if (!conversationId) {
        return c.json(
          {
            success: false,
            error: 'conversationId is required for approval response',
          },
          400
        );
      }

      const toolCallId = approvalPart.toolCallId as string;
      const approved = !!approvalPart.approval?.approved;
      const reason = approvalPart.approval?.reason as string | undefined;

      // Validate that the conversation exists and belongs to this tenant/project
      const conversation = await getConversation(runDbClient)({
        scopes: { tenantId, projectId },
        conversationId,
      });

      if (!conversation) {
        return c.json({ success: false, error: 'Conversation not found' }, 404);
      }

      // Resolve the pending approval (in-memory). Idempotent: if already processed, return 200.
      const ok = approved
        ? pendingToolApprovalManager.approveToolCall(toolCallId)
        : pendingToolApprovalManager.denyToolCall(toolCallId, reason);

      if (!ok) {
        return c.json({
          success: true,
          toolCallId,
          approved,
          alreadyProcessed: true,
        });
      }

      return c.json({
        success: true,
        toolCallId,
        approved,
      });
    }

    // Extract target context headers (for copilot/chat-to-edit scenarios)
    const targetTenantId = c.req.header('x-target-tenant-id');
    const targetProjectId = c.req.header('x-target-project-id');
    const targetAgentId = c.req.header('x-target-agent-id');

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
            clientTimezone: isValidTimezone ? clientTimezone : clientTimezone.substring(0, 100),
            clientTimestamp: isValidTimestamp ? clientTimestamp : clientTimestamp.substring(0, 50),
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

    // Add conversation ID to parent span
    const conversationId = body.conversationId ?? getConversationId();
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
      const agent = executionContext.project.agents[agentId];

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

      const activeAgent = await getActiveAgentForConversation(runDbClient)({
        scopes: { tenantId, projectId },
        conversationId,
      });
      if (!activeAgent) {
        await setActiveAgentForConversation(runDbClient)({
          scopes: { tenantId, projectId },
          conversationId,
          subAgentId: defaultSubAgentId,
          ref: executionContext.resolvedRef,
          agentId: agentId,
        });
      }
      const subAgentId = activeAgent?.activeSubAgentId || defaultSubAgentId;

      logger.info({ subAgentId }, 'subAgentId');
      const agentInfo = executionContext.project.agents[agentId]?.subAgents[subAgentId];
      if (!agentInfo) {
        logger.error({ subAgentId }, 'subAgentId not found');
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
        executionContext,
        conversationId,
        headers: validatedContext,
        credentialStores,
      });

      // Store last user message
      const lastUserMessage = body.messages.filter((m) => m.role === 'user').slice(-1)[0];

      // Build Part[] for execution (text + image parts), validated against core PartSchema
      const messageParts: Part[] = z
        .array(PartSchema)
        .parse(getMessagePartsFromVercelContent(lastUserMessage?.content, lastUserMessage?.parts));

      // Extract text content from parts
      const userText = extractTextFromParts(messageParts) || '';

      logger.info({ userText, lastUserMessage }, 'userText');
      const messageSpan = trace.getActiveSpan();
      if (messageSpan) {
        messageSpan.setAttributes({
          'message.timestamp': new Date().toISOString(),
          'message.content': userText,
          'agent.name': agentName,
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

      const shouldStream = body.stream !== false;
      if (!shouldStream) {
        // Non-streaming response - collect full response and return as JSON
        const emitOperationsHeader = c.req.header('x-emit-operations');
        const emitOperations = emitOperationsHeader === 'true';

        const bufferingHelper = createBufferingStreamHelper();

        const executionHandler = new ExecutionHandler();
        const result = await executionHandler.execute({
          executionContext,
          conversationId,
          userMessage: userText,
          messageParts: messageParts.length > 0 ? messageParts : undefined,
          initialAgentId: subAgentId,
          requestId: `chat-${Date.now()}`,
          sseHelper: bufferingHelper,
          emitOperations,
          forwardedHeaders,
        });

        const captured = bufferingHelper.getCapturedResponse();

        return c.json({
          id: `chat-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: agentName,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: captured.hasError ? captured.errorMessage : captured.text,
              },
              finish_reason: result.success && !captured.hasError ? 'stop' : 'error',
            },
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        });
      }

      // Create UI Message Stream using AI SDK V5
      const dataStream = createUIMessageStream({
        execute: async ({ writer }) => {
          const streamHelper = createVercelStreamHelper(writer);
          let unsubscribe: (() => void) | undefined;
          try {
            // Check for emit operations header
            const emitOperationsHeader = c.req.header('x-emit-operations');
            const emitOperations = emitOperationsHeader === 'true';

            const executionHandler = new ExecutionHandler();

            // Check if this is a dataset run conversation via header
            const datasetRunId = c.req.header('x-inkeep-dataset-run-id');

            const requestId = `chatds-${Date.now()}`;

            const chunkString = (s: string, size = 16) => {
              const out: string[] = [];
              for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
              return out;
            };

            const seenToolCalls = new Set<string>();
            const seenOutputs = new Set<string>();

            unsubscribe = toolApprovalUiBus.subscribe(requestId, async (event) => {
              if (event.type === 'approval-needed') {
                if (seenToolCalls.has(event.toolCallId)) return;
                seenToolCalls.add(event.toolCallId);

                await streamHelper.writeToolInputStart({
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                });

                const inputText = JSON.stringify(event.input ?? {});
                for (const part of chunkString(inputText, 16)) {
                  await streamHelper.writeToolInputDelta({
                    toolCallId: event.toolCallId,
                    inputTextDelta: part,
                  });
                }

                await streamHelper.writeToolInputAvailable({
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  input: event.input ?? {},
                  providerMetadata: event.providerMetadata,
                });

                await streamHelper.writeToolApprovalRequest({
                  approvalId: event.approvalId,
                  toolCallId: event.toolCallId,
                });
              } else if (event.type === 'approval-resolved') {
                if (seenOutputs.has(event.toolCallId)) return;
                seenOutputs.add(event.toolCallId);

                if (event.approved) {
                  await streamHelper.writeToolOutputAvailable({
                    toolCallId: event.toolCallId,
                    output: { status: 'approved' },
                  });
                } else {
                  await streamHelper.writeToolOutputDenied({ toolCallId: event.toolCallId });
                }
              }
            });

            const result = await executionHandler.execute({
              executionContext,
              conversationId,
              userMessage: userText,
              messageParts: messageParts.length > 0 ? messageParts : undefined,
              initialAgentId: subAgentId,
              requestId,
              sseHelper: streamHelper,
              emitOperations,
              datasetRunId: datasetRunId || undefined,
              forwardedHeaders,
            });

            if (!result.success) {
              await streamHelper.writeOperation(errorOp('Unable to process request', 'system'));
            }
          } catch (err) {
            logger.error({ err }, 'Streaming error');
            await streamHelper.writeOperation(errorOp('Internal server error', 'system'));
          } finally {
            try {
              unsubscribe?.();
            } catch (_e) {}
            // Clean up stream helper resources if it has cleanup method
            if ('cleanup' in streamHelper && typeof streamHelper.cleanup === 'function') {
              streamHelper.cleanup();
            }
            await flushBatchProcessor();
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
    logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        errorType: error?.constructor?.name,
      },
      'chatDataStream error - DETAILED'
    );
    throw createApiError({
      code: 'internal_server_error',
      message: 'Failed to process chat completion',
    });
  }
});

// Tool approval endpoint
const toolApprovalRoute = createRoute({
  method: 'post',
  path: '/tool-approvals',
  tags: ['Chat'],
  summary: 'Approve or deny tool execution',
  description: 'Handle user approval/denial of tool execution requests during conversations',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            conversationId: z.string().describe('The conversation ID'),
            toolCallId: z.string().describe('The tool call ID to respond to'),
            approved: z.boolean().describe('Whether the tool execution is approved'),
            reason: z.string().optional().describe('Optional reason for the decision'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Tool approval response processed successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            message: z.string().optional(),
          }),
        },
      },
    },
    400: {
      description: 'Bad request - invalid tool call ID or conversation ID',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Tool call not found or already processed',
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

app.openapi(toolApprovalRoute, async (c) => {
  const tracer = trace.getTracer('tool-approval-handler');

  return tracer.startActiveSpan('tool_approval_request', async (span) => {
    try {
      const executionContext = c.get('executionContext');
      const { tenantId, projectId } = executionContext;

      const requestBody = await c.req.json();
      const { conversationId, toolCallId, approved, reason } = requestBody;

      logger.info(
        {
          conversationId,
          toolCallId,
          approved,
          reason,
          tenantId,
          projectId,
        },
        'Processing tool approval request'
      );

      // Validate that the conversation exists and belongs to this tenant/project
      const conversation = await getConversation(runDbClient)({
        scopes: { tenantId, projectId },
        conversationId,
      });

      if (!conversation) {
        span.setStatus({ code: 1, message: 'Conversation not found' });
        return c.json({ error: 'Conversation not found' }, 404);
      }

      // Process the approval request using PendingToolApprovalManager
      let success = false;
      if (approved) {
        success = pendingToolApprovalManager.approveToolCall(toolCallId);
      } else {
        success = pendingToolApprovalManager.denyToolCall(toolCallId, reason);
      }

      if (!success) {
        span.setStatus({ code: 1, message: 'Tool call not found' });
        return c.json({ error: 'Tool call not found or already processed' }, 404);
      }

      logger.info({ conversationId, toolCallId, approved }, 'Tool approval processed successfully');

      span.setStatus({ code: 1, message: 'Success' });

      return c.json({
        success: true,
        message: approved ? 'Tool execution approved' : 'Tool execution denied',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error(
        {
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Failed to process tool approval'
      );

      span.setStatus({ code: 2, message: errorMessage });

      return c.json(
        {
          error: 'Internal server error',
          message: errorMessage,
        },
        500
      );
    } finally {
      span.end();
    }
  }) as any;
});

export default app;
