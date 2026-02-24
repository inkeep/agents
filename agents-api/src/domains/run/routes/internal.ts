import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  deletePendingToolAuth,
  findPendingToolAuthByUserAndTool,
  findWorkAppSlackUserMappingBySlackUser,
  getInProcessFetch,
  insertPendingToolAuth,
} from '@inkeep/agents-core';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';

const logger = getLogger('internal-tool-auth');

const app = new OpenAPIHono();

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/pending-tool-auth',
    summary: 'Store a pending tool auth request from a Slack conversation',
    description:
      'Called internally by the Slack streaming handler when a tool-auth-required event is emitted.',
    operationId: 'internal-store-pending-tool-auth',
    tags: ['Internal'],
    permission: noAuth(),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              toolId: z.string(),
              toolName: z.string(),
              tenantId: z.string(),
              projectId: z.string(),
              conversationId: z.string(),
              agentId: z.string(),
              slackUserId: z.string(),
              channel: z.string(),
              threadTs: z.string(),
              teamId: z.string(),
              agentName: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'OK',
        content: { 'application/json': { schema: z.object({ stored: z.boolean() }) } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid('json');

    const userMapping = await findWorkAppSlackUserMappingBySlackUser(runDbClient)(
      body.slackUserId,
      body.teamId
    );

    if (!userMapping) {
      logger.warn(
        { slackUserId: body.slackUserId, teamId: body.teamId },
        'No user mapping found for pending tool auth'
      );
      return c.json({ stored: false });
    }

    await insertPendingToolAuth(runDbClient)({
      tenantId: body.tenantId,
      projectId: body.projectId,
      userId: userMapping.inkeepUserId,
      toolId: body.toolId,
      toolName: body.toolName,
      conversationId: body.conversationId,
      agentId: body.agentId,
      surfaceType: 'slack',
      surfaceContext: {
        channel: body.channel,
        threadTs: body.threadTs,
        teamId: body.teamId,
        slackUserId: body.slackUserId,
        agentName: body.agentName,
      },
    });

    logger.info(
      { toolId: body.toolId, toolName: body.toolName, userId: userMapping.inkeepUserId },
      'Stored pending tool auth request'
    );

    return c.json({ stored: true });
  }
);

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/tool-auth-completed',
    summary: 'Notify that a user completed tool OAuth authentication',
    description:
      'Called internally after OAuth callback to trigger auto-retry of pending conversations.',
    operationId: 'internal-tool-auth-completed',
    tags: ['Internal'],
    permission: noAuth(),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              userId: z.string(),
              toolId: z.string(),
              tenantId: z.string(),
              projectId: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'OK',
        content: { 'application/json': { schema: z.object({ triggered: z.number() }) } },
      },
    },
  }),
  async (c) => {
    const { userId, toolId, tenantId, projectId } = c.req.valid('json');

    logger.info(
      { userId, toolId, tenantId, projectId },
      'Tool auth completed, checking pending requests'
    );

    const pendingRequests = await findPendingToolAuthByUserAndTool(runDbClient)(userId, toolId);

    let triggered = 0;

    for (const pending of pendingRequests) {
      if (pending.surfaceType === 'slack' && pending.surfaceContext) {
        const ctx = pending.surfaceContext as Record<string, string>;

        getInProcessFetch()(`/work-apps/slack/internal/retry-pending-auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: ctx.channel,
            threadTs: ctx.threadTs,
            teamId: ctx.teamId,
            slackUserId: ctx.slackUserId,
            agentName: ctx.agentName,
            conversationId: pending.conversationId,
            agentId: pending.agentId,
            tenantId: pending.tenantId,
            projectId: pending.projectId,
            toolName: pending.toolName,
          }),
        }).catch((err) =>
          logger.warn({ err, pendingId: pending.id }, 'Failed to trigger Slack retry')
        );

        triggered++;
      }

      await deletePendingToolAuth(runDbClient)(pending.id);
    }

    logger.info(
      { userId, toolId, triggered, total: pendingRequests.length },
      'Processed pending tool auth requests'
    );

    return c.json({ triggered });
  }
);

export default app;
