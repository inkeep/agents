import { otel } from '@hono/otel';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  type CredentialStoreRegistry,
  type ExecutionContext,
  handleApiError,
  type ServerConfig,
} from '@inkeep/agents-core';
import { context as otelContext, propagation } from '@opentelemetry/api';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import type { StatusCode } from 'hono/utils/http-status';
import { serve } from 'inngest/hono';
import { env } from './env';
import { inngest } from './inngest';
import { flushBatchProcessor } from './instrumentation';
import { getLogger } from './logger';
import { apiKeyAuth } from './middleware/api-key-auth';
import { setupOpenAPIRoutes } from './openapi';
import agentRoutes from './routes/agents';
import chatRoutes from './routes/chat';
import chatDataRoutes from './routes/chatDataStream';
import mcpRoutes from './routes/mcp';
import type { SandboxConfig } from './types/execution-context';

const logger = getLogger('agents-run-api');

type AppVariables = {
  executionContext: ExecutionContext;
  serverConfig: ServerConfig;
  credentialStores: CredentialStoreRegistry;
  sandboxConfig?: SandboxConfig;
  requestBody?: any;
};

function createExecutionHono(
  serverConfig: ServerConfig,
  credentialStores: CredentialStoreRegistry,
  sandboxConfig?: SandboxConfig
) {
  const app = new OpenAPIHono<{ Variables: AppVariables }>();

  app.use('*', otel());

  // Request ID middleware
  app.use('*', requestId());

  // Server config, credential stores, and sandbox config middleware
  app.use('*', async (c, next) => {
    c.set('serverConfig', serverConfig);
    c.set('credentialStores', credentialStores);
    if (sandboxConfig) {
      c.set('sandboxConfig', sandboxConfig);
    }
    return next();
  });

  // Body parsing middleware - parse once and share across all handlers
  app.use('*', async (c, next) => {
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

  // OpenTelemetry baggage middleware
  app.use('*', async (c, next) => {
    const reqId = c.get('requestId');
    let bag = propagation.getBaggage(otelContext.active());
    if (!bag) {
      bag = propagation.createBaggage();
    }
    // Safety check for test environment where createBaggage might return undefined
    if (bag && typeof bag.setEntry === 'function') {
      bag = bag.setEntry('request.id', { value: String(reqId ?? 'unknown') });
      const ctxWithBag = propagation.setBaggage(otelContext.active(), bag);
      return await otelContext.with(ctxWithBag, async () => await next());
    }
    return next();
  });

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
        if (logger) {
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
        }
      } else {
        if (logger) {
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
    }

    if (isExpectedError) {
      try {
        const response = err.getResponse();
        return response;
      } catch (responseError) {
        if (logger) {
          logger.error({ error: responseError }, 'Error while handling HTTPException response');
        }
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
      origin: '*', // public API
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['*'],
      exposeHeaders: ['Content-Length'],
      maxAge: 86400,
    })
  );

  // Inngest serve endpoint (before auth middleware)
  app.use(
    '/api/inngest',
    serve({
      client: inngest,
      functions: [],
      signingKey: env.INNGEST_SIGNING_KEY,
    })
  );

  // Apply API key authentication to all routes except health and docs
  app.use('/tenants/*', apiKeyAuth());
  app.use('/agents/*', apiKeyAuth());
  app.use('/v1/*', apiKeyAuth());
  app.use('/api/*', apiKeyAuth());

  // Baggage middleware for execution API - extracts context from API key authentication
  app.use('*', async (c, next) => {
    // Get the API key context if available (set by auth middleware)
    const executionContext = c.get('executionContext');

    if (!executionContext) {
      // No API key context, skip baggage setup
      logger.debug({}, 'Empty execution context');
      return next();
    }

    const { tenantId, projectId, agentId } = executionContext;

    // Extract conversation ID from parsed body if present
    let conversationId: string | undefined;
    const requestBody = c.get('requestBody') || {};
    if (requestBody) {
      conversationId = requestBody.conversationId;
      if (!conversationId) {
        logger.debug({ requestBody }, 'No conversation ID found in request body');
      }
    }

    const entries = Object.fromEntries(
      Object.entries({
        'agent.id': agentId,
        'tenant.id': tenantId,
        'project.id': projectId,
        'conversation.id': conversationId,
      }).filter((entry): entry is [string, string] => {
        const [, v] = entry;
        return typeof v === 'string' && v.length > 0;
      })
    );

    if (!Object.keys(entries).length) {
      logger.debug({}, 'Empty entries for baggage');
      return next();
    }

    const bag = Object.entries(entries).reduce(
      (b, [key, value]) => b.setEntry(key, { value: value || '' }),
      propagation.getBaggage(otelContext.active()) ?? propagation.createBaggage()
    );

    const ctxWithBag = propagation.setBaggage(otelContext.active(), bag);
    return await otelContext.with(ctxWithBag, async () => await next());
  });

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

  // Mount execution routes - API key provides tenant, project, and agent context
  app.route('/v1/chat', chatRoutes);
  app.route('/api', chatDataRoutes);
  app.route('/v1/mcp', mcpRoutes);
  app.route('/agents', agentRoutes);

  // Setup OpenAPI documentation endpoints (/openapi.json and /docs)
  setupOpenAPIRoutes(app);

  app.use('/tenants/*', async (_c, next) => {
    await next();
    await flushBatchProcessor();
  });
  app.use('/agents/*', async (_c, next) => {
    await next();
    await flushBatchProcessor();
  });
  app.use('/v1/*', async (_c, next) => {
    await next();
    await flushBatchProcessor();
  });
  app.use('/api/*', async (_c, next) => {
    await next();
    await flushBatchProcessor();
  });

  const baseApp = new Hono();
  baseApp.route('/', app);

  return baseApp;
}

export { createExecutionHono };
