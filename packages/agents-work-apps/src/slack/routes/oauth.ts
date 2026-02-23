/**
 * Slack OAuth Routes
 *
 * Endpoints for Slack workspace installation via OAuth:
 * - GET /install - Redirect to Slack OAuth page
 * - GET /oauth_redirect - Handle OAuth callback
 */

import * as crypto from 'node:crypto';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { createWorkAppSlackWorkspace } from '@inkeep/agents-core';
import { createProtectedRoute, noAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../db/runDbClient';
import { env } from '../../env';
import { getLogger } from '../../logger';
import {
  clearWorkspaceConnectionCache,
  computeWorkspaceConnectionId,
  deleteWorkspaceInstallation,
  getBotTokenForTeam,
  getSlackClient,
  getSlackTeamInfo,
  getSlackUserInfo,
  setBotTokenForTeam,
  storeWorkspaceInstallation,
} from '../services';
import type { WorkAppsVariables } from '../types';

const logger = getLogger('slack-oauth');

const STATE_TTL_MS = 10 * 60 * 1000;

const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';

interface OAuthState {
  nonce: string;
  tenantId?: string;
  timestamp: number;
}

export function getStateSigningSecret(): string {
  const secret = env.SLACK_SIGNING_SECRET;
  if (!secret) {
    if (env.ENVIRONMENT === 'production') {
      throw new Error('SLACK_SIGNING_SECRET is required in production for OAuth state signing');
    }
    logger.warn(
      {},
      'SLACK_SIGNING_SECRET not set, using insecure default. DO NOT USE IN PRODUCTION!'
    );
    return 'insecure-dev-oauth-state-secret-change-in-production';
  }
  return secret;
}

export function createOAuthState(tenantId?: string): string {
  const state: OAuthState = {
    nonce: crypto.randomBytes(16).toString('hex'),
    tenantId: tenantId || '',
    timestamp: Date.now(),
  };
  const data = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getStateSigningSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

export function parseOAuthState(stateStr: string): OAuthState | null {
  try {
    const [data, signature] = stateStr.split('.');
    if (!data || !signature) {
      logger.warn({}, 'OAuth state missing signature');
      return null;
    }

    const expectedSignature = crypto
      .createHmac('sha256', getStateSigningSecret())
      .update(data)
      .digest('base64url');

    if (
      signature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    ) {
      logger.warn({}, 'Invalid OAuth state signature');
      return null;
    }

    const decoded = Buffer.from(data, 'base64url').toString('utf-8');
    const state = JSON.parse(decoded) as OAuthState;

    if (!state.nonce || !state.timestamp) {
      logger.warn(
        { hasNonce: !!state.nonce, hasTimestamp: !!state.timestamp },
        'OAuth state missing required fields'
      );
      return null;
    }

    if (Date.now() - state.timestamp > STATE_TTL_MS) {
      logger.warn({ timestamp: state.timestamp }, 'OAuth state expired');
      return null;
    }

    return state;
  } catch {
    logger.warn({ stateStr: stateStr?.slice(0, 20) }, 'Failed to parse OAuth state');
    return null;
  }
}

const app = new OpenAPIHono<{ Variables: WorkAppsVariables }>();

export { getBotTokenForTeam, setBotTokenForTeam };

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/install',
    summary: 'Install Slack App',
    description: 'Redirects to Slack OAuth page for workspace installation',
    operationId: 'slack-install',
    tags: ['Work Apps', 'Slack', 'OAuth'],
    permission: noAuth(),
    request: {
      query: z.object({
        tenant_id: z.string().optional(),
      }),
    },
    responses: {
      302: {
        description: 'Redirect to Slack OAuth',
      },
    },
  }),
  (c) => {
    const { tenant_id: tenantId } = c.req.valid('query');
    const clientId = env.SLACK_CLIENT_ID;
    const redirectUri = `${env.SLACK_APP_URL}/work-apps/slack/oauth_redirect`;

    const botScopes = [
      'app_mentions:read',
      'channels:history',
      'channels:read',
      'chat:write',
      'chat:write.public',
      'commands',
      'files:write',
      'groups:history',
      'groups:read',
      'im:history',
      'im:read',
      'im:write',
      'team:read',
      'users:read',
      'users:read.email',
    ].join(',');

    const state = createOAuthState(tenantId);

    const slackAuthUrl = new URL('https://slack.com/oauth/v2/authorize');
    slackAuthUrl.searchParams.set('client_id', clientId || '');
    slackAuthUrl.searchParams.set('scope', botScopes);
    slackAuthUrl.searchParams.set('redirect_uri', redirectUri);
    slackAuthUrl.searchParams.set('state', state);

    logger.info({ redirectUri, tenantId: tenantId || '' }, 'Redirecting to Slack OAuth');

    return c.redirect(slackAuthUrl.toString());
  }
);

app.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/oauth_redirect',
    summary: 'Slack OAuth Callback',
    description: 'Handles the OAuth callback from Slack after workspace installation',
    operationId: 'slack-oauth-redirect',
    tags: ['Work Apps', 'Slack', 'OAuth'],
    permission: noAuth(),
    request: {
      query: z.object({
        code: z.string().optional(),
        error: z.string().optional(),
        state: z.string().optional(),
      }),
    },
    responses: {
      302: {
        description: 'Redirect to dashboard with workspace data',
      },
    },
  }),
  async (c) => {
    const { code, error, state: stateParam } = c.req.valid('query');

    const parsedState = stateParam ? parseOAuthState(stateParam) : null;
    const tenantId = parsedState?.tenantId || '';
    const dashboardUrl = `${manageUiUrl}/${tenantId}/work-apps/slack`;

    if (!stateParam || !parsedState) {
      logger.error({ hasState: !!stateParam }, 'Invalid or missing OAuth state parameter');
      return c.redirect(`${dashboardUrl}?error=invalid_state`);
    }

    if (error) {
      logger.error({ error }, 'Slack OAuth error');
      return c.redirect(`${dashboardUrl}?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      logger.error({}, 'No code provided in OAuth callback');
      return c.redirect(`${dashboardUrl}?error=no_code`);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      let tokenResponse: Response;
      try {
        tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: env.SLACK_CLIENT_ID || '',
            client_secret: env.SLACK_CLIENT_SECRET || '',
            code,
            redirect_uri: `${env.SLACK_APP_URL}/work-apps/slack/oauth_redirect`,
          }),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(timeout);
        if ((fetchErr as Error).name === 'AbortError') {
          logger.error({}, 'Slack token exchange timed out');
          return c.redirect(`${dashboardUrl}?error=timeout`);
        }
        throw fetchErr;
      } finally {
        clearTimeout(timeout);
      }

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
        clearWorkspaceConnectionCache(workspaceData.teamId);

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
            const isDuplicate =
              dbErrorMessage.includes('duplicate key') ||
              dbErrorMessage.includes('unique constraint');

            if (isDuplicate) {
              logger.info(
                { teamId: workspaceData.teamId, tenantId },
                'Workspace already exists in database'
              );
            } else {
              const pgCode =
                dbError && typeof dbError === 'object' && 'code' in dbError
                  ? (dbError as { code: string }).code
                  : undefined;

              logger.error(
                {
                  err: dbError,
                  dbErrorMessage,
                  pgCode,
                  teamId: workspaceData.teamId,
                  tenantId,
                  connectionId: nangoResult.connectionId,
                },
                'Failed to persist workspace to database, rolling back Nango connection'
              );
              try {
                await deleteWorkspaceInstallation(nangoResult.connectionId);
              } catch (rollbackError) {
                logger.error(
                  { err: rollbackError, connectionId: nangoResult.connectionId },
                  'Failed to rollback Nango connection after DB failure'
                );
              }
              return c.redirect(`${dashboardUrl}?error=installation_failed`);
            }
          }
        } else {
          logger.warn(
            {
              teamId: workspaceData.teamId,
              tenantId,
              nangoSuccess: nangoResult.success,
              nangoError: 'error' in nangoResult ? nangoResult.error : undefined,
            },
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
      logger.error({ err, tenantId }, 'Slack OAuth callback error');
      return c.redirect(`${dashboardUrl}?error=callback_error`);
    }
  }
);

export default app;
