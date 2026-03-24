import { OpenAPIHono, z } from '@hono/zod-openapi';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import manageDbPool from '../data/db/manageDbPool';
import runDbClient from '../data/db/runDbClient';
import type { AppVariables } from '../types';
import { checkManageDb, checkRunDb } from '../utils/healthChecks';

// Create a new Hono instance for health check routes
export const healthChecksHandler = new OpenAPIHono<{ Variables: AppVariables }>();

// Health check endpoint
healthChecksHandler.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/health',
    operationId: 'health',
    tags: ['Health'],
    summary: 'Health check',
    description: 'Check if the management service is healthy',
    permission: noAuth(),
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
healthChecksHandler.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/ready',
    operationId: 'ready',
    tags: ['Health'],
    summary: 'Readiness check',
    description:
      'Check if the service is ready to serve traffic by verifying database connectivity',
    permission: noAuth(),
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
