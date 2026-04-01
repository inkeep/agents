import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  getLedgerArtifact,
  LedgerArtifactApiSelectSchema,
  listLedgerArtifacts,
  TenantProjectParamsSchema,
  toISODateString,
} from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { requireProjectPermission } from '../../../middleware/projectAccess';

const app = new OpenAPIHono();

const ArtifactListQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1).optional(),
  limit: z.coerce.number().min(1).max(200).default(20).optional(),
  conversationId: z.string().optional(),
  userId: z.string().optional(),
});

const ManageArtifactListItemSchema = LedgerArtifactApiSelectSchema.omit({
  parts: true,
  metadata: true,
  allowedAgents: true,
  derivedFrom: true,
});

const ManageArtifactListResponseSchema = z
  .object({
    data: z.object({
      artifacts: z.array(ManageArtifactListItemSchema),
      pagination: z.object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        hasMore: z.boolean(),
      }),
    }),
  })
  .openapi('ManageArtifactListResponse');

const ManageArtifactDetailResponseSchema = z
  .object({
    data: LedgerArtifactApiSelectSchema,
  })
  .openapi('ManageArtifactDetailResponse');

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List Runtime Artifacts',
    description:
      'List runtime artifacts in a project. Supports optional conversationId and userId filters.',
    operationId: 'list-runtime-artifacts',
    tags: ['Artifacts'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema,
      query: ArtifactListQuerySchema,
    },
    responses: {
      200: {
        description: 'List of runtime artifacts',
        content: {
          'application/json': {
            schema: ManageArtifactListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId } = c.req.valid('param');
    const { page = 1, limit = 20, conversationId, userId } = c.req.valid('query');

    const result = await listLedgerArtifacts(runDbClient)({
      scopes: { tenantId, projectId },
      conversationId,
      userId,
      pagination: { page, limit },
    });

    return c.json({
      data: {
        artifacts: result.artifacts.map(
          ({ parts, metadata, allowedAgents, derivedFrom, ...rest }) => ({
            ...rest,
            mime: rest.mime as string[] | null,
            createdAt: toISODateString(rest.createdAt),
            updatedAt: toISODateString(rest.updatedAt),
          })
        ),
        pagination: {
          page,
          limit,
          total: result.total,
          hasMore: page * limit < result.total,
        },
      },
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{artifactId}',
    summary: 'Get Runtime Artifact',
    description: 'Get a single runtime artifact by ID with full data including parts.',
    operationId: 'get-runtime-artifact',
    tags: ['Artifacts'],
    permission: requireProjectPermission('view'),
    request: {
      params: TenantProjectParamsSchema.extend({ artifactId: z.string() }),
    },
    responses: {
      200: {
        description: 'Artifact with full data',
        content: {
          'application/json': {
            schema: ManageArtifactDetailResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, artifactId } = c.req.valid('param');

    const artifact = await getLedgerArtifact(runDbClient)({
      scopes: { tenantId, projectId },
      artifactId,
    });

    if (!artifact) {
      throw createApiError({
        code: 'not_found',
        message: 'Artifact not found',
      });
    }

    return c.json({
      data: {
        ...artifact,
        createdAt: toISODateString(artifact.createdAt),
        updatedAt: toISODateString(artifact.updatedAt),
      },
    });
  }
);

export default app;
