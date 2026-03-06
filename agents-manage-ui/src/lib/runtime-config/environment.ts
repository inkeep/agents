import { DEFAULT_INKEEP_AGENTS_API_URL } from './defaults';

const STRICT_VERCEL_ENVS = new Set(['preview', 'production']);
const STRICT_ENVIRONMENTS = new Set(['production', 'pentest']);

export function isStrictDeploymentRuntime(): boolean {
  const nodeEnv = process.env.NODE_ENV;
  const appEnv = process.env.ENVIRONMENT;
  const vercelEnv = process.env.VERCEL_ENV;

  return (
    nodeEnv === 'production' ||
    (appEnv !== undefined && STRICT_ENVIRONMENTS.has(appEnv)) ||
    (vercelEnv !== undefined && STRICT_VERCEL_ENVS.has(vercelEnv))
  );
}

export function resolvePublicAgentsApiUrl(): string {
  const configuredUrl =
    process.env.PUBLIC_INKEEP_AGENTS_API_URL || process.env.NEXT_PUBLIC_INKEEP_AGENTS_API_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  if (isStrictDeploymentRuntime()) {
    throw new Error(
      'Missing PUBLIC_INKEEP_AGENTS_API_URL (or NEXT_PUBLIC_INKEEP_AGENTS_API_URL). ' +
        'Preview/production deployments must explicitly set the agents API URL.'
    );
  }

  return DEFAULT_INKEEP_AGENTS_API_URL;
}

export function resolveServerAgentsApiUrl(): string {
  const configuredUrl =
    process.env.INKEEP_AGENTS_API_URL ||
    process.env.PUBLIC_INKEEP_AGENTS_API_URL ||
    process.env.NEXT_PUBLIC_INKEEP_AGENTS_API_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  if (isStrictDeploymentRuntime()) {
    throw new Error(
      'Missing INKEEP_AGENTS_API_URL (or PUBLIC/NEXT_PUBLIC fallback). ' +
        'Preview/production deployments must explicitly set the agents API URL.'
    );
  }

  return DEFAULT_INKEEP_AGENTS_API_URL;
}
