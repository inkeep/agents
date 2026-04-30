import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  AppListResponse,
  commonGetErrorResponses,
  listAppsPaginated,
  listUsableProjectIds,
  type OrgRole,
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
        // Member with no project memberships. Empty list either way; check
        // whether the tenant has any apps of this type so the client can
        // distinguish "you don't have access to existing apps" from "no
        // apps exist yet".
        //
        // Intentional information-disclosure tradeoff: a member with zero
        // project access can learn whether the tenant has any apps of this
        // type via `tenantHasAnyApps`. Within their own tenant, that single
        // boolean is acceptable disclosure to drive correct empty-state UX
        // (ask admin to add me vs ask admin to set up Copilot). If a future
        // deploy needs strict project-boundary silos, this branch should
        // be revisited.
        const tenantWide = await listAppsPaginated(runDbClient)({
          scopes: { tenantId },
          pagination: { page: 1, limit: 1 },
          type,
        });
        return c.json({
          data: [],
          pagination: { page, limit, total: 0, pages: 0 },
          role: tenantRole as OrgRole,
          tenantHasAnyApps: tenantWide.pagination.total > 0,
        });
      }
    }

    const result = await listAppsPaginated(runDbClient)({
      scopes: { tenantId, projectIds },
      pagination: { page, limit },
      type,
    });

    const sanitizedData = result.data.map((app) => sanitizeAppConfig(app));

    // Skip the second query when we already know: a non-empty list means
    // apps exist, and an admin's empty result is authoritative because
    // their scope is the whole tenant.
    let tenantHasAnyApps: boolean;
    if (result.pagination.total > 0) {
      // Use total, not sanitizedData.length: page 2+ with results on page 1
      // would spuriously fall through to the unscoped query below otherwise.
      tenantHasAnyApps = true;
    } else if (isOrgAdmin) {
      tenantHasAnyApps = false;
    } else {
      const tenantWide = await listAppsPaginated(runDbClient)({
        scopes: { tenantId },
        pagination: { page: 1, limit: 1 },
        type,
      });
      tenantHasAnyApps = tenantWide.pagination.total > 0;
    }

    return c.json({
      data: sanitizedData,
      pagination: result.pagination,
      role: tenantRole as OrgRole,
      tenantHasAnyApps,
    });
  }
);

export default app;
