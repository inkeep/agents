import { OpenAPIHono } from '@hono/zod-openapi';
import {
  type BaseExecutionContext,
  type CredentialStoreRegistry,
  commonCreateErrorResponses,
  createApiError,
  createFeedback,
  FeedbackApiInsertSchema,
  FeedbackResponse,
  generateId,
  getConversation,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedRunApiKeyAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';

const logger = getLogger('run-feedback');

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  executionContext: BaseExecutionContext;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

function requireEndUserId(executionContext: BaseExecutionContext): string {
  const endUserId = executionContext.metadata?.endUserId;
  if (!endUserId) {
    throw createApiError({
      code: 'unauthorized',
      message: 'End-user authentication required to submit feedback',
    });
  }
  return endUserId;
}

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Submit Feedback',
    description: 'Submit feedback for a conversation or message.',
    operationId: 'submit-end-user-feedback',
    tags: ['Feedback'],
    security: [{ bearerAuth: [] }],
    permission: inheritedRunApiKeyAuth(),
    request: {
      body: {
        content: {
          'application/json': {
            schema: FeedbackApiInsertSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Feedback submitted successfully',
        content: {
          'application/json': {
            schema: FeedbackResponse,
          },
        },
      },
      ...commonCreateErrorResponses,
    },
  }),
  async (c) => {
    const executionContext = c.get('executionContext');
    const { tenantId, projectId } = executionContext;
    const endUserId = requireEndUserId(executionContext);
    const body = c.req.valid('json');

    const conversation = await getConversation(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId: body.conversationId,
    });

    if (!conversation || conversation.userId !== endUserId) {
      throw createApiError({
        code: 'not_found',
        message: 'Conversation not found',
      });
    }

    const created = await createFeedback(runDbClient)({
      ...body,
      id: body.id || generateId(),
      tenantId,
      projectId,
    });

    logger.debug(
      { tenantId, projectId, endUserId, feedbackId: created.id },
      'End-user submitted feedback'
    );

    return c.json({ data: created }, 201);
  }
);

export default app;
