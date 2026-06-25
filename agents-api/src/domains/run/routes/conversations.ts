import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type BaseExecutionContext,
  ConversationApiSelectSchema,
  type CredentialStoreRegistry,
  commonGetErrorResponses,
  countVisibleMessages,
  createApiError,
  getAppByIdForProject,
  getConversation,
  getVisibleMessages,
  getWorkflowExecutionByConversation,
  ListResponseSchema,
  listConversations,
  type MessageContent,
  toISODateString,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedRunApiKeyAuth } from '@inkeep/agents-core/middleware';
import { stream } from 'hono/streaming';
import { getRun } from 'workflow/api';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import {
  extractText,
  toVercelMessage,
  VercelMessageSchema,
} from '../../../utils/vercel-message-formatter';
import { createReplayHydrationContext } from '../artifacts/replay-hydration';
import { resolveMessagesListBlobUris } from '../services/blob-storage/resolve-blob-uris';
import { streamBufferRegistry } from '../stream/stream-buffer-registry';

const logger = getLogger('run-conversations');

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  executionContext: BaseExecutionContext;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ConversationListItemSchema = ConversationApiSelectSchema.pick({
  id: true,
  agentId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
});

const ConversationListResponseSchema = ListResponseSchema(ConversationListItemSchema).openapi(
  'EndUserConversationListResponse'
);

const ConversationDetailResponseSchema = z
  .object({
    data: ConversationListItemSchema.extend({
      messages: z.array(VercelMessageSchema),
    }),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      pages: z.number(),
    }),
  })
  .openapi('EndUserConversationDetailResponse');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEndUserId(executionContext: BaseExecutionContext): string {
  const endUserId = executionContext.metadata?.endUserId;
  if (!endUserId) {
    throw createApiError({
      code: 'unauthorized',
      message: 'End-user authentication required to list conversations',
    });
  }
  return endUserId;
}

function getConfiguredAgentIdsForApp(appRecord: { defaultAgentId: string | null }): string[] {
  return appRecord.defaultAgentId ? [appRecord.defaultAgentId] : [];
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List End-User Conversations',
    description:
      'List conversations for the authenticated end-user. Automatically scoped by the JWT sub claim — end-users can only see their own conversations.',
    operationId: 'list-end-user-conversations',
    tags: ['Conversations'],
    security: [{ bearerAuth: [] }],
    permission: inheritedRunApiKeyAuth(),
    request: {
      query: z.object({
        page: z.coerce.number().min(1).default(1).optional(),
        limit: z.coerce.number().min(1).max(200).default(20).optional(),
      }),
    },
    responses: {
      200: {
        description: 'List of conversations for the authenticated end-user',
        content: {
          'application/json': {
            schema: ConversationListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const executionContext = c.get('executionContext');
    const { tenantId, projectId } = executionContext;
    const endUserId = requireEndUserId(executionContext);
    const appId = executionContext.metadata?.appId;

    const { page = 1, limit = 20 } = c.req.valid('query');

    let agentIds: string[] | undefined;
    if (appId) {
      const appRecord = await getAppByIdForProject(runDbClient)({
        scopes: { tenantId, projectId },
        id: appId,
      });

      if (!appRecord) {
        throw createApiError({
          code: 'not_found',
          message: 'App not found',
        });
      }

      agentIds = getConfiguredAgentIdsForApp(appRecord);
    }

    const result = await listConversations(runDbClient)({
      scopes: { tenantId, projectId },
      userId: endUserId,
      agentIds,
      pagination: { page, limit },
    });

    const conversationsWithTitles = await Promise.all(
      result.conversations.map(async (conv) => {
        let title = conv.title;
        if (!title) {
          const firstMessages = await getVisibleMessages(runDbClient)({
            scopes: { tenantId, projectId },
            conversationId: conv.id,
            visibility: ['user-facing'],
            pagination: { page: 1, limit: 1 },
          });
          const firstUserMsg = firstMessages.find((m) => m.role === 'user');
          if (firstUserMsg) {
            const text = extractText(firstUserMsg.content as MessageContent);
            if (text) {
              title = text.length > 100 ? `${text.slice(0, 100)}...` : text;
            }
          }
        }
        return {
          id: conv.id,
          agentId: conv.agentId,
          title,
          createdAt: toISODateString(conv.createdAt),
          updatedAt: toISODateString(conv.updatedAt),
        };
      })
    );

    logger.debug(
      { tenantId, projectId, endUserId, total: result.total },
      'Listed end-user conversations'
    );

    const pages = Math.ceil(result.total / limit);

    return c.json({
      data: conversationsWithTitles,
      pagination: {
        page,
        limit,
        total: result.total,
        pages,
      },
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{conversationId}',
    summary: 'Get Conversation',
    description:
      'Get a conversation and its messages. Returns messages in Vercel AI SDK UIMessage format. The conversation must belong to the authenticated end-user.',
    operationId: 'get-end-user-conversation',
    tags: ['Conversations'],
    security: [{ bearerAuth: [] }],
    permission: inheritedRunApiKeyAuth(),
    request: {
      params: z.object({
        conversationId: z.string(),
      }),
      query: z.object({
        page: z.coerce.number().min(1).default(1).optional(),
        limit: z.coerce.number().min(1).max(200).default(50).optional(),
        format: z.enum(['vercel', 'openai']).default('vercel').optional(),
      }),
    },
    responses: {
      200: {
        description: 'Conversation with messages',
        content: {
          'application/json': {
            schema: ConversationDetailResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const executionContext = c.get('executionContext');
    const { tenantId, projectId } = executionContext;
    const endUserId = requireEndUserId(executionContext);
    const { conversationId } = c.req.valid('param');
    const { page = 1, limit = 50, format = 'vercel' } = c.req.valid('query');

    if (format === 'openai') {
      throw createApiError({
        code: 'bad_request',
        message: 'OpenAI message format is not available yet. Use format=vercel (default).',
      });
    }

    const conversation = await getConversation(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId,
    });

    if (!conversation || conversation.userId !== endUserId) {
      throw createApiError({
        code: 'not_found',
        message: 'Conversation not found',
      });
    }

    const [messageList, total] = await Promise.all([
      getVisibleMessages(runDbClient)({
        scopes: { tenantId, projectId },
        conversationId,
        visibility: ['user-facing'],
        pagination: { page, limit },
      }),
      countVisibleMessages(runDbClient)({
        scopes: { tenantId, projectId },
        conversationId,
        visibility: ['user-facing'],
      }),
    ]);

    const resolvedMessages = await resolveMessagesListBlobUris(
      messageList.map((msg) => ({ ...msg, content: msg.content as MessageContent }))
    );

    const hydration = await createReplayHydrationContext({ tenantId, projectId }, resolvedMessages);

    const formattedMessages = await Promise.all(
      resolvedMessages.map((msg) =>
        toVercelMessage(
          {
            id: msg.id,
            role: msg.role,
            content: msg.content,
            createdAt: msg.createdAt,
          },
          hydration
        )
      )
    );

    let title = conversation.title;
    if (!title) {
      const firstUserMsg = formattedMessages.find((m) => m.role === 'user');
      if (firstUserMsg) {
        const text = firstUserMsg.content;
        if (text) {
          title = text.length > 100 ? `${text.slice(0, 100)}...` : text;
        }
      }
    }

    logger.debug(
      { tenantId, projectId, endUserId, conversationId, messageCount: messageList.length },
      'Retrieved conversation'
    );

    const pages = Math.ceil(total / limit);

    return c.json({
      data: {
        id: conversation.id,
        agentId: conversation.agentId,
        title,
        createdAt: toISODateString(conversation.createdAt),
        updatedAt: toISODateString(conversation.updatedAt),
        messages: formattedMessages,
      },
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    });
  }
);

const resumeConversationStreamRoute = createProtectedRoute({
  method: 'get',
  path: '/{conversationId}/stream',
  summary: 'Resume Conversation Stream',
  description:
    'Reconnects to an active in-progress stream for the conversation. Returns 204 if no active stream exists.',
  operationId: 'resume-conversation-stream',
  tags: ['Conversations'],
  security: [{ bearerAuth: [] }],
  permission: inheritedRunApiKeyAuth(),
  request: {
    params: z.object({ conversationId: z.string() }),
    query: z.object({
      afterIdx: z.coerce.number().int().optional().openapi({
        description: 'Resume from after this chunk index (omit for full replay)',
      }),
    }),
  },
  responses: {
    200: {
      description: 'Active stream — replays from given index or beginning',
      content: { 'text/event-stream': { schema: z.string() } },
    },
    204: { description: 'No active stream' },
    ...commonGetErrorResponses,
  },
});

app.openapi(resumeConversationStreamRoute, async (c) => {
  const executionContext = c.get('executionContext');
  const { tenantId, projectId } = executionContext;
  const endUserId = executionContext.metadata?.endUserId;
  const { conversationId } = c.req.valid('param');
  const { afterIdx } = c.req.valid('query');

  const conversation = await getConversation(runDbClient)({
    scopes: { tenantId, projectId },
    conversationId,
  });

  if (!conversation) {
    throw createApiError({ code: 'not_found', message: 'Conversation not found' });
  }

  if (conversation.userId && conversation.userId !== endUserId) {
    throw createApiError({ code: 'not_found', message: 'Conversation not found' });
  }

  const durableExecution = await getWorkflowExecutionByConversation(runDbClient)({
    tenantId,
    projectId,
    conversationId,
  });

  const setStreamHeaders = () => {
    c.header('content-type', 'text/event-stream');
    c.header('cache-control', 'no-cache');
    c.header('connection', 'keep-alive');
    c.header('x-vercel-ai-data-stream', 'v2');
    c.header('x-accel-buffering', 'no');
  };

  if (durableExecution) {
    const startIndex = afterIdx !== undefined ? afterIdx + 1 : 0;
    const run = getRun(durableExecution.id);
    setStreamHeaders();
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
        logger.error({ error, conversationId }, 'Error resuming durable stream');
        await s.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      }
    });
  }

  const scope = { tenantId, projectId, conversationId };
  const hasStream = await streamBufferRegistry.hasChunks(scope);

  if (hasStream) {
    setStreamHeaders();
    const readable = streamBufferRegistry.createReadable(scope, afterIdx);
    return stream(c, async (s) => {
      const reader = readable.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await s.write(value);
        }
      } catch (error) {
        logger.error({ error, conversationId }, 'Error resuming classic stream');
        await s.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      } finally {
        reader.releaseLock();
      }
    });
  }

  return new Response(null, { status: 204 });
});

const PendingToolApprovalSchema = z
  .object({
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.unknown().optional(),
    isDelegated: z.boolean(),
  })
  .openapi('PendingToolApproval');

const PendingApprovalsResponseSchema = z
  .object({
    hasPending: z.boolean(),
    approval: PendingToolApprovalSchema.extend({
      workflowRunId: z.string(),
      updatedAt: z.string(),
    }).optional(),
  })
  .openapi('PendingApprovalsResponse');

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{conversationId}/pending-approvals',
    summary: 'Get Pending Approvals',
    description:
      'Discover pending tool approval requests for a conversation. Use this to recover approval state when an SSE stream is interrupted or on page load.',
    operationId: 'get-conversation-pending-approvals',
    tags: ['Conversations'],
    security: [{ bearerAuth: [] }],
    permission: inheritedRunApiKeyAuth(),
    request: {
      params: z.object({ conversationId: z.string() }),
    },
    responses: {
      200: {
        description: 'Pending approval status for the conversation',
        content: {
          'application/json': {
            schema: PendingApprovalsResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const executionContext = c.get('executionContext');
    const { tenantId, projectId } = executionContext;
    const { conversationId } = c.req.valid('param');

    const conversation = await getConversation(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId,
    });

    if (!conversation) {
      throw createApiError({ code: 'not_found', message: 'Conversation not found' });
    }

    const endUserId = executionContext.metadata?.endUserId;
    if (conversation.userId && conversation.userId !== endUserId) {
      throw createApiError({ code: 'not_found', message: 'Conversation not found' });
    }

    const execution = await getWorkflowExecutionByConversation(runDbClient)({
      tenantId,
      projectId,
      conversationId,
    });

    if (!execution || execution.status !== 'suspended') {
      return c.json({ hasPending: false });
    }

    const metadata = execution.metadata as Record<string, unknown> | null;
    const parsed = PendingToolApprovalSchema.safeParse(metadata?.pendingToolApproval);

    if (!parsed.success) {
      return c.json({ hasPending: false });
    }

    const pendingToolApproval = parsed.data;

    return c.json({
      hasPending: true,
      approval: {
        toolCallId: pendingToolApproval.toolCallId,
        toolName: pendingToolApproval.toolName,
        args: pendingToolApproval.args,
        isDelegated: pendingToolApproval.isDelegated,
        workflowRunId: execution.id,
        updatedAt: execution.updatedAt,
      },
    });
  }
);

export default app;
