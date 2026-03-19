import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type BaseExecutionContext,
  type CredentialStoreRegistry,
  commonDeleteErrorResponses,
  commonUpdateErrorResponses,
  createApiError,
  deleteMessageFeedback,
  generateId,
  getConversation,
  getMessageById,
  toISODateString,
  upsertMessageFeedback,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedRunApiKeyAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  executionContext: BaseExecutionContext;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

const FeedbackRequestSchema = z.object({
  type: z.enum(['positive', 'negative']),
  reasons: z
    .array(
      z.object({
        label: z.string(),
        details: z.string(),
      })
    )
    .optional(),
});

const FeedbackResponseSchema = z.object({
  id: z.string(),
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

const FeedbackParamsSchema = z.object({
  conversationId: z.string(),
  messageId: z.string(),
});

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/{conversationId}/messages/{messageId}/feedback',
    summary: 'Submit message feedback',
    description: 'Submit or update feedback (thumbs up/down) on an assistant message',
    operationId: 'submit-message-feedback',
    tags: ['Conversations'],
    security: [{ bearerAuth: [] }],
    permission: inheritedRunApiKeyAuth(),
    request: {
      params: FeedbackParamsSchema,
      body: {
        content: {
          'application/json': { schema: FeedbackRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Feedback submitted successfully',
        content: { 'application/json': { schema: FeedbackResponseSchema } },
      },
      ...commonUpdateErrorResponses,
    },
  }),
  async (c) => {
    const executionContext = c.get('executionContext');
    const { tenantId, projectId } = executionContext;
    const { conversationId, messageId } = c.req.valid('param');
    const body = c.req.valid('json');

    const conversation = await getConversation(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId,
    });
    if (!conversation) {
      throw createApiError({ code: 'not_found', message: 'Conversation not found' });
    }

    const message = await getMessageById(runDbClient)({
      scopes: { tenantId, projectId },
      messageId,
    });
    if (!message) {
      throw createApiError({ code: 'not_found', message: 'Message not found' });
    }

    const result = await upsertMessageFeedback(runDbClient)({
      scopes: { tenantId, projectId },
      data: {
        id: generateId(),
        conversationId,
        messageId,
        type: body.type,
        reasons: body.reasons ?? null,
        userId: executionContext.metadata?.endUserId ?? null,
      },
    });

    if (!result) {
      throw createApiError({
        code: 'internal_server_error',
        message: 'Failed to save feedback',
      });
    }

    return c.json({
      id: result.id,
      type: result.type,
      reasons: result.reasons ?? null,
      createdAt: toISODateString(result.createdAt),
      updatedAt: toISODateString(result.updatedAt),
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{conversationId}/messages/{messageId}/feedback',
    summary: 'Delete message feedback',
    description: 'Remove feedback from an assistant message',
    operationId: 'delete-message-feedback',
    tags: ['Conversations'],
    security: [{ bearerAuth: [] }],
    permission: inheritedRunApiKeyAuth(),
    request: {
      params: FeedbackParamsSchema,
    },
    responses: {
      204: {
        description: 'Feedback deleted successfully',
      },
      ...commonDeleteErrorResponses,
    },
  }),
  async (c) => {
    const executionContext = c.get('executionContext');
    const { tenantId, projectId } = executionContext;
    const { conversationId, messageId } = c.req.valid('param');

    const conversation = await getConversation(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId,
    });
    if (!conversation) {
      throw createApiError({ code: 'not_found', message: 'Conversation not found' });
    }

    await deleteMessageFeedback(runDbClient)({
      scopes: { tenantId, projectId },
      messageId,
    });

    return c.body(null, 204);
  }
);

export default app;
