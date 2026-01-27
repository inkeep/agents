import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  createApiError,
  getInstallationById,
  getInstallationsByTenantId,
  getRepositoriesByInstallationId,
  getRepositoryCountsByInstallationIds,
  GitHubAppInstallationApiSelectSchema,
  GitHubAppRepositorySelectSchema,
  TenantParamsSchema,
} from '@inkeep/agents-core';
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

export default app;
export { signStateToken, STATE_JWT_ISSUER, STATE_JWT_AUDIENCE };
