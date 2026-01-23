import { OpenAPIHono } from '@hono/zod-openapi';
import { validateGitHubAppConfigOnStartup } from './config';
import tokenExchangeRoutes from './routes/tokenExchange';

export function createGithubRoutes() {
  validateGitHubAppConfigOnStartup();

  const app = new OpenAPIHono();

  app.route('/token-exchange', tokenExchangeRoutes);

  return app;
}

export const githubRoutes = createGithubRoutes();

export { getGitHubAppConfig, isGitHubAppConfigured, type GitHubAppConfig } from './config';
export {
  getJwkForToken,
  clearJwksCache,
  getJwksCacheStatus,
  type JwksResult,
  type JwksError,
  type GetJwkResult,
} from './jwks';
export {
  validateOidcToken,
  type GitHubOidcClaims,
  type ValidateTokenResult,
  type ValidateTokenError,
  type ValidateOidcTokenResult,
} from './oidcToken';
export {
  lookupInstallationForRepo,
  type InstallationInfo,
  type LookupInstallationResult,
  type LookupInstallationError,
  type LookupInstallationForRepoResult,
} from './installation';
