import { createHash, timingSafeEqual } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import { startSchedulerWorkflow } from '../domains/run/services/SchedulerService';
import { env } from '../env';
import { getLogger } from '../logger';
import type { AppVariables } from '../types';

const logger = getLogger('deploy-restart-scheduler');

function constantTimeEqual(a: string, b: string): boolean {
  const hash = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(hash(a), hash(b));
}

export const restartWorkflowHandler = new OpenAPIHono<{ Variables: AppVariables }>();

restartWorkflowHandler.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/api/deploy/restart-scheduler',
    tags: ['Workflows'],
    summary: 'Restart scheduler workflow on new deployment',
    description:
      'Called by CI after deploy to restart the scheduler workflow on the latest deployment. Auth via INKEEP_AGENTS_RUN_API_BYPASS_SECRET.',
    permission: noAuth(),
    responses: {
      200: { description: 'Scheduler workflow restarted' },
      401: { description: 'Unauthorized' },
      503: { description: 'Endpoint not available' },
    },
  }),
  async (c) => {
    if (!env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET) {
      return c.json({ error: 'Endpoint not available' }, 503);
    }

    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || !constantTimeEqual(token, env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      const result = await startSchedulerWorkflow();
      logger.info(result, 'Scheduler workflow restarted via deploy hook');
      return c.json(result);
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to restart scheduler workflow'
      );
      return c.json({ error: 'Failed to restart scheduler workflow' }, 500);
    }
  }
);
