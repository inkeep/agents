import { env } from '../env';

export const LOCAL_AGENTS_API_URL = 'http://localhost:3002';
export const LOCAL_MANAGE_UI_URL = 'http://localhost:3000';

function isLocalhostLikeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function isStrictDeploymentMode(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;

  return (
    env.NODE_ENV === 'production' ||
    env.ENVIRONMENT === 'production' ||
    env.ENVIRONMENT === 'pentest' ||
    vercelEnv === 'preview' ||
    vercelEnv === 'production'
  );
}

export function requireAgentsApiUrl(): string {
  const apiUrl = env.INKEEP_AGENTS_API_URL;
  if (!apiUrl) {
    if (isStrictDeploymentMode()) {
      throw new Error(
        'INKEEP_AGENTS_API_URL is required in preview/production. ' +
          'Refusing to fall back to localhost.'
      );
    }
    return LOCAL_AGENTS_API_URL;
  }

  if (isStrictDeploymentMode() && isLocalhostLikeUrl(apiUrl)) {
    throw new Error(
      'INKEEP_AGENTS_API_URL resolves to localhost in preview/production. ' +
        'Set INKEEP_AGENTS_API_URL to the deployed API URL.'
    );
  }
  return apiUrl;
}

export function resolveManageUiUrl(): string {
  if (env.INKEEP_AGENTS_MANAGE_UI_URL) {
    return env.INKEEP_AGENTS_MANAGE_UI_URL;
  }

  if (isStrictDeploymentMode()) {
    throw new Error(
      'INKEEP_AGENTS_MANAGE_UI_URL is required in preview/production. ' +
        'Refusing to fall back to localhost.'
    );
  }

  return LOCAL_MANAGE_UI_URL;
}
