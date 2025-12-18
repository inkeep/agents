
import './workflow-bootstrap';
import { world } from './workflow';

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { handleApiError } from '@inkeep/agents-core';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import type { StatusCode } from 'hono/utils/http-status';
import { pinoLogger } from 'hono-pino';
import { env } from './env';
import { getLogger } from './logger';
import { apiKeyAuth } from './middleware/auth';
import { setupOpenAPIRoutes } from './openapi';
import evaluationsRoutes from './routes/evaluations';
import { workflowRoutes } from './workflow/routes';

const logger = getLogger('agents-eval-api');

// Only start the workflow worker if we're running as the main eval-api server
// Skip if we're being imported as a library (e.g., by agents-run-api)
// The SKIP_WORKFLOW_WORKER env var allows run-api to import without starting worker
if (!process.env.SKIP_WORKFLOW_WORKER) {
  world.start?.().then(() => {
    logger.info({}, 'Workflow worker started');
  }).catch((err: unknown) => {
    logger.error({ error: err }, 'Failed to start workflow worker');
  });
}

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

  // Debug endpoint to check workflow environment
  app.get('/debug/workflow-env', (c) => {
    // Get ALL VERCEL_* env vars to diagnose system env var exposure
    const allVercelEnvVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('VERCEL_')) {
        // Mask sensitive values
        if (key.includes('TOKEN') || key.includes('SECRET') || key.includes('KEY')) {
          allVercelEnvVars[key] = value ? '[SET]' : '[NOT SET]';
        } else {
          allVercelEnvVars[key] = value || '[NOT SET]';
        }
      }
    }
    
    return c.json({
      // All VERCEL_* env vars found
      allVercelEnvVars,
      // Specific workflow config
      WORKFLOW_TARGET_WORLD: process.env.WORKFLOW_TARGET_WORLD || '[NOT SET]',
      WORKFLOW_VERCEL_AUTH_TOKEN: process.env.WORKFLOW_VERCEL_AUTH_TOKEN ? '[SET]' : '[NOT SET]',
      WORKFLOW_VERCEL_BASE_URL: process.env.WORKFLOW_VERCEL_BASE_URL || '[NOT SET]',
      // Request context (to verify which deployment we're hitting)
      requestUrl: c.req.url,
    });
  });

  // Debug endpoint to check workflow run status
  app.get('/debug/workflow-run/:runId', async (c) => {
    const runId = c.req.param('runId');
    try {
      // Try to get run status from world
      const status = await world.runs?.status?.(runId);
      return c.json({ runId, status, error: null });
    } catch (err: any) {
      return c.json({ 
        runId, 
        status: null, 
        error: err?.message || String(err),
        errorName: err?.name,
      });
    }
  });

  // Workflow process endpoint - called by Vercel cron to keep worker active
  // The worker processes queued jobs while this request is active
  app.openapi(
    createRoute({
      method: 'get',
      path: '/api/workflow/process',
      tags: ['workflow'],
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

  // API Key authentication middleware for protected routes
  app.use('/tenants/*', apiKeyAuth());

  // Mount evaluation routes under tenant scope
  app.route('/tenants/:tenantId/projects/:projectId/evaluations', evaluationsRoutes);

  // Mount workflow routes for internal workflow execution
  // The postgres world's internal local world calls these endpoints
  app.route('/.well-known/workflow', workflowRoutes);

  // Handle /index POST - Vercel Queue delivers CloudEvents here
  // Forward to the workflow flow handler using real HTTP fetch (not app.fetch)
  // to preserve the full path for workflow handler resolution
  app.post('/index', async (c) => {
    const originalUrl = new URL(c.req.url);
    const forwardUrl = new URL('/.well-known/workflow/v1/flow', originalUrl.origin);

    console.log('[QUEUE-CALLBACK] forwarding CloudEvent to', forwardUrl.pathname);

    // Create a new Request object with the original body
    const forwardedRequest = new Request(forwardUrl.toString(), {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: await c.req.arrayBuffer(),
    });

    // Use global fetch to bypass Hono's internal path normalization
    return fetch(forwardedRequest);
  });

  // Setup OpenAPI documentation endpoints (/openapi.json and /docs)
  setupOpenAPIRoutes(app);

  const baseApp = new Hono();
  baseApp.route('/', app);

  return baseApp;
}

export { createEvaluationHono };
