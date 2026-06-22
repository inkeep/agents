import { createHash, timingSafeEqual } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import {
  cleanupExpiredStreamChunks,
  cleanupExpiredToolApprovalDecisions,
} from '@inkeep/agents-core';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../data/db/runDbClient';
import { env } from '../env';
import { getLogger } from '../logger';
import type { AppVariables } from '../types';

const logger = getLogger('cron-cleanup-stream-chunks');

function constantTimeEqual(a: string, b: string): boolean {
  const hash = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(hash(a), hash(b));
}

export const cleanupStreamChunksHandler = new OpenAPIHono<{ Variables: AppVariables }>();

cleanupStreamChunksHandler.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/api/cron/cleanup-stream-chunks',
    tags: ['Workflows'],
    summary: 'Clean up expired stream chunks',
    description:
      'Called by Vercel Cron to delete stream chunks older than 5 minutes. Auth via CRON_SECRET or INKEEP_AGENTS_RUN_API_BYPASS_SECRET.',
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

    // Run each cleanup independently so a failure in one doesn't skip the other,
    // and report which one(s) failed rather than a single misleading message.
    const failures: string[] = [];

    try {
      await cleanupExpiredStreamChunks(runDbClient)();
    } catch (err) {
      failures.push('stream_chunks');
      logger.error({ error: err }, 'Failed to cleanup stream chunks via cron');
    }

    try {
      await cleanupExpiredToolApprovalDecisions(runDbClient)();
    } catch (err) {
      failures.push('tool_approval_decisions');
      logger.error({ error: err }, 'Failed to cleanup tool approval decisions via cron');
    }

    if (failures.length > 0) {
      return c.json({ error: `Cleanup failed: ${failures.join(', ')}` }, 500);
    }

    logger.info({}, 'Stream chunk and tool-approval decision cleanup completed via cron');
    return c.json({ ok: true });
  }
);
