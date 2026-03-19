import { OpenAPIHono, z } from '@hono/zod-openapi';
import type { OrgRole } from '@inkeep/agents-core';
import {
  canViewProject,
  commonGetErrorResponses,
  createApiError,
  queryUsageEvents,
  queryUsageSummary,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedManageTenantAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import type { ManageAppVariables } from '../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const UsageSummaryQuerySchema = z.object({
  projectId: z.string().optional(),
  from: z.string(),
  to: z.string(),
  groupBy: z.enum(['model', 'agent', 'day', 'generation_type']).default('model').optional(),
});

const UsageSummaryRowSchema = z.object({
  groupKey: z.string(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  totalTokens: z.number(),
  totalEstimatedCostUsd: z.number(),
  eventCount: z.number(),
});

const UsageSummaryResponseSchema = z
  .object({
    data: z.array(UsageSummaryRowSchema),
  })
  .openapi('UsageSummaryResponse');

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/summary',
    summary: 'Get Usage Summary',
    description:
      'Get aggregated usage data. Omit projectId for tenant-level summary. Supports grouping by model, agent, day, or generation_type.',
    operationId: 'get-usage-summary',
    tags: ['Usage'],
    permission: inheritedManageTenantAuth(),
    request: {
      query: UsageSummaryQuerySchema,
    },
    responses: {
      200: {
        description: 'Usage summary',
        content: {
          'application/json': {
            schema: UsageSummaryResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const tenantId = c.get('tenantId');
    const userId = c.get('userId');
    const tenantRole = c.get('tenantRole') as OrgRole;
    const { projectId, from, to, groupBy } = c.req.valid('query');

    if (!tenantId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Tenant context not found',
        instance: c.req.path,
      });
    }

    if (projectId && userId && userId !== 'system' && !userId.startsWith('apikey:')) {
      const hasAccess = await canViewProject({ userId, tenantId, projectId, orgRole: tenantRole });
      if (!hasAccess) {
        throw createApiError({
          code: 'forbidden',
          message: 'You do not have access to this project',
          instance: c.req.path,
        });
      }
    }

    const data = await queryUsageSummary(runDbClient)({
      tenantId,
      projectId,
      from,
      to,
      groupBy,
    });

    return c.json({ data });
  }
);

const UsageEventsQuerySchema = z.object({
  projectId: z.string().optional(),
  from: z.string(),
  to: z.string(),
  agentId: z.string().optional(),
  model: z.string().optional(),
  generationType: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50).optional(),
});

const UsageEventSchema = z.object({
  requestId: z.string(),
  tenantId: z.string(),
  projectId: z.string(),
  agentId: z.string(),
  subAgentId: z.string().nullable(),
  conversationId: z.string().nullable(),
  messageId: z.string().nullable(),
  generationType: z.string(),
  traceId: z.string().nullable(),
  spanId: z.string().nullable(),
  requestedModel: z.string(),
  resolvedModel: z.string().nullable(),
  provider: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number().nullable(),
  reasoningTokens: z.number().nullable(),
  cachedReadTokens: z.number().nullable(),
  cachedWriteTokens: z.number().nullable(),
  stepCount: z.number(),
  estimatedCostUsd: z.string().nullable(),
  streamed: z.boolean(),
  finishReason: z.string().nullable(),
  generationDurationMs: z.number().nullable(),
  byok: z.boolean(),
  status: z.string(),
  errorCode: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});

const UsageEventsResponseSchema = z
  .object({
    data: z.array(UsageEventSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi('UsageEventsResponse');

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/events',
    summary: 'List Usage Events',
    description:
      'List individual usage events with pagination. Supports filtering by project, agent, model, and generation type.',
    operationId: 'list-usage-events',
    tags: ['Usage'],
    permission: inheritedManageTenantAuth(),
    request: {
      query: UsageEventsQuerySchema,
    },
    responses: {
      200: {
        description: 'Paginated usage events',
        content: {
          'application/json': {
            schema: UsageEventsResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const tenantId = c.get('tenantId');
    const userId = c.get('userId');
    const tenantRole = c.get('tenantRole') as OrgRole;
    const query = c.req.valid('query');

    if (!tenantId) {
      throw createApiError({
        code: 'unauthorized',
        message: 'Tenant context not found',
        instance: c.req.path,
      });
    }

    if (query.projectId && userId && userId !== 'system' && !userId.startsWith('apikey:')) {
      const hasAccess = await canViewProject({
        userId,
        tenantId,
        projectId: query.projectId,
        orgRole: tenantRole,
      });
      if (!hasAccess) {
        throw createApiError({
          code: 'forbidden',
          message: 'You do not have access to this project',
          instance: c.req.path,
        });
      }
    }

    const result = await queryUsageEvents(runDbClient)({
      tenantId,
      projectId: query.projectId,
      agentId: query.agentId,
      model: query.model,
      generationType: query.generationType as any,
      from: query.from,
      to: query.to,
      cursor: query.cursor,
      limit: query.limit,
    });

    return c.json({
      data: result.events,
      nextCursor: result.nextCursor ?? null,
    });
  }
);

export default app;
