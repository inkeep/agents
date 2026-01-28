import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { pinoLogger } from 'hono-pino';
import manageDbPool from './data/db/manageDbPool';
import runDbClient from './data/db/runDbClient';
import { evalRoutes } from './domains/evals';
import { workflowRoutes } from './domains/evals/workflow/routes';
import { githubRoutes } from './domains/github';
import { manageRoutes } from './domains/manage';
import { vercelChecksWebhookHandler } from './domains/manage/routes/vercelChecks/handler';
import mcpRoutes from './domains/mcp/routes/mcp';
import { runRoutes } from './domains/run';
import { env } from './env';
import { checkManageDb, checkRunDb } from './utils/healthChecks';
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

  // Global CORS middleware - handles all other routes
  app.use('*', async (c, next) => {
    // Skip CORS for routes with their own CORS config
    if (auth && c.req.path.startsWith('/api/auth/')) {
      return next();
    }
    if (c.req.path.startsWith('/run/')) {
      return next();
    }
    if (c.req.path.includes('/playground/token')) {
      return next();
    }
    if (c.req.path.includes('/signoz/')) {
      return next();
    }

    // GitHub OIDC token exchange - server-to-server API called from GitHub Actions.
    if (c.req.path.includes('/api/github/')) {
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

  // Health check endpoint
  app.openapi(
    createRoute({
      method: 'get',
      path: '/health',
      operationId: 'health',
      summary: 'Health check',
      description: 'Check if the management service is healthy',
      responses: {
        204: {
          description: 'Service is healthy',
        },
      },
    }),
    (c) => {
      return c.body(null, 204);
    }
  );

  // Readiness check schemas
  const ReadyResponseSchema = z
    .object({
      status: z.literal('ok'),
      manageDb: z.boolean().describe('Whether the manage database is reachable'),
      runDb: z.boolean().describe('Whether the run database is reachable'),
    })
    .openapi('ReadyResponse');

  const ReadyErrorChecksSchema = z
    .object({
      manageDb: z.boolean().describe('Whether the manage database check passed'),
      runDb: z.boolean().describe('Whether the run database check passed'),
    })
    .openapi('ReadyErrorChecks');

  const ReadyErrorResponseSchema = z
    .object({
      type: z.string().describe('A URI reference that identifies the problem type'),
      title: z.string().describe('A short, human-readable summary of the problem type'),
      status: z.number().describe('The HTTP status code'),
      detail: z.string().describe('A human-readable explanation specific to this occurrence'),
      checks: ReadyErrorChecksSchema,
    })
    .openapi('ReadyErrorResponse');

  // Readiness check endpoint - verifies database connectivity
  app.openapi(
    createRoute({
      method: 'get',
      path: '/ready',
      operationId: 'ready',
      summary: 'Readiness check',
      description:
        'Check if the service is ready to serve traffic by verifying database connectivity',
      responses: {
        200: {
          description: 'Service is ready - all health checks passed',
          content: {
            'application/json': {
              schema: ReadyResponseSchema,
            },
          },
        },
        503: {
          description: 'Service is not ready - one or more health checks failed',
          content: {
            'application/problem+json': {
              schema: ReadyErrorResponseSchema,
            },
          },
        },
      },
    }),
    async (c) => {
      const [manageDbHealthy, runDbHealthy] = await Promise.all([
        checkManageDb(manageDbPool),
        checkRunDb(runDbClient),
      ]);

      if (manageDbHealthy && runDbHealthy) {
        return c.json({
          status: 'ok' as const,
          manageDb: true,
          runDb: true,
        });
      }

      const failedChecks: string[] = [];
      if (!manageDbHealthy) failedChecks.push('manage database');
      if (!runDbHealthy) failedChecks.push('run database');

      return c.json(
        {
          type: 'https://httpstatuses.com/503',
          title: 'Service Unavailable',
          status: 503,
          detail: `Health checks failed: ${failedChecks.join(', ')}`,
          checks: {
            manageDb: manageDbHealthy,
            runDb: runDbHealthy,
          },
        },
        503,
        {
          'Content-Type': 'application/problem+json',
        }
      ) as any;
    }
  );

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
    // Skip auth if DISABLE_AUTH is true or in test environment
    if (env.DISABLE_AUTH || isTestEnvironment()) {
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
    if (!auth || env.DISABLE_AUTH || isTestEnvironment()) {
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

  // Tenant access check (skip in DISABLE_AUTH and test environments)
  if (env.DISABLE_AUTH || isTestEnvironment()) {
    // When auth is disabled, just extract tenantId from URL param
    app.use('/manage/tenants/:tenantId/*', async (c, next) => {
      const tenantId = c.req.param('tenantId');
      if (tenantId) {
        c.set('tenantId', tenantId);
        c.set('userId', 'anonymous'); // Set a default user ID for disabled auth
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
  app.route('/api/github', githubRoutes);

  // Mount MCP routes at top level (eclipses both manage and run services)
  // Also available at /manage/mcp for backward compatibility
  app.route('/mcp', mcpRoutes);

  // Mount Vercel Checks webhook handler
  // This is opt-in and returns 404 when VERCEL_CHECKS_ENABLED is not true
  // NOT exposed in public OpenAPI spec
  app.route('/api/vercel', vercelChecksWebhookHandler);

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
