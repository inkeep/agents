/**
 * Slack Events Routes
 *
 * Endpoints for handling Slack events, commands, and webhooks:
 * - POST /commands - Handle /inkeep slash commands
 * - POST /events - Handle Slack events & interactivity
 * - POST /nango-webhook - Handle Nango auth webhooks
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import {
  deleteAllWorkAppSlackChannelAgentConfigsByTeam,
  deleteAllWorkAppSlackUserMappingsByTeam,
  deleteWorkAppSlackWorkspaceByNangoConnectionId,
  getWaitUntil,
} from '@inkeep/agents-core';
import { SpanStatusCode } from '@opentelemetry/api';
import runDbClient from '../../db/runDbClient';
import { env } from '../../env';
import { getLogger } from '../../logger';
import { dispatchSlackEvent } from '../dispatcher';
import {
  findWorkspaceConnectionByTeamId,
  getSlackClient,
  getSlackIntegrationId,
  getSlackNango,
  getSlackUserInfo,
  handleCommand,
  parseSlackCommandBody,
  parseSlackEventBody,
  type SlackCommandPayload,
  updateConnectionMetadata,
  verifySlackRequest,
} from '../services';
import { SLACK_SPAN_KEYS, SLACK_SPAN_NAMES, type SlackOutcome, tracer } from '../tracer';
import type { WorkAppsVariables } from '../types';

const logger = getLogger('slack-events');

const app = new OpenAPIHono<{ Variables: WorkAppsVariables }>();

app.post('/commands', async (c) => {
  const body = await c.req.text();
  const timestamp = c.req.header('x-slack-request-timestamp') || '';
  const signature = c.req.header('x-slack-signature') || '';

  if (!env.SLACK_SIGNING_SECRET) {
    logger.error({}, 'SLACK_SIGNING_SECRET not configured - rejecting request');
    return c.json({ response_type: 'ephemeral', text: 'Server configuration error' }, 500);
  }

  if (!verifySlackRequest(env.SLACK_SIGNING_SECRET, body, timestamp, signature)) {
    logger.error({}, 'Invalid Slack request signature');
    return c.json({ response_type: 'ephemeral', text: 'Invalid request signature' }, 401);
  }

  const params = parseSlackCommandBody(body);

  const payload: SlackCommandPayload = {
    command: params.command || '',
    text: params.text || '',
    userId: params.user_id || '',
    userName: params.user_name || '',
    teamId: params.team_id || '',
    teamDomain: params.team_domain || '',
    enterpriseId: params.enterprise_id,
    channelId: params.channel_id || '',
    channelName: params.channel_name || '',
    responseUrl: params.response_url || '',
    triggerId: params.trigger_id || '',
  };

  const response = await handleCommand(payload);

  // If response is empty object, return empty body (Slack expects this to not show any message)
  if (Object.keys(response).length === 0) {
    return c.body(null, 200);
  }

  return c.json(response);
});

app.post('/events', async (c) => {
  // Slack retries event delivery when the initial ack is slow (>3s).
  // Retries include X-Slack-Retry-Num / X-Slack-Retry-Reason headers.
  // Since we fire-and-forget background work, retries would cause duplicate processing.
  const retryNum = c.req.header('x-slack-retry-num');
  const retryReason = c.req.header('x-slack-retry-reason');
  if (retryNum) {
    return tracer.startActiveSpan(`${SLACK_SPAN_NAMES.WEBHOOK} retry`, (span) => {
      span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, 'ignored_slack_retry' satisfies SlackOutcome);
      span.setAttribute('slack.retry_num', retryNum);
      if (retryReason) span.setAttribute('slack.retry_reason', retryReason);
      logger.info({ retryNum, retryReason }, 'Acknowledging Slack retry without re-processing');
      span.end();
      return c.body(null, 200);
    });
  }

  const waitUntil = await getWaitUntil();

  return tracer.startActiveSpan(SLACK_SPAN_NAMES.WEBHOOK, async (span) => {
    let outcome: SlackOutcome = 'ignored_unknown_event';

    try {
      const contentType = c.req.header('content-type') || '';
      const body = await c.req.text();
      const timestamp = c.req.header('x-slack-request-timestamp') || '';
      const signature = c.req.header('x-slack-signature') || '';

      let eventBody: Record<string, unknown>;
      try {
        eventBody = parseSlackEventBody(body, contentType);
      } catch (error) {
        outcome = 'validation_error';
        span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
        logger.error(
          { error, contentType, bodyPreview: body.slice(0, 200) },
          'Failed to parse Slack event body'
        );
        span.end();
        return c.json({ error: 'Invalid payload' }, 400);
      }

      const eventType = eventBody.type as string | undefined;
      span.setAttribute(SLACK_SPAN_KEYS.EVENT_TYPE, eventType || 'unknown');
      span.updateName(`${SLACK_SPAN_NAMES.WEBHOOK} ${eventType || 'unknown'}`);

      if (!env.SLACK_SIGNING_SECRET) {
        outcome = 'error';
        span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
        logger.error({}, 'SLACK_SIGNING_SECRET not configured - rejecting request');
        span.end();
        return c.json({ error: 'Server configuration error' }, 500);
      }

      if (!verifySlackRequest(env.SLACK_SIGNING_SECRET, body, timestamp, signature)) {
        outcome = 'signature_invalid';
        span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
        logger.error({ eventType }, 'Invalid Slack request signature');
        span.end();
        return c.json({ error: 'Invalid request signature' }, 401);
      }

      if (eventType === 'url_verification') {
        outcome = 'url_verification';
        span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
        logger.info({}, 'Responding to Slack URL verification challenge');
        span.end();
        return c.text(String(eventBody.challenge));
      }

      const registerBackgroundWork = (work: Promise<unknown>) => {
        if (waitUntil) {
          waitUntil(work);
        }
      };

      const result = await dispatchSlackEvent(
        eventType || '',
        eventBody,
        { registerBackgroundWork },
        span
      );
      outcome = result.outcome;

      if (result.response) {
        span.end();
        return c.json(result.response);
      }

      span.end();
      // Slack requires an empty body for view_submission ack (non-empty
      // bodies without a response_action cause "We had some trouble
      // connecting" errors). An empty 200 is valid for all interaction types.
      return c.body(null, 200);
    } catch (error) {
      outcome = 'error';
      span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      if (error instanceof Error) {
        span.recordException(error);
      }
      span.end();
      throw error;
    }
  });
});

app.post('/nango-webhook', async (c) => {
  const body = await c.req.text();

  // Verify Nango webhook signature — required in production
  const nangoSecret = env.NANGO_SLACK_SECRET_KEY || env.NANGO_SECRET_KEY;
  if (!nangoSecret) {
    logger.error({}, 'No Nango secret key configured — rejecting webhook');
    return c.json({ error: 'Server configuration error' }, 503);
  }

  const signature = c.req.header('x-nango-signature');
  if (!signature) {
    logger.warn({}, 'Missing Nango webhook signature');
    return c.json({ error: 'Missing signature' }, 401);
  }

  const crypto = await import('node:crypto');
  const expectedSignature = crypto.createHmac('sha256', nangoSecret).update(body).digest('hex');

  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    logger.warn({ signature }, 'Invalid Nango webhook signature');
    return c.json({ error: 'Invalid signature' }, 401);
  }

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
  } catch (error) {
    logger.error({ error, bodyPreview: body.slice(0, 200) }, 'Failed to parse Nango webhook JSON');
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  logger.debug({ payload }, 'Nango webhook received');

  if (payload.type === 'connection_deleted' && payload.connectionId && payload.providerConfigKey) {
    const { connectionId, providerConfigKey } = payload;

    if (providerConfigKey === getSlackIntegrationId()) {
      try {
        const teamMatch = connectionId.match(/T:([A-Z0-9]+)/);
        if (teamMatch) {
          const teamId = teamMatch[1];
          const workspace = await findWorkspaceConnectionByTeamId(teamId);
          const tenantId = workspace?.tenantId;

          const dbDeleted =
            await deleteWorkAppSlackWorkspaceByNangoConnectionId(runDbClient)(connectionId);
          if (dbDeleted) {
            logger.info({ connectionId }, 'Deleted workspace from database via Nango webhook');
          }

          if (tenantId) {
            const deletedMappings = await deleteAllWorkAppSlackUserMappingsByTeam(runDbClient)(
              tenantId,
              teamId
            );
            if (deletedMappings > 0) {
              logger.info({ teamId, deletedMappings }, 'Deleted user mappings via Nango webhook');
            }

            const deletedChannelConfigs = await deleteAllWorkAppSlackChannelAgentConfigsByTeam(
              runDbClient
            )(tenantId, teamId);
            if (deletedChannelConfigs > 0) {
              logger.info(
                { teamId, deletedChannelConfigs },
                'Deleted channel configs via Nango webhook'
              );
            }
          } else {
            logger.warn(
              { connectionId, teamId },
              'No tenantId found, skipping user/channel cleanup'
            );
          }

          logger.info({ connectionId, teamId }, 'Processed Nango connection deletion webhook');
        }
      } catch (error: unknown) {
        logger.error({ error, connectionId }, 'Failed to process Nango deletion webhook');
        return c.json({ error: 'Deletion processing failed' }, 500);
      }
    }

    return c.json({ received: true });
  }

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

      logger.debug({ teamId: rawResponse?.team?.id }, 'Retrieved Nango connection info');

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

        const tenantId = payload.organization?.id || '';

        await updateConnectionMetadata(connectionId, {
          linked_at: new Date().toISOString(),
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

export default app;
