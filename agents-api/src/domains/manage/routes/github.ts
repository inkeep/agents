import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { commonGetErrorResponses, createApiError, TenantParamsSchema } from '@inkeep/agents-core';
import { SignJWT } from 'jose';
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

export default app;
export { signStateToken, STATE_JWT_ISSUER, STATE_JWT_AUDIENCE };
