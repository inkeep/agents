import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonCreateErrorResponses,
  commonGetErrorResponses,
  createApiError,
  createMessage,
  createOrGetConversation,
  createWorkflowExecution,
  type FullExecutionContext,
  generateId,
  getActiveWorkflowExecution,
  getConversationId,
  getMessagesByConversation,
  type Part,
  PartSchema,
  workflowExecutions,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedRunApiKeyAuth } from '@inkeep/agents-core/middleware';
import { and, eq } from 'drizzle-orm';
import { start } from 'workflow/api';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { extractTextFromParts, getMessagePartsFromVercelContent } from '../utils/message-parts';
import {
  type AgentExecutionPayload,
  agentExecutionWorkflow,
} from '../workflow/functions/agentExecution';

type AppVariables = {
  executionContext: FullExecutionContext;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();
const logger = getLogger('executions');

const startExecutionRoute = createProtectedRoute({
  method: 'post',
  path: '/',
  tags: ['Executions'],
  summary: 'Start a durable agent execution',
  description: 'Starts a durable agent execution that runs reliably with workflow orchestration.',
  security: [{ bearerAuth: [] }],
  permission: inheritedRunApiKeyAuth(),
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            agentId: z.string().optional(),
            messages: z.array(
              z.object({
                role: z.enum(['user']),
                content: z.any(),
                parts: z
                  .array(
                    z.union([
                      z.object({ type: z.literal('text'), text: z.string() }),
                      z.object({
                        type: z.union([z.literal('image'), z.literal('file'), z.string()]),
                        text: z.string().optional(),
                      }),
                    ])
                  )
                  .optional(),
              })
            ),
            conversationId: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Execution started',
      content: {
        'application/json': {
          schema: z.object({
            executionId: z.string(),
            runId: z.string(),
            conversationId: z.string(),
            status: z.string(),
          }),
        },
      },
    },
    ...commonCreateErrorResponses,
    409: {
      description: 'Active execution already exists for this conversation',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
            existingExecutionId: z.string().optional(),
          }),
        },
      },
    },
  },
});

app.openapi(startExecutionRoute, async (c) => {
  const executionContext = c.get('executionContext');
  const { tenantId, projectId, agentId } = executionContext;

  const body = c.req.valid('json');

  const effectiveAgentId = body.agentId || agentId;

  const agent = executionContext.project.agents[effectiveAgentId];
  if (!agent) {
    throw createApiError({ code: 'not_found', message: 'Agent not found' });
  }

  if (agent.executionMode !== 'durable') {
    throw createApiError({
      code: 'bad_request',
      message: `Agent "${effectiveAgentId}" does not have executionMode set to "durable"`,
    });
  }

  const lastUserMessage = body.messages.filter((m) => m.role === 'user').slice(-1)[0];
  if (!lastUserMessage) {
    throw createApiError({ code: 'bad_request', message: 'At least one user message is required' });
  }

  const messageParts: Part[] = z
    .array(PartSchema)
    .parse(getMessagePartsFromVercelContent(lastUserMessage.content, lastUserMessage.parts));

  const userText = extractTextFromParts(messageParts) || '';

  if (!userText) {
    throw createApiError({ code: 'bad_request', message: 'User message must contain text' });
  }

  const conversationId = body.conversationId ?? getConversationId();

  const activeExecution = await getActiveWorkflowExecution(runDbClient)({
    scopes: { tenantId, projectId },
    conversationId,
  });

  if (activeExecution) {
    return c.json(
      {
        error: 'An active execution already exists for this conversation',
        existingExecutionId: activeExecution.id,
      },
      409
    );
  }

  const defaultSubAgentId = agent.defaultSubAgentId;

  await createOrGetConversation(runDbClient)({
    id: conversationId,
    tenantId,
    projectId,
    agentId: effectiveAgentId,
    activeSubAgentId: defaultSubAgentId || effectiveAgentId,
    ref: executionContext.resolvedRef,
  });

  const executionId = generateId();

  await createWorkflowExecution(runDbClient)({
    id: executionId,
    tenantId,
    projectId,
    agentId: effectiveAgentId,
    conversationId,
    status: 'starting',
  });

  await createMessage(runDbClient)({
    id: generateId(),
    tenantId,
    projectId,
    conversationId,
    role: 'user',
    content: { text: userText, parts: messageParts },
    metadata: {
      a2a_metadata: { executionId },
    },
  });

  const requestId = `exec-${executionId}`;

  const payload: AgentExecutionPayload = {
    executionId,
    tenantId,
    projectId,
    agentId: effectiveAgentId,
    conversationId,
    userMessage: userText,
    messageParts: messageParts as Array<{
      kind: string;
      text?: string;
      data?: unknown;
      metadata?: unknown;
    }>,
    requestId,
  };

  const run = await start(agentExecutionWorkflow, [payload]);
  const runId = run.runId;

  await runDbClient
    .update(workflowExecutions)
    .set({ runId, status: 'running', updatedAt: new Date().toISOString() })
    .where(eq(workflowExecutions.id, executionId));

  logger.info(
    { executionId, runId, conversationId, tenantId, projectId, agentId: effectiveAgentId },
    'Durable execution started'
  );

  return c.json({
    executionId,
    runId,
    conversationId,
    status: 'running',
  });
});

const getExecutionStatusRoute = createProtectedRoute({
  method: 'get',
  path: '/:executionId/status',
  tags: ['Executions'],
  summary: 'Get execution status',
  description: 'Returns the current status of a durable agent execution.',
  security: [{ bearerAuth: [] }],
  permission: inheritedRunApiKeyAuth(),
  request: {
    params: z.object({
      executionId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Execution status',
      content: {
        'application/json': {
          schema: z.object({
            executionId: z.string(),
            status: z.string(),
            runId: z.string().nullable(),
            conversationId: z.string().nullable(),
            createdAt: z.string(),
            updatedAt: z.string(),
          }),
        },
      },
    },
    ...commonGetErrorResponses,
  },
});

app.openapi(getExecutionStatusRoute, async (c) => {
  const executionContext = c.get('executionContext');
  const { tenantId } = executionContext;

  const { executionId } = c.req.valid('param');

  const [execution] = await runDbClient
    .select()
    .from(workflowExecutions)
    .where(and(eq(workflowExecutions.id, executionId), eq(workflowExecutions.tenantId, tenantId)))
    .limit(1);

  if (!execution) {
    throw createApiError({ code: 'not_found', message: 'Execution not found' });
  }

  let messages: Array<{ role: string; content: unknown }> | undefined;
  if (
    execution.conversationId &&
    (execution.status === 'completed' || execution.status === 'failed')
  ) {
    const convMessages = await getMessagesByConversation(runDbClient)({
      scopes: { tenantId, projectId: execution.projectId },
      conversationId: execution.conversationId,
      pagination: { page: 1, limit: 50 },
    });
    messages = convMessages.map((m) => ({ role: m.role, content: m.content }));
  }

  return c.json({
    executionId: execution.id,
    status: execution.status,
    runId: execution.runId,
    conversationId: execution.conversationId,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
    messages,
  });
});

export default app;
