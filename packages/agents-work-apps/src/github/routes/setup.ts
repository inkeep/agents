import {
  createInstallation,
  generateId,
  getInstallationByGitHubId,
  listProjectsMetadata,
  setProjectAccessMode,
  syncRepositories,
  updateInstallationStatusByGitHubId,
} from '@inkeep/agents-core';
import { Hono } from 'hono';
import { jwtVerify } from 'jose';
import { z } from 'zod';
import runDbClient from '../../db/runDbClient';
import { env } from '../../env';
import { getLogger } from '../../logger';
import { getStateSigningSecret, isStateSigningConfigured } from '../config';
import {
  createAppJwt,
  determineStatus,
  fetchInstallationDetails,
  fetchInstallationRepositories,
} from '../installation';

const logger = getLogger('github-setup');

const STATE_JWT_ISSUER = 'inkeep-agents-api';
const STATE_JWT_AUDIENCE = 'github-app-install';

const CallbackQuerySchema = z.object({
  installation_id: z.string(),
  setup_action: z.enum(['install', 'update', 'request']),
  state: z.string(),
});

function getManageUiUrl(): string {
  return env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';
}

function buildErrorRedirectUrl(message: string): string {
  const baseUrl = getManageUiUrl();
  const url = new URL('/github/setup-error', baseUrl);
  url.searchParams.set('message', message);
  return url.toString();
}

function buildRedirectUrl(params: {
  tenantId: string;
  status: 'success' | 'error';
  message?: string;
  installationId?: string;
}): string {
  const baseUrl = getManageUiUrl();
  const url = new URL(`/${params.tenantId}/work-apps/github`, baseUrl);

  url.searchParams.set('status', params.status);
  if (params.message) {
    url.searchParams.set('message', params.message);
  }
  if (params.installationId) {
    url.searchParams.set('installation_id', params.installationId);
  }

  return url.toString();
}

async function verifyStateToken(
  state: string
): Promise<{ success: true; tenantId: string } | { success: false; error: string }> {
  if (!isStateSigningConfigured()) {
    return { success: false, error: 'GitHub App installation is not configured' };
  }

  const secret = getStateSigningSecret();
  const secretKey = new TextEncoder().encode(secret);

  try {
    const { payload } = await jwtVerify(state, secretKey, {
      issuer: STATE_JWT_ISSUER,
      audience: STATE_JWT_AUDIENCE,
    });

    const tenantId = payload.tenantId as string | undefined;
    if (!tenantId) {
      return { success: false, error: 'Invalid state: missing tenantId' };
    }

    return { success: true, tenantId };
  } catch (error) {
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      const errorName = error.name.toLowerCase();
      if (errorMessage.includes('expired') || errorName.includes('expired')) {
        return { success: false, error: 'State token has expired. Please try installing again.' };
      }
      if (errorMessage.includes('signature')) {
        return { success: false, error: 'Invalid state signature' };
      }
    }
    logger.error({ error }, 'Failed to verify state token');
    return { success: false, error: 'Invalid state token' };
  }
}

const app = new Hono();

app.get('/', async (c) => {
  const queryParams = {
    installation_id: c.req.query('installation_id'),
    setup_action: c.req.query('setup_action'),
    state: c.req.query('state'),
  };

  const parseResult = CallbackQuerySchema.safeParse(queryParams);

  if (!parseResult.success) {
    logger.warn({ errors: parseResult.error.issues }, 'Invalid callback parameters');
    return c.redirect(buildErrorRedirectUrl('Invalid callback parameters'));
  }

  const { installation_id, setup_action, state } = parseResult.data;

  logger.info({ installation_id, setup_action }, 'Processing GitHub callback');

  const stateResult = await verifyStateToken(state);
  if (!stateResult.success) {
    logger.warn({ error: stateResult.error }, 'State verification failed');
    return c.redirect(buildErrorRedirectUrl(stateResult.error));
  }

  const { tenantId } = stateResult;
  logger.info({ tenantId, installation_id }, 'State verified successfully');

  let appJwt: string;
  try {
    appJwt = await createAppJwt();
  } catch (error) {
    logger.error({ error }, 'Failed to create GitHub App JWT');
    return c.redirect(buildErrorRedirectUrl('GitHub App not configured properly'));
  }

  const installationResult = await fetchInstallationDetails(installation_id, appJwt);
  if (!installationResult.success) {
    return c.redirect(
      buildRedirectUrl({
        tenantId,
        status: 'error',
        message: 'Failed to verify installation with GitHub',
      })
    );
  }

  const { installation } = installationResult;
  logger.info(
    {
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      installationId: installation.id,
    },
    'Fetched installation details from GitHub'
  );

  const reposResult = await fetchInstallationRepositories(installation_id, appJwt);
  if (!reposResult.success) {
    logger.warn(
      { error: reposResult.error },
      'Failed to fetch repositories, continuing with empty list'
    );
  }

  const repositories = reposResult.success ? reposResult.repositories : [];
  logger.info({ repositoryCount: repositories.length }, 'Fetched repositories from GitHub');

  const status = determineStatus(setup_action);

  try {
    const existingInstallation = await getInstallationByGitHubId(runDbClient)(installation_id);

    let internalInstallationId: string;

    if (existingInstallation) {
      logger.info(
        { existingId: existingInstallation.id, setup_action },
        'Updating existing installation'
      );

      const updated = await updateInstallationStatusByGitHubId(runDbClient)({
        gitHubInstallationId: installation_id,
        status,
      });

      if (!updated) {
        throw new Error('Failed to update installation status');
      }

      internalInstallationId = updated.id;
    } else {
      logger.info({ tenantId, setup_action }, 'Creating new installation record');

      const newInstallation = await createInstallation(runDbClient)({
        id: generateId(),
        tenantId,
        installationId: installation_id,
        accountLogin: installation.account.login,
        accountId: String(installation.account.id),
        accountType: installation.account.type,
        status,
      });

      internalInstallationId = newInstallation.id;

      // Set GitHub access mode to 'all' for all existing projects in this tenant
      // This ensures projects have access to all repositories when an app is first installed
      const projectsInTenant = await listProjectsMetadata(runDbClient)({ tenantId });
      if (projectsInTenant.length > 0) {
        logger.info(
          { tenantId, projectCount: projectsInTenant.length },
          'Setting GitHub access mode to "all" for all existing projects'
        );
        await Promise.all(
          projectsInTenant.map((project) =>
            setProjectAccessMode(runDbClient)({
              tenantId,
              projectId: project.id,
              mode: 'all',
            })
          )
        );
      }
    }

    if (repositories.length > 0) {
      const syncResult = await syncRepositories(runDbClient)({
        installationId: internalInstallationId,
        repositories: repositories.map((repo) => ({
          repositoryId: String(repo.id),
          repositoryName: repo.name,
          repositoryFullName: repo.full_name,
          private: repo.private,
        })),
      });

      logger.info(
        {
          added: syncResult.added,
          removed: syncResult.removed,
          updated: syncResult.updated,
        },
        'Synced repositories'
      );
    }

    logger.info(
      {
        tenantId,
        installationId: installation_id,
        accountLogin: installation.account.login,
        status,
      },
      'GitHub App installation processed successfully'
    );

    return c.redirect(
      buildRedirectUrl({
        tenantId,
        status: 'success',
        installationId: internalInstallationId,
      })
    );
  } catch (error) {
    logger.error({ error, tenantId, installation_id }, 'Failed to store installation in database');
    return c.redirect(
      buildRedirectUrl({
        tenantId,
        status: 'error',
        message: 'Failed to complete installation setup',
      })
    );
  }
});

export default app;
