import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonDeleteErrorResponses,
  commonGetErrorResponses,
  createApiError,
  deleteInstallation,
  errorSchemaFactory,
  getInstallationById,
  getInstallationsByTenantId,
  getRepositoriesByInstallationId,
  getRepositoryCountsByInstallationIds,
  GitHubAppInstallationApiSelectSchema,
  GitHubAppRepositorySelectSchema,
  syncRepositories,
  TenantParamsSchema,
} from '@inkeep/agents-core';
import { HTTPException } from 'hono/http-exception';
import { SignJWT } from 'jose';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import type { ManageAppVariables } from '../../../types/app';
import {
  getGitHubAppName,
  getStateSigningSecret,
  isGitHubAppNameConfigured,
  isStateSigningConfigured,
} from '../../github/config';
import { createAppJwt, fetchInstallationRepositories } from '../../github/installation';

const logger = getLogger('github-manage');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const InstallUrlResponseSchema = z.object({
  url: z.url().describe('GitHub App installation URL with signed state parameter'),
});

const STATE_JWT_ISSUER = 'inkeep-agents-api';
const STATE_JWT_AUDIENCE = 'github-app-install';

/**
 * Signs a JWT state token for the GitHub App installation flow.
 * The state contains the tenantId and expires after 10 minutes.
 */
async function signStateToken(tenantId: string): Promise<string> {
  const secret = getStateSigningSecret();
  const secretKey = new TextEncoder().encode(secret);

  const jwt = await new SignJWT({ tenantId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(STATE_JWT_ISSUER)
    .setAudience(STATE_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secretKey);

  return jwt;
}

app.openapi(
  createRoute({
    method: 'get',
    path: '/install-url',
    summary: 'Get GitHub App installation URL',
    operationId: 'get-github-install-url',
    tags: ['GitHub'],
    description:
      'Generates a URL to install the GitHub App on an organization or user account. ' +
      'The URL includes a signed state parameter that encodes the tenant ID and expires after 10 minutes. ' +
      'After installation, GitHub will redirect back to our callback endpoint with this state.',
    request: {
      params: TenantParamsSchema,
    },
    responses: {
      200: {
        description: 'GitHub App installation URL generated successfully',
        content: {
          'application/json': {
            schema: InstallUrlResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');

    if (!isStateSigningConfigured()) {
      logger.error({}, 'GITHUB_STATE_SIGNING_SECRET is not configured');
      throw createApiError({
        code: 'internal_server_error',
        message: 'GitHub App installation is not configured',
      });
    }

    if (!isGitHubAppNameConfigured()) {
      logger.error({}, 'GITHUB_APP_NAME is not configured');
      throw createApiError({
        code: 'internal_server_error',
        message: 'GitHub App installation is not configured',
      });
    }

    const appName = getGitHubAppName();

    logger.info({ tenantId }, 'Generating GitHub App installation URL');

    const state = await signStateToken(tenantId);

    const installUrl = `https://github.com/apps/${appName}/installations/new?state=${encodeURIComponent(state)}`;

    logger.info({ tenantId }, 'GitHub App installation URL generated');

    return c.json({ url: installUrl }, 200);
  }
);

const InstallationWithRepoCountSchema = GitHubAppInstallationApiSelectSchema.extend({
  repositoryCount: z.number().describe('Number of repositories accessible to this installation'),
});

const ListInstallationsResponseSchema = z.object({
  installations: z
    .array(InstallationWithRepoCountSchema)
    .describe('List of GitHub App installations'),
});

const ListInstallationsQuerySchema = z.object({
  includeDeleted: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .describe('Include deleted installations in the response'),
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/installations',
    summary: 'List GitHub App installations',
    operationId: 'list-github-installations',
    tags: ['GitHub'],
    description:
      'Returns a list of GitHub App installations connected to this tenant. ' +
      'By default, deleted installations are filtered out. ' +
      'Use the includeDeleted query parameter to include them.',
    request: {
      params: TenantParamsSchema,
      query: ListInstallationsQuerySchema,
    },
    responses: {
      200: {
        description: 'List of GitHub App installations',
        content: {
          'application/json': {
            schema: ListInstallationsResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('param');
    const { includeDeleted } = c.req.valid('query');

    logger.info({ tenantId, includeDeleted }, 'Listing GitHub App installations');

    const installations = await getInstallationsByTenantId(runDbClient)({
      tenantId,
      includeDeleted,
    });

    const installationIds = installations.map((i) => i.id);
    const repositoryCounts =
      await getRepositoryCountsByInstallationIds(runDbClient)(installationIds);

    const installationsWithCounts = installations.map((installation) => ({
      id: installation.id,
      installationId: installation.installationId,
      accountLogin: installation.accountLogin,
      accountId: installation.accountId,
      accountType: installation.accountType,
      status: installation.status,
      repositoryCount: repositoryCounts.get(installation.id) ?? 0,
      createdAt: installation.createdAt,
      updatedAt: installation.updatedAt,
    }));

    logger.info(
      { tenantId, count: installationsWithCounts.length },
      'Listed GitHub App installations'
    );

    return c.json({ installations: installationsWithCounts }, 200);
  }
);

const InstallationIdParamSchema = z.object({
  installationId: z.string().describe('The internal installation ID'),
});

const InstallationDetailResponseSchema = z.object({
  installation: GitHubAppInstallationApiSelectSchema.describe('Installation details'),
  repositories: z.array(GitHubAppRepositorySelectSchema).describe('List of repositories'),
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/installations/:installationId',
    summary: 'Get GitHub App installation details',
    operationId: 'get-github-installation-details',
    tags: ['GitHub'],
    description:
      'Returns detailed information about a specific GitHub App installation, ' +
      'including the full list of repositories.',
    request: {
      params: TenantParamsSchema.merge(InstallationIdParamSchema),
    },
    responses: {
      200: {
        description: 'Installation details retrieved successfully',
        content: {
          'application/json': {
            schema: InstallationDetailResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, installationId } = c.req.valid('param');

    logger.info({ tenantId, installationId }, 'Getting GitHub App installation details');

    const installation = await getInstallationById(runDbClient)({
      tenantId,
      id: installationId,
    });

    if (!installation) {
      logger.warn({ tenantId, installationId }, 'Installation not found');
      throw createApiError({
        code: 'not_found',
        message: 'Installation not found',
      });
    }

    const repositories = await getRepositoriesByInstallationId(runDbClient)(installation.id);

    logger.info(
      { tenantId, installationId, repositoryCount: repositories.length },
      'Got GitHub App installation details'
    );

    return c.json(
      {
        installation: {
          id: installation.id,
          installationId: installation.installationId,
          accountLogin: installation.accountLogin,
          accountId: installation.accountId,
          accountType: installation.accountType,
          status: installation.status,
          createdAt: installation.createdAt,
          updatedAt: installation.updatedAt,
        },
        repositories,
      },
      200
    );
  }
);

const DisconnectInstallationResponseSchema = z.object({
  success: z.literal(true).describe('Whether the disconnection was successful'),
});

app.openapi(
  createRoute({
    method: 'delete',
    path: '/installations/:installationId',
    summary: 'Disconnect a GitHub App installation',
    operationId: 'disconnect-github-installation',
    tags: ['GitHub'],
    description:
      'Disconnects a GitHub App installation from the tenant. ' +
      'This soft deletes the installation (sets status to "deleted") and removes all project repository access entries. ' +
      'Note: This does NOT uninstall the GitHub App from GitHub - the user can do that separately from GitHub settings.',
    request: {
      params: TenantParamsSchema.merge(InstallationIdParamSchema),
    },
    responses: {
      200: {
        description: 'Installation disconnected successfully',
        content: {
          'application/json': {
            schema: DisconnectInstallationResponseSchema,
          },
        },
      },
      ...commonDeleteErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, installationId } = c.req.valid('param');

    logger.info({ tenantId, installationId }, 'Disconnecting GitHub App installation');

    const installation = await getInstallationById(runDbClient)({
      tenantId,
      id: installationId,
    });

    if (!installation) {
      logger.warn({ tenantId, installationId }, 'Installation not found');
      throw createApiError({
        code: 'not_found',
        message: 'Installation not found',
      });
    }

    const deleted = await deleteInstallation(runDbClient)({
      tenantId,
      id: installationId,
    });

    if (!deleted) {
      logger.error({ tenantId, installationId }, 'Failed to disconnect installation');
      throw createApiError({
        code: 'internal_server_error',
        message: 'Failed to disconnect installation',
      });
    }

    logger.info({ tenantId, installationId }, 'GitHub App installation disconnected');

    return c.json({ success: true as const }, 200);
  }
);

const SyncRepositoriesResponseSchema = z.object({
  repositories: z.array(GitHubAppRepositorySelectSchema).describe('Updated list of repositories'),
  syncResult: z.object({
    added: z.number().describe('Number of repositories added'),
    removed: z.number().describe('Number of repositories removed'),
    updated: z.number().describe('Number of repositories updated'),
  }),
});

function createServiceUnavailableError(message: string): HTTPException {
  const responseBody = {
    title: 'Service Unavailable',
    status: 503,
    detail: message,
    code: 'service_unavailable',
    error: {
      code: 'service_unavailable',
      message: message.length > 100 ? `${message.substring(0, 97)}...` : message,
    },
  };

  const res = new Response(JSON.stringify(responseBody), {
    status: 503,
    headers: {
      'Content-Type': 'application/problem+json',
      'X-Content-Type-Options': 'nosniff',
    },
  });

  return new HTTPException(503, { message, res });
}

const serviceUnavailableSchema = {
  description: 'Service Unavailable - GitHub API is not accessible',
  content: {
    'application/problem+json': {
      schema: z.object({
        title: z.string().openapi({ example: 'Service Unavailable' }),
        status: z.number().openapi({ example: 503 }),
        detail: z.string().openapi({ example: 'Failed to connect to GitHub API' }),
        code: z.literal('service_unavailable').openapi({ example: 'service_unavailable' }),
        error: z.object({
          code: z.literal('service_unavailable'),
          message: z.string(),
        }),
      }),
    },
  },
};

app.openapi(
  createRoute({
    method: 'post',
    path: '/installations/:installationId/sync',
    summary: 'Sync repositories for a GitHub App installation',
    operationId: 'sync-github-installation-repositories',
    tags: ['GitHub'],
    description:
      'Manually refreshes the repository list for a GitHub App installation by fetching the current list from GitHub API. ' +
      'This is useful if webhooks were missed or to ensure the local data is in sync with GitHub.',
    request: {
      params: TenantParamsSchema.merge(InstallationIdParamSchema),
    },
    responses: {
      200: {
        description: 'Repositories synced successfully',
        content: {
          'application/json': {
            schema: SyncRepositoriesResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
      503: serviceUnavailableSchema,
    },
  }),
  async (c) => {
    const { tenantId, installationId } = c.req.valid('param');

    logger.info({ tenantId, installationId }, 'Syncing repositories for GitHub App installation');

    const installation = await getInstallationById(runDbClient)({
      tenantId,
      id: installationId,
    });

    if (!installation) {
      logger.warn({ tenantId, installationId }, 'Installation not found');
      throw createApiError({
        code: 'not_found',
        message: 'Installation not found',
      });
    }

    let appJwt: string;
    try {
      appJwt = await createAppJwt();
    } catch (error) {
      logger.error({ error }, 'Failed to create GitHub App JWT');
      throw createServiceUnavailableError('GitHub App not configured properly');
    }

    const reposResult = await fetchInstallationRepositories(installation.installationId, appJwt);
    if (!reposResult.success) {
      logger.error(
        { error: reposResult.error, installationId },
        'Failed to fetch repositories from GitHub'
      );
      throw createServiceUnavailableError('Failed to fetch repositories from GitHub API');
    }

    const syncResult = await syncRepositories(runDbClient)({
      installationId: installation.id,
      repositories: reposResult.repositories.map((repo) => ({
        repositoryId: String(repo.id),
        repositoryName: repo.name,
        repositoryFullName: repo.full_name,
        private: repo.private,
      })),
    });

    logger.info(
      {
        tenantId,
        installationId,
        added: syncResult.added,
        removed: syncResult.removed,
        updated: syncResult.updated,
      },
      'Repositories synced successfully'
    );

    const updatedRepositories = await getRepositoriesByInstallationId(runDbClient)(installation.id);

    return c.json(
      {
        repositories: updatedRepositories,
        syncResult: {
          added: syncResult.added,
          removed: syncResult.removed,
          updated: syncResult.updated,
        },
      },
      200
    );
  }
);

export default app;
export { signStateToken, STATE_JWT_ISSUER, STATE_JWT_AUDIENCE };
