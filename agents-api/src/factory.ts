import type { CredentialStore, ServerConfig } from '@inkeep/agents-core';
import { CredentialStoreRegistry, createDefaultCredentialStores } from '@inkeep/agents-core';
import type {
  EmailServiceConfig,
  SSOProviderConfig,
  UserAuthConfig,
} from '@inkeep/agents-core/auth';
import { createAuth } from '@inkeep/agents-core/auth';
import { createAgentsHono } from './createApp';
import manageDbPool from './data/db/manageDbPool';
import runDbClient from './data/db/runDbClient';
import { env } from './env';
import type { SandboxConfig } from './types';

export { createAuth0Provider, createOIDCProvider } from './ssoHelpers';

export type { UserAuthConfig, SSOProviderConfig };

const defaultConfig: ServerConfig = {
  port: 3002,
  serverOptions: {
    requestTimeout: 120000,
    keepAliveTimeout: 60000,
    keepAlive: true,
  },
};

export function createAgentsAuth(
  userAuthConfig?: UserAuthConfig,
  emailService?: EmailServiceConfig
) {
  return createAuth({
    baseURL: env.INKEEP_AGENTS_API_URL || `http://localhost:3002`,
    secret: env.BETTER_AUTH_SECRET || 'development-secret-change-in-production',
    dbClient: runDbClient,
    manageDbPool,
    ...(env.AUTH_COOKIE_DOMAIN && { cookieDomain: env.AUTH_COOKIE_DOMAIN }),
    ...(userAuthConfig?.ssoProviders && { ssoProviders: userAuthConfig.ssoProviders }),
    ...(userAuthConfig?.socialProviders && { socialProviders: userAuthConfig.socialProviders }),
    ...(emailService && { emailService }),
  });
}

export function createAgentsApp(config?: {
  serverConfig?: ServerConfig;
  credentialStores?: CredentialStore[];
  auth?: UserAuthConfig;
  sandboxConfig?: SandboxConfig;
  emailService?: EmailServiceConfig;
}) {
  const serverConfig = config?.serverConfig ?? defaultConfig;
  const stores = config?.credentialStores ?? createDefaultCredentialStores();
  const registry = new CredentialStoreRegistry(stores);
  const auth = createAgentsAuth(config?.auth, config?.emailService);

  return createAgentsHono({
    serverConfig,
    credentialStores: registry,
    auth,
    sandboxConfig: config?.sandboxConfig,
  });
}

export { createAgentsHono };
