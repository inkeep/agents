import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  type ExecutionContext,
  type ServerConfig,
  type CredentialStoreRegistry,
} from '@inkeep/agents-core';
import { context as otelContext, propagation } from '@opentelemetry/api';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import type { StatusCode } from 'hono/utils/http-status';
import { pinoLogger } from 'hono-pino';
import { handleApiError } from '@inkeep/agents-core';
import { getLogger } from './logger.js';
import { apiKeyAuth } from './middleware/api-key-auth.js';
import { setupOpenAPIRoutes } from './openapi.js';
import agentRoutes from './routes/agents.js';
import chatRoutes from './routes/chat.js';
import chatDataRoutes from './routes/chatDataStream.js';
import mcpRoutes from './routes/mcp.js';

type AppVariables = {
  executionContext: ExecutionContext;
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
};

function createExecutionHono(
  serverConfig: ServerConfig,
  credentialStores: CredentialStoreRegistry
) {
  const app = new OpenAPIHono<{ Variables: AppVariables }>();

  // Request ID middleware
  app.use('*', requestId());

  // OpenTelemetry baggage middleware
  app.use('*', async (c, next) => {
    const reqId = c.get('requestId');
    let bag = propagation.getBaggage(otelContext.active());
    if (!bag) {
      bag = propagation.createBaggage();
    }
    bag = bag.setEntry('request.id', { value: String(reqId ?? 'unknown') });
    const ctxWithBag = propagation.setBaggage(otelContext.active(), bag);
    return otelContext.with(ctxWithBag, () => next());
  });

  // Baggage middleware for execution API - extracts context from API key authentication
  app.use('*', async (c, next) => {
    // Get the API key context if available (set by auth middleware)
    const executionContext = c.get('executionContext');

    if (!executionContext) {
      // No API key context, skip baggage setup
      return next();
    }

    const { tenantId, projectId, graphId } = executionContext;

    // Extract conversation ID from JSON body if present
    let conversationId: string | undefined;
    if (c.req.header('content-type')?.includes('application/json')) {
      try {
        const body = await c.req.json();
        conversationId = body?.conversationId;
      } catch (_) {
        // Silently ignore parse errors for non-JSON bodies
      }
    }

    const entries = Object.fromEntries(
      Object.entries({
        'graph.id': graphId,
        'tenant.id': tenantId,
        'project.id': projectId,
        'conversation.id': conversationId,
      }).filter((entry): entry is [string, string] => {
        const [, v] = entry;
        return typeof v === 'string' && v.length > 0;
      })
    );

    if (!Object.keys(entries).length) {
      return next();
    }

    const bag = Object.entries(entries).reduce(
      (b, [key, value]) => b.setEntry(key, { value: value || '' }),
      propagation.getBaggage(otelContext.active()) ?? propagation.createBaggage()
    );

    const ctxWithBag = propagation.setBaggage(otelContext.active(), bag);
    return otelContext.with(ctxWithBag, () => next());
  });

  // Server config and credential stores middleware
  app.use('*', async (c, next) => {
    c.set('serverConfig', serverConfig);
    c.set('credentialStores', credentialStores);
    return next();
  });

  // Logging middleware
  app.use(
    pinoLogger({
      pino: getLogger(),
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
        getLogger().error(
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
        getLogger().error(
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
        getLogger().error({ error: responseError }, 'Error while handling HTTPException response');
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
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['*'],
      exposeHeaders: ['Content-Length'],
      maxAge: 86400,
      credentials: true,
    })
  );

  // Apply API key authentication to all routes except health and docs
  app.use('/tenants/*', apiKeyAuth());
  app.use('/agents/*', apiKeyAuth());
  app.use('/v1/*', apiKeyAuth());
  app.use('/api/*', apiKeyAuth());

  // Health check endpoint (no auth required)
  app.openapi(
    createRoute({
      method: 'get',
      path: '/health',
      tags: ['health'],
      summary: 'Health check',
      description: 'Check if the execution service is healthy',
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

  // Mount execution routes - API key provides tenant, project, and graph context
  app.route('/v1/chat', chatRoutes);
  app.route('/api', chatDataRoutes);
  app.route('/v1/mcp', mcpRoutes);
  app.route('/agents', agentRoutes);

  // Setup OpenAPI documentation endpoints (/openapi.json and /docs)
  setupOpenAPIRoutes(app);

  return app;
}

export { createExecutionHono };
