import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  ResolvedRefSchema,
  TenantProjectParamsSchema,
} from '@inkeep/agents-core';
import type { BaseAppVariables } from '../types/app';

const app = new OpenAPIHono<{ Variables: BaseAppVariables }>();

const ResolvedRefResponseSchema = z
  .object({
    data: ResolvedRefSchema,
  })
  .openapi('ResolvedRefResponse');

// Return the resolved ref from middleware
app.openapi(
  createRoute({
    method: 'get',
    path: '/resolve',
    summary: 'Resolve Ref',
    description:
      'Resolve a ref string (branch name, tag name, or commit hash) to its full resolved ref with type and commit hash. Pass the ref as a query parameter.',
    operationId: 'resolve-ref',
    tags: ['Refs'],
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
