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

type MessageFormat = 'vercel' | 'openai';

interface VercelMessage {
  id: string;
  role: string;
  content: string;
  parts: Array<Record<string, unknown>>;
  createdAt: string;
}

interface OpenAIMessage {
  id: string;
  role: string;
  content: string | Array<Record<string, unknown>>;
  createdAt: string;
}

function dbPartToVercelPart(part: {
  kind: string;
  text?: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
}): Record<string, unknown> | null {
  switch (part.kind) {
    case 'text':
      return { type: 'text', text: part.text ?? '' };
    case 'file':
      return { type: 'file', data: part.data, ...(part.metadata && { metadata: part.metadata }) };
    case 'image':
      return { type: 'image', text: part.data ?? part.text ?? '' };
    case 'data':
      return { type: 'data', data: part.data, ...(part.metadata && { metadata: part.metadata }) };
    default: {
      const result: Record<string, unknown> = { type: part.kind };
      if (part.text) result.text = part.text;
      if (part.data) result.data = part.data;
      return result;
    }
  }
}

function extractText(content: MessageContent): string {
  if (content.text) return content.text;
  if (content.parts) {
    return content.parts
      .filter((p) => p.kind === 'text' && p.text)
      .map((p) => p.text as string)
      .join(' ');
  }
  return '';
}

function toVercelMessage(msg: {
  id: string;
  role: string;
  content: MessageContent;
  createdAt: string;
}): VercelMessage {
  const text = extractText(msg.content);
  const parts: Array<Record<string, unknown>> = [];

  if (msg.content.parts) {
    for (const part of msg.content.parts) {
      const converted = dbPartToVercelPart(part);
      if (converted) parts.push(converted);
    }
  } else if (text) {
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

  return { id: msg.id, role: msg.role, content: text, parts, createdAt: msg.createdAt };
}

function toOpenAIMessage(msg: {
  id: string;
  role: string;
  content: MessageContent;
  createdAt: string;
}): OpenAIMessage {
  const text = extractText(msg.content);

  if (msg.content.tool_calls) {
    return {
      id: msg.id,
      role: msg.role,
      content: text,
      createdAt: msg.createdAt,
    };
  }

  if (msg.content.parts?.some((p) => p.kind === 'file' || p.kind === 'image')) {
    const contentParts: Array<Record<string, unknown>> = [];
    for (const part of msg.content.parts) {
      if (part.kind === 'text') {
        contentParts.push({ type: 'text', text: part.text ?? '' });
      } else if (part.kind === 'file' || part.kind === 'image') {
        const fileData = part.data as Record<string, unknown> | undefined;
        const url = fileData?.uri ?? fileData?.bytes;
        if (url) {
          contentParts.push({ type: 'image_url', image_url: { url } });
        }
      }
    }
    return { id: msg.id, role: msg.role, content: contentParts, createdAt: msg.createdAt };
  }

  return { id: msg.id, role: msg.role, content: text, createdAt: msg.createdAt };
}

function formatMessage(
  msg: { id: string; role: string; content: MessageContent; createdAt: string },
  format: MessageFormat
): VercelMessage | OpenAIMessage {
  return format === 'vercel' ? toVercelMessage(msg) : toOpenAIMessage(msg);
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

const OpenAIMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]),
  createdAt: z.string(),
});

const ConversationDetailResponseSchema = z
  .object({
    data: ConversationListItemSchema.extend({
      messages: z.array(z.union([VercelMessageSchema, OpenAIMessageSchema])),
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
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
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
      'Get a conversation and its messages. Returns messages in Vercel AI SDK format by default. Use `?format=openai` for OpenAI Chat Completions format. The conversation must belong to the authenticated end-user.',
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
      formatMessage(
        {
          id: msg.id,
          role: msg.role,
          content: msg.content as MessageContent,
          createdAt: msg.createdAt,
        },
        format as MessageFormat
      )
    );

    let title = conversation.title;
    if (!title) {
      const firstUserMsg = formattedMessages.find((m) => m.role === 'user');
      if (firstUserMsg) {
        const text = typeof firstUserMsg.content === 'string' ? firstUserMsg.content : '';
        if (text) {
          title = text.length > 100 ? `${text.slice(0, 100)}...` : text;
        }
      }
    }

    logger.debug(
      { tenantId, projectId, endUserId, conversationId, format, messageCount: messageList.length },
      'Retrieved conversation'
    );

    const pages = Math.ceil(total / limit);

    return c.json({
      data: {
        id: conversation.id,
        agentId: conversation.agentId,
        title,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
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
