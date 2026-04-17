import { createHash, timingSafeEqual } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import {
  getStaleWorkflowExecutions,
  updateWorkflowExecutionStatus,
  type WorkflowExecutionSelect,
} from '@inkeep/agents-core';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../data/db/runDbClient';
import { env } from '../env';
import { getLogger } from '../logger';
import type { AppVariables } from '../types';

const logger = getLogger('cron-cleanup-stale-workflows');

const STALE_TIMEOUT_MINUTES = 30;
const CLEANUP_LIMIT = 100;
const CONCURRENCY_LIMIT = 10;

function constantTimeEqual(a: string, b: string): boolean {
  const hash = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(hash(a), hash(b));
}

export const cleanupStaleWorkflowsHandler = new OpenAPIHono<{ Variables: AppVariables }>();

cleanupStaleWorkflowsHandler.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/api/cron/cleanup-stale-workflows',
    tags: ['Workflows'],
    summary: 'Clean up stale suspended workflows',
    description:
      'Called by Vercel Cron to fail workflows suspended longer than 30 minutes. Auth via CRON_SECRET or INKEEP_AGENTS_RUN_API_BYPASS_SECRET.',
    permission: noAuth(),
    security: [],
    responses: {
      200: { description: 'Cleanup completed' },
      401: { description: 'Unauthorized' },
    },
  }),
  async (c) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.slice(7);
    const validSecret = env.CRON_SECRET ?? env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET;
    if (!validSecret || !constantTimeEqual(token, validSecret)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const staleBefore = new Date(Date.now() - STALE_TIMEOUT_MINUTES * 60 * 1000).toISOString();

      const staleExecutions = await getStaleWorkflowExecutions(runDbClient)({
        staleBefore,
        limit: CLEANUP_LIMIT,
      });

      if (staleExecutions.length === 0) {
        logger.info({}, 'No stale workflows to clean up');
        return c.json({ ok: true, cleanedUp: 0 });
      }

      const now = new Date().toISOString();

      const results = await Promise.allSettled(
        staleExecutions.map(async (execution: WorkflowExecutionSelect, i: number) => {
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
        { cleanedUp, failed, total: staleExecutions.length },
        'Stale workflow cleanup completed via cron'
      );
      return c.json({ ok: true, cleanedUp, failed, total: staleExecutions.length });
    } catch (err) {
      logger.error({ error: err }, 'Failed to cleanup stale workflows via cron');
      return c.json({ error: 'Cleanup failed' }, 500);
    }
  }
);
