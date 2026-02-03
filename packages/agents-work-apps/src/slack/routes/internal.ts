/**
 * Slack Internal/Debug Routes
 *
 * Endpoints for internal operations and debugging:
 * - POST /register-workspace - Register workspace bot token (memory cache)
 * - POST /debug/generate-token - Generate test tokens (dev only)
 * - GET /workspace-info - Get workspace info from Nango
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { env } from '../../env';
import { getLogger } from '../../logger';
import {
  getConnectionAccessToken,
  getSlackChannels,
  getSlackClient,
  getSlackTeamInfo,
} from '../services';
import type { WorkAppsVariables } from '../types';
import { setBotTokenForTeam } from './oauth';

const logger = getLogger('slack-internal');

const app = new OpenAPIHono<{ Variables: WorkAppsVariables }>();

app.post('/register-workspace', async (c) => {
  const body = await c.req.json();
  const { teamId, teamName, botToken } = body as {
    teamId?: string;
    teamName?: string;
    botToken?: string;
  };

  if (!teamId) {
    return c.json({ error: 'teamId is required' }, 400);
  }

  if (!botToken) {
    return c.json({ error: 'botToken is required' }, 400);
  }

  setBotTokenForTeam(teamId, {
    botToken,
    teamName: teamName || '',
    installedAt: new Date().toISOString(),
  });

  logger.info({ teamId, teamName }, 'Registered workspace bot token');

  return c.json({ success: true, teamId });
});

app.get('/workspace-info', async (c) => {
  const connectionId = c.req.query('connectionId');

  if (!connectionId) {
    return c.json({ error: 'connectionId is required' }, 400);
  }

  try {
    const accessToken = await getConnectionAccessToken(connectionId);

    if (!accessToken) {
      return c.json({ error: 'No access token found' }, 404);
    }

    const client = getSlackClient(accessToken);
    const [team, channels] = await Promise.all([
      getSlackTeamInfo(client),
      getSlackChannels(client, 20),
    ]);

    logger.debug(
      { hasTeam: !!team, channelCount: channels.length },
      'Retrieved Slack workspace info'
    );

    return c.json({ team, channels });
  } catch (error) {
    logger.error({ error, connectionId }, 'Failed to fetch Slack workspace info');
    return c.json({ error: 'Failed to fetch workspace info' }, 500);
  }
});

app.post('/debug/generate-token', async (c) => {
  if (env.ENVIRONMENT === 'production') {
    return c.json({ error: 'This endpoint is not available in production' }, 403);
  }

  const body = await c.req.json();
  const { userId, tenantId, slackUserId, slackTeamId, slackEnterpriseId } = body as {
    userId?: string;
    tenantId?: string;
    slackUserId?: string;
    slackTeamId?: string;
    slackEnterpriseId?: string;
  };

  if (!userId) {
    return c.json({ error: 'userId is required' }, 400);
  }
  if (!slackUserId) {
    return c.json({ error: 'slackUserId is required' }, 400);
  }
  if (!slackTeamId) {
    return c.json({ error: 'slackTeamId is required' }, 400);
  }

  try {
    const { signSlackUserToken } = await import('@inkeep/agents-core');

    const token = await signSlackUserToken({
      inkeepUserId: userId,
      tenantId: tenantId || 'default',
      slackTeamId,
      slackUserId,
      slackEnterpriseId,
    });

    logger.info(
      { userId, tenantId: tenantId || 'default', slackTeamId, slackUserId },
      'Generated Slack user token for debugging'
    );

    return c.json({
      token,
      expiresIn: '5m',
      tokenType: 'slackUser',
      payload: {
        sub: userId,
        tenantId: tenantId || 'default',
        slack: {
          teamId: slackTeamId,
          userId: slackUserId,
          enterpriseId: slackEnterpriseId,
        },
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, 'Failed to generate Slack user token');
    return c.json({ error: `Failed to generate token: ${errorMessage}` }, 500);
  }
});

export default app;
