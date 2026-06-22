import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  BulkFeedbackResponseSchema,
  commonCreateErrorResponses,
  commonDeleteErrorResponses,
  commonGetErrorResponses,
  commonUpdateErrorResponses,
  createApiError,
  createFeedback,
  createFeedbackBulk,
  deleteFeedback,
  FeedbackApiInsertSchema,
  type FeedbackApiSelectSchema,
  FeedbackApiUpdateSchema,
  FeedbackListResponse,
  FeedbackResponse,
  generateId,
  getFeedbackById,
  isForeignKeyViolation,
  isUniqueConstraintError,
  listFeedback,
  PaginationQueryParamsSchema,
  TenantProjectIdParamsSchema,
  TenantProjectParamsSchema,
  updateFeedback,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { emitFeedbackWebhook } from '../../../domains/run/services/WebhookDeliveryService';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';

const logger = getLogger('manage-feedback');

const app = new OpenAPIHono();

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Feedback',
    description: 'List feedback for a project, optionally filtered by conversation or message',
    operationId: 'list-feedback',
    tags: ['Feedback'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
      query: PaginationQueryParamsSchema.extend({
        conversationId: z.string().optional().describe('Optionally filter by conversation ID'),
        messageId: z.string().optional().describe('Optionally filter by message ID'),
        agentId: z.string().optional().describe('Optionally filter by agent ID'),
        type: z
          .enum(['positive', 'negative'])
          .optional()
          .describe('Optionally filter by feedback type'),
        startDate: z
          .string()
          .optional()
          .describe('Filter feedback created on or after this date (YYYY-MM-DD)'),
        endDate: z
          .string()
          .optional()
          .describe('Filter feedback created on or before this date (YYYY-MM-DD)'),
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
    const {
      conversationId,
      messageId,
      agentId,
      type,
      startDate,
      endDate,
      page = 1,
      limit = 10,
    } = c.req.valid('query');

    const result = await listFeedback(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId,
      messageId,
      agentId,
      type,
      startDate,
      endDate,
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

    emitFeedbackWebhook({
      runDbClient,
      tenantId,
      projectId,
      feedback: created,
    });

    return c.json({ data: created }, 201);
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/bulk',
    summary: 'Create Multiple Feedback',
    description:
      'Create multiple feedback entries. Items with invalid conversation or message IDs are skipped and returned in the errors array.',
    operationId: 'create-feedback-bulk',
    tags: ['Feedback'],
    permission: requireProjectPermission('edit'),
    request: {
      params: TenantProjectParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: z.array(FeedbackApiInsertSchema).min(1).max(1000),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Feedback items created (partial success possible)',
        content: {
          'application/json': {
            schema: BulkFeedbackResponseSchema,
          },
        },
      },
      ...commonCreateErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const itemsData = c.req.valid('json');

    const insertRows = itemsData.map((item) => ({
      ...item,
      id: item.id || generateId(),
      tenantId,
      projectId,
    }));

    try {
      const bulkResult = await createFeedbackBulk(runDbClient)(insertRows);
      return c.json({ data: bulkResult, errors: [] }, 201);
    } catch (bulkError) {
      logger.warn({ err: bulkError }, 'Bulk insert failed, falling back to per-row insertion');
    }

    const created: z.infer<typeof FeedbackApiSelectSchema>[] = [];
    const errors: { index: number; conversationId: string; message: string }[] = [];

    for (let i = 0; i < insertRows.length; i++) {
      const row = insertRows[i];
      try {
        const result = await createFeedback(runDbClient)(row);
        created.push(result);
      } catch (error: unknown) {
        let message: string;
        if (isForeignKeyViolation(error)) {
          message = `Conversation '${row.conversationId}' not found${row.messageId ? ` or message '${row.messageId}' does not exist` : ''}`;
        } else if (isUniqueConstraintError(error)) {
          message = 'Duplicate feedback entry';
        } else {
          message = `Failed to create feedback for conversation '${row.conversationId}'`;
        }
        errors.push({ index: i, conversationId: row.conversationId, message });
      }
    }

    return c.json({ data: created, errors }, 201);
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
      // 204 No Content — consistent with every other delete route in the API.
      204: {
        description: 'Feedback deleted successfully',
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

    return c.body(null, 204);
  }
);

export default app;
