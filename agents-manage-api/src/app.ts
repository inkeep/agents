import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { CredentialStoreRegistry, ServerConfig } from '@inkeep/agents-core';
import {
  branchScopedDbMiddleware,
  handleApiError,
  refMiddleware,
  writeProtectionMiddleware,
} from '@inkeep/agents-core';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import type { StatusCode } from 'hono/utils/http-status';
import { pinoLogger } from 'hono-pino';
import dbClient from './data/db/dbClient';
import { getLogger } from './logger';
import { apiKeyAuth } from './middleware/auth';
import { setupOpenAPIRoutes } from './openapi';
import crudRoutes from './routes/index';
import oauthRoutes from './routes/oauth';
import projectFullRoutes from './routes/projectFull';

const logger = getLogger('agents-manage-api');

logger.info({ logger: logger.getTransports() }, 'Logger initialized');

type AppVariables = {
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
};

function createManagementHono(
  serverConfig: ServerConfig,
  credentialStores: CredentialStoreRegistry
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

    if (isExpectedError) {
      try {
        const response = err.getResponse();
        return response;
      } catch (responseError) {
        logger.error({ error: responseError }, 'Error while handling HTTPException response');
      }
    }

    const { status: respStatus, title, detail, instance } = await handleApiError(err, requestId);
    c.status(respStatus as StatusCode);
    c.header('Content-Type', 'application/problem+json');
    c.header('X-Content-Type-Options', 'nosniff');
    return c.json({
      type: 'https://docs.inkeep.com/agents-api/errors#internal_server_error',
      title,
      status: respStatus,
      detail,
      ...(instance && { instance }),
    });
  });

  // CORS middleware
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return origin;
        return origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')
          ? origin
          : null;
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowHeaders: ['*'],
      exposeHeaders: ['Content-Length'],
      maxAge: 86400,
      credentials: true,
    })
  );

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

  // API Key authentication middleware for protected routes
  app.use('/tenants/*', apiKeyAuth());

  // Ref versioning middleware for all tenant routes
  app.use('/tenants/*', refMiddleware(dbClient, { apiType: 'manage' }));
  app.use('/tenants/*', (c, next) => writeProtectionMiddleware(c, next));
  app.use('/tenants/*', (c, next) => branchScopedDbMiddleware(c, next, dbClient));

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
