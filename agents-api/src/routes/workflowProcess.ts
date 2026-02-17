import { OpenAPIHono } from '@hono/zod-openapi';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import type { AppVariables } from '../types';

export const workflowProcessHandler = new OpenAPIHono<{ Variables: AppVariables }>();

workflowProcessHandler.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/api/workflow/process',
    tags: ['Workflows'],
    summary: 'Process workflow jobs',
    description: 'Keeps the workflow worker active to process queued jobs (called by cron)',
    permission: noAuth(),
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
