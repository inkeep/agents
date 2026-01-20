import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { CredentialStoreRegistry, ServerConfig } from '@inkeep/agents-core';
import type { auth as authForTypes, createAuth } from '@inkeep/agents-core/auth';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { pinoLogger } from 'hono-pino';
import { env } from './env';
import { getLogger } from './logger';
import { apiKeyAuth } from './middleware/auth';
import { branchScopedDbMiddleware } from './middleware/branch-scoped-db';
import { errorHandler } from './middleware/error-handler';
import { refMiddleware, writeProtectionMiddleware } from './middleware/ref';
import { sessionAuth } from './middleware/session-auth';
import { requireTenantAccess } from './middleware/tenant-access';
import { setupOpenAPIRoutes } from './openapi';
import cliAuthRoutes from './routes/cliAuth';
import evalsRoutes from './routes/evals';
import crudRoutes from './routes/index';
import invitationsRoutes from './routes/invitations';
import mcpRoutes from './routes/mcp';
import nangoRoutes from './routes/nango';
import oauthRoutes from './routes/oauth';
import playgroundTokenRoutes from './routes/playgroundToken';
import projectFullRoutes from './routes/projectFull';
import signozRoutes from './routes/signoz';
import userOrganizationsRoutes from './routes/userOrganizations';
import {
  authCorsConfig,
  defaultCorsConfig,
  isOriginAllowed,
  playgroundCorsConfig,
} from './utils/cors';

const logger = getLogger('agents-manage-api');

logger.info({ logger: logger.getTransports() }, 'Logger initialized');

const isTestEnvironment = () => process.env.ENVIRONMENT === 'test';

export type AppVariables = {
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
  auth: ReturnType<typeof createAuth> | null;
  user: typeof authForTypes.$Infer.Session.user | null;
  session: typeof authForTypes.$Infer.Session.session | null;
  userId?: string;
  userEmail?: string;
  tenantId?: string;
  tenantRole?: string;
  isInternalService?: boolean;
  internalServicePayload?: import('@inkeep/agents-core').InternalServiceTokenPayload;
};

function createManagementHono(
  serverConfig: ServerConfig,
  credentialStores: CredentialStoreRegistry,
  auth: ReturnType<typeof createAuth> | null
) {
  const app = new OpenAPIHono<{ Variables: AppVariables }>();

  // Request ID middleware
  app.use('*', requestId());

  // Server config, credential stores, and auth middleware
  app.use('*', async (c, next) => {
    c.set('serverConfig', serverConfig);
    c.set('credentialStores', credentialStores);
    c.set('auth', auth);
    return next();
  });

  // Logging middleware - let hono-pino create its own logger to preserve formatting
  app.use(
    pinoLogger({
      pino: getLogger('agents-manage-api').getPinoInstance(),
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

  // Better Auth routes - only mount if auth is enabled
  if (auth) {
    // CORS middleware for Better Auth routes (must be registered before the handler)
    app.use('/api/auth/*', cors(authCorsConfig));

    // Mount the Better Auth handler (OPTIONS handled by cors middleware above)
    app.on(['POST', 'GET'], '/api/auth/*', (c) => {
      return auth.handler(c.req.raw);
    });
  }

  // CORS middleware for playground routes (must be registered before global CORS)
  app.use('/tenants/*/playground/token', cors(playgroundCorsConfig));

  // CORS middleware for SigNoz proxy routes (must be registered before global CORS)
  app.use(
    '/tenants/*/signoz/*',
    cors({
      origin: (origin) => {
        return isOriginAllowed(origin) ? origin : null;
      },
      allowHeaders: [
        'content-type',
        'Content-Type',
        'authorization',
        'Authorization',
        'User-Agent',
        'Cookie',
        'X-Forwarded-Cookie',
      ],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      exposeHeaders: ['Content-Length', 'Set-Cookie'],
      maxAge: 600,
      credentials: true,
    })
  );

  // CORS middleware for Nango config routes (must be registered before global CORS)
  app.use(
    '/tenants/*/nango/*',
    cors({
      origin: (origin) => {
        return isOriginAllowed(origin) ? origin : null;
      },
      allowHeaders: [
        'content-type',
        'Content-Type',
        'authorization',
        'Authorization',
        'User-Agent',
        'Cookie',
        'X-Forwarded-Cookie',
      ],
      allowMethods: ['GET', 'OPTIONS'],
      exposeHeaders: ['Content-Length', 'Set-Cookie'],
      maxAge: 600,
      credentials: true,
    })
  );

  // CORS middleware - handles all other routes
  app.use('*', async (c, next) => {
    // Skip CORS middleware for routes with their own CORS config
    if (auth && c.req.path.startsWith('/api/auth/')) {
      return next();
    }
    if (c.req.path.includes('/playground/token')) {
      return next();
    }
    if (c.req.path.includes('/signoz/')) {
      return next();
    }
    if (c.req.path.includes('/nango/')) {
      return next();
    }

    return cors(defaultCorsConfig)(c, next);
  });

  // Global session middleware - sets user and session in context for all routes
  app.use('*', async (c, next) => {
    if (env.DISABLE_AUTH || !auth) {
      c.set('user', null);
      c.set('session', null);
      await next();
      return;
    }

    // Create headers with x-forwarded-cookie mapped to cookie (browsers forbid setting Cookie header directly)
    const headers = new Headers(c.req.raw.headers);
    const forwardedCookie = headers.get('x-forwarded-cookie');
    if (forwardedCookie && !headers.get('cookie')) {
      headers.set('cookie', forwardedCookie);
    }

    const session = await auth.api.getSession({ headers });

    if (!session) {
      c.set('user', null);
      c.set('session', null);
      await next();
      return;
    }

    c.set('user', session.user);
    c.set('session', session.session);
    await next();
  });

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

  // Authentication middleware for protected routes
  app.use('/tenants/*', async (c, next) => {
    // Skip auth if DISABLE_AUTH is true or in test environment
    if (env.DISABLE_AUTH || isTestEnvironment()) {
      await next();
      return;
    }

    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return apiKeyAuth()(c as any, next);
    }

    return sessionAuth()(c as any, next);
  });

  // Tenant access check (skip in DISABLE_AUTH and test environments)
  if (env.DISABLE_AUTH || isTestEnvironment()) {
    // When auth is disabled, just extract tenantId from URL param
    app.use('/tenants/:tenantId/*', async (c, next) => {
      const tenantId = c.req.param('tenantId');
      if (tenantId) {
        c.set('tenantId', tenantId);
        c.set('userId', 'anonymous'); // Set a default user ID for disabled auth
      }
      await next();
    });
  } else {
    app.use('/tenants/:tenantId/*', requireTenantAccess());
  }

  // Ref versioning middleware for all tenant routes - MUST be before route mounting
  app.use('/tenants/*', async (c, next) => refMiddleware(c, next));
  app.use('/tenants/*', (c, next) => writeProtectionMiddleware(c, next));
  app.use('/tenants/*', async (c, next) => branchScopedDbMiddleware(c, next));

  // Mount user-organizations routes - global user endpoint
  app.route('/api/users/:userId/organizations', userOrganizationsRoutes);

  // Mount CLI auth routes - for CLI login flow
  app.route('/api/cli', cliAuthRoutes);

  // Mount invitations routes - global invitations endpoint
  app.route('/api/invitations', invitationsRoutes);

  // Mount routes for all entities
  app.route('/tenants/:tenantId', crudRoutes);

  // Mount playground token routes under tenant (uses requireTenantAccess middleware)
  app.route('/tenants/:tenantId/playground/token', playgroundTokenRoutes);

  // Mount SigNoz proxy routes under tenant (uses requireTenantAccess middleware for authorization)
  app.route('/tenants/:tenantId/signoz', signozRoutes);

  // Mount Nango config routes under tenant (uses requireTenantAccess middleware for authorization)
  app.route('/tenants/:tenantId/nango', nangoRoutes);

  // Mount full project routes directly under tenant
  app.route('/tenants/:tenantId', projectFullRoutes);

  // Mount evaluation routes under tenant and project
  app.route('/tenants/:tenantId/projects/:projectId/evals', evalsRoutes);

  // Mount OAuth routes - global OAuth callback endpoint
  app.route('/oauth', oauthRoutes);

  app.route('/mcp', mcpRoutes);

  // Setup OpenAPI documentation endpoints (/openapi.json and /docs)
  setupOpenAPIRoutes(app);

  const baseApp = new Hono();
  baseApp.route('/', app);

  return baseApp;
}

export { createManagementHono };
