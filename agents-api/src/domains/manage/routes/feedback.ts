import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonCreateErrorResponses,
  commonDeleteErrorResponses,
  commonGetErrorResponses,
  commonUpdateErrorResponses,
  createApiError,
  createFeedback,
  deleteFeedback,
  FeedbackApiInsertSchema,
  FeedbackApiUpdateSchema,
  FeedbackListResponse,
  FeedbackResponse,
  generateId,
  getFeedbackById,
  listFeedbackByConversation,
  PaginationQueryParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateFeedback,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { requireProjectPermission } from '../../../middleware/projectAccess';

const app = new OpenAPIHono();

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Feedback',
    description: 'List feedback for a conversation, optionally filtered by message',
    operationId: 'list-feedback',
    tags: ['Feedback'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema.extend({
        conversationId: z.string().describe('Filter by conversation ID'),
        messageId: z.string().optional().describe('Optionally filter by message ID'),
      }),
    },
    responses: {
      200: {
        description: 'List of feedback retrieved successfully',
        content: {
          'application/json': {
            schema: FeedbackListResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { conversationId, messageId, page = 1, limit = 10 } = c.req.valid('query');

    const result = await listFeedbackByConversation(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId,
      messageId,
      pagination: { page, limit },
    });

    const total = result.total;
    const pages = Math.ceil(total / limit);

    return c.json({
      data: result.feedback,
      pagination: { page, limit, total, pages },
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{id}',
    summary: 'Get Feedback',
    description: 'Get a specific feedback entry by ID',
    operationId: 'get-feedback-by-id',
    tags: ['Feedback'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Feedback found',
        content: {
          'application/json': {
            schema: FeedbackResponse,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, id } = c.req.valid('param');

    const entry = await getFeedbackById(runDbClient)({
      scopes: { tenantId, projectId },
      feedbackId: id,
    });

    if (!entry) {
      throw createApiError({
        code: 'not_found',
        message: 'Feedback not found',
      });
    }

    return c.json({ data: entry });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Create Feedback',
    description: 'Create a new feedback entry for a conversation or message',
    operationId: 'create-feedback',
    tags: ['Feedback'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
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
        description: 'Feedback created successfully',
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
    const { tenantId, projectId } = c.req.valid('param');
    const body = c.req.valid('json');

    const created = await createFeedback(runDbClient)({
      ...body,
      id: body.id || generateId(),
      tenantId,
      projectId,
    });

    return c.json({ data: created }, 201);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'patch',
    path: '/{id}',
    summary: 'Update Feedback',
    description: 'Update an existing feedback entry',
    operationId: 'update-feedback',
    tags: ['Feedback'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectIdParamsSchema,
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
    const { tenantId, projectId, id } = c.req.valid('param');
    const body = c.req.valid('json');

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

    return c.json({ data: updated });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'delete',
    path: '/{id}',
    summary: 'Delete Feedback',
    description: 'Delete a feedback entry',
    operationId: 'delete-feedback',
    tags: ['Feedback'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectIdParamsSchema,
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
    const { tenantId, projectId, id } = c.req.valid('param');

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

    return c.json({ success: true });
  }
);

export default app;
