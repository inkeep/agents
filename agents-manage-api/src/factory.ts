import type { CredentialStore, ServerConfig } from '@inkeep/agents-core';
import { CredentialStoreRegistry, createDefaultCredentialStores } from '@inkeep/agents-core';
import type { SSOProviderConfig, UserAuthConfig } from '@inkeep/agents-core/auth';
import { createAuth } from '@inkeep/agents-core/auth';
import { createManagementHono } from './create-app';
import dbClient from './data/db/dbClient';
import { env } from './env';
import { initializeDefaultUser } from './initialization';

export type { UserAuthConfig, SSOProviderConfig };

export { createAuth0Provider, createOIDCProvider } from './sso-helpers';

const defaultConfig: ServerConfig = {
  port: 3002,
  serverOptions: {
    requestTimeout: 60000,
    keepAliveTimeout: 60000,
    keepAlive: true,
  },
};

function createManagementAuth(userAuthConfig?: UserAuthConfig) {
  if (env.DISABLE_AUTH) {
    return null;
  }

  return createAuth({
    baseURL: env.INKEEP_AGENTS_MANAGE_API_URL || 'http://localhost:3002',
    secret: env.BETTER_AUTH_SECRET || 'development-secret-change-in-production',
    dbClient,
    ...(userAuthConfig?.ssoProviders && { ssoProviders: userAuthConfig.ssoProviders }),
    ...(userAuthConfig?.socialProviders && { socialProviders: userAuthConfig.socialProviders }),
  });
}

export function createManagementApp(config?: {
  serverConfig?: ServerConfig;
  credentialStores?: CredentialStore[];
  auth?: UserAuthConfig;
  skipInitialization?: boolean;
}) {
  const serverConfig = config?.serverConfig ?? defaultConfig;
  const stores = config?.credentialStores ?? createDefaultCredentialStores();
  const registry = new CredentialStoreRegistry(stores);
  const auth = createManagementAuth(config?.auth);

  // Initialize default user unless explicitly skipped or in test environment
  if (!config?.skipInitialization && env.ENVIRONMENT !== 'test') {
    void initializeDefaultUser(auth);
  }

  return createManagementHono(serverConfig, registry, auth);
}

export { createManagementHono, initializeDefaultUser };
