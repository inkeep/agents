import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  ResolvedRefSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const ResolvedRefResponseSchema = z
  .object({
    data: ResolvedRefSchema,
  })
  .openapi('ResolvedRefResponse');

// Return the resolved ref from middleware
app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/resolve',
    summary: 'Resolve Ref',
    description:
      'Resolve a ref string (branch name, tag name, or commit hash) to its full resolved ref with type and commit hash. Pass the ref as a query parameter.',
    operationId: 'resolve-ref',
    tags: ['Refs'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
    },
    responses: {
      200: {
        description: 'Ref resolved successfully',
        content: {
          'application/json': {
            schema: ResolvedRefResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const resolvedRef = c.get('resolvedRef');

    if (!resolvedRef) {
      throw createApiError({
        code: 'not_found',
        message: 'Could not resolve ref',
      });
    }

    return c.json({ data: resolvedRef });
  }
);

export default app;
