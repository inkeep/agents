import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { OrgRoles } from '@inkeep/agents-core';
import { githubRoutes } from '@inkeep/agents-work-apps/github';
import { type Context, Hono, type Next } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { pinoLogger } from 'hono-pino';
import { evalRoutes } from './domains/evals';
import { workflowRoutes } from './domains/evals/workflow/routes';
import { manageRoutes } from './domains/manage';
import mcpRoutes from './domains/mcp/routes/mcp';
import { runRoutes } from './domains/run';
import { workAppsRoutes } from './domains/work-apps';
import { env } from './env';
import { flushBatchProcessor } from './instrumentation';
import { getLogger } from './logger';
import {
  authCorsConfig,
  defaultCorsConfig,
  errorHandler,
  manageApiKeyAuth,
  playgroundCorsConfig,
  requireTenantAccess,
  runApiKeyAuth,
  runApiKeyAuthExcept,
  runCorsConfig,
  signozCorsConfig,
  workAppsCorsConfig,
} from './middleware';
import { branchScopedDbMiddleware } from './middleware/branchScopedDb';
import { evalApiKeyAuth } from './middleware/evalsAuth';
import { projectConfigMiddleware, projectConfigMiddlewareExcept } from './middleware/projectConfig';
import {
  manageRefMiddleware,
  oauthRefMiddleware,
  runRefMiddleware,
  writeProtectionMiddleware,
} from './middleware/ref';
import { sessionAuth, sessionContext } from './middleware/sessionAuth';
import { executionBaggageMiddleware } from './middleware/tracing';
import { setupOpenAPIRoutes } from './openapi';
import { healthChecksHandler } from './routes/healthChecks';
import type { AppConfig, AppVariables } from './types';

const logger = getLogger('agents-api');

const isTestEnvironment = () => env.ENVIRONMENT === 'test';

// Helper to check if a path is a webhook/trigger route (no API key auth required)
export const isWebhookRoute = (path: string) => {
  return path.includes('/triggers/') && !path.endsWith('/triggers') && !path.endsWith('/triggers/');
};

function createAgentsHono(config: AppConfig) {
  const { serverConfig, credentialStores, auth, sandboxConfig } = config;

  const app = new OpenAPIHono<{ Variables: AppVariables }>();

  const CapabilitiesResponseSchema = z
    .object({
      sandbox: z
        .object({
          configured: z
            .boolean()
            .describe(
              'Whether a sandbox provider is configured. Required for Function Tools execution.'
            ),
          provider: z
            .enum(['native', 'vercel'])
            .optional()
            .describe('The configured sandbox provider, if enabled.'),
          runtime: z
            .enum(['node22', 'typescript'])
            .optional()
            .describe('The configured sandbox runtime, if enabled.'),
        })
        .describe('Sandbox execution capabilities (used by Function Tools).'),
    })
    .describe('Optional server capabilities and configuration.')
    .openapi('CapabilitiesResponseSchema');

  // Core middleware
  app.use('*', requestId());

  // Route-specific CORS (must be registered before global CORS)
  // Better Auth routes - only mount if auth is enabled
  if (auth) {
    app.use('/api/auth/*', cors(authCorsConfig));

    // Mount the Better Auth handler (OPTIONS handled by cors middleware above)
    app.on(['POST', 'GET'], '/api/auth/*', (c) => {
      return auth.handler(c.req.raw);
    });
  }
  // Run routes - permissive CORS (origin: '*')
  app.use('/run/*', cors(runCorsConfig));

  // Manage routes - playground and signoz have specific CORS needs
  app.use('/manage/tenants/*/playground/token', cors(playgroundCorsConfig));

  app.use('/manage/tenants/*/signoz/*', cors(signozCorsConfig));

  // Work Apps routes - specific CORS config for dashboard integration
  app.use('/work-apps/*', cors(workAppsCorsConfig));

  // Global CORS middleware - handles all other routes
  app.use('*', async (c, next) => {
    // Skip CORS for routes with their own CORS config
    if (auth && c.req.path.startsWith('/api/auth/')) {
      return next();
    }
    if (c.req.path.startsWith('/run/')) {
      return next();
    }
    if (c.req.path.startsWith('/work-apps/')) {
      return next();
    }
    if (c.req.path.includes('/playground/token')) {
      return next();
    }
    if (c.req.path.includes('/signoz/')) {
      return next();
    }

    // GitHub OIDC token exchange - server-to-server API called from GitHub Actions.
    if (c.req.path.includes('/work-apps/github/')) {
      return next();
    }

    return cors(defaultCorsConfig)(c, next);
  });

  app.use('*', async (c, next) => {
    c.set('serverConfig', serverConfig);
    c.set('credentialStores', credentialStores);
    await next();
  });

  app.use('/manage/*', async (c, next) => {
    c.set('auth', auth);
    await next();
  });

  // Work Apps routes - set auth context for session-based operations (before sessionContext)
  app.use('/work-apps/*', async (c, next) => {
    c.set('auth', auth);
    await next();
  });

  app.use('/run/*', async (c, next) => {
    if (sandboxConfig) {
      c.set('sandboxConfig', sandboxConfig);
    }
    await next();
  });

  // Body parsing middleware - parse once and share across all handlers
  app.use('/run/*', async (c, next) => {
    if (c.req.header('content-type')?.includes('application/json')) {
      try {
        const body = await c.req.json();
        c.set('requestBody', body);
      } catch (error) {
        logger.debug({ error }, 'Failed to parse JSON body, continuing without parsed body');
      }
    }
    return next();
  });

  // Logging middleware - let hono-pino create its own logger to preserve formatting
  app.use(
    pinoLogger({
      pino: getLogger('agents-api').getPinoInstance(),
      http: {
        onResLevel(c) {
          if (c.res.status >= 500) {
            return 'error';
          }
          // SigNoz routes are noisy, so we log at debug level
          if (c.req.path.includes('/signoz/')) {
            return 'debug';
          }
          return 'info';
        },
      },
    })
  );

  // Error handling
  app.onError(errorHandler);

  // Global session middleware - sets user and session in context for all routes
  app.use('*', sessionContext());

  // Mount health check routes at root level
  app.route('/', healthChecksHandler);

  // Workflow process endpoint - called by Vercel cron to keep worker active
  // The worker processes queued jobs while this request is active
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/workflow/process',
      tags: ['Workflows'],
      summary: 'Process workflow jobs',
      description: 'Keeps the workflow worker active to process queued jobs (called by cron)',
      responses: {
        200: {
          description: 'Processing complete',
        },
      },
    }),
    async (c) => {
      // Worker is already started via world.start() at app initialization
      // Keep the function alive for ~50s to process jobs (Vercel max is 60s)
      await new Promise((resolve) => setTimeout(resolve, 50000));
      return c.json({ processed: true, timestamp: new Date().toISOString() });
    }
  );

  // Authentication middleware for protected manage routes
  app.use('/manage/tenants/*', async (c, next) => {
    // Skip auth if in test environment
    if (isTestEnvironment()) {
      await next();
      return;
    }

    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return manageApiKeyAuth()(c as any, next);
    }

    return sessionAuth()(c as any, next);
  });

  // Authentication middleware for non-tenant manage routes
  app.use('/manage/capabilities', async (c, next) => {
    // Capabilities should be gated the same way as other manage routes, but still work
    // when auth is disabled or not configured.
    if (!auth || isTestEnvironment()) {
      await next();
      return;
    }

    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return manageApiKeyAuth()(c as any, next);
    }

    return sessionAuth()(c as any, next);
  });

  app.openapi(
    createRoute({
      method: 'get',
      path: '/manage/capabilities',
      operationId: 'capabilities',
      summary: 'Get server capabilities',
      description: 'Get information about optional server-side capabilities and configuration.',
      responses: {
        200: {
          description: 'Server capabilities',
          content: {
            'application/json': {
              schema: CapabilitiesResponseSchema,
            },
          },
        },
      },
    }),
    (c) => {
      if (!sandboxConfig) {
        return c.json({ sandbox: { configured: false } });
      }
      return c.json({
        sandbox: {
          configured: true,
          provider: sandboxConfig.provider,
          runtime: sandboxConfig.runtime,
        },
      });
    }
  );

  // Tenant access check (skip in test environments)
  if (isTestEnvironment()) {
    // When auth is disabled, just extract tenantId from URL param
    app.use('/manage/tenants/:tenantId/*', async (c, next) => {
      const tenantId = c.req.param('tenantId');
      if (tenantId) {
        c.set('tenantId', tenantId);
        c.set('userId', 'anonymous'); // Set a default user ID for disabled auth
        c.set('tenantRole', OrgRoles.OWNER); // Grant owner role in test mode to bypass SpiceDB checks
      }
      await next();
    });
  } else {
    app.use('/manage/tenants/:tenantId/*', requireTenantAccess());
  }

  // Apply API key authentication to all protected run routes
  app.use('/run/tenants/*', runApiKeyAuthExcept(isWebhookRoute));
  app.use('/run/agents/*', runApiKeyAuth());
  app.use('/run/v1/*', runApiKeyAuth());
  app.use('/run/api/*', runApiKeyAuth());

  app.use('/evals/tenants/*', evalApiKeyAuth());

  // Ref versioning middleware for all tenant routes - MUST be before route mounting
  app.use('/manage/tenants/*', async (c, next) => manageRefMiddleware(c, next));
  app.use('/manage/tenants/*', (c, next) => writeProtectionMiddleware(c, next));
  app.use('/manage/tenants/*', async (c, next) => branchScopedDbMiddleware(c, next));

  // Ref + branch-scoped DB for OAuth login (has tenant/project in query params)
  // Note: OAuth callback doesn't use middleware - it extracts tenant/project from PKCE state
  app.use('/manage/oauth/login', async (c, next) => oauthRefMiddleware(c, next));
  app.use('/manage/oauth/login', async (c, next) => branchScopedDbMiddleware(c, next));

  // Apply ref middleware to all execution routes
  app.use('/run/*', async (c, next) => runRefMiddleware(c, next));

  // Fetch project config upfront for authenticated execution routes
  app.use('/run/tenants/*', projectConfigMiddlewareExcept(isWebhookRoute));
  app.use('/run/agents/*', projectConfigMiddleware);
  app.use('/run/v1/*', projectConfigMiddleware);
  app.use('/run/api/*', projectConfigMiddleware);

  // Baggage middleware for execution API - extracts context from API key authentication
  app.use('/run/*', async (c, next) => {
    return executionBaggageMiddleware()(c, next);
  });

  // management routes
  app.route('/manage', manageRoutes);

  // Mount execution routes - API key provides tenant, project, and agent context
  app.route('/run', runRoutes);

  // Mount evaluation routes - API key provides tenant, project, and agent context
  // Mount eval workflow routes for internal workflow execution
  // The postgres world's internal local world calls these endpoints
  // Mount at /.well-known - routes inside define /workflow/v1/flow etc.
  app.route('/.well-known', workflowRoutes);

  // Handle /index POST - Vercel Queue delivers CloudEvents here
  // Forward to the workflow flow handler - the dispatchFlowOrStep in routes.ts
  // handles the actual flow/step routing based on x-vqs-queue-name header
  app.post('/index', async (c) => {
    const originalUrl = new URL(c.req.url);
    const bodyBuffer = await c.req.arrayBuffer();

    // Always forward to /flow - the dispatcher in routes.ts handles flow/step routing
    const targetUrl = new URL('/.well-known/workflow/v1/flow', originalUrl.origin);

    const forwardedRequest = new Request(targetUrl.toString(), {
      method: 'POST',
      headers: new Headers(c.req.raw.headers),
      body: bodyBuffer,
    });

    return fetch(forwardedRequest);
  });

  app.route('/evals', evalRoutes);

  // Mount GitHub routes - unauthenticated, OIDC token is the authentication
  app.route('/work-apps/github', githubRoutes);

  // Work Apps auth middleware - shared session/API key auth for protected Slack routes
  // Most routes are unauthenticated (events, commands), but workspace and user management require session
  const workAppsAuth = async (c: Context, next: Next) => {
    // Skip auth for GET requests (listing is public) and in test mode
    if (c.req.method === 'GET' || isTestEnvironment()) {
      await next();
      return;
    }

    // DEV ONLY: Allow localhost origins without session auth
    // This is needed because cross-origin cookies don't work with ngrok during development
    // In production, the dashboard and API are on the same domain so session cookies work
    const origin = c.req.header('Origin');
    if (origin && env.ENVIRONMENT !== 'production') {
      try {
        const originUrl = new URL(origin);
        if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
          c.set('userId', 'dev-user');
          c.set('tenantId', 'default');
          c.set('tenantRole', 'owner');
          await next();
          return;
        }
      } catch {
        // Invalid origin URL, continue to auth check
      }
    }

    // For mutating requests, require session auth (dashboard uses Better Auth cookies)
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return manageApiKeyAuth()(c as any, next);
    }

    return sessionAuth()(c as any, next);
  };

  app.use('/work-apps/slack/workspaces/*', workAppsAuth);
  app.use('/work-apps/slack/users/*', workAppsAuth);

  // Mount Work Apps routes - modular third-party integrations (Slack, etc.)
  app.route('/work-apps', workAppsRoutes);

  // Mount MCP routes at top level (eclipses both manage and run services)
  // Also available at /manage/mcp for backward compatibility
  app.route('/mcp', mcpRoutes);

  // Setup OpenAPI documentation endpoints (/openapi.json and /docs)
  setupOpenAPIRoutes(app);

  app.use('/run/*', async (_c, next) => {
    await next();
    await flushBatchProcessor();
  });

  // Wrap in base Hono for framework detection
  const base = new Hono();
  base.route('/', app);

  return base;
}

export { createAgentsHono };
