import { createPrivateKey } from 'node:crypto';
import { SignJWT } from 'jose';
import { getLogger } from '../logger';
import { getGitHubAppConfig } from './config';

const logger = getLogger('github-installation');

const GITHUB_API_BASE = 'https://api.github.com';

export interface InstallationInfo {
  installationId: number;
  accountLogin: string;
  accountType: 'User' | 'Organization';
}

export interface LookupInstallationResult {
  success: true;
  installation: InstallationInfo;
}

export interface LookupInstallationError {
  success: false;
  errorType: 'not_installed' | 'api_error' | 'jwt_error';
  message: string;
}

export type LookupInstallationForRepoResult = LookupInstallationResult | LookupInstallationError;

export interface InstallationAccessToken {
  token: string;
  expiresAt: string;
}

export interface GenerateTokenResult {
  success: true;
  accessToken: InstallationAccessToken;
}

export interface GenerateTokenError {
  success: false;
  errorType: 'api_error' | 'jwt_error';
  message: string;
}

type SetupAction = 'install' | 'update' | 'request';

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

export type GenerateInstallationAccessTokenResult = GenerateTokenResult | GenerateTokenError;

export async function createAppJwt(): Promise<string> {
  const config = getGitHubAppConfig();

  logger.debug({ appId: config.appId }, 'Creating GitHub App JWT');

  // Use Node's crypto to handle both PKCS#1 (RSA PRIVATE KEY) and PKCS#8 (PRIVATE KEY) formats
  const privateKey = createPrivateKey({
    key: config.privateKey,
    format: 'pem',
  });

  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 600)
    .setIssuer(config.appId)
    .sign(privateKey);

  return jwt;
}

export async function lookupInstallationForRepo(
  repositoryOwner: string,
  repositoryName: string
): Promise<LookupInstallationForRepoResult> {
  let appJwt: string;
  try {
    appJwt = await createAppJwt();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Failed to create GitHub App JWT');
    return {
      success: false,
      errorType: 'jwt_error',
      message: `Failed to create GitHub App authentication: ${message}`,
    };
  }

  const url = `${GITHUB_API_BASE}/repos/${repositoryOwner}/${repositoryName}/installation`;

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

    if (response.status === 404) {
      return {
        success: false,
        errorType: 'not_installed',
        message: `GitHub App is not installed on repository ${repositoryOwner}/${repositoryName}. Please install the Inkeep Agents GitHub App on the repository to enable token exchange.`,
      };
    }

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { status: response.status, error: errorText, repositoryOwner, repositoryName },
        'GitHub API error looking up installation'
      );
      return {
        success: false,
        errorType: 'api_error',
        message: `GitHub API error (${response.status}): Failed to look up installation for repository`,
      };
    }

    const data = await response.json();

    const installationId = data.id;
    const accountLogin = data.account?.login;
    const accountType = data.account?.type;

    if (typeof installationId !== 'number' || typeof accountLogin !== 'string') {
      logger.error({ data }, 'Unexpected response format from GitHub API');
      return {
        success: false,
        errorType: 'api_error',
        message: 'Unexpected response format from GitHub API',
      };
    }

    logger.info(
      { installationId, accountLogin, accountType, repositoryOwner, repositoryName },
      'Found GitHub App installation for repository'
    );

    return {
      success: true,
      installation: {
        installationId,
        accountLogin,
        accountType: accountType === 'Organization' ? 'Organization' : 'User',
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      { error: message, repositoryOwner, repositoryName },
      'Error calling GitHub API to look up installation'
    );
    return {
      success: false,
      errorType: 'api_error',
      message: `Failed to connect to GitHub API: ${message}`,
    };
  }
}

export async function generateInstallationAccessToken(
  installationId: number
): Promise<GenerateInstallationAccessTokenResult> {
  let appJwt: string;
  try {
    appJwt = await createAppJwt();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: message }, 'Failed to create GitHub App JWT for token generation');
    return {
      success: false,
      errorType: 'jwt_error',
      message: `Failed to create GitHub App authentication: ${message}`,
    };
  }

  const url = `${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'inkeep-agents-api',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { status: response.status, error: errorText, installationId },
        'GitHub API error generating installation access token'
      );
      return {
        success: false,
        errorType: 'api_error',
        message: `GitHub API error (${response.status}): Failed to generate installation access token`,
      };
    }

    const data = await response.json();

    const token = data.token;
    const expiresAt = data.expires_at;

    if (typeof token !== 'string' || typeof expiresAt !== 'string') {
      logger.error({ data }, 'Unexpected response format from GitHub API for token generation');
      return {
        success: false,
        errorType: 'api_error',
        message: 'Unexpected response format from GitHub API',
      };
    }

    return {
      success: true,
      accessToken: {
        token,
        expiresAt,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      { error: message, installationId },
      'Error calling GitHub API to generate installation access token'
    );
    return {
      success: false,
      errorType: 'api_error',
      message: `Failed to connect to GitHub API: ${message}`,
    };
  }
}

export async function fetchInstallationDetails(
  installationId: string,
  appJwt: string
): Promise<
  | { success: true; installation: GitHubInstallationResponse }
  | { success: false; error: string; status: number }
> {
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
      logger.error(
        { status: response.status, error: errorText, installationId },
        'Failed to fetch installation details'
      );
      return {
        success: false,
        error: `GitHub API error: ${response.status}`,
        status: response.status,
      };
    }

    const data = (await response.json()) as GitHubInstallationResponse;
    return { success: true, installation: data };
  } catch (error) {
    logger.error({ error, installationId }, 'Error fetching installation details');
    return { success: false, error: 'Failed to connect to GitHub API', status: 500 };
  }
}

export async function fetchInstallationRepositories(
  installationId: string,
  appJwt: string
): Promise<
  { success: true; repositories: GitHubRepository[] } | { success: false; error: string }
> {
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
      logger.error(
        { status: tokenResponse.status, error: errorText, installationId },
        'Failed to get installation access token'
      );
      return { success: false, error: 'Failed to get installation access token' };
    }

    const tokenData = (await tokenResponse.json()) as { token: string };
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
        logger.error(
          { status: reposResponse.status, error: errorText, installationId },
          'Failed to fetch repositories'
        );
        return { success: false, error: 'Failed to fetch repositories' };
      }

      const reposData = (await reposResponse.json()) as GitHubRepositoriesResponse;
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

export function determineStatus(setupAction: SetupAction): 'active' | 'pending' {
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
