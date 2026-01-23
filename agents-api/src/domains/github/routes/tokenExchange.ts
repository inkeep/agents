import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Hook } from '@hono/zod-openapi';
import type { Context, Env } from 'hono';
import { isGitHubAppConfigured } from '../config';
import { validateOidcToken } from '../oidcToken';
import { lookupInstallationForRepo, generateInstallationAccessToken } from '../installation';
import { getLogger } from '../../../logger';

const logger = getLogger('github-token-exchange');

/**
 * Custom hook to handle Zod validation errors with RFC 7807 format
 * that includes the 'error' field required by our OpenAPI schema.
 */
const validationErrorHook: Hook<any, Env, any, any> = (result, c: Context) => {
  if (!result.success) {
    const issues = result.error.issues;
    const errorMessage = issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');

    c.header('Content-Type', 'application/problem+json');
    return c.json(
      {
        type: 'https://api.inkeep.com/problems/validation-error',
        title: 'Bad Request',
        status: 400,
        detail: errorMessage,
        error: errorMessage,
      },
      400
    );
  }
};

const app = new OpenAPIHono({
  defaultHook: validationErrorHook,
});

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
  error: z.string().describe('Human-readable error message'),
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
        'application/problem+json': {
          schema: ProblemDetailsSchema,
        },
      },
    },
    401: {
      description:
        'Unauthorized - Invalid JWT signature, wrong issuer, wrong audience, or expired token',
      content: {
        'application/problem+json': {
          schema: ProblemDetailsSchema,
        },
      },
    },
    403: {
      description: 'Forbidden - GitHub App not installed on repository',
      content: {
        'application/problem+json': {
          schema: ProblemDetailsSchema,
        },
      },
    },
    500: {
      description: 'Internal Server Error - GitHub API failure or missing App credentials',
      content: {
        'application/problem+json': {
          schema: ProblemDetailsSchema,
        },
      },
    },
  },
});

app.openapi(tokenExchangeRoute, async (c) => {
  const body = c.req.valid('json');

  logger.info({}, 'Processing token exchange request');

  if (!isGitHubAppConfigured()) {
    logger.error({}, 'GitHub App credentials not configured');
    const errorMessage =
      'GitHub App credentials are not configured. Please contact the administrator to set up GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.';
    c.header('Content-Type', 'application/problem+json');
    return c.json(
      {
        type: 'https://api.inkeep.com/problems/configuration-error',
        title: 'GitHub App Not Configured',
        status: 500,
        detail: errorMessage,
        error: errorMessage,
      },
      500
    );
  }

  const validationResult = await validateOidcToken(body.oidc_token);
  if (!validationResult.success) {
    const errorType = validationResult.errorType;
    logger.warn({ errorType, message: validationResult.message }, 'OIDC token validation failed');

    c.header('Content-Type', 'application/problem+json');

    // Malformed tokens are 400 Bad Request (request format issue)
    // Invalid signature, expired, wrong issuer/audience are 401 Unauthorized (auth failures)
    if (errorType === 'malformed') {
      return c.json(
        {
          type: 'https://api.inkeep.com/problems/malformed-token',
          title: 'Bad Request',
          status: 400,
          detail: validationResult.message,
          error: validationResult.message,
        },
        400
      );
    }

    return c.json(
      {
        type: `https://api.inkeep.com/problems/token-validation-${errorType.replace(/_/g, '-')}`,
        title: 'Token Validation Failed',
        status: 401,
        detail: validationResult.message,
        error: validationResult.message,
      },
      401
    );
  }

  const { claims } = validationResult;
  logger.info({ repository: claims.repository, actor: claims.actor }, 'OIDC token validated successfully');

  const installationResult = await lookupInstallationForRepo(
    claims.repository_owner,
    claims.repository.split('/')[1]
  );

  if (!installationResult.success) {
    const { errorType, message } = installationResult;

    if (errorType === 'not_installed') {
      logger.warn(
        { repository: claims.repository },
        'GitHub App not installed on repository'
      );
      c.header('Content-Type', 'application/problem+json');
      return c.json(
        {
          type: 'https://api.inkeep.com/problems/app-not-installed',
          title: 'GitHub App Not Installed',
          status: 403,
          detail: message,
          error: message,
        },
        403
      );
    }

    logger.error(
      { errorType, message, repository: claims.repository },
      'Failed to look up GitHub App installation'
    );
    c.header('Content-Type', 'application/problem+json');
    return c.json(
      {
        type: 'https://api.inkeep.com/problems/installation-lookup-error',
        title: 'Installation Lookup Failed',
        status: 500,
        detail: message,
        error: message,
      },
      500
    );
  }

  const { installation } = installationResult;
  logger.info(
    { installationId: installation.installationId, repository: claims.repository },
    'Found GitHub App installation'
  );

  const tokenResult = await generateInstallationAccessToken(installation.installationId);

  if (!tokenResult.success) {
    const { errorType, message } = tokenResult;
    logger.error(
      { errorType, message, installationId: installation.installationId, repository: claims.repository },
      'Failed to generate installation access token'
    );
    c.header('Content-Type', 'application/problem+json');
    return c.json(
      {
        type: 'https://api.inkeep.com/problems/token-generation-error',
        title: 'Token Generation Failed',
        status: 500,
        detail: message,
        error: message,
      },
      500
    );
  }

  const { accessToken } = tokenResult;
  logger.info(
    { installationId: installation.installationId, repository: claims.repository, expiresAt: accessToken.expiresAt },
    'Token exchange completed successfully'
  );

  return c.json(
    {
      token: accessToken.token,
      expires_at: accessToken.expiresAt,
      repository: claims.repository,
      installation_id: installation.installationId,
    },
    200
  );
});

export default app;
