import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { handleApiError, type ServerConfig } from '@inkeep/agents-core';
import type { auth as authForTypes, createAuth } from '@inkeep/agents-core/auth';
import type { CredentialStoreRegistry } from '@inkeep/agents-core/credential-stores';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import type { StatusCode } from 'hono/utils/http-status';
import { pinoLogger } from 'hono-pino';
import { env } from './env';
import { getLogger } from './logger';
import { apiKeyAuth } from './middleware/auth';
import { sessionAuth } from './middleware/session-auth';
import { requireTenantAccess } from './middleware/tenant-access';
import { setupOpenAPIRoutes } from './openapi';
import crudRoutes from './routes/index';
import invitationsRoutes from './routes/invitations';
import oauthRoutes from './routes/oauth';
import projectFullRoutes from './routes/projectFull';
import userOrganizationsRoutes from './routes/userOrganizations';

const logger = getLogger('agents-manage-api');

logger.info({ logger: logger.getTransports() }, 'Logger initialized');

/**
 * Check if a request origin is allowed for CORS
 *
 * Development: Allow any localhost origin
 * Production: Only allow origins from the same base domain as INKEEP_AGENTS_MANAGE_API_URL
 *
 * @returns true if origin is allowed (also narrows type to string)
 */
function isOriginAllowed(origin: string | undefined): origin is string {
  if (!origin) return false;

  try {
    const requestUrl = new URL(origin);
    const authUrl = new URL(env.INKEEP_AGENTS_MANAGE_API_URL || 'http://localhost:3002');

    // Development: allow any localhost
    if (authUrl.hostname === 'localhost' || authUrl.hostname === '127.0.0.1') {
      return requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1';
    }

    // Production: allow same base domain and subdomains
    const baseDomain = authUrl.hostname.replace(/^api\./, ''); // Remove 'api.' prefix if present
    return requestUrl.hostname === baseDomain || requestUrl.hostname.endsWith(`.${baseDomain}`);
  } catch {
    // Invalid URL
    return false;
  }
}

export type AppVariables = {
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
  user: typeof authForTypes.$Infer.Session.user | null;
  session: typeof authForTypes.$Infer.Session.session | null;
  userId?: string;
  userEmail?: string;
  tenantId?: string;
  tenantRole?: string;
};

function createManagementHono(
  serverConfig: ServerConfig,
  credentialStores: CredentialStoreRegistry,
  auth: ReturnType<typeof createAuth> | null
) {
  const app = new OpenAPIHono<{ Variables: AppVariables }>();

  // Request ID middleware
  app.use('*', requestId());

  // Server config and credential stores middleware
  app.use('*', async (c, next) => {
    c.set('serverConfig', serverConfig);
    c.set('credentialStores', credentialStores);
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
  app.onError(async (err, c) => {
    const isExpectedError = err instanceof HTTPException;
    const status = isExpectedError ? err.status : 500;
    const requestId = c.get('requestId') || 'unknown';

    // Zod validation error detection
    let zodIssues: Array<any> | undefined;
    if (err && typeof err === 'object') {
      if (err.cause && Array.isArray((err.cause as any).issues)) {
        zodIssues = (err.cause as any).issues;
      } else if (Array.isArray((err as any).issues)) {
        zodIssues = (err as any).issues;
      }
    }

    if (status === 400 && Array.isArray(zodIssues)) {
      c.status(400);
      c.header('Content-Type', 'application/problem+json');
      c.header('X-Content-Type-Options', 'nosniff');
      return c.json({
        type: 'https://docs.inkeep.com/agents-api/errors#bad_request',
        title: 'Validation Failed',
        status: 400,
        detail: 'Request validation failed',
        errors: zodIssues.map((issue) => ({
          detail: issue.message,
          pointer: issue.path ? `/${issue.path.join('/')}` : undefined,
          name: issue.path ? issue.path.join('.') : undefined,
          reason: issue.message,
        })),
      });
    }

    if (status >= 500) {
      if (!isExpectedError) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;
        logger.error(
          {
            error: err,
            message: errorMessage,
            stack: errorStack,
            path: c.req.path,
            requestId,
          },
          'Unexpected server error occurred'
        );
      } else {
        logger.error(
          {
            error: err,
            path: c.req.path,
            requestId,
            status,
          },
          'Server error occurred'
        );
      }
    }

    // All errors (including HTTPExceptions) flow through to RFC 7807-compliant error handler
    const errorResponse = await handleApiError(err, requestId);
    c.status(errorResponse.status as StatusCode);

    const responseBody = {
      ...(errorResponse.code && { code: errorResponse.code }),
      title: errorResponse.title,
      status: errorResponse.status,
      detail: errorResponse.detail,
      ...(errorResponse.instance && { instance: errorResponse.instance }),
      ...(errorResponse.error && { error: errorResponse.error }),
    };

    // Use c.body() to set custom Content-Type (c.json() overrides it to application/json)
    c.header('Content-Type', 'application/problem+json');
    c.header('X-Content-Type-Options', 'nosniff');

    return c.body(JSON.stringify(responseBody));
  });

  // Better Auth routes - only mount if auth is enabled
  if (auth) {
    // CORS middleware for Better Auth routes (must be registered before the handler)
    app.use(
      '/api/auth/*',
      cors({
        origin: (origin) => {
          return isOriginAllowed(origin) ? origin : null;
        },
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: ['POST', 'GET', 'OPTIONS'],
        exposeHeaders: ['Content-Length'],
        maxAge: 600,
        credentials: true,
      })
    );

    // Mount the Better Auth handler
    app.on(['POST', 'GET'], '/api/auth/*', (c) => {
      return auth.handler(c.req.raw);
    });
  }

  // CORS middleware - handles all non-Better Auth routes
  app.use('*', async (c, next) => {
    // Skip CORS middleware for Better Auth routes - they have their own CORS config
    if (auth && c.req.path.startsWith('/api/auth/')) {
      return next();
    }

    return cors({
      origin: (origin) => {
        return isOriginAllowed(origin) ? origin : null;
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowHeaders: ['*'],
      exposeHeaders: ['Content-Length'],
      maxAge: 86400,
      credentials: true,
    })(c, next);
  });

  // Global session middleware - sets user and session in context for all routes
  app.use('*', async (c, next) => {
    if (env.DISABLE_AUTH || !auth) {
      c.set('user', null);
      c.set('session', null);
      await next();
      return;
    }

    const session = await auth.api.getSession({ headers: c.req.raw.headers });

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
    // Use process.env directly to support test environment variables set after module load
    const isTestEnvironment = process.env.ENVIRONMENT === 'test';

    // Skip auth if DISABLE_AUTH is true or in test environment
    if (env.DISABLE_AUTH || isTestEnvironment) {
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
  // Use process.env directly to support test environment variables set after module load
  const isTestEnv = process.env.ENVIRONMENT === 'test';
  if (!env.DISABLE_AUTH && !isTestEnv) {
    app.use('/tenants/:tenantId/*', requireTenantAccess());
  }

  // Mount user-organizations routes - global user endpoint
  app.route('/api/users/:userId/organizations', userOrganizationsRoutes);

  // Mount invitations routes - global invitations endpoint
  app.route('/api/invitations', invitationsRoutes);

  // Mount routes for all entities
  app.route('/tenants/:tenantId', crudRoutes);

  // Mount full project routes directly under tenant
  app.route('/tenants/:tenantId', projectFullRoutes);

  // Mount OAuth routes - global OAuth callback endpoint
  app.route('/oauth', oauthRoutes);

  // Setup OpenAPI documentation endpoints (/openapi.json and /docs)
  setupOpenAPIRoutes(app);

  const baseApp = new Hono();
  baseApp.route('/', app);

  return baseApp;
}

export { createManagementHono };
