import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { setupOpenAPIRoutes } from './openapi';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { pinoLogger } from 'hono-pino';
import {
  errorHandler,
  defaultCorsConfig,
  runCorsConfig,
  authCorsConfig,
  playgroundCorsConfig,
  signozCorsConfig,
  manageApiKeyAuth,
  runApiKeyAuth,
  requireTenantAccess,
} from './middleware';
import type { AppConfig, AppVariables } from './types';
import { getLogger } from './logger';
import { sessionContext, sessionAuth } from './middleware/sessionAuth';
import { env } from './env';
import { flushBatchProcessor } from './instrumentation';
import { manageRoutes } from './domains/manage';
import { branchScopedDbMiddleware } from './middleware/branchScopedDb';
import { manageRefMiddleware, writeProtectionMiddleware } from './middleware/ref';

const logger = getLogger('agents-api');

const isTestEnvironment = () => env.ENVIRONMENT === 'test';

function createAgentsHono(config: AppConfig) {
  const { serverConfig, credentialStores, auth, sandboxConfig } = config;

  const app = new OpenAPIHono<{ Variables: AppVariables }>();

  // Core middleware
  app.use('*', requestId());

  // Route-specific CORS (must be registered before global CORS)
  // Auth routes - restrictive CORS with credentials
  if (auth) {
    app.use('/auth/*', cors(authCorsConfig));
  }
  // Run routes - permissive CORS (origin: '*')
  app.use('/run/*', cors(runCorsConfig));
  // Manage routes - playground and signoz have specific CORS needs
  app.use('/manage/tenants/*/playground/token', cors(playgroundCorsConfig));
  app.use('/manage/tenants/*/signoz/*', cors(signozCorsConfig));

  // Global CORS middleware - handles all other routes
  app.use('*', async (c, next) => {
    // Skip CORS for routes with their own CORS config
    if (auth && c.req.path.startsWith('/auth/')) {
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
  app.use('/run/tenants/*', runApiKeyAuth());
  app.use('/run/agents/*', runApiKeyAuth());
  app.use('/run/v1/*', runApiKeyAuth());
  app.use('/run/api/*', runApiKeyAuth());

  // Ref versioning middleware for all tenant routes - MUST be before route mounting
  app.use('/manage/tenants/*', async (c, next) => manageRefMiddleware(c, next));
  app.use('/manage/tenants/*', (c, next) => writeProtectionMiddleware(c, next));
  app.use('/manage/tenants/*', async (c, next) => branchScopedDbMiddleware(c, next));


  // TODO: Mount domain routes
  app.route('/manage', manageRoutes);
  // app.route('/run', runRoutes);
  // app.route('/evals', evalRoutes);

  // OpenAPI documentation
  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Inkeep Agents API',
      version: '1.0.0',
      description: 'Unified API for Inkeep Agent Framework',
    },
  });

 
  // Setup OpenAPI documentation endpoints (/openapi.json and /docs)
  setupOpenAPIRoutes(app);

  app.use('/run/tenants/*', async (_c, next) => {
    await next();
    await flushBatchProcessor();
  });
  app.use('/run/agents/*', async (_c, next) => {
    await next();
    await flushBatchProcessor();
  });
  app.use('/run/v1/*', async (_c, next) => {
    await next();
    await flushBatchProcessor();
  });
  app.use('/run/api/*', async (_c, next) => {
    await next();
    await flushBatchProcessor();
  });

  // Wrap in base Hono for framework detection
  const base = new Hono();
  base.route('/', app);

  return base;
}

export { createAgentsHono };