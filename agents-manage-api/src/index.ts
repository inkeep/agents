import type { CredentialStore, ServerConfig } from '@inkeep/agents-core';
import { CredentialStoreRegistry, createDefaultCredentialStores } from '@inkeep/agents-core';
import type { SSOProviderConfig, UserAuthConfig } from '@inkeep/agents-core/auth';
import { createAuth } from '@inkeep/agents-core/auth';
import { createManagementHono } from './app';
import dbClient from './data/db/dbClient';
import { env } from './env';
import { initializeDefaultUser } from './initialization';
import { createAuth0Provider } from './sso-helpers';

export type { UserAuthConfig, SSOProviderConfig };

export {
  createAuth0Provider,
  createOIDCProvider,
} from './sso-helpers';

const defaultConfig: ServerConfig = {
  port: 3002,
  serverOptions: {
    requestTimeout: 60000,
    keepAliveTimeout: 60000,
    keepAlive: true,
  },
};

const defaultStores = createDefaultCredentialStores();
const defaultRegistry = new CredentialStoreRegistry(defaultStores);

function createManagementAuth(userAuthConfig?: UserAuthConfig) {
  if (env.DISABLE_AUTH) {
    return null;
  }

  return createAuth({
    baseURL: env.INKEEP_AGENTS_MANAGE_API_URL || 'http://localhost:3002',
    secret: env.BETTER_AUTH_SECRET || 'development-secret-change-in-production',
    dbClient,
    ...(userAuthConfig?.ssoProviders && { ssoProviders: userAuthConfig.ssoProviders }),
  });
}

const ssoProviders = await Promise.all([
  process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET
    ? createAuth0Provider({
        domain: process.env.AUTH0_DOMAIN,
        clientId: process.env.AUTH0_CLIENT_ID,
        clientSecret: process.env.AUTH0_CLIENT_SECRET,
      })
    : null,
]);

export const auth = createManagementAuth({
  ssoProviders: ssoProviders.filter(
    (p: SSOProviderConfig | null): p is SSOProviderConfig => p !== null
  ),
});

const app = createManagementHono(defaultConfig, defaultRegistry, auth);

// Skip initialization in test environment - tests will handle their own setup
if (env.ENVIRONMENT !== 'test') {
  void initializeDefaultUser();
}

// Export the default app for Vite dev server and simple deployments
export default app;

// Also export the factory function for advanced usage
export { createManagementHono };

// Export a helper to create app with custom configuration
export function createManagementApp(config?: {
  serverConfig?: ServerConfig;
  credentialStores?: CredentialStore[];
  auth?: UserAuthConfig;
}) {
  const serverConfig = config?.serverConfig ?? defaultConfig;
  const stores = config?.credentialStores ?? defaultStores;
  const registry = new CredentialStoreRegistry(stores);
  const auth = createManagementAuth(config?.auth);

  return createManagementHono(serverConfig, registry, auth);
}
