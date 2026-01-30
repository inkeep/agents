/**
 * Run API routes for scheduled triggers.
 * Provides cancel functionality for invocations.
 */
import { Hono } from 'hono';
import {
  getScheduledTriggerInvocationById,
  markScheduledTriggerInvocationCancelled,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import type { AppVariables } from '../../../types';

const logger = getLogger('run-scheduled-triggers');

const app = new Hono<{ Variables: AppVariables }>();

/**
 * Cancel a scheduled trigger invocation
 * POST /tenants/{tenantId}/projects/{projectId}/agents/{agentId}/scheduled-triggers/{scheduledTriggerId}/invocations/{invocationId}/cancel
 */
app.post(
  '/tenants/:tenantId/projects/:projectId/agents/:agentId/scheduled-triggers/:scheduledTriggerId/invocations/:invocationId/cancel',
  async (c) => {
    const tenantId = c.req.param('tenantId');
    const projectId = c.req.param('projectId');
    const agentId = c.req.param('agentId');
    const scheduledTriggerId = c.req.param('scheduledTriggerId');
    const invocationId = c.req.param('invocationId');

    logger.debug(
      { tenantId, projectId, agentId, scheduledTriggerId, invocationId },
      'Cancelling scheduled trigger invocation'
    );

    // Get the invocation
    const invocation = await getScheduledTriggerInvocationById(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
      invocationId,
    });

    if (!invocation) {
      return c.json({ error: 'Invocation not found' }, 404);
    }

    // Check if invocation can be cancelled
    if (invocation.status === 'completed' || invocation.status === 'failed') {
      return c.json(
        { error: `Cannot cancel invocation with status: ${invocation.status}` },
        400
      );
    }

    if (invocation.status === 'cancelled') {
      return c.json({
        success: true,
        invocationId,
        previousStatus: 'cancelled',
      });
    }

    const previousStatus = invocation.status;

    // Mark as cancelled
    await markScheduledTriggerInvocationCancelled(runDbClient)({
      scopes: { tenantId, projectId, agentId },
      scheduledTriggerId,
      invocationId,
    });

    logger.info(
      { tenantId, projectId, agentId, scheduledTriggerId, invocationId, previousStatus },
      'Scheduled trigger invocation cancelled'
    );

    return c.json({
      success: true,
      invocationId,
      previousStatus,
    });
  }
);

export default app;
