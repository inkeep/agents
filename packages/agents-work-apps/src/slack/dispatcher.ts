import { flushTraces } from '@inkeep/agents-core';
import { getLogger } from '../logger';
import { findWorkspaceConnectionByTeamId, getSlackClient } from './services';
import {
  handleAppMention,
  handleDirectMessage,
  handleMessageShortcut,
  handleModalSubmission,
  handleOpenAgentSelectorModal,
  handleToolApproval,
  sendResponseUrlMessage,
} from './services/events';
import type { SlackAttachment } from './services/events/utils';
import { SLACK_SPAN_KEYS, type SlackOutcome } from './tracer';

const logger = getLogger('slack-dispatcher');

export interface SlackEventDispatchResult {
  outcome: SlackOutcome;
  response?: Record<string, unknown>;
}

export interface DispatchOptions {
  registerBackgroundWork: (work: Promise<unknown>) => void;
}

export async function dispatchSlackEvent(
  eventType: string,
  payload: Record<string, unknown>,
  options: DispatchOptions,
  span: {
    setAttribute: (key: string, value: string | boolean | number) => void;
    updateName: (name: string) => void;
  }
): Promise<SlackEventDispatchResult> {
  const { registerBackgroundWork } = options;
  let outcome: SlackOutcome = 'ignored_unknown_event';

  if (eventType === 'event_callback') {
    const teamId = payload.team_id as string | undefined;
    const event = payload.event as
      | {
          type?: string;
          channel_type?: string;
          user?: string;
          text?: string;
          channel?: string;
          ts?: string;
          thread_ts?: string;
          bot_id?: string;
          subtype?: string;
          edited?: unknown;
          attachments?: SlackAttachment[];
        }
      | undefined;

    const innerEventType = event?.type || 'unknown';
    span.setAttribute(SLACK_SPAN_KEYS.INNER_EVENT_TYPE, innerEventType);
    if (teamId) span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);
    if (event?.channel) span.setAttribute(SLACK_SPAN_KEYS.CHANNEL_ID, event.channel);
    if (event?.user) span.setAttribute(SLACK_SPAN_KEYS.USER_ID, event.user);

    if (event?.bot_id || event?.subtype === 'bot_message') {
      outcome = 'ignored_bot_message';
      span.setAttribute(SLACK_SPAN_KEYS.IS_BOT_MESSAGE, true);
      span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
      logger.info(
        { botId: event.bot_id, subtype: event?.subtype, teamId, innerEventType },
        'Ignoring bot message'
      );
      return { outcome };
    }

    if (event?.edited) {
      outcome = 'ignored_edited_message';
      span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
      logger.info({ teamId, innerEventType }, 'Ignoring edited message');
      return { outcome };
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

      const dispatchedAt = Date.now();
      const mentionWork = handleAppMention({
        slackUserId: event.user,
        channel: event.channel,
        text: question,
        attachments: event.attachments,
        threadTs: event.thread_ts || event.ts || '',
        messageTs: event.ts || '',
        teamId,
        dispatchedAt,
      })
        .catch((err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          const errorStack = err instanceof Error ? err.stack : undefined;
          logger.error({ errorMessage, errorStack }, 'Failed to handle app mention (outer catch)');
        })
        .finally(() => flushTraces());
      registerBackgroundWork(mentionWork);
      logger.info({ teamId, channel: event.channel, dispatchedAt }, 'app_mention work registered');
    } else if (
      event?.type === 'message' &&
      event.channel_type === 'im' &&
      event.channel &&
      event.user &&
      teamId
    ) {
      outcome = 'handled';
      span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
      if (event.thread_ts) span.setAttribute(SLACK_SPAN_KEYS.THREAD_TS, event.thread_ts);
      if (event.ts) span.setAttribute(SLACK_SPAN_KEYS.MESSAGE_TS, event.ts);

      logger.info(
        { userId: event.user, channel: event.channel, teamId },
        'Handling event: message.im'
      );

      const dmWork = handleDirectMessage({
        slackUserId: event.user,
        channel: event.channel,
        text: event.text || '',
        threadTs: event.thread_ts,
        messageTs: event.ts || '',
        teamId,
      })
        .catch((err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          const errorStack = err instanceof Error ? err.stack : undefined;
          logger.error(
            { errorMessage, errorStack },
            'Failed to handle direct message (outer catch)'
          );
        })
        .finally(() => flushTraces());
      registerBackgroundWork(dmWork);
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
    const actions = payload.actions as
      | Array<{
          action_id: string;
          value?: string;
        }>
      | undefined;

    const teamId = (payload.team as { id?: string })?.id;
    const responseUrl = payload.response_url as string | undefined;
    const triggerId = payload.trigger_id as string | undefined;
    const actionIds = actions?.map((a) => a.action_id) || [];

    if (teamId) span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);
    span.setAttribute(SLACK_SPAN_KEYS.ACTION_IDS, actionIds.join(','));

    if (actions && teamId) {
      let anyHandled = false;
      for (const action of actions) {
        if (action.action_id === 'open_agent_selector_modal' && action.value && triggerId) {
          anyHandled = true;
          logger.info(
            { teamId, actionId: action.action_id },
            'Handling block_action: open_agent_selector_modal'
          );
          const selectorWork = handleOpenAgentSelectorModal({
            triggerId,
            actionValue: action.value,
            teamId,
            responseUrl: responseUrl || '',
          })
            .catch(async (err: unknown) => {
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
            })
            .finally(() => flushTraces());
          registerBackgroundWork(selectorWork);
        }

        if (action.action_id === 'modal_project_select') {
          anyHandled = true;
          const selectedOption = (action as { selected_option?: { value?: string } })
            .selected_option;
          const selectedProjectId = selectedOption?.value;
          const view = payload.view as {
            id?: string;
            private_metadata?: string;
          };

          logger.info(
            { teamId, actionId: action.action_id, selectedProjectId },
            'Handling block_action: modal_project_select'
          );

          if (selectedProjectId && view?.id) {
            const projectSelectWork = (async () => {
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
                if (!workspace?.botToken) {
                  logger.warn(
                    { teamId },
                    'Workspace found but no botToken — skipping modal project update'
                  );
                  return;
                }

                const slackClient = getSlackClient(workspace.botToken);

                const { fetchProjectsForTenant, fetchAgentsForProject } = await import(
                  './services/events/utils'
                );
                const { buildAgentSelectorModal, buildMessageShortcutModal } = await import(
                  './services/modals'
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
              } finally {
                await flushTraces();
              }
            })();
            registerBackgroundWork(projectSelectWork);
          }
        }

        if (
          (action.action_id === 'tool_approval_approve' ||
            action.action_id === 'tool_approval_deny') &&
          action.value
        ) {
          anyHandled = true;
          const approved = action.action_id === 'tool_approval_approve';
          const slackUserId = (payload.user as { id?: string })?.id || '';
          logger.info(
            { teamId, actionId: action.action_id, approved },
            `Handling block_action: ${action.action_id}`
          );
          const approvalWork = handleToolApproval({
            actionValue: action.value,
            approved,
            teamId,
            slackUserId,
            responseUrl,
          })
            .catch((err: unknown) => {
              const errorMessage = err instanceof Error ? err.message : String(err);
              logger.error(
                { errorMessage, actionId: action.action_id },
                'Failed to handle tool approval'
              );
            })
            .finally(() => flushTraces());
          registerBackgroundWork(approvalWork);
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
    const callbackId = payload.callback_id as string | undefined;
    span.setAttribute(SLACK_SPAN_KEYS.CALLBACK_ID, callbackId || 'unknown');

    if (callbackId === 'ask_agent_shortcut') {
      const triggerId = payload.trigger_id as string | undefined;
      const teamId = (payload.team as { id?: string })?.id;
      const channelId = (payload.channel as { id?: string })?.id;
      const userId = (payload.user as { id?: string })?.id;
      const message = payload.message as {
        ts?: string;
        text?: string;
        thread_ts?: string;
      };
      const responseUrl = payload.response_url as string | undefined;

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
        const shortcutWork = handleMessageShortcut({
          triggerId,
          teamId,
          channelId,
          userId,
          messageTs: message.ts,
          messageText: message.text || '',
          threadTs: message.thread_ts,
          responseUrl,
        })
          .catch((err: unknown) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error({ errorMessage, callbackId }, 'Failed to handle message shortcut');
          })
          .finally(() => flushTraces());
        registerBackgroundWork(shortcutWork);
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
    const callbackId = (payload.view as { callback_id?: string })?.callback_id;
    span.setAttribute(SLACK_SPAN_KEYS.CALLBACK_ID, callbackId || 'unknown');

    if (callbackId === 'agent_selector_modal') {
      const view = payload.view as {
        private_metadata?: string;
        state?: { values?: Record<string, Record<string, unknown>> };
      };

      const values = view.state?.values || {};
      const agentSelectEntry = Object.entries(values).find(
        ([, block]) => (block as Record<string, unknown>).agent_select
      );
      const agentSelectBlockId = agentSelectEntry?.[0];
      const agentSelect = agentSelectEntry
        ? ((agentSelectEntry[1] as Record<string, unknown>).agent_select as
            | { selected_option?: { value?: string } }
            | undefined)
        : undefined;
      if (!agentSelect?.selected_option?.value || agentSelect.selected_option.value === 'none') {
        outcome = 'validation_error';
        span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
        logger.info({ callbackId }, 'Rejecting view_submission: no agent selected');
        return {
          outcome,
          response: {
            response_action: 'errors',
            errors: {
              [agentSelectBlockId || 'agent_select_block']:
                'Please select an agent. If none are available, add agents to this project in the dashboard.',
            },
          },
        };
      }

      outcome = 'handled';
      span.setAttribute(SLACK_SPAN_KEYS.OUTCOME, outcome);
      logger.info({ callbackId }, 'Handling view_submission: agent_selector_modal');

      const modalWork = handleModalSubmission(view)
        .catch((err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          logger.error({ errorMessage, callbackId }, 'Failed to handle modal submission');
        })
        .finally(() => flushTraces());
      registerBackgroundWork(modalWork);

      return { outcome };
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

  return { outcome };
}
