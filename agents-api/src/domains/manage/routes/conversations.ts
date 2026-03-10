import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  formatMessagesForLLMContext,
  getConversation,
  getConversationHistory,
  listConversations,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import { getBlobStorageProvider } from '../../run/services/blob-storage';
import { resolveMessagesListBlobUris } from '../../run/services/blob-storage/resolve-blob-uris';
import { buildMediaStorageKeyPrefix } from '../../run/services/blob-storage/storage-keys';

const logger = getLogger('conversations-media');

const app = new OpenAPIHono();

function isMediaNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes('enoent') ||
    normalized.includes('nosuchkey') ||
    normalized.includes('statuscode: 404') ||
    normalized.includes(' 404') ||
    normalized.includes(' not found')
  );
}

const ConversationListQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(200).default(20).optional(),
  userId: z.string().optional(),
});

const ManageConversationListItemSchema = z.object({
  id: z.string(),
  agentId: z.string().nullable(),
  userId: z.string().nullable(),
  title: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ManageConversationListResponseSchema = z
  .object({
    data: z.object({
      conversations: z.array(ManageConversationListItemSchema),
      pagination: z.object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        hasMore: z.boolean(),
      }),
    }),
  })
  .openapi('ManageConversationListResponse');

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Conversations',
    description:
      "List conversations in a project. Supports optional userId filter for viewing a specific end-user's conversations.",
    operationId: 'list-conversations',
    tags: ['Conversations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
      query: ConversationListQuerySchema,
    },
    responses: {
      200: {
        description: 'List of conversations',
        content: {
          'application/json': {
            schema: ManageConversationListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { page = 1, limit = 20, userId } = c.req.valid('query');

    const result = await listConversations(runDbClient)({
      scopes: { tenantId, projectId },
      userId,
      pagination: { page, limit },
    });

    return c.json({
      data: {
        conversations: result.conversations.map((conv) => ({
          id: conv.id,
          agentId: conv.agentId,
          userId: conv.userId,
          title: conv.title,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
        })),
        pagination: {
          page,
          limit,
          total: result.total,
          hasMore: page * limit < result.total,
        },
      },
    });
  }
);

const ConversationQueryParamsSchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(20).optional(),
  includeInternal: z.coerce.boolean().default(false).optional(),
});

const ConversationWithFormattedMessagesResponse = z
  .object({
    data: z.object({
      messages: z.array(z.any()),
      formatted: z.object({
        llmContext: z.string(),
      }),
    }),
  })
  .openapi('ConversationWithFormattedMessagesResponse');

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Conversation',
    operationId: 'get-conversation',
    tags: ['Conversations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectIdParamsSchema,
      query: ConversationQueryParamsSchema,
    },
    responses: {
      200: {
        description: 'Conversation found with formatted messages for LLM use',
        content: {
          'application/json': {
            schema: ConversationWithFormattedMessagesResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const { limit = 20, includeInternal = true } = c.req.valid('query');

    const messages = await getConversationHistory(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId: id,
      options: {
        limit,
        includeInternal,
      },
    });

    if (!messages || messages.length === 0) {
      throw createApiError({
        code: 'not_found',
        message: 'Conversation not found',
      });
    }

    const llmContext = formatMessagesForLLMContext(messages);

    const resolvedMessages = resolveMessagesListBlobUris(messages);

    return c.json({
      data: {
        messages: resolvedMessages,
        formatted: {
          llmContext,
        },
      },
    });
  }
);

const ConversationBoundsResponse = z
  .object({
    data: z.object({
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  })
  .openapi('ConversationBoundsResponse');

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}/bounds',
    summary: 'Get conversation time bounds',
    operationId: 'get-conversation-bounds',
    tags: ['Conversations'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Conversation time bounds for trace queries',
        content: {
          'application/json': {
            schema: ConversationBoundsResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');
    const conversation = await getConversation(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId: id,
    });
    if (!conversation) {
      throw createApiError({
        code: 'not_found',
        message: 'Conversation not found',
      });
    }
    return c.json({
      data: {
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    });
  }
);

const ConversationMediaParamsSchema = TenantProjectIdParamsSchema.extend({
  mediaKey: z.string().min(1).openapi({
    description: 'URL-encoded path segment(s) for the blob (e.g. message key or path)',
  }),
});

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}/media/{mediaKey}',
    summary: 'Get conversation media',
    operationId: 'get-conversation-media',
    tags: ['Conversations'],
    permission: requireProjectPermission('view'),
    request: {
      params: ConversationMediaParamsSchema,
    },
    responses: {
      200: {
        description: 'Media file (content type varies by blob)',
        content: {
          'application/octet-stream': {
            schema: z.string().openapi({ format: 'binary' }),
          },
        },
      },
      ...commonGetErrorResponses,
      400: {
        description: 'Invalid path or media key',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() }),
          },
        },
      },
    },
  }),
  async (c) => {
    const params = c.req.valid('param') as z.infer<typeof ConversationMediaParamsSchema>;
    const { tenantId, projectId, id: conversationId, mediaKey: pathAfterMedia } = params;

    let decodedForValidation: string;
    try {
      decodedForValidation = decodeURIComponent(pathAfterMedia);
    } catch {
      return c.json({ error: 'Invalid media key' }, 400);
    }

    if (
      !decodedForValidation ||
      decodedForValidation.includes('\0') ||
      decodedForValidation.includes('\\') ||
      decodedForValidation.split('/').some((segment) => segment === '..')
    ) {
      return c.json({ error: 'Invalid media key' }, 400);
    }

    const key = `${buildMediaStorageKeyPrefix({ tenantId, projectId, conversationId })}/${pathAfterMedia}`;

    try {
      const storage = getBlobStorageProvider();
      const result = await storage.download(key);

      return new Response(result.data as Uint8Array<ArrayBuffer>, {
        status: 200,
        headers: {
          'Content-Type': result.contentType,
          'Cache-Control': 'private, max-age=31536000, immutable',
          'Content-Length': result.data.length.toString(),
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          error: errorMessage,
          key,
          requestId: c.get('requestId'),
          tenantId,
          projectId,
          conversationId,
        },
        'Failed to serve media'
      );
      if (isMediaNotFoundError(error)) {
        return c.json({ error: 'Media not found' }, 404);
      }
      return c.json({ error: 'Failed to retrieve media' }, 502);
    }
  }
);

export default app;
