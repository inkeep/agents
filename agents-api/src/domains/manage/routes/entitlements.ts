import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  listOrgEntitlements,
  TenantParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedManageTenantAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import type { ManageAppVariables } from '../../../types/app';

const EntitlementItemSchema = z.object({
  resourceType: z.string().openapi({ example: 'seat:admin' }),
  maxValue: z.number().int().openapi({ example: 10 }),
});

const EntitlementsResponseSchema = z.object({
  entitlements: z.array(EntitlementItemSchema),
});

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Org Entitlements',
    description: 'List all entitlements for the current organization.',
    operationId: 'list-org-entitlements',
    tags: ['Entitlements'],
    permission: inheritedManageTenantAuth(),
    request: {
      params: TenantParamsSchema,
    },
    responses: {
      200: {
        description: 'List of entitlements retrieved successfully',
        content: {
          'application/json': {
            schema: EntitlementsResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const entitlements = await listOrgEntitlements(runDbClient)(tenantId);
    return c.json({ entitlements });
  }
);

export default app;
