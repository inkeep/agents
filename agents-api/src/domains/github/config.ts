import { z } from '@hono/zod-openapi';
import { getLogger } from '../../logger';

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

  const appId = process.env.GITHUB_APP_ID;
  // Handle escaped newlines (common when setting env vars from CLI or .env files)
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');

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
  logger.info({}, 'GitHub App credentials loaded successfully');
  return cachedConfig;
}

export function isGitHubAppConfigured(): boolean {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
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
