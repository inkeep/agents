import { OpenAPIHono, z } from '@hono/zod-openapi';
import { getStaleWorkflowExecutions, updateWorkflowExecutionStatus } from '@inkeep/agents-core';
import { createProtectedRoute, inheritedRunApiKeyAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';

const logger = getLogger('workflowCleanup');

const app = new OpenAPIHono();

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/workflows/cleanup-stale',
    summary: 'Clean up stale suspended workflows',
    description:
      'Finds workflows that have been suspended longer than the configured timeout and marks them as failed.',
    operationId: 'cleanup-stale-workflows',
    tags: ['Workflows'],
    security: [{ bearerAuth: [] }],
    permission: inheritedRunApiKeyAuth(),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              timeoutMinutes: z
                .number()
                .int()
                .positive()
                .default(30)
                .describe('Minutes after which a suspended workflow is considered stale'),
              limit: z
                .number()
                .int()
                .positive()
                .max(1000)
                .default(100)
                .describe('Maximum number of stale workflows to clean up'),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Cleanup results',
        content: {
          'application/json': {
            schema: z.object({
              cleanedUp: z.number(),
            }),
          },
        },
      },
      400: {
        description: 'Invalid request',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() }),
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { timeoutMinutes, limit } = c.req.valid('json');

    const staleBefore = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

    const staleExecutions = await getStaleWorkflowExecutions(runDbClient)({
      staleBefore,
      limit,
    });

    const now = new Date().toISOString();
    let cleanedUp = 0;

    await Promise.all(
      staleExecutions.map(async (execution) => {
        try {
          await updateWorkflowExecutionStatus(runDbClient)({
            tenantId: execution.tenantId,
            projectId: execution.projectId,
            id: execution.id,
            status: 'failed',
            metadata: {
              ...(execution.metadata as Record<string, unknown> | undefined),
              failureReason: 'approval_timeout',
              timedOutAt: now,
            },
          });
          cleanedUp++;
        } catch (error) {
          logger.error(
            { executionId: execution.id, error },
            'Failed to clean up stale workflow execution'
          );
        }
      })
    );

    logger.info(
      { cleanedUp, total: staleExecutions.length, timeoutMinutes },
      'Stale workflow cleanup completed'
    );

    return c.json({ cleanedUp }, 200);
  }
);

export default app;
