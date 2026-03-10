import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type CredentialStoreRegistry,
  createApiError,
  createMessage,
  type FullExecutionContext,
  generateId,
  getConversationId,
  getWorkflowExecution,
  PartSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedRunApiKeyAuth } from '@inkeep/agents-core/middleware';
import { stream } from 'hono/streaming';
import { getRun, start } from 'workflow/api';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { contextValidationMiddleware, handleContextResolution } from '../context';
import { buildPersistedMessageContent } from '../services/blob-storage/image-upload-helpers';
import type { Message } from '../types/chat';
import { ImageContentItemSchema } from '../types/chat';
import { extractTextFromParts, getMessagePartsFromOpenAIContent } from '../utils/message-parts';
import { agentExecutionWorkflow, toolApprovalHook } from '../workflow/functions/agentExecution';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  executionContext: FullExecutionContext;
  requestBody?: any;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('executionsHandler');

const createExecutionRoute = createProtectedRoute({
  method: 'post',
  path: '/executions',
  tags: ['Executions'],
  summary: 'Create durable agent execution',
  description:
    'Starts a durable workflow-backed agent execution. Returns an SSE stream with an x-workflow-run-id header for reconnection.',
  security: [{ bearerAuth: [] }],
  permission: inheritedRunApiKeyAuth(),
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            messages: z
              .array(
                z.object({
                  role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
                  content: z
                    .union([
                      z.string(),
                      z.array(
                        z.discriminatedUnion('type', [
                          z.object({ type: z.literal('text'), text: z.string() }),
                          ImageContentItemSchema,
                        ])
                      ),
                    ])
                    .describe('The message content'),
                })
              )
              .describe('The conversation messages'),
            conversationId: z.string().optional(),
            forwardedHeaders: z.record(z.string(), z.string()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description:
        'Streaming SSE response. The x-workflow-run-id header contains the run ID for reconnection.',
      headers: z.object({
        'Content-Type': z.string().default('text/event-stream'),
        'x-workflow-run-id': z.string(),
      }),
      content: {
        'text/event-stream': {
          schema: z.string(),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
    },
    404: {
      description: 'Agent not found',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
    },
  },
});

const getExecutionRoute = createProtectedRoute({
  method: 'get',
  path: '/executions/:executionId',
  tags: ['Executions'],
  summary: 'Get execution status',
  description: 'Returns the status of a durable execution.',
  security: [{ bearerAuth: [] }],
  permission: inheritedRunApiKeyAuth(),
  request: {
    params: z.object({ executionId: z.string() }),
  },
  responses: {
    200: {
      description: 'Execution status',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            status: z.enum(['running', 'suspended', 'completed', 'failed']),
            conversationId: z.string(),
            agentId: z.string(),
            createdAt: z.string(),
            updatedAt: z.string(),
          }),
        },
      },
    },
    404: {
      description: 'Execution not found',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
    },
  },
});

const reconnectExecutionStreamRoute = createProtectedRoute({
  method: 'get',
  path: '/executions/:executionId/stream',
  tags: ['Executions'],
  summary: 'Reconnect to execution stream',
  description: 'Reconnects to the SSE stream of an existing durable execution.',
  security: [{ bearerAuth: [] }],
  permission: inheritedRunApiKeyAuth(),
  request: {
    params: z.object({ executionId: z.string() }),
  },
  responses: {
    200: {
      description: 'SSE stream',
      content: { 'text/event-stream': { schema: z.string() } },
    },
    404: {
      description: 'Execution not found',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
    },
  },
});

const approveToolCallRoute = createProtectedRoute({
  method: 'post',
  path: '/executions/:executionId/approvals/:toolCallId',
  tags: ['Executions'],
  summary: 'Approve or deny a tool call',
  description: 'Resumes a suspended durable execution by approving or denying a pending tool call.',
  security: [{ bearerAuth: [] }],
  permission: inheritedRunApiKeyAuth(),
  request: {
    params: z.object({
      executionId: z.string(),
      toolCallId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            approved: z.boolean(),
            reason: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Tool call approval submitted',
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
    },
    404: {
      description: 'Execution not found',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
    },
  },
});

app.use('/executions', contextValidationMiddleware);

app.openapi(createExecutionRoute, async (c) => {
  const executionContext = c.get('executionContext');
  const { tenantId, projectId, agentId, resolvedRef } = executionContext;

  const body = c.get('requestBody') || (await c.req.json());
  const conversationId = body.conversationId || getConversationId();

  const credentialStores = c.get('credentialStores');
  await handleContextResolution({
    executionContext,
    conversationId,
    headers: {},
    credentialStores,
  });

  const lastUserMessage = (body.messages as Message[])
    .filter((msg) => msg.role === 'user')
    .slice(-1)[0];

  const messageParts = z
    .array(PartSchema)
    .parse(lastUserMessage ? getMessagePartsFromOpenAIContent(lastUserMessage.content) : []);

  const userMessage = extractTextFromParts(messageParts);

  const messageId = generateId();
  const messageContent = await buildPersistedMessageContent(userMessage, messageParts, {
    tenantId,
    projectId,
    conversationId,
    messageId,
  });

  await createMessage(runDbClient)({
    id: messageId,
    tenantId,
    projectId,
    conversationId,
    role: 'user',
    content: messageContent,
    visibility: 'user-facing',
    messageType: 'chat',
  });

  const requestId = `exec-${generateId()}`;

  const run = await start(agentExecutionWorkflow, [
    {
      tenantId,
      projectId,
      agentId,
      conversationId,
      userMessage,
      messageParts: messageParts.length > 0 ? messageParts : undefined,
      requestId,
      resolvedRef,
      forwardedHeaders: body.forwardedHeaders,
    },
  ]);

  logger.info({ runId: run.runId, conversationId, agentId }, 'Durable execution started');

  c.header('x-workflow-run-id', run.runId);

  return stream(c, async (s) => {
    try {
      const readable = run.readable;
      const reader = readable.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await s.write(value);
      }
    } catch (error) {
      logger.error({ error, runId: run.runId }, 'Error streaming durable execution');
    }
  });
});

app.openapi(getExecutionRoute, async (c) => {
  const executionContext = c.get('executionContext');
  const { tenantId, projectId } = executionContext;
  const { executionId } = c.req.valid('param');

  const execution = await getWorkflowExecution(runDbClient)({
    tenantId,
    projectId,
    id: executionId,
  });
  if (!execution) {
    throw createApiError({ code: 'not_found', message: 'Execution not found' });
  }

  return c.json(
    {
      id: execution.id,
      status: execution.status,
      conversationId: execution.conversationId,
      agentId: execution.agentId,
      createdAt: execution.createdAt,
      updatedAt: execution.updatedAt,
    },
    200
  );
});

app.openapi(reconnectExecutionStreamRoute, async (c) => {
  const { executionId } = c.req.valid('param');
  const startIndexHeader = c.req.header('x-stream-start-index');
  const startIndex = startIndexHeader ? Number.parseInt(startIndexHeader, 10) : 0;

  const run = getRun(executionId);

  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  return stream(c, async (s) => {
    try {
      const readable = run.getReadable({ startIndex });
      const reader = readable.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await s.write(value);
      }
    } catch (error) {
      logger.error({ error, executionId }, 'Error reconnecting to execution stream');
    }
  });
});

app.openapi(approveToolCallRoute, async (c) => {
  const executionContext = c.get('executionContext');
  const { tenantId, projectId } = executionContext;
  const { executionId, toolCallId } = c.req.valid('param');
  const { approved, reason } = await c.req.json();

  const execution = await getWorkflowExecution(runDbClient)({
    tenantId,
    projectId,
    id: executionId,
  });
  if (!execution) {
    throw createApiError({ code: 'not_found', message: 'Execution not found' });
  }

  const token = `tool-approval:${execution.conversationId}:${executionId}:${toolCallId}`;

  await toolApprovalHook.resume(token, {
    approved,
    reason: approved ? undefined : reason,
  });

  return c.json({ success: true as boolean }, 200);
});

export default app;
