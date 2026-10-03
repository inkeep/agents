import { env } from './env';
import './sentry';
import { startOpenTelemetrySDK } from './instrumentation';

startOpenTelemetrySDK();

import {
  CredentialStoreRegistry,
  createDefaultCredentialStores,
  type ServerConfig,
} from '@inkeep/agents-core';
import { getLogger } from './logger';

const logger = getLogger('agents-api-init');

import { createEmailService } from '@inkeep/agents-email';
import { Hono } from 'hono';
import { createAgentsHono } from './createApp';
import { createAgentsAuth } from './factory';
import type { SandboxConfig } from './types';

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

const googleProvider =
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

const microsoftProvider =
  process.env.PUBLIC_MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
    ? {
        microsoft: {
          prompt: 'select_account' as const,
          clientId: process.env.PUBLIC_MICROSOFT_CLIENT_ID,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        },
      }
    : undefined;

const socialProviders =
  googleProvider || microsoftProvider ? { ...googleProvider, ...microsoftProvider } : undefined;

const emailService = createEmailService();

export const auth: ReturnType<typeof createAgentsAuth> = createAgentsAuth(
  { socialProviders },
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

// Ensure playground app configuration on startup (domains + public keys, idempotent)
import { scheduleEnsurePlaygroundAppConfig } from './startup/playground-app';

scheduleEnsurePlaygroundAppConfig();

// Start the workflow world worker, recover orphaned workflows, and schedule cleanups.
// Shared with createAgentsApp() so factory-based apps (e.g. Docker) get the same behavior.
import { scheduleWorkflowWorldStartup } from './startup/workflow-world';

scheduleWorkflowWorldStartup();

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
