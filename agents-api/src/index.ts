import {
  CredentialStoreRegistry,
  createDefaultCredentialStores,
  type ServerConfig,
} from '@inkeep/agents-core';
import type { SSOProviderConfig } from '@inkeep/agents-core/auth';
import { Hono } from 'hono';
import { createAgentsHono } from './createApp';
import { env } from './env';
import { createAgentsAuth } from './factory';
import { initializeDefaultUser } from './initialization';
import { createAuth0Provider } from './ssoHelpers';

export type { AppConfig, AppVariables } from './types';

// Re-export Hono to ensure it's not tree-shaken (required for Vercel framework detection)
export { Hono };

// Re-export everything from factory for backward compatibility
export type { SSOProviderConfig, UserAuthConfig } from './factory';
export {
  createAgentsApp,
  createAgentsHono,
  createAuth0Provider,
  createOIDCProvider,
  initializeDefaultUser,
} from './factory';

// Create default configuration
const defaultConfig: ServerConfig = {
  port: 3002,
  serverOptions: {
    requestTimeout: 120000,
    keepAliveTimeout: 60000,
    keepAlive: true,
  },
};

// Module-level initialization for default app export
// This only runs when importing the default app (legacy/simple deployments)
const ssoProviders = await Promise.all([
  process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET
    ? createAuth0Provider({
        domain: process.env.AUTH0_DOMAIN,
        clientId: process.env.AUTH0_CLIENT_ID,
        clientSecret: process.env.AUTH0_CLIENT_SECRET,
      })
    : null,
]);

const socialProviders =
  process.env.PUBLIC_GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          prompt: 'select_account' as const,
          display: 'popup' as const,
          clientId: process.env.PUBLIC_GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : undefined;

export const auth = createAgentsAuth({
  ssoProviders: ssoProviders.filter(
    (p: SSOProviderConfig | null): p is SSOProviderConfig => p !== null
  ),
  socialProviders,
});

// Create default credential stores
const defaultStores = createDefaultCredentialStores();
const defaultRegistry = new CredentialStoreRegistry(defaultStores);

const app = createAgentsHono({
  serverConfig: defaultConfig,
  credentialStores: defaultRegistry,
  auth,
});

// Initialize default user for development environment only
if (env.ENVIRONMENT === 'development') {
  void initializeDefaultUser(auth);
}

export default app;
