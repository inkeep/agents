import { env } from './env';
import { defaultSDK } from './instrumentation';

defaultSDK.start();

import {
  CredentialStoreRegistry,
  createDefaultCredentialStores,
  type ServerConfig,
} from '@inkeep/agents-core';
import { getLogger } from './logger';

const logger = getLogger('agents-api-init');

import type { SSOProviderConfig } from '@inkeep/agents-core/auth';
import { createEmailService } from '@inkeep/agents-email';
import { Hono } from 'hono';
import { createAgentsHono } from './createApp';
import { createAgentsAuth } from './factory';
import { createAuth0Provider } from './ssoHelpers';
import type { SandboxConfig } from './types';
import { recoverOrphanedWorkflows, world } from './workflow/world';

export type { AppConfig, AppVariables } from './types';

// Re-export Hono to ensure it's not tree-shaken (required for Vercel framework detection)
export { Hono };

// Export SandboxConfig type for use in applications
export type {
  NativeSandboxConfig,
  SandboxConfig,
  VercelSandboxConfig,
} from './domains/run/types/executionContext';
// Re-export everything from factory for backward compatibility
export type { SSOProviderConfig, UserAuthConfig } from './factory';
export {
  createAgentsApp,
  createAgentsHono,
  createAuth0Provider,
  createOIDCProvider,
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

const sandboxConfig: SandboxConfig =
  process.env.SANDBOX_VERCEL_TEAM_ID &&
  process.env.SANDBOX_VERCEL_PROJECT_ID &&
  process.env.SANDBOX_VERCEL_TOKEN
    ? {
        provider: 'vercel',
        runtime: 'node22',
        timeout: 60000,
        vcpus: 4,
        teamId: process.env.SANDBOX_VERCEL_TEAM_ID,
        projectId: process.env.SANDBOX_VERCEL_PROJECT_ID,
        token: process.env.SANDBOX_VERCEL_TOKEN,
      }
    : { provider: 'native', runtime: 'node22', timeout: 30000, vcpus: 2 };

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

const emailService = createEmailService();

export const auth = createAgentsAuth(
  {
    ssoProviders: ssoProviders.filter(
      (p: SSOProviderConfig | null): p is SSOProviderConfig => p !== null
    ),
    socialProviders,
  },
  emailService
);

// Create default credential stores
const defaultStores = createDefaultCredentialStores();
const defaultRegistry = new CredentialStoreRegistry(defaultStores);

const app = createAgentsHono({
  serverConfig: defaultConfig,
  credentialStores: defaultRegistry,
  auth,
  sandboxConfig,
});

// Start the workflow world worker and recover orphaned workflows.
const workflowWorld = process.env.WORKFLOW_TARGET_WORLD || 'local';
if (workflowWorld === '@workflow/world-postgres' || workflowWorld === 'local') {
  const STARTUP_DELAY_MS = 3000; // Wait for Vite/server to start
  logger.info(
    { targetWorld: workflowWorld, delayMs: STARTUP_DELAY_MS },
    'Scheduling workflow world worker start'
  );

  setTimeout(async () => {
    try {
      if (workflowWorld === '@workflow/world-postgres') {
        await world.start();
        logger.info({}, 'Workflow world worker started successfully');
      } else {
        logger.info(
          { targetWorld: workflowWorld },
          'Workflow world does not require explicit start'
        );
      }
      const recoveredCount = await recoverOrphanedWorkflows();
      if (recoveredCount > 0) {
        logger.info({ recoveredCount }, 'Recovered orphaned workflow(s)');
      }
    } catch (err) {
      logger.error({ error: err }, 'Failed to start workflow world');
    }
  }, STARTUP_DELAY_MS);
}

// Start Slack Socket Mode client for local development (when configured)
if (env.ENVIRONMENT === 'development' && env.SLACK_APP_TOKEN) {
  const SOCKET_MODE_DELAY_MS = 3000;
  logger.info({ delayMs: SOCKET_MODE_DELAY_MS }, 'Scheduling Slack Socket Mode start');

  setTimeout(async () => {
    try {
      const { startSocketMode } = await import('@inkeep/agents-work-apps/slack');
      await startSocketMode(env.SLACK_APP_TOKEN as string);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
        logger.error(
          {},
          'SLACK_APP_TOKEN is set but @slack/socket-mode is not installed. Run: pnpm add -D @slack/socket-mode (in packages/agents-work-apps)'
        );
      } else {
        logger.error({ error: err }, 'Failed to start Slack Socket Mode');
      }
    }
  }, SOCKET_MODE_DELAY_MS);
}

export default app;
