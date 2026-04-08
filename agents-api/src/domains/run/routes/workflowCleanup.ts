import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type CredentialStoreRegistry,
  type FullExecutionContext,
  getStaleWorkflowExecutions,
  updateWorkflowExecutionStatus,
  type WorkflowExecutionSelect,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedRunApiKeyAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';

type AppVariables = {
  credentialStores: CredentialStoreRegistry;
  requestBody?: any;
  executionContext: FullExecutionContext;
};

const logger = getLogger('workflowCleanup');

const app = new OpenAPIHono<{ Variables: AppVariables }>();

const CONCURRENCY_LIMIT = 10;

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
              failed: z.number(),
              total: z.number(),
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
    const executionContext = c.get('executionContext');
    const { tenantId } = executionContext;
    const { timeoutMinutes, limit } = c.req.valid('json');

    const staleBefore = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

    const staleExecutions = await getStaleWorkflowExecutions(runDbClient)({
      scopes: { tenantId },
      staleBefore,
      limit,
    });

    const now = new Date().toISOString();

    // Process in batches with concurrency limit to avoid overwhelming the connection pool
    const results = await Promise.allSettled(
      staleExecutions.map(async (execution: WorkflowExecutionSelect, i: number) => {
        // Simple concurrency gate: wait for earlier batches to finish
        const batchIndex = Math.floor(i / CONCURRENCY_LIMIT);
        if (batchIndex > 0) {
          await new Promise((resolve) => setTimeout(resolve, batchIndex * 50));
        }

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
        return execution.id;
      })
    );

    const cleanedUp = results.filter(
      (r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled'
    ).length;
    const failed = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    ).length;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        logger.error(
          {
            executionId: staleExecutions[i].id,
            tenantId: staleExecutions[i].tenantId,
            projectId: staleExecutions[i].projectId,
            error: result.reason,
          },
          'Failed to clean up stale workflow execution'
        );
      }
    }

    logger.info(
      {
        cleanedUp,
        failed,
        total: staleExecutions.length,
        timeoutMinutes,
      },
      'Stale workflow cleanup completed'
    );

    return c.json({ cleanedUp, failed, total: staleExecutions.length }, 200);
  }
);

export default app;
