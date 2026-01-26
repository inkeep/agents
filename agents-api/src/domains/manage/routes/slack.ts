/**
 * Slack App Routes
 *
 * Handles Slack workspace installation and user connection:
 * - GET /install - Redirects to Slack's OAuth page for workspace install
 * - GET /oauth_redirect - Handles callback from Slack workspace install
 * - POST /connect - Creates Nango session for user-level Slack connection
 * - POST /nango-webhook - Handles Nango auth webhooks
 * - POST /commands - Handles /inkeep slash commands
 *
 * Step 1: Workspace installation (direct Slack OAuth)
 * Step 2: User connection (via Nango OAuth)
 */

import crypto from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { listProjectsWithMetadataPaginated } from '@inkeep/agents-core';
import { Nango } from '@nangohq/node';
import manageDbClient from '../../../data/db/manageDbClient';
import runDbClient from '../../../data/db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import type { ManageAppVariables } from '../../../types/app';

/**
 * Get Nango client for Slack integration.
 * Uses NANGO_SLACK_SECRET_KEY if set, otherwise falls back to NANGO_SECRET_KEY.
 * This allows isolating Slack auth from MCP auth in separate Nango environments.
 */
const getSlackNango = () => {
  const secretKey = env.NANGO_SLACK_SECRET_KEY || env.NANGO_SECRET_KEY;
  if (!secretKey) {
    throw new Error('NANGO_SLACK_SECRET_KEY or NANGO_SECRET_KEY is required for Slack integration');
  }
  return new Nango({ secretKey });
};

/**
 * Get the Slack integration ID from environment.
 * Uses NANGO_SLACK_INTEGRATION_ID (default: 'slack-agent').
 */
const getSlackIntegrationId = () => {
  return env.NANGO_SLACK_INTEGRATION_ID || 'slack-agent';
};

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();
const logger = getLogger('slack-routes');

const SlackWorkspaceResponseSchema = z
  .object({
    ok: z.boolean(),
    teamId: z.string().optional(),
    teamName: z.string().optional(),
    teamDomain: z.string().optional(),
    enterpriseId: z.string().optional(),
    enterpriseName: z.string().optional(),
    isEnterpriseInstall: z.boolean().optional(),
    botUserId: z.string().optional(),
    botToken: z.string().optional(),
    botScopes: z.string().optional(),
    installerUserId: z.string().optional(),
    installedAt: z.string().optional(),
    error: z.string().optional(),
  })
  .openapi('SlackWorkspaceResponse');

app.openapi(
  createRoute({
    method: 'get',
    path: '/install',
    summary: 'Initiate Slack app installation',
    description:
      'Redirects users to Slack OAuth page to install the bot in their workspace. This is a public endpoint.',
    operationId: 'slack-install',
    tags: ['Slack'],
    responses: {
      302: {
        description: 'Redirect to Slack OAuth authorization page',
      },
      500: {
        description: 'Missing Slack configuration',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() }),
          },
        },
      },
    },
  }),
  async (c) => {
    const clientId = env.SLACK_CLIENT_ID;
    const appUrl = env.SLACK_APP_URL || env.INKEEP_AGENTS_API_URL;

    if (!clientId) {
      logger.error({}, 'Missing SLACK_CLIENT_ID environment variable');
      return c.json({ error: 'Missing Slack configuration: SLACK_CLIENT_ID' }, 500);
    }

    if (!appUrl) {
      logger.error({}, 'Missing SLACK_APP_URL environment variable');
      return c.json({ error: 'Missing Slack configuration: SLACK_APP_URL' }, 500);
    }

    const scopes = ['commands', 'chat:write', 'users:read', 'team:read'].join(',');

    const slackUrl = new URL('https://slack.com/oauth/v2/authorize');
    slackUrl.searchParams.set('client_id', clientId);
    slackUrl.searchParams.set('scope', scopes);
    slackUrl.searchParams.set('redirect_uri', `${appUrl}/manage/slack/oauth_redirect`);

    logger.info(
      { clientId, redirectUri: `${appUrl}/manage/slack/oauth_redirect` },
      'Initiating Slack OAuth'
    );

    return c.redirect(slackUrl.toString(), 302);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/oauth_redirect',
    summary: 'Slack OAuth callback handler',
    description:
      'Handles the OAuth callback from Slack after workspace admin installs the bot. Exchanges authorization code for access token.',
    operationId: 'slack-oauth-redirect',
    tags: ['Slack'],
    request: {
      query: z.object({
        code: z.string().optional(),
        error: z.string().optional(),
        state: z.string().optional(),
      }),
    },
    responses: {
      302: {
        description: 'Redirect to UI with installation result',
      },
      400: {
        description: 'OAuth error',
        content: {
          'application/json': {
            schema: z.object({ error: z.string() }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { code, error } = c.req.valid('query');
    const appUrl = env.SLACK_APP_URL || env.INKEEP_AGENTS_API_URL;
    const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';

    if (error) {
      logger.error({ error }, 'Slack OAuth error from callback');
      const redirectUrl = new URL(`/default/slack-app`, manageUiUrl);
      redirectUrl.searchParams.set('error', error);
      return c.redirect(redirectUrl.toString(), 302);
    }

    if (!code) {
      logger.error({}, 'Missing authorization code in callback');
      const redirectUrl = new URL(`/default/slack-app`, manageUiUrl);
      redirectUrl.searchParams.set('error', 'missing_code');
      return c.redirect(redirectUrl.toString(), 302);
    }

    try {
      const clientId = env.SLACK_CLIENT_ID;
      const clientSecret = env.SLACK_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        logger.error({}, 'Missing Slack credentials for token exchange');
        const redirectUrl = new URL(`/default/slack-app`, manageUiUrl);
        redirectUrl.searchParams.set('error', 'missing_credentials');
        return c.redirect(redirectUrl.toString(), 302);
      }

      logger.info({}, 'Exchanging Slack authorization code for access token');

      const response = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: `${appUrl}/manage/slack/oauth_redirect`,
        }),
      });

      const data = await response.json();

      console.log('=== SLACK OAUTH RESPONSE ===');
      console.log(JSON.stringify(data, null, 2));
      console.log('============================');

      if (!data.ok) {
        logger.error({ error: data.error }, 'Slack OAuth token exchange failed');
        const redirectUrl = new URL(`/default/slack-app`, manageUiUrl);
        redirectUrl.searchParams.set('error', data.error || 'token_exchange_failed');
        return c.redirect(redirectUrl.toString(), 302);
      }

      const {
        team,
        enterprise,
        access_token,
        bot_user_id,
        authed_user,
        scope,
        is_enterprise_install,
      } = data;

      let teamDomain = '';
      try {
        const teamInfo = await fetch('https://slack.com/api/team.info', {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        const teamData = await teamInfo.json();
        if (teamData.ok) {
          teamDomain = teamData.team?.domain || '';
        }
        console.log('=== SLACK TEAM INFO ===');
        console.log(JSON.stringify(teamData, null, 2));
        console.log('=======================');
      } catch (e) {
        logger.warn({ error: e }, 'Could not fetch team info');
      }

      const workspaceData: z.infer<typeof SlackWorkspaceResponseSchema> = {
        ok: true,
        teamId: team?.id,
        teamName: team?.name,
        teamDomain,
        enterpriseId: enterprise?.id,
        enterpriseName: enterprise?.name,
        isEnterpriseInstall: is_enterprise_install || false,
        botUserId: bot_user_id,
        botToken: access_token,
        botScopes: scope,
        installerUserId: authed_user?.id,
        installedAt: new Date().toISOString(),
      };

      logger.info(
        { teamId: team?.id, teamName: team?.name },
        'Slack workspace installation successful'
      );

      const redirectUrl = new URL(`/default/slack-app`, manageUiUrl);
      redirectUrl.searchParams.set('success', 'true');
      redirectUrl.searchParams.set('workspace', JSON.stringify(workspaceData));

      return c.redirect(redirectUrl.toString(), 302);
    } catch (err) {
      logger.error({ error: err }, 'OAuth callback processing failed');
      const redirectUrl = new URL(`/default/slack-app`, manageUiUrl);
      redirectUrl.searchParams.set('error', 'server_error');
      return c.redirect(redirectUrl.toString(), 302);
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/workspaces',
    summary: 'List installed Slack workspaces (stub)',
    description:
      'Returns workspaces from localStorage data passed by client. This is a placeholder for future DB integration.',
    operationId: 'slack-list-workspaces',
    tags: ['Slack'],
    responses: {
      200: {
        description: 'List of workspaces',
        content: {
          'application/json': {
            schema: z.object({
              workspaces: z.array(SlackWorkspaceResponseSchema),
              message: z.string(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    return c.json({
      workspaces: [],
      message:
        'Workspaces are currently stored in browser localStorage. DB integration coming in next step.',
    });
  }
);

const SlackUserLinkSchema = z
  .object({
    slackUserId: z.string(),
    slackTeamId: z.string(),
    slackUsername: z.string().optional(),
    slackDisplayName: z.string().optional(),
    slackEmail: z.string().optional(),
    slackAvatarUrl: z.string().optional(),
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
  })
  .openapi('SlackUserLink');

app.post('/connect', async (c) => {
  try {
    const { userId, userEmail, userName, tenantId } = await c.req.json();

    if (!userId) {
      return c.json({ error: 'userId is required' }, 400);
    }

    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();

    const response = await nango.createConnectSession({
      end_user: {
        id: userId,
        email: userEmail,
        display_name: userName,
      },
      organization: {
        id: tenantId || 'default',
        display_name: tenantId || 'Default Organization',
      },
      allowed_integrations: [integrationId],
    });

    console.log('=== NANGO CONNECT SESSION CREATED ===');
    console.log({ userId, userEmail, userName, tenantId, integrationId });
    console.log('=====================================');

    logger.info({ userId, userEmail, tenantId }, 'Created Nango connect session');

    return c.json({
      sessionToken: response.data.token,
      expiresAt: response.data.expires_at,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create Nango connect session');
    return c.json({ error: 'Failed to create connection session' }, 500);
  }
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
          try {
            const userInfoResponse = await fetch(
              `https://slack.com/api/users.info?user=${slackUserId}`,
              {
                headers: { Authorization: `Bearer ${accessToken}` },
              }
            );
            const userInfo = await userInfoResponse.json();

            console.log('=== SLACK USER INFO ===');
            console.log(JSON.stringify(userInfo, null, 2));
            console.log('=======================');

            if (userInfo.ok && userInfo.user) {
              slackUsername = userInfo.user.name || '';
              slackDisplayName =
                userInfo.user.profile?.display_name || userInfo.user.real_name || '';
              slackEmail = userInfo.user.profile?.email || '';
              isSlackAdmin = userInfo.user.is_admin || false;
              isSlackOwner = userInfo.user.is_owner || false;
            }
          } catch (e) {
            logger.warn({ error: e }, 'Could not fetch Slack user info');
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

        await nango.updateMetadata(integrationId, connectionId, {
          linked_at: userLink.linkedAt,
          app_user_id: endUser.endUserId,
          app_user_email: endUser.endUserEmail,
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

function verifySlackRequest(
  signingSecret: string,
  requestBody: string,
  timestamp: string,
  signature: string
): boolean {
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp, 10)) > 60 * 5) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${requestBody}`;
  const mySignature = `v0=${crypto.createHmac('sha256', signingSecret).update(sigBasestring).digest('hex')}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function findConnectionBySlackUser(slackUserId: string): Promise<{
  connectionId: string;
  appUserId: string;
  appUserEmail: string;
  slackDisplayName: string;
  linkedAt: string;
} | null> {
  try {
    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();

    const connections = await nango.listConnections();

    const matchingConnections: Array<{
      connectionId: string;
      appUserId: string;
      appUserEmail: string;
      slackDisplayName: string;
      linkedAt: string;
    }> = [];

    for (const conn of connections.connections) {
      if (conn.provider_config_key === integrationId) {
        try {
          const fullConn = await nango.getConnection(integrationId, conn.connection_id);
          const metadata = fullConn.metadata as Record<string, string> | undefined;

          if (metadata?.slack_user_id === slackUserId) {
            matchingConnections.push({
              connectionId: conn.connection_id,
              appUserId: metadata.app_user_id || '',
              appUserEmail: metadata.app_user_email || '',
              slackDisplayName: metadata.slack_display_name || metadata.slack_username || '',
              linkedAt: metadata.linked_at || '',
            });
          }
        } catch {}
      }
    }

    if (matchingConnections.length === 0) {
      return null;
    }

    if (matchingConnections.length > 1) {
      console.log('=== MULTIPLE CONNECTIONS FOUND FOR SLACK USER ===');
      console.log(JSON.stringify(matchingConnections, null, 2));
      console.log('=================================================');

      matchingConnections.sort(
        (a, b) => new Date(b.linkedAt).getTime() - new Date(a.linkedAt).getTime()
      );
    }

    return matchingConnections[0];
  } catch (error) {
    logger.error({ error }, 'Failed to find connection by Slack user');
    return null;
  }
}

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

  const params = new URLSearchParams(body);
  const command = params.get('command') || '';
  const text = params.get('text') || '';
  const slackUserId = params.get('user_id') || '';
  const userName = params.get('user_name') || '';
  const teamId = params.get('team_id') || '';
  const teamDomain = params.get('team_domain') || '';

  console.log('=== SLACK COMMAND RECEIVED ===');
  console.log({ command, text, slackUserId, userName, teamId, teamDomain });
  console.log('==============================');

  const subcommand = text.trim().toLowerCase().split(' ')[0];
  const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';
  const dashboardUrl = `${manageUiUrl}/default/slack-app`;

  switch (subcommand) {
    case 'link': {
      const existingConnection = await findConnectionBySlackUser(slackUserId);

      if (existingConnection) {
        return c.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ *Already Connected!*\n\nYour Slack account is linked to Inkeep.\n\n*Inkeep Account:* ${existingConnection.appUserEmail}\n*Linked:* ${new Date(existingConnection.linkedAt).toLocaleDateString()}`,
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '📊 View Dashboard', emoji: true },
                  url: dashboardUrl,
                },
              ],
            },
          ],
        });
      }

      return c.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🔗 *Connect your Inkeep account*\n\nTo link your Slack account to Inkeep:\n1. Click the button below to open the dashboard\n2. Sign in to your Inkeep account\n3. Click "Connect Slack Account"\n4. Authorize the connection',
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '🔗 Go to Inkeep Dashboard', emoji: true },
                url: dashboardUrl,
                style: 'primary',
              },
            ],
          },
        ],
      });
    }

    case 'status': {
      const connection = await findConnectionBySlackUser(slackUserId);

      if (connection) {
        return c.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ *Connected to Inkeep*\n\n*Slack User:* @${userName}\n*Inkeep Account:* ${connection.appUserEmail}\n*Linked:* ${new Date(connection.linkedAt).toLocaleDateString()}\n\nYou can now use Inkeep from Slack!`,
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '📊 View Dashboard', emoji: true },
                  url: dashboardUrl,
                },
              ],
            },
          ],
        });
      }

      return c.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `❌ *Not Connected*\n\n*Slack User:* @${userName}\n*Team:* ${teamDomain}\n\nUse \`/inkeep link\` to connect your Inkeep account.`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '🔗 Connect Now', emoji: true },
                url: dashboardUrl,
                style: 'primary',
              },
            ],
          },
        ],
      });
    }

    case 'logout':
    case 'disconnect': {
      const connection = await findConnectionBySlackUser(slackUserId);

      if (!connection) {
        return c.json({
          response_type: 'ephemeral',
          text: '❌ No connection found. You are not currently linked to an Inkeep account.',
        });
      }

      try {
        const nango = getSlackNango();
        const integrationId = getSlackIntegrationId();
        await nango.deleteConnection(integrationId, connection.connectionId);

        logger.info(
          { slackUserId, connectionId: connection.connectionId },
          'User disconnected from Slack'
        );

        return c.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '✅ *Logged out successfully*\n\nYour Slack account has been unlinked from Inkeep.\n\nUse `/inkeep link` to reconnect anytime.',
              },
            },
          ],
        });
      } catch (error) {
        logger.error({ error, slackUserId }, 'Failed to disconnect user');
        return c.json({
          response_type: 'ephemeral',
          text: '❌ Failed to logout. Please try again or visit the dashboard.',
        });
      }
    }

    case 'list': {
      const connection = await findConnectionBySlackUser(slackUserId);

      if (!connection) {
        return c.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '❌ *Not Connected*\n\nYou need to link your Inkeep account first.\n\nUse `/inkeep link` to connect.',
              },
            },
          ],
        });
      }

      try {
        const tenantId = 'default';
        const listProjects = listProjectsWithMetadataPaginated(runDbClient, manageDbClient);
        const result = await listProjects({
          tenantId,
          pagination: { limit: 10 },
        });

        const projects = result.data || [];

        if (projects.length === 0) {
          return c.json({
            response_type: 'ephemeral',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `📋 *Your Inkeep Projects*\n\n*Account:* ${connection.appUserEmail}\n\n_No projects found. Create one in the dashboard!_`,
                },
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: '➕ Create Project', emoji: true },
                    url: `${manageUiUrl}/default/projects`,
                    style: 'primary',
                  },
                ],
              },
            ],
          });
        }

        const projectList = projects
          .slice(0, 10)
          .map(
            (p) =>
              `• *${p.name || p.id}* (\`${p.id}\`)${p.description ? `\n  _${p.description}_` : ''}`
          )
          .join('\n');

        return c.json({
          response_type: 'ephemeral',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `📋 *Your Inkeep Projects*\n\n*Account:* ${connection.appUserEmail}\n\n${projectList}${projects.length > 10 ? `\n\n_...and ${projects.length - 10} more_` : ''}`,
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '📊 View All in Dashboard', emoji: true },
                  url: `${manageUiUrl}/default/projects`,
                },
              ],
            },
          ],
        });
      } catch (error) {
        logger.error({ error }, 'Failed to fetch projects');
        return c.json({
          response_type: 'ephemeral',
          text: '❌ Failed to fetch projects. Please try again or visit the dashboard.',
        });
      }
    }

    case 'help':
    default: {
      return c.json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Inkeep Slack Commands*\n\nAvailable commands:',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '• `/inkeep link` - Connect your Slack account to Inkeep\n• `/inkeep status` - Check your connection status\n• `/inkeep list` - List your Inkeep projects\n• `/inkeep logout` - Unlink your account\n• `/inkeep help` - Show this help message',
            },
          },
        ],
      });
    }
  }
});

app.get('/workspace-info', async (c) => {
  const connectionId = c.req.query('connectionId');

  if (!connectionId) {
    return c.json({ error: 'connectionId is required' }, 400);
  }

  try {
    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();

    const connection = await nango.getConnection(integrationId, connectionId);
    const accessToken = (connection as { credentials?: { access_token?: string } }).credentials
      ?.access_token;

    if (!accessToken) {
      return c.json({ error: 'No access token found' }, 404);
    }

    const [teamResponse, channelsResponse] = await Promise.all([
      fetch('https://slack.com/api/team.info', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch('https://slack.com/api/conversations.list?types=public_channel&limit=20', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);

    const teamData = await teamResponse.json();
    const channelsData = await channelsResponse.json();

    console.log('=== SLACK WORKSPACE INFO ===');
    console.log({ team: teamData.ok, channels: channelsData.ok });
    console.log('============================');

    return c.json({
      team: teamData.ok
        ? {
            id: teamData.team?.id,
            name: teamData.team?.name,
            domain: teamData.team?.domain,
            icon: teamData.team?.icon?.image_68,
            url: teamData.team?.url,
          }
        : null,
      channels: channelsData.ok
        ? channelsData.channels?.map(
            (ch: { id: string; name: string; num_members?: number; is_member?: boolean }) => ({
              id: ch.id,
              name: ch.name,
              memberCount: ch.num_members,
              isBotMember: ch.is_member,
            })
          )
        : [],
    });
  } catch (error) {
    logger.error({ error, connectionId }, 'Failed to fetch Slack workspace info');
    return c.json({ error: 'Failed to fetch workspace info' }, 500);
  }
});

app.post('/events', async (c) => {
  const contentType = c.req.header('content-type') || '';
  let body: Record<string, unknown>;

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await c.req.text();
    const params = new URLSearchParams(formData);
    const payload = params.get('payload');

    if (payload) {
      body = JSON.parse(payload);
    } else {
      body = Object.fromEntries(params.entries());
    }
  } else {
    body = await c.req.json();
  }

  console.log('=== SLACK EVENT RECEIVED ===');
  console.log(JSON.stringify(body, null, 2));
  console.log('============================');

  const eventType = body.type as string | undefined;

  if (eventType === 'url_verification') {
    logger.info({}, 'Responding to Slack URL verification challenge');
    return c.text(String(body.challenge));
  }

  if (eventType === 'event_callback') {
    const event = body.event as { type?: string; user?: string } | undefined;

    console.log('=== SLACK EVENT CALLBACK ===');
    console.log(JSON.stringify(event, null, 2));
    console.log('============================');

    if (event?.type === 'app_home_opened') {
      logger.info({ userId: event.user }, 'App home opened');
    }
  }

  if (eventType === 'block_actions' || eventType === 'interactive_message') {
    console.log('=== SLACK INTERACTIVE EVENT ===');
    console.log('Received interactive event, acknowledging');
    console.log('================================');
  }

  return c.json({ ok: true });
});

export default app;
