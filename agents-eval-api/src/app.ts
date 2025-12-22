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
import { workflowRoutes } from './workflow/routes';

const logger = getLogger('agents-eval-api');

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
  // Mount at /.well-known - routes inside define /workflow/v1/flow etc.
  app.route('/.well-known', workflowRoutes);

  // Handle /index POST - Vercel Queue delivers CloudEvents here
  // Forward to the workflow flow handler using real HTTP fetch (not app.fetch)
  // to preserve the full path for workflow handler resolution
  app.post('/index', async (c) => {
    const originalUrl = new URL(c.req.url);
    
    // Read the original body
    const bodyBuffer = await c.req.arrayBuffer();
    
    // Determine the target endpoint based on the topic
    // Topic is in CloudEvents header (ce-subject) or in the body
    // Note: ce-type is usually generic (e.g. "com.vercel.queue.message"), not the topic
    const ceType = c.req.header('ce-type') || c.req.header('Ce-Type');
    const ceSubject = c.req.header('ce-subject') || c.req.header('Ce-Subject');
    let topic = ceSubject;
    
    console.log('[QUEUE-CALLBACK] CloudEvents headers:', {
      'ce-type': ceType,
      'ce-subject': ceSubject,
    });
    
    // For Vercel Queue CloudEvents, the workflow topic is in body.data.topic
    // Always parse body to get the topic (headers may not have it)
    try {
      const bodyText = new TextDecoder().decode(bodyBuffer);
      const body = JSON.parse(bodyText);
      console.log('[QUEUE-CALLBACK] CloudEvents body fields:', {
        type: body.type,
        subject: body.subject,
        'data.topic': body.data?.topic,
        'data.subject': body.data?.subject,
      });
      // Prioritize body.data.topic for Vercel Queue, then fall back to other fields
      if (!topic) {
        topic = body.data?.topic || body.subject || body.data?.subject;
      }
    } catch (err) {
      console.log('[QUEUE-CALLBACK] Failed to parse body for topic:', err);
    }
    
    console.log('[QUEUE-CALLBACK] Resolved topic:', topic);
    
    // Route based on topic prefix:
    // - __wkf_step_* -> /step endpoint
    // - __wkf_workflow_* -> /flow endpoint (default)
    const isStepTopic = topic?.startsWith('__wkf_step_');
    const fullPath = isStepTopic 
      ? '/.well-known/workflow/v1/step'
      : '/.well-known/workflow/v1/flow';
    const targetUrl = new URL(fullPath, originalUrl.origin);

    console.log('[QUEUE-CALLBACK] forwarding CloudEvent to', targetUrl.pathname, { topic, isStepTopic });

    // Build a new Request with the exact full URL
    const forwardedRequest = new Request(targetUrl.toString(), {
      method: 'POST',
      headers: new Headers(c.req.raw.headers),
      body: bodyBuffer,
    });

    // Pass to the runtime fetch
    return fetch(forwardedRequest);
  });

  // Setup OpenAPI documentation endpoints (/openapi.json and /docs)
  setupOpenAPIRoutes(app);

  const baseApp = new Hono();
  baseApp.route('/', app);

  return baseApp;
}

export { createEvaluationHono };
