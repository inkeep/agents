import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getGitHubAppConfig, isGitHubAppConfigured } from '../config';
import { getLogger } from '../../../logger';

const app = new OpenAPIHono();
const logger = getLogger('github-token-exchange');

const TokenExchangeRequestSchema = z.object({
  oidc_token: z.string().describe('GitHub Actions OIDC token to exchange'),
});

const TokenExchangeResponseSchema = z.object({
  token: z.string().describe('GitHub App installation access token'),
  expires_at: z.string().datetime().describe('Token expiration timestamp in ISO 8601 format'),
  repository: z.string().describe('Full repository name (owner/repo)'),
  installation_id: z.number().describe('GitHub App installation ID'),
});

const ProblemDetailsSchema = z.object({
  type: z.string().url().optional().describe('URI reference identifying the problem type'),
  title: z.string().describe('Short, human-readable summary of the problem'),
  status: z.number().describe('HTTP status code'),
  detail: z.string().optional().describe('Human-readable explanation specific to this occurrence'),
  instance: z.string().optional().describe('URI reference identifying the specific occurrence'),
});

const tokenExchangeRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['github'],
  summary: 'Exchange GitHub OIDC token for installation token',
  description:
    'Exchanges a GitHub Actions OIDC token for a GitHub App installation access token. ' +
    'The OIDC token is validated to ensure it was issued by GitHub Actions and the GitHub App ' +
    'is installed on the repository. Returns a short-lived installation token for repository access.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: TokenExchangeRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Token exchange successful',
      content: {
        'application/json': {
          schema: TokenExchangeResponseSchema,
        },
      },
    },
    400: {
      description: 'Bad Request - Missing or malformed oidc_token',
      content: {
        'application/json': {
          schema: ProblemDetailsSchema,
        },
      },
    },
    401: {
      description:
        'Unauthorized - Invalid JWT signature, wrong issuer, wrong audience, or expired token',
      content: {
        'application/json': {
          schema: ProblemDetailsSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - GitHub App not installed on repository',
      content: {
        'application/json': {
          schema: ProblemDetailsSchema,
        },
      },
    },
    500: {
      description: 'Internal Server Error - GitHub API failure or missing App credentials',
      content: {
        'application/json': {
          schema: ProblemDetailsSchema,
        },
      },
    },
  },
});

app.openapi(tokenExchangeRoute, async (c) => {
  const _body = c.req.valid('json');

  logger.info({}, 'Processing token exchange request');

  if (!isGitHubAppConfigured()) {
    logger.error({}, 'GitHub App credentials not configured');
    return c.json(
      {
        type: 'https://api.inkeep.com/problems/configuration-error',
        title: 'GitHub App Not Configured',
        status: 500,
        detail:
          'GitHub App credentials are not configured. Please contact the administrator to set up GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.',
      },
      500
    );
  }

  const config = getGitHubAppConfig();
  logger.info({ appId: config.appId }, 'Using GitHub App for token exchange');

  // TODO: Implement token validation and exchange in subsequent stories
  // For now, return a placeholder to establish the route structure

  return c.json(
    {
      token: 'placeholder',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      repository: 'placeholder/repo',
      installation_id: 0,
    },
    200
  );
});

export default app;
