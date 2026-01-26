import { Hono } from 'hono';
import { validateGitHubAppConfigOnStartup } from './config';
import callbackRoutes from './routes/callback';
import tokenExchangeRoutes from './routes/tokenExchange';

export function createGithubRoutes() {
  validateGitHubAppConfigOnStartup();

  const app = new Hono();

  app.route('/token-exchange', tokenExchangeRoutes);
  app.route('/callback', callbackRoutes);

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
