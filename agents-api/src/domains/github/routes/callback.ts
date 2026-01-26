import { Hono } from 'hono';
import { jwtVerify } from 'jose';
import { z } from 'zod';
import {
  createInstallation,
  getInstallationByGitHubId,
  syncRepositories,
  updateInstallationStatusByGitHubId,
} from '@inkeep/agents-core';
import { generateId } from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { getStateSigningSecret, isStateSigningConfigured } from '../config';

const logger = getLogger('github-callback');

const STATE_JWT_ISSUER = 'inkeep-agents-api';
const STATE_JWT_AUDIENCE = 'github-app-install';
const GITHUB_API_BASE = 'https://api.github.com';

const CallbackQuerySchema = z.object({
  installation_id: z.string(),
  setup_action: z.enum(['install', 'update', 'request']),
  state: z.string(),
});

type SetupAction = 'install' | 'update' | 'request';

interface StatePayload {
  tenantId: string;
}

interface GitHubInstallationResponse {
  id: number;
  account: {
    login: string;
    id: number;
    type: 'Organization' | 'User';
  };
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
}

interface GitHubRepositoriesResponse {
  total_count: number;
  repositories: GitHubRepository[];
}

function getManageUiUrl(): string {
  return env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3001';
}

function buildRedirectUrl(params: { status: 'success' | 'error'; message?: string; installationId?: string }): string {
  const baseUrl = getManageUiUrl();
  const url = new URL('/settings/github', baseUrl);

  url.searchParams.set('status', params.status);
  if (params.message) {
    url.searchParams.set('message', params.message);
  }
  if (params.installationId) {
    url.searchParams.set('installation_id', params.installationId);
  }

  return url.toString();
}

async function verifyStateToken(state: string): Promise<{ success: true; tenantId: string } | { success: false; error: string }> {
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
      if (error.message.includes('expired')) {
        return { success: false, error: 'State token has expired. Please try installing again.' };
      }
      if (error.message.includes('signature')) {
        return { success: false, error: 'Invalid state signature' };
      }
    }
    logger.error({ error }, 'Failed to verify state token');
    return { success: false, error: 'Invalid state token' };
  }
}

async function createAppJwt(): Promise<string> {
  const { createPrivateKey } = await import('node:crypto');
  const { SignJWT } = await import('jose');

  const appId = env.GITHUB_APP_ID;
  const privateKeyPem = env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!appId || !privateKeyPem) {
    throw new Error('GitHub App credentials not configured');
  }

  const privateKey = createPrivateKey({
    key: privateKeyPem,
    format: 'pem',
  });

  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 600)
    .setIssuer(appId)
    .sign(privateKey);

  return jwt;
}

async function fetchInstallationDetails(
  installationId: string,
  appJwt: string
): Promise<{ success: true; installation: GitHubInstallationResponse } | { success: false; error: string; status: number }> {
  const url = `${GITHUB_API_BASE}/app/installations/${installationId}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'inkeep-agents-api',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText, installationId }, 'Failed to fetch installation details');
      return { success: false, error: `GitHub API error: ${response.status}`, status: response.status };
    }

    const data = await response.json() as GitHubInstallationResponse;
    return { success: true, installation: data };
  } catch (error) {
    logger.error({ error, installationId }, 'Error fetching installation details');
    return { success: false, error: 'Failed to connect to GitHub API', status: 500 };
  }
}

async function fetchInstallationRepositories(
  installationId: string,
  appJwt: string
): Promise<{ success: true; repositories: GitHubRepository[] } | { success: false; error: string }> {
  const tokenUrl = `${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`;

  try {
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'inkeep-agents-api',
      },
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error({ status: tokenResponse.status, error: errorText, installationId }, 'Failed to get installation access token');
      return { success: false, error: 'Failed to get installation access token' };
    }

    const tokenData = await tokenResponse.json() as { token: string };
    const installationToken = tokenData.token;

    const allRepositories: GitHubRepository[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const reposUrl = `${GITHUB_API_BASE}/installation/repositories?per_page=${perPage}&page=${page}`;
      const reposResponse = await fetch(reposUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${installationToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'inkeep-agents-api',
        },
      });

      if (!reposResponse.ok) {
        const errorText = await reposResponse.text();
        logger.error({ status: reposResponse.status, error: errorText, installationId }, 'Failed to fetch repositories');
        return { success: false, error: 'Failed to fetch repositories' };
      }

      const reposData = await reposResponse.json() as GitHubRepositoriesResponse;
      allRepositories.push(...reposData.repositories);

      if (reposData.repositories.length < perPage) {
        break;
      }
      page++;
    }

    return { success: true, repositories: allRepositories };
  } catch (error) {
    logger.error({ error, installationId }, 'Error fetching installation repositories');
    return { success: false, error: 'Failed to connect to GitHub API' };
  }
}

function determineStatus(setupAction: SetupAction): 'active' | 'pending' {
  switch (setupAction) {
    case 'install':
    case 'update':
      return 'active';
    case 'request':
      return 'pending';
    default:
      return 'active';
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
    return c.redirect(buildRedirectUrl({
      status: 'error',
      message: 'Invalid callback parameters'
    }));
  }

  const { installation_id, setup_action, state } = parseResult.data;

  logger.info({ installation_id, setup_action }, 'Processing GitHub callback');

  const stateResult = await verifyStateToken(state);
  if (!stateResult.success) {
    logger.warn({ error: stateResult.error }, 'State verification failed');
    return c.redirect(buildRedirectUrl({
      status: 'error',
      message: stateResult.error
    }));
  }

  const { tenantId } = stateResult;
  logger.info({ tenantId, installation_id }, 'State verified successfully');

  let appJwt: string;
  try {
    appJwt = await createAppJwt();
  } catch (error) {
    logger.error({ error }, 'Failed to create GitHub App JWT');
    return c.redirect(buildRedirectUrl({
      status: 'error',
      message: 'GitHub App not configured properly'
    }));
  }

  const installationResult = await fetchInstallationDetails(installation_id, appJwt);
  if (!installationResult.success) {
    return c.redirect(buildRedirectUrl({
      status: 'error',
      message: 'Failed to verify installation with GitHub'
    }));
  }

  const { installation } = installationResult;
  logger.info({
    accountLogin: installation.account.login,
    accountType: installation.account.type,
    installationId: installation.id
  }, 'Fetched installation details from GitHub');

  const reposResult = await fetchInstallationRepositories(installation_id, appJwt);
  if (!reposResult.success) {
    logger.warn({ error: reposResult.error }, 'Failed to fetch repositories, continuing with empty list');
  }

  const repositories = reposResult.success ? reposResult.repositories : [];
  logger.info({ repositoryCount: repositories.length }, 'Fetched repositories from GitHub');

  const status = determineStatus(setup_action);

  try {
    const existingInstallation = await getInstallationByGitHubId(runDbClient)(installation_id);

    let internalInstallationId: string;

    if (existingInstallation) {
      logger.info({ existingId: existingInstallation.id, setup_action }, 'Updating existing installation');

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

      logger.info({
        added: syncResult.added,
        removed: syncResult.removed,
        updated: syncResult.updated
      }, 'Synced repositories');
    }

    logger.info({
      tenantId,
      installationId: installation_id,
      accountLogin: installation.account.login,
      status
    }, 'GitHub App installation processed successfully');

    return c.redirect(buildRedirectUrl({
      status: 'success',
      installationId: internalInstallationId
    }));
  } catch (error) {
    logger.error({ error, tenantId, installation_id }, 'Failed to store installation in database');
    return c.redirect(buildRedirectUrl({
      status: 'error',
      message: 'Failed to complete installation setup'
    }));
  }
});

export default app;
