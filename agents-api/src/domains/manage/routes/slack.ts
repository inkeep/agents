/**
 * Slack App Installation Routes
 *
 * Handles Slack workspace OAuth installation flow:
 * - GET /install - Redirects to Slack's OAuth page
 * - GET /oauth_redirect - Handles callback from Slack, exchanges code for token
 *
 * For Step 1: Using direct Slack OAuth (not Nango) for workspace installation.
 * The response is returned as JSON and query params for the UI to capture.
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import type { ManageAppVariables } from '../../../types/app';

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

export default app;
