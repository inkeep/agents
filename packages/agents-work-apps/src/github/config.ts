import { z } from '@hono/zod-openapi';
import { env } from '../env';
import { getLogger } from '../logger';

const logger = getLogger('github-config');

const GitHubAppConfigSchema = z.object({
  appId: z.string().min(1, 'GITHUB_APP_ID is required'),
  privateKey: z.string().min(1, 'GITHUB_APP_PRIVATE_KEY is required'),
});

export type GitHubAppConfig = z.infer<typeof GitHubAppConfigSchema>;

let cachedConfig: GitHubAppConfig | null = null;

export function getGitHubAppConfig(): GitHubAppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const appId = env.GITHUB_APP_ID;
  // Handle escaped newlines (common when setting env vars from CLI or .env files)
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');

  const result = GitHubAppConfigSchema.safeParse({
    appId,
    privateKey,
  });

  if (!result.success) {
    const missingVars = result.error.issues.map((issue) => issue.message);
    const errorMessage = `GitHub App credentials are not configured. ${missingVars.join('. ')}. Please set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY environment variables.`;
    logger.error({}, errorMessage);
    throw new Error(errorMessage);
  }

  cachedConfig = result.data;
  logger.info({ appId: cachedConfig.appId }, 'GitHub App credentials loaded successfully');
  return cachedConfig;
}

export function isGitHubAppConfigured(): boolean {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY);
}

export function validateGitHubAppConfigOnStartup(): void {
  if (!isGitHubAppConfigured()) {
    logger.warn(
      {},
      'GitHub App credentials not configured. Token exchange endpoint will return 500 errors. ' +
        'Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY to enable the feature.'
    );
    return;
  }

  try {
    getGitHubAppConfig();
  } catch (error) {
    logger.error(
      { error },
      'GitHub App credentials are invalid. Token exchange endpoint will return 500 errors.'
    );
  }
}

export function clearConfigCache(): void {
  cachedConfig = null;
}

export function isWebhookConfigured(): boolean {
  return Boolean(env.GITHUB_WEBHOOK_SECRET);
}

export function getWebhookSecret(): string {
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('GITHUB_WEBHOOK_SECRET is not configured');
  }
  return secret;
}

export function validateGitHubWebhookConfigOnStartup(): void {
  if (!isWebhookConfigured()) {
    logger.warn(
      {},
      'GitHub webhook secret not configured. Webhook endpoints will reject all requests. ' +
        'Set GITHUB_WEBHOOK_SECRET to enable webhook processing.'
    );
  }
}

export function isStateSigningConfigured(): boolean {
  return Boolean(env.GITHUB_STATE_SIGNING_SECRET);
}

export function getStateSigningSecret(): string {
  const secret = env.GITHUB_STATE_SIGNING_SECRET;
  if (!secret) {
    throw new Error('GITHUB_STATE_SIGNING_SECRET is not configured');
  }
  return secret;
}

export function isGitHubAppNameConfigured(): boolean {
  return Boolean(env.GITHUB_APP_NAME);
}

export function getGitHubAppName(): string {
  const appName = env.GITHUB_APP_NAME;
  if (!appName) {
    throw new Error('GITHUB_APP_NAME is not configured');
  }
  return appName;
}

export function validateGitHubInstallFlowConfigOnStartup(): void {
  if (!isStateSigningConfigured()) {
    logger.warn(
      {},
      'GitHub state signing secret not configured. Install URL endpoint will return 500 errors. ' +
        'Set GITHUB_STATE_SIGNING_SECRET to enable the installation flow.'
    );
  }
  if (!isGitHubAppNameConfigured()) {
    logger.warn(
      {},
      'GitHub App name not configured. Install URL endpoint will return 500 errors. ' +
        'Set GITHUB_APP_NAME to enable the installation flow.'
    );
  }
}
