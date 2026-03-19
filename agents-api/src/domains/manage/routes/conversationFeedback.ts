import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  getConversationFeedback,
  TenantProjectParamsSchema,
  toISODateString,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { requireProjectPermission } from '../../../middleware/projectAccess';

const app = new OpenAPIHono();

const ConversationFeedbackParamsSchema = TenantProjectParamsSchema.extend({
  conversationId: z.string().min(1),
});

const FeedbackItemSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  type: z.enum(['positive', 'negative']),
  reasons: z
    .array(
      z.object({
        label: z.string(),
        details: z.string(),
      })
    )
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List conversation feedback',
    description: 'Get all message feedback for a conversation',
    operationId: 'list-conversation-feedback',
    tags: ['Conversations'],
    permission: requireProjectPermission('view'),
    request: {
      params: ConversationFeedbackParamsSchema,
    },
    responses: {
      200: {
        description: 'Feedback entries for the conversation',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(FeedbackItemSchema),
            }),
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, conversationId } = c.req.valid('param') as z.infer<
      typeof ConversationFeedbackParamsSchema
    >;

    const feedbacks = await getConversationFeedback(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId,
    });

    return c.json({
      data: feedbacks.map((f) => ({
        id: f.id,
        messageId: f.messageId,
        type: f.type,
        reasons: f.reasons ?? null,
        createdAt: toISODateString(f.createdAt),
        updatedAt: toISODateString(f.updatedAt),
      })),
    });
  }
);

export default app;
