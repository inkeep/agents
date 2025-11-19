import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  formatMessagesForLLMContext,
  getConversationHistory,
  TenantProjectIdParamsSchema,
} from '@inkeep/agents-core';
import { z } from 'zod';
import dbClient from '../data/db/dbClient';

const app = new OpenAPIHono();

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
    const messages = await getConversationHistory(dbClient)({
      scopes: { tenantId, projectId },
      conversationId: id,
      options: {
        limit: 20,
        includeInternal: true,
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

export default app;
