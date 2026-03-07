import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type BaseExecutionContext,
  type CredentialStoreRegistry,
  commonGetErrorResponses,
  createApiError,
  listConversations,
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

const ConversationListItemSchema = z.object({
  id: z.string(),
  agentId: z.string().nullable(),
  title: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ConversationListResponseSchema = z
  .object({
    data: z.object({
      conversations: z.array(ConversationListItemSchema),
      pagination: z.object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        hasMore: z.boolean(),
      }),
    }),
  })
  .openapi('EndUserConversationListResponse');

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

    const endUserId = executionContext.metadata?.endUserId;
    if (!endUserId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'End-user authentication required to list conversations',
      });
    }

    const { page = 1, limit = 20 } = c.req.valid('query');

    const result = await listConversations(runDbClient)({
      scopes: { tenantId, projectId },
      userId: endUserId,
      pagination: { page, limit },
    });

    logger.debug(
      { tenantId, projectId, endUserId, total: result.total },
      'Listed end-user conversations'
    );

    return c.json({
      data: {
        conversations: result.conversations.map((conv) => ({
          id: conv.id,
          agentId: conv.agentId,
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

export default app;
