import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type BaseExecutionContext,
  ConversationApiSelectSchema,
  type CredentialStoreRegistry,
  commonGetErrorResponses,
  countMessagesByConversation,
  createApiError,
  getConversation,
  getVisibleMessages,
  ListResponseSchema,
  listConversations,
  type MessageContent,
  toISODateString,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedRunApiKeyAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';

const logger = getLogger('run-conversations');

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  executionContext: BaseExecutionContext;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

// ---------------------------------------------------------------------------
// Message format converters: DB MessageContent → Vercel / OpenAI
// ---------------------------------------------------------------------------

interface VercelMessage {
  id: string;
  role: string;
  content: string;
  parts: Array<Record<string, unknown>>;
  createdAt: string;
}

/** Map internal DB roles to standard roles expected by consumers. */
function normalizeRole(role: string): string {
  if (role === 'agent') return 'assistant';
  return role;
}

function extractText(content: MessageContent): string {
  if (content.text) return content.text;
  if (content.parts) {
    return content.parts
      .filter((p) => p.kind === 'text' && p.text)
      .map((p) => p.text as string)
      .join('');
  }
  return '';
}

function toVercelMessage(msg: {
  id: string;
  role: string;
  content: MessageContent;
  createdAt: string;
}): VercelMessage {
  const role = normalizeRole(msg.role);
  const text = extractText(msg.content);
  const parts: Array<Record<string, unknown>> = [];

  if (text) {
    parts.push({ type: 'text', text });
  }

  if (msg.content.tool_calls) {
    for (const tc of msg.content.tool_calls) {
      parts.push({
        type: 'tool-invocation',
        toolCallId: tc.id,
        toolName: tc.function.name,
        args: tc.function.arguments,
        state: 'result',
      });
    }
  }

  return { id: msg.id, role, content: text, parts, createdAt: toISODateString(msg.createdAt) };
}

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

const VercelMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: z.string(),
  parts: z.array(z.record(z.string(), z.unknown())),
  createdAt: z.string(),
});

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

    const { page = 1, limit = 20 } = c.req.valid('query');

    const result = await listConversations(runDbClient)({
      scopes: { tenantId, projectId },
      userId: endUserId,
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
      countMessagesByConversation(runDbClient)({
        scopes: { tenantId, projectId },
        conversationId,
      }),
    ]);

    const formattedMessages = messageList.map((msg) =>
      toVercelMessage({
        id: msg.id,
        role: msg.role,
        content: msg.content as MessageContent,
        createdAt: msg.createdAt,
      })
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

export default app;
