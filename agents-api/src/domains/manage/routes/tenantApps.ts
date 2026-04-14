import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AppListResponse,
  listAppsPaginated,
  PaginationQueryParamsSchema,
  sanitizeAppConfig,
  TenantParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedManageTenantAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import type { ManageAppVariables } from '../../../types/app';
import { speakeasyOffsetLimitPagination } from '../../../utils/speakeasy';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Tenant Apps',
    description: 'List all apps for a tenant across all projects, optionally filtered by type',
    operationId: 'list-tenant-apps',
    tags: ['Apps'],
    permission: inheritedManageTenantAuth(),
    request: {
      params: TenantParamsSchema,
      query: PaginationQueryParamsSchema.extend({
        type: z
          .enum(['web_client', 'api', 'support_copilot'])
          .optional()
          .describe('Filter by app type'),
      }),
    },
    responses: {
      200: {
        description: 'List of apps retrieved successfully',
        content: {
          'application/json': {
            schema: AppListResponse,
          },
        },
      },
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);
    const type = c.req.query('type') as 'web_client' | 'api' | 'support_copilot' | undefined;

    const result = await listAppsPaginated(runDbClient)({
      scopes: { tenantId },
      pagination: { page, limit },
      type,
    });

    const sanitizedData = result.data.map((app) => sanitizeAppConfig(app));

    return c.json({
      data: sanitizedData,
      pagination: result.pagination,
    });
  }
);

export default app;
