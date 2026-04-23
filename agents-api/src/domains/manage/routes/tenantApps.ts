import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AppListResponse,
  commonGetErrorResponses,
  listAppsPaginated,
  listUsableProjectIds,
  OrgRoles,
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
    description:
      'List apps for a tenant. Organization admins and owners see all apps across all projects. Other tenant members see only apps from projects where they have at least Use permission (project member role or higher). Results can be optionally filtered by app type.',
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
      ...commonGetErrorResponses,
    },
    ...speakeasyOffsetLimitPagination,
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const userId = c.get('userId');
    const tenantRole = c.get('tenantRole');
    const page = Number(c.req.query('page')) || 1;
    const limit = Math.min(Number(c.req.query('limit')) || 10, 100);
    const type = c.req.query('type') as 'web_client' | 'api' | 'support_copilot' | undefined;

    // Org owners/admins inherit project_admin on every project via SpiceDB,
    // so we skip the lookup and return the tenant-wide set. Also covers
    // system/api-key/test-mode callers (requireTenantAccess sets them to OWNER).
    const isOrgAdmin = tenantRole === OrgRoles.OWNER || tenantRole === OrgRoles.ADMIN;
    let projectIds: string[] | undefined;
    if (!isOrgAdmin) {
      projectIds = userId ? await listUsableProjectIds({ userId, tenantId }) : [];
      if (projectIds.length === 0) {
        return c.json({
          data: [],
          pagination: { page, limit, total: 0, pages: 0 },
        });
      }
    }

    const result = await listAppsPaginated(runDbClient)({
      scopes: { tenantId, projectIds },
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
