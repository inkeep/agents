import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  formatMessagesForLLMContext,
  getConversation,
  getConversationHistory,
  TenantProjectIdParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { requireProjectPermission } from '../../../middleware/projectAccess';

const app = new OpenAPIHono();

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

    return c.json({
      data: {
        messages,
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

export default app;
