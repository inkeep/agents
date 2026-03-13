import { OpenAPIHono } from '@hono/zod-openapi';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import { env } from '../env';
import { startSchedulerWorkflow } from '../domains/run/services/SchedulerService';
import { getLogger } from '../logger';
import type { AppVariables } from '../types';

const logger = getLogger('deploy-restart-scheduler');

export const restartWorkflowHandler = new OpenAPIHono<{ Variables: AppVariables }>();

restartWorkflowHandler.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/api/deploy/restart-scheduler',
    tags: ['Deploy'],
    summary: 'Restart scheduler workflow on new deployment',
    description:
      'Called by CI after deploy to restart the scheduler workflow on the latest deployment. Auth via INKEEP_AGENTS_RUN_API_BYPASS_SECRET.',
    permission: noAuth(),
    responses: {
      200: { description: 'Scheduler workflow restarted' },
      401: { description: 'Unauthorized' },
    },
  }),
  async (c) => {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (token !== env.INKEEP_AGENTS_RUN_API_BYPASS_SECRET) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const result = await startSchedulerWorkflow();

    logger.info(result, 'Scheduler workflow restarted via deploy hook');

    return c.json(result);
  },
);
