import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type BaseExecutionContext,
  type CredentialStoreRegistry,
  commonGetErrorResponses,
  createApiError,
  getLedgerArtifact,
  LedgerArtifactApiSelectSchema,
  ListResponseSchema,
  listLedgerArtifacts,
  toISODateString,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedRunApiKeyAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  executionContext: BaseExecutionContext;
};

const app = new OpenAPIHono<{ Variables: AppVariables }>();

function requireEndUserId(executionContext: BaseExecutionContext): string {
  const endUserId = executionContext.metadata?.endUserId;
  if (!endUserId) {
    throw createApiError({
      code: 'unauthorized',
      message: 'End-user authentication required to list artifacts',
    });
  }
  return endUserId;
}

const ArtifactListItemSchema = LedgerArtifactApiSelectSchema.omit({
  parts: true,
  metadata: true,
  allowedAgents: true,
  derivedFrom: true,
});

const ArtifactListResponseSchema = ListResponseSchema(ArtifactListItemSchema).openapi(
  'EndUserArtifactListResponse'
);

const ArtifactDetailResponseSchema = z
  .object({
    data: LedgerArtifactApiSelectSchema,
  })
  .openapi('EndUserArtifactDetailResponse');

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/',
    summary: 'List End-User Artifacts',
    description:
      'List artifacts for the authenticated end-user. Automatically scoped by the JWT sub claim. Optionally filter by conversation.',
    operationId: 'list-end-user-artifacts',
    tags: ['Artifacts'],
    security: [{ bearerAuth: [] }],
    permission: inheritedRunApiKeyAuth(),
    request: {
      query: z.object({
        page: z.coerce.number().min(1).default(1).optional(),
        limit: z.coerce.number().min(1).max(200).default(20).optional(),
        conversationId: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: 'List of artifacts for the authenticated end-user',
        content: {
          'application/json': {
            schema: ArtifactListResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const executionContext = c.get('executionContext');
    const { tenantId, projectId } = executionContext;
    const endUserId = requireEndUserId(executionContext);

    const { page = 1, limit = 20, conversationId } = c.req.valid('query');

    const result = await listLedgerArtifacts(runDbClient)({
      scopes: { tenantId, projectId },
      userId: endUserId,
      conversationId,
      pagination: { page, limit },
    });

    const pages = Math.ceil(result.total / limit);

    return c.json({
      data: result.artifacts.map(({ parts, metadata, allowedAgents, derivedFrom, ...rest }) => ({
        ...rest,
        createdAt: toISODateString(rest.createdAt),
        updatedAt: toISODateString(rest.updatedAt),
      })),
      pagination: {
        page,
        limit,
        total: result.total,
        pages,
      },
    });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/{artifactId}',
    summary: 'Get Artifact',
    description:
      'Get a single artifact by ID with full data including parts. The artifact must belong to a conversation owned by the authenticated end-user.',
    operationId: 'get-end-user-artifact',
    tags: ['Artifacts'],
    security: [{ bearerAuth: [] }],
    permission: inheritedRunApiKeyAuth(),
    request: {
      params: z.object({
        artifactId: z.string(),
      }),
    },
    responses: {
      200: {
        description: 'Artifact with full data',
        content: {
          'application/json': {
            schema: ArtifactDetailResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const executionContext = c.get('executionContext');
    const { tenantId, projectId } = executionContext;
    const endUserId = requireEndUserId(executionContext);
    const { artifactId } = c.req.valid('param');

    const artifact = await getLedgerArtifact(runDbClient)({
      scopes: { tenantId, projectId },
      artifactId,
      userId: endUserId,
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
