/**
 * Slack App Routes
 *
 * Handles Slack workspace installation and user connection:
 * - GET /install - Redirects to Slack's OAuth page for workspace install
 * - GET /oauth_redirect - Handles callback from Slack workspace install
 * - POST /connect - Creates Nango session for user-level Slack connection
 * - POST /nango-webhook - Handles Nango auth webhooks
 * - POST /commands - Handles /inkeep slash commands
 * - POST /events - Handles Slack events & interactivity
 * - GET /workspace-info - Fetch workspace info via Nango
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import type { ManageAppVariables } from '../../../types/app';
import {
  createConnectSession,
  deleteConnection,
  findConnectionByAppUser,
  getConnectionAccessToken,
  getConnectionStatus,
  getSlackChannels,
  getSlackClient,
  getSlackIntegrationId,
  getSlackNango,
  getSlackTeamInfo,
  getSlackUserInfo,
  handleCommand,
  parseSlackCommandBody,
  parseSlackEventBody,
  type SlackCommandPayload,
  updateConnectionMetadata,
  verifySlackRequest,
} from '../services/slack';

const logger = getLogger('slack-routes');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const SlackUserLinkSchema = z.object({
  slackUserId: z.string(),
  slackTeamId: z.string(),
  slackUsername: z.string().optional(),
  slackDisplayName: z.string().optional(),
  slackEmail: z.string().optional(),
  isSlackAdmin: z.boolean().optional(),
  isSlackOwner: z.boolean().optional(),
  enterpriseId: z.string().optional(),
  enterpriseName: z.string().optional(),
  appUserId: z.string(),
  appUserEmail: z.string().optional(),
  appUserName: z.string().optional(),
  nangoConnectionId: z.string(),
  isLinked: z.boolean(),
  linkedAt: z.string().optional(),
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/install',
    summary: 'Install Slack App',
    description: 'Redirects to Slack OAuth page for workspace installation',
    operationId: 'slack-install',
    tags: ['Slack'],
    responses: {
      302: {
        description: 'Redirect to Slack OAuth',
      },
    },
  }),
  (c) => {
    const clientId = env.SLACK_CLIENT_ID;
    const redirectUri = `${env.SLACK_APP_URL}/manage/slack/oauth_redirect`;
    const scopes = 'commands,chat:write,users:read,team:read,users:read.email,channels:read';

    const slackAuthUrl = new URL('https://slack.com/oauth/v2/authorize');
    slackAuthUrl.searchParams.set('client_id', clientId || '');
    slackAuthUrl.searchParams.set('scope', scopes);
    slackAuthUrl.searchParams.set('redirect_uri', redirectUri);

    logger.info({ redirectUri }, 'Redirecting to Slack OAuth');

    return c.redirect(slackAuthUrl.toString());
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/oauth_redirect',
    summary: 'Slack OAuth Callback',
    description: 'Handles the OAuth callback from Slack after workspace installation',
    operationId: 'slack-oauth-redirect',
    tags: ['Slack'],
    request: {
      query: z.object({
        code: z.string().optional(),
        error: z.string().optional(),
      }),
    },
    responses: {
      302: {
        description: 'Redirect to dashboard with workspace data',
      },
    },
  }),
  async (c) => {
    const { code, error } = c.req.valid('query');
    const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';
    const dashboardUrl = `${manageUiUrl}/default/slack-app`;

    if (error) {
      logger.error({ error }, 'Slack OAuth error');
      return c.redirect(`${dashboardUrl}?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      logger.error({}, 'No code provided in OAuth callback');
      return c.redirect(`${dashboardUrl}?error=no_code`);
    }

    try {
      const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.SLACK_CLIENT_ID || '',
          client_secret: env.SLACK_CLIENT_SECRET || '',
          code,
          redirect_uri: `${env.SLACK_APP_URL}/manage/slack/oauth_redirect`,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenData.ok) {
        logger.error({ error: tokenData.error }, 'Slack token exchange failed');
        return c.redirect(
          `${dashboardUrl}?error=${encodeURIComponent(tokenData.error || 'token_exchange_failed')}`
        );
      }

      const client = getSlackClient(tokenData.access_token);
      const teamInfo = await getSlackTeamInfo(client);

      console.log('=== SLACK TEAM INFO ===');
      console.log(JSON.stringify(teamInfo, null, 2));
      console.log('=======================');

      const workspaceData = {
        ok: true,
        teamId: tokenData.team?.id,
        teamName: tokenData.team?.name,
        teamDomain: teamInfo?.domain,
        enterpriseId: tokenData.enterprise?.id,
        enterpriseName: tokenData.enterprise?.name,
        isEnterpriseInstall: tokenData.is_enterprise_install || false,
        botUserId: tokenData.bot_user_id,
        botToken: tokenData.access_token,
        botScopes: tokenData.scope,
        installerUserId: tokenData.authed_user?.id,
        installedAt: new Date().toISOString(),
      };

      logger.info(
        { teamId: workspaceData.teamId, teamName: workspaceData.teamName },
        'Slack workspace installation successful'
      );

      const encodedData = encodeURIComponent(JSON.stringify(workspaceData));
      return c.redirect(`${dashboardUrl}?success=true&workspace=${encodedData}`);
    } catch (err) {
      logger.error({ error: err }, 'Slack OAuth callback error');
      return c.redirect(`${dashboardUrl}?error=callback_error`);
    }
  }
);

app.post('/connect', async (c) => {
  const body = await c.req.json();
  const { userId, userEmail, userName, tenantId } = body as {
    userId?: string;
    userEmail?: string;
    userName?: string;
    tenantId?: string;
  };

  if (!userId) {
    return c.json({ error: 'userId is required' }, 400);
  }

  console.log('=== NANGO CONNECT SESSION CREATED ===');
  console.log({
    userId,
    userEmail,
    userName,
    integrationId: getSlackIntegrationId(),
  });
  console.log('=====================================');

  const session = await createConnectSession({
    userId,
    userEmail,
    userName,
    tenantId: tenantId || 'default',
  });

  if (!session) {
    return c.json({ error: 'Failed to create session' }, 500);
  }

  return c.json(session);
});

app.post('/nango-webhook', async (c) => {
  const body = await c.req.text();

  let payload: {
    type: string;
    success?: boolean;
    connectionId?: string;
    providerConfigKey?: string;
    endUser?: {
      endUserId: string;
      endUserEmail?: string;
      displayName?: string;
    };
    organization?: {
      id: string;
      displayName?: string;
    };
  };

  try {
    payload = JSON.parse(body);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  console.log('=== NANGO WEBHOOK RECEIVED ===');
  console.log(JSON.stringify(payload, null, 2));
  console.log('==============================');

  if (payload.type === 'auth' && payload.success && payload.endUser && payload.connectionId) {
    const { endUser, connectionId } = payload;
    const integrationId = getSlackIntegrationId();

    try {
      const nango = getSlackNango();
      const connection = await nango.getConnection(integrationId, connectionId);

      const rawResponse = (connection as { credentials?: { raw?: unknown } }).credentials?.raw as {
        ok?: boolean;
        authed_user?: { id: string };
        bot_user_id?: string;
        team?: { id: string; name: string };
        enterprise?: { id: string; name: string };
        access_token?: string;
        scope?: string;
        is_enterprise_install?: boolean;
      };

      console.log('=== NANGO CONNECTION INFO ===');
      console.log(JSON.stringify(rawResponse, null, 2));
      console.log('=============================');

      if (rawResponse?.ok && rawResponse.access_token) {
        const slackUserId = rawResponse.authed_user?.id || '';
        const slackTeamId = rawResponse.team?.id || '';
        const accessToken = rawResponse.access_token;

        let slackUsername = '';
        let slackDisplayName = '';
        let slackEmail = '';
        let isSlackAdmin = false;
        let isSlackOwner = false;

        if (slackUserId && accessToken) {
          const client = getSlackClient(accessToken);
          const userInfo = await getSlackUserInfo(client, slackUserId);

          if (userInfo) {
            slackUsername = userInfo.name || '';
            slackDisplayName = userInfo.displayName || userInfo.realName || '';
            slackEmail = userInfo.email || '';
            isSlackAdmin = userInfo.isAdmin || false;
            isSlackOwner = userInfo.isOwner || false;
          }
        }

        const userLink: z.infer<typeof SlackUserLinkSchema> = {
          slackUserId,
          slackTeamId,
          slackUsername,
          slackDisplayName,
          slackEmail,
          isSlackAdmin,
          isSlackOwner,
          enterpriseId: rawResponse.enterprise?.id,
          enterpriseName: rawResponse.enterprise?.name,
          appUserId: endUser.endUserId,
          appUserEmail: endUser.endUserEmail,
          appUserName: endUser.displayName,
          nangoConnectionId: connectionId,
          isLinked: true,
          linkedAt: new Date().toISOString(),
        };

        const tenantId = payload.organization?.id || 'default';

        await updateConnectionMetadata(connectionId, {
          linked_at: userLink.linkedAt || '',
          app_user_id: endUser.endUserId,
          app_user_email: endUser.endUserEmail || '',
          tenant_id: tenantId,
          slack_user_id: slackUserId,
          slack_team_id: slackTeamId,
          slack_team_name: rawResponse.team?.name || '',
          slack_username: slackUsername,
          slack_display_name: slackDisplayName,
          slack_email: slackEmail,
          is_slack_admin: String(isSlackAdmin),
          is_slack_owner: String(isSlackOwner),
          enterprise_id: rawResponse.enterprise?.id || '',
          enterprise_name: rawResponse.enterprise?.name || '',
        });

        console.log('=== USER LINK CREATED (ENRICHED) ===');
        console.log(JSON.stringify(userLink, null, 2));
        console.log('====================================');

        logger.info(
          { appUserId: endUser.endUserId, slackUserId, slackEmail },
          'User linked to Slack with enriched metadata'
        );
      }
    } catch (error) {
      logger.error({ error, connectionId }, 'Failed to process Nango webhook');
    }
  }

  return c.json({ received: true });
});

app.post('/commands', async (c) => {
  const body = await c.req.text();
  const timestamp = c.req.header('x-slack-request-timestamp') || '';
  const signature = c.req.header('x-slack-signature') || '';

  if (env.SLACK_SIGNING_SECRET) {
    if (!verifySlackRequest(env.SLACK_SIGNING_SECRET, body, timestamp, signature)) {
      logger.error({}, 'Invalid Slack request signature');
      return c.json({ response_type: 'ephemeral', text: 'Invalid request signature' }, 401);
    }
  }

  const params = parseSlackCommandBody(body);

  const payload: SlackCommandPayload = {
    command: params.command || '',
    text: params.text || '',
    userId: params.user_id || '',
    userName: params.user_name || '',
    teamId: params.team_id || '',
    teamDomain: params.team_domain || '',
    channelId: params.channel_id || '',
    channelName: params.channel_name || '',
    responseUrl: params.response_url || '',
    triggerId: params.trigger_id || '',
  };

  const response = await handleCommand(payload);
  return c.json(response);
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

    console.log('=== SLACK WORKSPACE INFO ===');
    console.log({ team: !!team, channelCount: channels.length });
    console.log('============================');

    return c.json({ team, channels });
  } catch (error) {
    logger.error({ error, connectionId }, 'Failed to fetch Slack workspace info');
    return c.json({ error: 'Failed to fetch workspace info' }, 500);
  }
});

app.post('/events', async (c) => {
  const contentType = c.req.header('content-type') || '';
  const body = await c.req.text();

  let eventBody: Record<string, unknown>;
  try {
    eventBody = parseSlackEventBody(body, contentType);
  } catch {
    return c.json({ error: 'Invalid payload' }, 400);
  }

  console.log('=== SLACK EVENT RECEIVED ===');
  console.log(JSON.stringify(eventBody, null, 2));
  console.log('============================');

  const eventType = eventBody.type as string | undefined;

  if (eventType === 'url_verification') {
    logger.info({}, 'Responding to Slack URL verification challenge');
    return c.text(String(eventBody.challenge));
  }

  if (eventType === 'event_callback') {
    const event = eventBody.event as { type?: string; user?: string } | undefined;

    console.log('=== SLACK EVENT CALLBACK ===');
    console.log(JSON.stringify(event, null, 2));
    console.log('============================');

    if (event?.type === 'app_home_opened') {
      logger.info({ userId: event.user }, 'App home opened');
    }

    if (event?.type === 'app_mention') {
      logger.info({ userId: event.user }, 'Bot was mentioned');
    }
  }

  if (eventType === 'block_actions' || eventType === 'interactive_message') {
    console.log('=== SLACK INTERACTIVE EVENT ===');
    console.log('Received interactive event, acknowledging');
    console.log('================================');
  }

  return c.json({ ok: true });
});

app.get('/status', async (c) => {
  const appUserId = c.req.query('userId');

  if (!appUserId) {
    return c.json({ error: 'userId is required' }, 400);
  }

  try {
    const status = await getConnectionStatus(appUserId);

    console.log('=== SLACK CONNECTION STATUS ===');
    console.log({ appUserId, connected: status.connected });
    console.log('===============================');

    return c.json(status);
  } catch (error) {
    logger.error({ error, appUserId }, 'Failed to get connection status');
    return c.json({ error: 'Failed to get connection status' }, 500);
  }
});

app.post('/disconnect', async (c) => {
  const body = await c.req.json();
  const { userId, connectionId } = body as { userId?: string; connectionId?: string };

  if (!userId && !connectionId) {
    return c.json({ error: 'Either userId or connectionId is required' }, 400);
  }

  try {
    let targetConnectionId = connectionId;

    if (!targetConnectionId && userId) {
      const connection = await findConnectionByAppUser(userId);
      if (connection) {
        targetConnectionId = connection.connectionId;
      }
    }

    if (!targetConnectionId) {
      return c.json({ error: 'No connection found for this user' }, 404);
    }

    const success = await deleteConnection(targetConnectionId);

    if (!success) {
      return c.json({ error: 'Failed to delete connection' }, 500);
    }

    console.log('=== SLACK DISCONNECTION ===');
    console.log({ userId, connectionId: targetConnectionId, success: true });
    console.log('===========================');

    logger.info({ userId, connectionId: targetConnectionId }, 'User disconnected from Slack');

    return c.json({ success: true, connectionId: targetConnectionId });
  } catch (error) {
    logger.error({ error, userId, connectionId }, 'Failed to disconnect from Slack');
    return c.json({ error: 'Failed to disconnect' }, 500);
  }
});

export default app;
