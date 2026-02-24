import { OpenAPIHono, z } from '@hono/zod-openapi';
import { signSlackUserToken } from '@inkeep/agents-core';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import { getLogger } from '../../logger';
import { getSlackClient } from '../services/client';
import { streamAgentResponse } from '../services/events/streaming';
import { findCachedUserMapping } from '../services/events/utils';
import { findWorkspaceConnectionByTeamId } from '../services/nango';
import type { WorkAppsVariables } from '../types';

const logger = getLogger('slack-internal');

const app = new OpenAPIHono<{ Variables: WorkAppsVariables }>();

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/retry-pending-auth',
    summary: 'Retry a pending agent conversation after user completes tool authentication',
    description: 'Called internally after tool-auth-completed to re-invoke the agent in Slack.',
    operationId: 'internal-slack-retry-pending-auth',
    tags: ['Internal'],
    permission: noAuth(),
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              channel: z.string(),
              threadTs: z.string(),
              teamId: z.string(),
              slackUserId: z.string(),
              agentName: z.string(),
              conversationId: z.string(),
              agentId: z.string(),
              tenantId: z.string(),
              projectId: z.string(),
              toolName: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'OK',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      },
    },
  }),
  async (c) => {
    const {
      channel,
      threadTs,
      teamId,
      slackUserId,
      agentName,
      conversationId,
      agentId,
      tenantId,
      projectId,
      toolName,
    } = c.req.valid('json');

    logger.info(
      { channel, threadTs, teamId, slackUserId, agentId, conversationId, toolName },
      'Retrying pending auth conversation'
    );

    try {
      const workspace = await findWorkspaceConnectionByTeamId(teamId);
      if (!workspace) {
        logger.warn({ teamId }, 'No workspace connection found for retry');
        return c.json({ success: false });
      }

      const slackClient = getSlackClient(workspace.botToken);

      const userMapping = await findCachedUserMapping(tenantId, slackUserId, teamId);
      if (!userMapping) {
        logger.warn({ tenantId, slackUserId, teamId }, 'No user mapping found for retry');
        return c.json({ success: false });
      }

      const slackUserToken = await signSlackUserToken({
        inkeepUserId: userMapping.inkeepUserId,
        tenantId,
        slackTeamId: teamId,
        slackUserId,
        slackAuthorized: true,
        slackAuthorizedProjectId: projectId,
      });

      const continuationPrompt =
        `The user has connected their ${toolName} account. ` +
        `Please retry the previous request that required ${toolName}.`;

      await streamAgentResponse({
        slackClient,
        channel,
        threadTs,
        thinkingMessageTs: '',
        slackUserId,
        teamId,
        jwtToken: slackUserToken,
        projectId,
        agentId,
        question: continuationPrompt,
        agentName,
        conversationId,
      });

      logger.info({ channel, threadTs, conversationId, toolName }, 'Retry stream completed');

      return c.json({ success: true });
    } catch (error) {
      logger.error(
        { error, channel, threadTs, conversationId },
        'Failed to retry pending auth conversation'
      );
      return c.json({ success: false });
    }
  }
);

export default app;
