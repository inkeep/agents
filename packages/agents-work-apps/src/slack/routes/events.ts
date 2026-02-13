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
} from '@inkeep/agents-core';
import { SpanStatusCode } from '@opentelemetry/api';
import runDbClient from '../../db/runDbClient';
import { env } from '../../env';
import { getLogger } from '../../logger';
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
import {
  handleAppMention,
  handleFollowUpSubmission,
  handleMessageShortcut,
  handleModalSubmission,
  handleOpenAgentSelectorModal,
  handleOpenFollowUpModal,
  sendResponseUrlMessage,
} from '../services/events';
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

      if (eventType === 'event_callback') {
        const teamId = eventBody.team_id as string | undefined;
        const event = eventBody.event as
          | {
              type?: string;
              user?: string;
              text?: string;
              channel?: string;
              ts?: string;
              thread_ts?: string;
              bot_id?: string;
              subtype?: string;
            }
          | undefined;

        const innerEventType = event?.type || 'unknown';
        span.setAttribute(SLACK_SPAN_KEYS.INNER_EVENT_TYPE, innerEventType);
        if (teamId) span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);
        if (event?.channel) span.setAttribute(SLACK_SPAN_KEYS.CHANNEL_ID, event.channel);
        if (event?.user) span.setAttribute(SLACK_SPAN_KEYS.USER_ID, event.user);
        span.updateName(`${SLACK_SPAN_NAMES.WEBHOOK} event_callback.${innerEventType}`);

        if (event?.bot_id || event?.subtype === 'bot_message') {
          outcome = 'ignored_bot_message';
          span.setAttribute(SLACK_SPAN_KEYS.IS_BOT_MESSAGE, true);
          span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
          logger.info(
            { botId: event.bot_id, subtype: event?.subtype, teamId, innerEventType },
            'Ignoring bot message'
          );
          span.end();
          return c.json({ ok: true });
        }

        if (event?.type === 'app_mention' && event.channel && event.user && teamId) {
          outcome = 'handled';
          span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
          const question = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
          span.setAttribute(SLACK_SPAN_KEYS.HAS_QUERY, question.length > 0);
          if (event.thread_ts) span.setAttribute(SLACK_SPAN_KEYS.THREAD_TS, event.thread_ts);
          if (event.ts) span.setAttribute(SLACK_SPAN_KEYS.MESSAGE_TS, event.ts);

          logger.info(
            { userId: event.user, channel: event.channel, teamId, hasQuery: question.length > 0 },
            'Handling event: app_mention'
          );

          handleAppMention({
            slackUserId: event.user,
            channel: event.channel,
            text: question,
            threadTs: event.thread_ts || event.ts || '',
            messageTs: event.ts || '',
            teamId,
          }).catch((err: unknown) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            const errorStack = err instanceof Error ? err.stack : undefined;
            logger.error(
              { errorMessage, errorStack },
              'Failed to handle app mention (outer catch)'
            );
          });
        } else {
          outcome = 'ignored_unknown_event';
          span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
          logger.info(
            { innerEventType, teamId },
            `Ignoring unhandled event_callback: ${innerEventType}`
          );
        }
      }

      if (eventType === 'block_actions' || eventType === 'interactive_message') {
        const actions = eventBody.actions as
          | Array<{
              action_id: string;
              value?: string;
            }>
          | undefined;

        const teamId = (eventBody.team as { id?: string })?.id;
        const responseUrl = eventBody.response_url as string | undefined;
        const triggerId = eventBody.trigger_id as string | undefined;
        const actionIds = actions?.map((a) => a.action_id) || [];

        if (teamId) span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);
        span.setAttribute(SLACK_SPAN_KEYS.ACTION_IDS, actionIds.join(','));
        span.updateName(`${SLACK_SPAN_NAMES.WEBHOOK} ${eventType} [${actionIds.join(',')}]`);

        if (actions && teamId) {
          let anyHandled = false;
          for (const action of actions) {
            if (action.action_id === 'open_agent_selector_modal' && action.value && triggerId) {
              anyHandled = true;
              logger.info(
                { teamId, actionId: action.action_id },
                'Handling block_action: open_agent_selector_modal'
              );
              handleOpenAgentSelectorModal({
                triggerId,
                actionValue: action.value,
                teamId,
                responseUrl: responseUrl || '',
              }).catch(async (err: unknown) => {
                const errorMessage = err instanceof Error ? err.message : String(err);
                logger.error(
                  { errorMessage, actionId: action.action_id },
                  'Failed to open agent selector modal'
                );
                if (responseUrl) {
                  await sendResponseUrlMessage(responseUrl, {
                    text: 'Sorry, something went wrong while opening the agent selector. Please try again.',
                    response_type: 'ephemeral',
                  }).catch((e) =>
                    logger.warn({ error: e }, 'Failed to send error notification via response URL')
                  );
                }
              });
            }

            if (action.action_id === 'modal_project_select') {
              anyHandled = true;
              const selectedOption = (action as { selected_option?: { value?: string } })
                .selected_option;
              const selectedProjectId = selectedOption?.value;
              const view = eventBody.view as {
                id?: string;
                private_metadata?: string;
              };

              logger.info(
                { teamId, actionId: action.action_id, selectedProjectId },
                'Handling block_action: modal_project_select'
              );

              if (selectedProjectId && view?.id) {
                (async () => {
                  try {
                    const metadata = JSON.parse(view.private_metadata || '{}');
                    const tenantId = metadata.tenantId;
                    if (!tenantId) {
                      logger.warn(
                        { teamId },
                        'No tenantId in modal metadata — skipping project update'
                      );
                      return;
                    }

                    const workspace = await findWorkspaceConnectionByTeamId(teamId);
                    if (!workspace?.botToken) return;

                    const slackClient = getSlackClient(workspace.botToken);

                    const { fetchProjectsForTenant, fetchAgentsForProject } = await import(
                      '../services/events/utils'
                    );
                    const { buildAgentSelectorModal, buildMessageShortcutModal } = await import(
                      '../services/modals'
                    );

                    const projectList = await fetchProjectsForTenant(tenantId);
                    const agentList = await fetchAgentsForProject(tenantId, selectedProjectId);

                    const agentOptions = agentList.map((a) => ({
                      id: a.id,
                      name: a.name,
                      projectId: a.projectId,
                      projectName: a.projectName || a.projectId,
                    }));

                    const modal = metadata.messageContext
                      ? buildMessageShortcutModal({
                          projects: projectList,
                          agents: agentOptions,
                          metadata,
                          selectedProjectId,
                          messageContext: metadata.messageContext,
                        })
                      : buildAgentSelectorModal({
                          projects: projectList,
                          agents: agentOptions,
                          metadata,
                          selectedProjectId,
                        });

                    await slackClient.views.update({
                      view_id: view.id as string,
                      view: modal,
                    });

                    logger.debug(
                      { selectedProjectId, agentCount: agentList.length },
                      'Updated modal with agents for selected project'
                    );
                  } catch (err) {
                    logger.error(
                      { err, selectedProjectId },
                      'Failed to update modal on project change'
                    );
                  }
                })();
              }
            }

            if (action.action_id === 'open_follow_up_modal' && action.value && triggerId) {
              anyHandled = true;
              logger.info(
                { teamId, actionId: action.action_id },
                'Handling block_action: open_follow_up_modal'
              );
              handleOpenFollowUpModal({
                triggerId,
                actionValue: action.value,
                teamId,
                responseUrl: responseUrl || undefined,
              }).catch((err: unknown) => {
                const errorMessage = err instanceof Error ? err.message : String(err);
                logger.error(
                  { errorMessage, actionId: action.action_id },
                  'Failed to open follow-up modal'
                );
              });
            }
          }

          outcome = anyHandled ? 'handled' : 'ignored_no_action_match';
          span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
          if (!anyHandled) {
            logger.info(
              { teamId, actionIds, eventType },
              'Ignoring block_actions: no matching action handlers'
            );
          }
        } else {
          outcome = 'ignored_no_action_match';
          span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
          logger.info(
            { teamId, eventType, hasActions: Boolean(actions) },
            'Ignoring block_actions: missing actions or teamId'
          );
        }
      }

      if (eventType === 'message_action') {
        const callbackId = eventBody.callback_id as string | undefined;
        span.setAttribute(SLACK_SPAN_KEYS.CALLBACK_ID, callbackId || 'unknown');
        span.updateName(`${SLACK_SPAN_NAMES.WEBHOOK} message_action.${callbackId || 'unknown'}`);

        if (callbackId === 'ask_agent_shortcut') {
          const triggerId = eventBody.trigger_id as string | undefined;
          const teamId = (eventBody.team as { id?: string })?.id;
          const channelId = (eventBody.channel as { id?: string })?.id;
          const userId = (eventBody.user as { id?: string })?.id;
          const message = eventBody.message as {
            ts?: string;
            text?: string;
            thread_ts?: string;
          };
          const responseUrl = eventBody.response_url as string | undefined;

          if (teamId) span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);
          if (channelId) span.setAttribute(SLACK_SPAN_KEYS.CHANNEL_ID, channelId);
          if (userId) span.setAttribute(SLACK_SPAN_KEYS.USER_ID, userId);

          if (triggerId && teamId && channelId && userId && message?.ts) {
            outcome = 'handled';
            span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
            logger.info(
              { teamId, channelId, userId, callbackId },
              'Handling message_action: ask_agent_shortcut'
            );
            handleMessageShortcut({
              triggerId,
              teamId,
              channelId,
              userId,
              messageTs: message.ts,
              messageText: message.text || '',
              threadTs: message.thread_ts,
              responseUrl,
            }).catch((err: unknown) => {
              const errorMessage = err instanceof Error ? err.message : String(err);
              logger.error({ errorMessage, callbackId }, 'Failed to handle message shortcut');
            });
          } else {
            outcome = 'ignored_unknown_event';
            span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
            logger.info(
              { teamId, channelId, userId, callbackId, hasTriggerId: Boolean(triggerId) },
              'Ignoring message_action: missing required fields'
            );
          }
        } else {
          outcome = 'ignored_unknown_event';
          span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
          logger.info({ callbackId }, `Ignoring unhandled message_action: ${callbackId}`);
        }
      }

      if (eventType === 'view_submission') {
        const callbackId = (eventBody.view as { callback_id?: string })?.callback_id;
        span.setAttribute(SLACK_SPAN_KEYS.CALLBACK_ID, callbackId || 'unknown');
        span.updateName(`${SLACK_SPAN_NAMES.WEBHOOK} view_submission.${callbackId || 'unknown'}`);

        if (callbackId === 'agent_selector_modal') {
          const view = eventBody.view as {
            private_metadata?: string;
            state?: { values?: Record<string, Record<string, unknown>> };
          };

          const agentSelect = view.state?.values?.agent_select_block?.agent_select as
            | {
                selected_option?: { value?: string };
              }
            | undefined;
          if (
            !agentSelect?.selected_option?.value ||
            agentSelect.selected_option.value === 'none'
          ) {
            outcome = 'validation_error';
            span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
            logger.info({ callbackId }, 'Rejecting view_submission: no agent selected');
            span.end();
            return c.json({
              response_action: 'errors',
              errors: {
                agent_select_block:
                  'Please select an agent. If none are available, add agents to this project in the dashboard.',
              },
            });
          }

          outcome = 'handled';
          span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
          logger.info({ callbackId }, 'Handling view_submission: agent_selector_modal');

          handleModalSubmission(view).catch((err: unknown) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error({ errorMessage, callbackId }, 'Failed to handle modal submission');
          });

          span.end();
          return new Response(null, { status: 200 });
        }

        if (callbackId === 'follow_up_modal') {
          const view = eventBody.view as {
            private_metadata?: string;
            state?: { values?: Record<string, Record<string, unknown>> };
          };

          outcome = 'handled';
          span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
          logger.info({ callbackId }, 'Handling view_submission: follow_up_modal');

          handleFollowUpSubmission(view).catch((err: unknown) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error({ errorMessage, callbackId }, 'Failed to handle follow-up submission');
          });

          span.end();
          return new Response(null, { status: 200 });
        }

        outcome = 'ignored_unknown_event';
        span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
        logger.info({ callbackId }, `Ignoring unhandled view_submission: ${callbackId}`);
      }

      if (
        eventType !== 'event_callback' &&
        eventType !== 'block_actions' &&
        eventType !== 'interactive_message' &&
        eventType !== 'message_action' &&
        eventType !== 'view_submission'
      ) {
        outcome = 'ignored_unknown_event';
        span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
        logger.info({ eventType }, `Ignoring unhandled Slack event type: ${eventType}`);
      }

      span.end();
      return c.json({ ok: true });
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
