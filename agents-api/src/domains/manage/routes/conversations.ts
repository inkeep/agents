import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  formatMessagesForLLMContext,
  getConversationHistory,
  TenantProjectIdParamsSchema,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { resolveMessagesListBlobUris } from '../../run/services/blob-storage/resolve-blob-uris';
import mediaRoutes from '../../run/routes/media';

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
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Conversation',
    operationId: 'get-conversation',
    tags: ['Conversations'],
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

// Mount media routes for conversation media access
app.route('/:id/media', mediaRoutes);

export default app;
