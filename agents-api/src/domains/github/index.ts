import { Hono } from 'hono';
import { validateGitHubAppConfigOnStartup, validateGitHubWebhookConfigOnStartup } from './config';
import setupRoutes from './routes/setup';
import tokenExchangeRoutes from './routes/tokenExchange';
import webhooksRoutes from './routes/webhooks';

export function createGithubRoutes() {
  validateGitHubAppConfigOnStartup();
  validateGitHubWebhookConfigOnStartup();

  const app = new Hono();

  app.route('/token-exchange', tokenExchangeRoutes);
  app.route('/setup', setupRoutes);
  app.route('/webhooks', webhooksRoutes);

  return app;
}

export const githubRoutes = createGithubRoutes();

export {
  type GitHubAppConfig,
  getGitHubAppConfig,
  getGitHubAppName,
  getStateSigningSecret,
  getWebhookSecret,
  isGitHubAppConfigured,
  isGitHubAppNameConfigured,
  isStateSigningConfigured,
  isWebhookConfigured,
  validateGitHubInstallFlowConfigOnStartup,
  validateGitHubWebhookConfigOnStartup,
} from './config';
export {
  type GenerateInstallationAccessTokenResult,
  type GenerateTokenError,
  type GenerateTokenResult,
  generateInstallationAccessToken,
  type InstallationAccessToken,
  type InstallationInfo,
  type LookupInstallationError,
  type LookupInstallationForRepoResult,
  type LookupInstallationResult,
  lookupInstallationForRepo,
} from './installation';
export {
  clearJwksCache,
  type GetJwkResult,
  getJwkForToken,
  getJwksCacheStatus,
  type JwksError,
  type JwksResult,
} from './jwks';
export {
  type GitHubOidcClaims,
  type ValidateOidcTokenResult,
  type ValidateTokenError,
  type ValidateTokenResult,
  validateOidcToken,
} from './oidcToken';
export { verifyWebhookSignature, type WebhookVerificationResult } from './routes/webhooks';
