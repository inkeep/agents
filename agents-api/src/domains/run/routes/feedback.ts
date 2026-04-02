import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type BaseExecutionContext,
  type CredentialStoreRegistry,
  commonCreateErrorResponses,
  commonDeleteErrorResponses,
  commonUpdateErrorResponses,
  createApiError,
  createFeedback,
  deleteFeedback,
  FeedbackApiInsertSchema,
  FeedbackApiUpdateSchema,
  FeedbackResponse,
  generateId,
  getFeedbackById,
  updateFeedback,
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

app.openapi(
  createProtectedRoute({
    method: 'patch',
    path: '/{id}',
    summary: 'Update Feedback',
    description: 'Update an existing feedback entry.',
    operationId: 'update-end-user-feedback',
    tags: ['Feedback'],
    security: [{ bearerAuth: [] }],
    permission: inheritedRunApiKeyAuth(),
    request: {
      params: z.object({
        id: z.string(),
      }),
      body: {
        content: {
          'application/json': {
            schema: FeedbackApiUpdateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Feedback updated successfully',
        content: {
          'application/json': {
            schema: FeedbackResponse,
          },
        },
      },
      ...commonUpdateErrorResponses,
    },
  }),
  async (c) => {
    const executionContext = c.get('executionContext');
    const { tenantId, projectId } = executionContext;
    const endUserId = requireEndUserId(executionContext);
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');

    const existing = await getFeedbackById(runDbClient)({
      scopes: { tenantId, projectId },
      feedbackId: id,
    });

    if (!existing) {
      throw createApiError({
        code: 'not_found',
        message: 'Feedback not found',
      });
    }

    const updated = await updateFeedback(runDbClient)({
      scopes: { tenantId, projectId },
      feedbackId: id,
      data: body,
    });

    if (!updated) {
      throw createApiError({
        code: 'not_found',
        message: 'Feedback not found',
      });
    }

    logger.debug({ tenantId, projectId, endUserId, feedbackId: id }, 'End-user updated feedback');

    return c.json({ data: updated });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Feedback',
    description: 'Delete a feedback entry.',
    operationId: 'delete-end-user-feedback',
    tags: ['Feedback'],
    security: [{ bearerAuth: [] }],
    permission: inheritedRunApiKeyAuth(),
    request: {
      params: z.object({
        id: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Feedback deleted successfully',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean() }),
          },
        },
      },
      ...commonDeleteErrorResponses,
    },
  }),
  async (c) => {
    const executionContext = c.get('executionContext');
    const { tenantId, projectId } = executionContext;
    const endUserId = requireEndUserId(executionContext);
    const { id } = c.req.valid('param');

    const existing = await getFeedbackById(runDbClient)({
      scopes: { tenantId, projectId },
      feedbackId: id,
    });

    if (!existing) {
      throw createApiError({
        code: 'not_found',
        message: 'Feedback not found',
      });
    }

    const deleted = await deleteFeedback(runDbClient)({
      scopes: { tenantId, projectId },
      feedbackId: id,
    });

    if (!deleted) {
      throw createApiError({
        code: 'not_found',
        message: 'Feedback not found',
      });
    }

    logger.debug({ tenantId, projectId, endUserId, feedbackId: id }, 'End-user deleted feedback');

    return c.json({ success: true });
  }
);

export default app;
