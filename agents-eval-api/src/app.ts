import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { handleApiError } from '@inkeep/agents-core';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import type { StatusCode } from 'hono/utils/http-status';
import { pinoLogger } from 'hono-pino';
import { getLogger } from './logger';
import { apiKeyAuth } from './middleware/auth';
import { setupOpenAPIRoutes } from './openapi';
import evaluationsRoutes from './routes/evaluations';
import mcpRoutes from './routes/mcp';

const logger = getLogger('agents-eval-api');

logger.info({ logger: logger.getTransports() }, 'Logger initialized');

function createEvaluationHono() {
  const app = new OpenAPIHono();

  // Request ID middleware
  app.use('*', requestId());

  // Logging middleware - let hono-pino create its own logger to preserve formatting
  app.use(
    pinoLogger({
      pino: getLogger('agents-eval-api').getPinoInstance(),
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
      tags: ['health'],
      summary: 'Health check',
      description: 'Check if the evaluation service is healthy',
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

  // Mount evaluation routes under tenant scope
  app.route('/tenants/:tenantId/projects/:projectId/evaluations', evaluationsRoutes);

  // Mount MCP endpoint
  app.route('/mcp', mcpRoutes);

  // Setup OpenAPI documentation endpoints (/openapi.json and /docs)
  setupOpenAPIRoutes(app);

  const baseApp = new Hono();
  baseApp.route('/', app);

  return baseApp;
}

export { createEvaluationHono };
