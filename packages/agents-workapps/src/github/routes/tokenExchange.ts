import { checkProjectRepositoryAccess, getInstallationByGitHubId } from '@inkeep/agents-core';
import { Hono } from 'hono';
import { z } from 'zod';
import runDbClient from '../../db/runDbClient';
import { getLogger } from '../../logger';
import { isGitHubAppConfigured } from '../config';
import { generateInstallationAccessToken, lookupInstallationForRepo } from '../installation';
import { validateOidcToken } from '../oidcToken';

const logger = getLogger('github-token-exchange');

const TokenExchangeRequestSchema = z.object({
  oidc_token: z.string(),
  project_id: z.string().optional(),
});

const app = new Hono();

/**
 * Exchange GitHub OIDC token for installation token.
 *
 * This is an internal infrastructure endpoint called by the CLI from GitHub Actions.
 * It exchanges a GitHub Actions OIDC token for a GitHub App installation access token.
 * Not included in the public OpenAPI spec.
 */
app.post('/', async (c) => {
  // Validate request body
  const rawBody = await c.req.json().catch(() => null);
  const parseResult = TokenExchangeRequestSchema.safeParse(rawBody);

  if (!parseResult.success) {
    const issues = parseResult.error.issues;
    const errorMessage = issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    c.header('Content-Type', 'application/problem+json');
    return c.json(
      {
        title: 'Bad Request',
        status: 400,
        detail: errorMessage,
        error: errorMessage,
      },
      400
    );
  }

  const body = parseResult.data;

  logger.info({}, 'Processing token exchange request');

  if (!isGitHubAppConfigured()) {
    logger.error({}, 'GitHub App credentials not configured');
    const errorMessage =
      'GitHub App credentials are not configured. Please contact the administrator to set up GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.';
    c.header('Content-Type', 'application/problem+json');
    return c.json(
      {
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
        title: 'Token Validation Failed',
        status: 401,
        detail: validationResult.message,
        error: validationResult.message,
      },
      401
    );
  }

  const { claims } = validationResult;

  const installationResult = await lookupInstallationForRepo(
    claims.repository_owner,
    claims.repository.split('/')[1]
  );

  if (!installationResult.success) {
    const { errorType, message } = installationResult;

    if (errorType === 'not_installed') {
      c.header('Content-Type', 'application/problem+json');
      return c.json(
        {
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

  // Validate installation is registered in our database
  const dbInstallation = await getInstallationByGitHubId(runDbClient)(
    installation.installationId.toString()
  );

  if (!dbInstallation) {
    const errorMessage =
      'GitHub App installation not registered. Please connect your GitHub organization in the Inkeep dashboard.';
    logger.warn(
      { installationId: installation.installationId, repository: claims.repository },
      'Installation not found in database'
    );
    c.header('Content-Type', 'application/problem+json');
    return c.json(
      {
        title: 'Installation Not Registered',
        status: 403,
        detail: errorMessage,
        error: errorMessage,
      },
      403
    );
  }

  // Validate installation status
  if (dbInstallation.status === 'pending') {
    const errorMessage = 'GitHub App installation is pending organization admin approval';
    logger.warn(
      {
        installationId: installation.installationId,
        repository: claims.repository,
        status: dbInstallation.status,
      },
      'Installation is pending approval'
    );
    c.header('Content-Type', 'application/problem+json');
    return c.json(
      {
        title: 'Installation Pending',
        status: 403,
        detail: errorMessage,
        error: errorMessage,
      },
      403
    );
  }

  if (dbInstallation.status === 'suspended') {
    const errorMessage = 'GitHub App installation is suspended';
    logger.warn(
      {
        installationId: installation.installationId,
        repository: claims.repository,
        status: dbInstallation.status,
      },
      'Installation is suspended'
    );
    c.header('Content-Type', 'application/problem+json');
    return c.json(
      {
        title: 'Installation Suspended',
        status: 403,
        detail: errorMessage,
        error: errorMessage,
      },
      403
    );
  }

  if (dbInstallation.status === 'deleted') {
    const errorMessage = 'GitHub App installation has been disconnected';
    logger.warn(
      {
        installationId: installation.installationId,
        repository: claims.repository,
        status: dbInstallation.status,
      },
      'Installation has been deleted'
    );
    c.header('Content-Type', 'application/problem+json');
    return c.json(
      {
        title: 'Installation Disconnected',
        status: 403,
        detail: errorMessage,
        error: errorMessage,
      },
      403
    );
  }

  logger.info(
    {
      installationId: installation.installationId,
      tenantId: dbInstallation.tenantId,
      repository: claims.repository,
    },
    'Installation validated against database'
  );

  // If project_id is provided, check project-level repository access
  if (body.project_id) {
    const accessCheck = await checkProjectRepositoryAccess(runDbClient)({
      projectId: body.project_id,
      repositoryFullName: claims.repository,
      tenantId: dbInstallation.tenantId,
    });

    if (!accessCheck.hasAccess) {
      const errorMessage = `Project does not have access to repository ${claims.repository}. ${accessCheck.reason}`;
      logger.warn(
        {
          installationId: installation.installationId,
          tenantId: dbInstallation.tenantId,
          projectId: body.project_id,
          repository: claims.repository,
          reason: accessCheck.reason,
        },
        'Project does not have access to repository'
      );
      c.header('Content-Type', 'application/problem+json');
      return c.json(
        {
          title: 'Repository Access Denied',
          status: 403,
          detail: errorMessage,
          error: errorMessage,
        },
        403
      );
    }

    logger.info(
      {
        installationId: installation.installationId,
        tenantId: dbInstallation.tenantId,
        projectId: body.project_id,
        repository: claims.repository,
        reason: accessCheck.reason,
      },
      'Project has access to repository'
    );
  }

  const tokenResult = await generateInstallationAccessToken(installation.installationId);

  if (!tokenResult.success) {
    const { errorType, message } = tokenResult;
    logger.error(
      {
        errorType,
        message,
        installationId: installation.installationId,
        repository: claims.repository,
      },
      'Failed to generate installation access token'
    );
    c.header('Content-Type', 'application/problem+json');
    return c.json(
      {
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
    {
      installationId: installation.installationId,
      tenantId: dbInstallation.tenantId,
      repository: claims.repository,
      expiresAt: accessToken.expiresAt,
    },
    'Token exchange completed successfully'
  );

  return c.json(
    {
      token: accessToken.token,
      expires_at: accessToken.expiresAt,
      repository: claims.repository,
      installation_id: installation.installationId,
      tenant_id: dbInstallation.tenantId,
    },
    200
  );
});

export default app;
