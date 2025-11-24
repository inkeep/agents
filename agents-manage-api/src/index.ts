import { CredentialStoreRegistry, createDefaultCredentialStores } from '@inkeep/agents-core';
import type { SSOProviderConfig } from '@inkeep/agents-core/auth';
import { createAuth } from '@inkeep/agents-core/auth';
import { Hono } from 'hono';
import { createManagementHono } from './app';
import dbClient from './data/db/dbClient';
import { env } from './env';
import { initializeDefaultUser } from './initialization';
import { createAuth0Provider } from './sso-helpers';

// Re-export Hono to ensure it's not tree-shaken (required for Vercel framework detection)
export { Hono };

// Re-export everything from factory for backward compatibility
export type { SSOProviderConfig, UserAuthConfig } from './factory';
export {
  createAuth0Provider,
  createManagementApp,
  createManagementHono,
  createOIDCProvider,
  initializeDefaultUser,
} from './factory';

// Default configuration and stores for module-level app
const defaultConfig = {
  port: 3002,
  serverOptions: {
    requestTimeout: 60000,
    keepAliveTimeout: 60000,
    keepAlive: true,
  },
};

const defaultStores = createDefaultCredentialStores();
const defaultRegistry = new CredentialStoreRegistry(defaultStores);

function createManagementAuth(userAuthConfig?: {
  ssoProviders?: SSOProviderConfig[];
  socialProviders?: any;
}) {
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

export const auth = createManagementAuth({
  ssoProviders: ssoProviders.filter(
    (p: SSOProviderConfig | null): p is SSOProviderConfig => p !== null
  ),
  socialProviders,
});

const app: Hono = createManagementHono(defaultConfig, defaultRegistry, auth);

// Initialize default user for development environment only
if (env.ENVIRONMENT === 'development') {
  void initializeDefaultUser(auth);
}

// Export the default app for Vite dev server and simple deployments
export default app;
