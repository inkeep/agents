/**
 * Slack OAuth Routes
 *
 * Endpoints for Slack workspace installation via OAuth:
 * - GET /install - Redirect to Slack OAuth page
 * - GET /oauth_redirect - Handle OAuth callback
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { createWorkAppSlackWorkspace } from '@inkeep/agents-core';
import runDbClient from '../../db/runDbClient';
import { env } from '../../env';
import { getLogger } from '../../logger';
import {
  computeWorkspaceConnectionId,
  getBotTokenForTeam,
  getSlackClient,
  getSlackTeamInfo,
  getSlackUserInfo,
  setBotTokenForTeam,
  storeWorkspaceInstallation,
} from '../services';
import type { WorkAppsVariables } from '../types';

const logger = getLogger('slack-oauth');

const app = new OpenAPIHono<{ Variables: WorkAppsVariables }>();

export { getBotTokenForTeam, setBotTokenForTeam };

app.openapi(
  createRoute({
    method: 'get',
    path: '/install',
    summary: 'Install Slack App',
    description: 'Redirects to Slack OAuth page for workspace installation',
    operationId: 'slack-install',
    tags: ['Work Apps', 'Slack', 'OAuth'],
    responses: {
      302: {
        description: 'Redirect to Slack OAuth',
      },
    },
  }),
  (c) => {
    const clientId = env.SLACK_CLIENT_ID;
    const redirectUri = `${env.SLACK_APP_URL}/work-apps/slack/oauth_redirect`;

    const botScopes = [
      'app_mentions:read',
      'channels:history',
      'channels:read',
      'chat:write',
      'chat:write.public',
      'commands',
      'groups:history',
      'groups:read',
      'im:history',
      'im:read',
      'im:write',
      'team:read',
      'users:read',
      'users:read.email',
    ].join(',');

    const slackAuthUrl = new URL('https://slack.com/oauth/v2/authorize');
    slackAuthUrl.searchParams.set('client_id', clientId || '');
    slackAuthUrl.searchParams.set('scope', botScopes);
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
    tags: ['Work Apps', 'Slack', 'OAuth'],
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
    const dashboardUrl = `${manageUiUrl}/default/work-apps/slack`;

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
          redirect_uri: `${env.SLACK_APP_URL}/work-apps/slack/oauth_redirect`,
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

      logger.debug({ teamInfo }, 'Retrieved Slack team info');

      const installerUserId = tokenData.authed_user?.id;
      let installerUserName: string | undefined;
      if (installerUserId) {
        try {
          const userInfo = await getSlackUserInfo(client, installerUserId);
          installerUserName = userInfo?.realName || userInfo?.name;
        } catch {
          logger.warn({ installerUserId }, 'Could not fetch installer user info');
        }
      }

      const workspaceData = {
        ok: true,
        teamId: tokenData.team?.id,
        teamName: tokenData.team?.name,
        teamDomain: teamInfo?.domain,
        workspaceUrl: teamInfo?.url,
        workspaceIconUrl: teamInfo?.icon,
        enterpriseId: tokenData.enterprise?.id,
        enterpriseName: tokenData.enterprise?.name,
        isEnterpriseInstall: tokenData.is_enterprise_install || false,
        botUserId: tokenData.bot_user_id,
        botToken: tokenData.access_token,
        botScopes: tokenData.scope,
        installerUserId,
        installerUserName,
        appId: tokenData.app_id,
        installedAt: new Date().toISOString(),
      };

      if (workspaceData.teamId && workspaceData.botToken) {
        const tenantId = 'default';

        const nangoResult = await storeWorkspaceInstallation({
          teamId: workspaceData.teamId,
          teamName: workspaceData.teamName,
          teamDomain: workspaceData.teamDomain,
          workspaceUrl: workspaceData.workspaceUrl,
          workspaceIconUrl: workspaceData.workspaceIconUrl,
          enterpriseId: workspaceData.enterpriseId,
          enterpriseName: workspaceData.enterpriseName,
          botUserId: workspaceData.botUserId,
          botToken: workspaceData.botToken,
          botScopes: workspaceData.botScopes,
          installerUserId: workspaceData.installerUserId,
          installerUserName: workspaceData.installerUserName,
          isEnterpriseInstall: workspaceData.isEnterpriseInstall,
          appId: workspaceData.appId,
          tenantId,
          installationSource: 'dashboard',
        });

        if (nangoResult.success && nangoResult.connectionId) {
          logger.info(
            { teamId: workspaceData.teamId, connectionId: nangoResult.connectionId },
            'Stored workspace installation in Nango'
          );

          try {
            await createWorkAppSlackWorkspace(runDbClient)({
              tenantId,
              slackTeamId: workspaceData.teamId,
              slackEnterpriseId: workspaceData.enterpriseId,
              slackAppId: workspaceData.appId,
              slackTeamName: workspaceData.teamName,
              nangoConnectionId: nangoResult.connectionId,
              status: 'active',
            });
            logger.info(
              { teamId: workspaceData.teamId, tenantId },
              'Persisted workspace installation to database'
            );
          } catch (dbError) {
            const dbErrorMessage = dbError instanceof Error ? dbError.message : String(dbError);
            if (
              dbErrorMessage.includes('duplicate key') ||
              dbErrorMessage.includes('unique constraint')
            ) {
              logger.info(
                { teamId: workspaceData.teamId, tenantId },
                'Workspace already exists in database'
              );
            } else {
              logger.error(
                { error: dbErrorMessage, teamId: workspaceData.teamId },
                'Failed to persist workspace to database'
              );
            }
          }
        } else {
          logger.warn(
            { teamId: workspaceData.teamId },
            'Failed to store in Nango, falling back to memory'
          );
        }

        setBotTokenForTeam(workspaceData.teamId, {
          botToken: workspaceData.botToken,
          teamName: workspaceData.teamName || '',
          installedAt: workspaceData.installedAt,
        });
      }

      logger.info(
        { teamId: workspaceData.teamId, teamName: workspaceData.teamName },
        'Slack workspace installation successful'
      );

      const safeWorkspaceData = {
        ok: workspaceData.ok,
        teamId: workspaceData.teamId,
        teamName: workspaceData.teamName,
        teamDomain: workspaceData.teamDomain,
        enterpriseId: workspaceData.enterpriseId,
        enterpriseName: workspaceData.enterpriseName,
        isEnterpriseInstall: workspaceData.isEnterpriseInstall,
        botUserId: workspaceData.botUserId,
        botScopes: workspaceData.botScopes,
        installerUserId: workspaceData.installerUserId,
        installedAt: workspaceData.installedAt,
        connectionId: workspaceData.teamId
          ? computeWorkspaceConnectionId({
              teamId: workspaceData.teamId,
              enterpriseId: workspaceData.enterpriseId,
            })
          : undefined,
      };

      const encodedData = encodeURIComponent(JSON.stringify(safeWorkspaceData));
      return c.redirect(`${dashboardUrl}?success=true&workspace=${encodedData}`);
    } catch (err) {
      logger.error({ error: err }, 'Slack OAuth callback error');
      return c.redirect(`${dashboardUrl}?error=callback_error`);
    }
  }
);

export default app;
