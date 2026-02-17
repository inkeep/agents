/**
 * Handlers for Slack block action events (button clicks, selections, etc.)
 * and message shortcuts
 */

import { getLogger } from '../../../logger';
import { SlackStrings } from '../../i18n';
import { SLACK_SPAN_KEYS, SLACK_SPAN_NAMES, setSpanWithError, tracer } from '../../tracer';
import { getSlackClient } from '../client';
import {
  buildAgentSelectorModal,
  buildFollowUpModal,
  buildMessageShortcutModal,
  type FollowUpModalMetadata,
  type ModalMetadata,
} from '../modals';
import { findWorkspaceConnectionByTeamId } from '../nango';
import type { InlineSelectorMetadata } from './app-mention';
import {
  fetchAgentsForProject,
  fetchProjectsForTenant,
  getChannelAgentConfig,
  sendResponseUrlMessage,
} from './utils';

const logger = getLogger('slack-block-actions');

/**
 * Handle opening the agent selector modal when user clicks "Select Agent" button
 */
export async function handleOpenAgentSelectorModal(params: {
  triggerId: string;
  actionValue: string;
  teamId: string;
  responseUrl: string;
}): Promise<void> {
  return tracer.startActiveSpan(SLACK_SPAN_NAMES.OPEN_AGENT_SELECTOR_MODAL, async (span) => {
    const { triggerId, actionValue, teamId, responseUrl } = params;
    span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);

    try {
      const metadata = JSON.parse(actionValue) as InlineSelectorMetadata;
      const { channel, threadTs, messageTs, slackUserId, tenantId } = metadata;
      span.setAttribute(SLACK_SPAN_KEYS.CHANNEL_ID, channel);
      span.setAttribute(SLACK_SPAN_KEYS.USER_ID, slackUserId);
      span.setAttribute(SLACK_SPAN_KEYS.TENANT_ID, tenantId);

      // Determine if we're actually in a thread (threadTs exists and differs from messageTs)
      const isInThread = Boolean(threadTs && threadTs !== messageTs);

      const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
      if (!workspaceConnection?.botToken) {
        logger.error({ teamId }, 'No bot token for modal');
        span.end();
        return;
      }

      const slackClient = getSlackClient(workspaceConnection.botToken);

      let projectList = await fetchProjectsForTenant(tenantId);

      if (projectList.length === 0) {
        const defaultAgent = await getChannelAgentConfig(teamId, channel);
        if (defaultAgent) {
          projectList = [
            {
              id: defaultAgent.projectId,
              name: defaultAgent.projectName || defaultAgent.projectId,
            },
          ];
        }
      }

      if (projectList.length === 0) {
        logger.info({ teamId, channel, tenantId }, 'No projects configured — cannot open selector');
        await slackClient.chat.postEphemeral({
          channel,
          user: slackUserId,
          thread_ts: isInThread ? threadTs : undefined,
          text: SlackStrings.status.noProjectsConfigured,
        });
        span.end();
        return;
      }

      // Fetch agents for first project (modal updates dynamically on project change)
      const firstProject = projectList[0];
      let agentList = await fetchAgentsForProject(tenantId, firstProject.id);

      if (agentList.length === 0) {
        const defaultAgent = await getChannelAgentConfig(teamId, channel);
        if (defaultAgent && defaultAgent.projectId === firstProject.id) {
          agentList = [
            {
              id: defaultAgent.agentId,
              name: defaultAgent.agentName || defaultAgent.agentId,
              projectId: defaultAgent.projectId,
              projectName: defaultAgent.projectName || defaultAgent.projectId,
            },
          ];
        }
      }

      const modalMetadata: ModalMetadata = {
        channel,
        threadTs: isInThread ? threadTs : undefined,
        messageTs,
        teamId,
        slackUserId,
        tenantId,
        isInThread,
        buttonResponseUrl: responseUrl,
      };

      const modal = buildAgentSelectorModal({
        projects: projectList,
        agents: agentList.map((a) => ({
          id: a.id,
          name: a.name,
          projectId: a.projectId,
          projectName: a.projectName || a.projectId,
        })),
        metadata: modalMetadata,
        selectedProjectId: firstProject.id,
      });

      await slackClient.views.open({
        trigger_id: triggerId,
        view: modal,
      });

      logger.info(
        {
          teamId,
          channel,
          threadTs,
          projectCount: projectList.length,
          agentCount: agentList.length,
        },
        'Opened agent selector modal'
      );
      span.end();
    } catch (error) {
      if (error instanceof Error) setSpanWithError(span, error);
      logger.error({ error, teamId }, 'Failed to open agent selector modal');
      if (responseUrl) {
        await sendResponseUrlMessage(responseUrl, {
          text: SlackStrings.errors.failedToOpenSelector,
          response_type: 'ephemeral',
        }).catch((e) => logger.warn({ error: e }, 'Failed to send selector error notification'));
      }
      span.end();
    }
  });
}

/**
 * Handle "Follow Up" button click.
 * Opens a prompt-only modal that carries the conversationId for multi-turn context.
 */
export async function handleOpenFollowUpModal(params: {
  triggerId: string;
  actionValue: string;
  teamId: string;
  responseUrl?: string;
}): Promise<void> {
  return tracer.startActiveSpan(SLACK_SPAN_NAMES.OPEN_FOLLOW_UP_MODAL, async (span) => {
    const { triggerId, actionValue, teamId, responseUrl } = params;
    span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);

    try {
      const metadata = JSON.parse(actionValue) as FollowUpModalMetadata;
      span.setAttribute(SLACK_SPAN_KEYS.CONVERSATION_ID, metadata.conversationId || '');
      span.setAttribute(SLACK_SPAN_KEYS.AGENT_ID, metadata.agentId || '');

      const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
      if (!workspaceConnection?.botToken) {
        logger.error({ teamId }, 'No bot token for follow-up modal');
        span.end();
        return;
      }

      const slackClient = getSlackClient(workspaceConnection.botToken);
      const modal = buildFollowUpModal(metadata);

      await slackClient.views.open({
        trigger_id: triggerId,
        view: modal,
      });

      logger.info(
        { teamId, conversationId: metadata.conversationId, agentId: metadata.agentId },
        'Opened follow-up modal'
      );
      span.end();
    } catch (error) {
      if (error instanceof Error) setSpanWithError(span, error);
      logger.error({ error, teamId }, 'Failed to open follow-up modal');
      if (responseUrl) {
        await sendResponseUrlMessage(responseUrl, {
          text: 'Failed to open follow-up dialog. Please try again.',
          response_type: 'ephemeral',
        }).catch((e) => logger.warn({ error: e }, 'Failed to send follow-up error notification'));
      }
      span.end();
    }
  });
}

/**
 * Handle message shortcut (context menu action on a message)
 * Opens a modal with the message content pre-filled as context
 */
export async function handleMessageShortcut(params: {
  triggerId: string;
  teamId: string;
  channelId: string;
  userId: string;
  messageTs: string;
  messageText: string;
  threadTs?: string;
  responseUrl?: string;
}): Promise<void> {
  return tracer.startActiveSpan(SLACK_SPAN_NAMES.MESSAGE_SHORTCUT, async (span) => {
    const { triggerId, teamId, channelId, userId, messageTs, messageText, threadTs, responseUrl } =
      params;

    span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);
    span.setAttribute(SLACK_SPAN_KEYS.CHANNEL_ID, channelId);
    span.setAttribute(SLACK_SPAN_KEYS.USER_ID, userId);
    span.setAttribute(SLACK_SPAN_KEYS.MESSAGE_TS, messageTs);
    if (threadTs) span.setAttribute(SLACK_SPAN_KEYS.THREAD_TS, threadTs);

    try {
      const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
      if (!workspaceConnection?.botToken) {
        logger.error({ teamId }, 'No bot token for message shortcut modal');
        span.end();
        return;
      }

      const tenantId = workspaceConnection.tenantId;
      span.setAttribute(SLACK_SPAN_KEYS.TENANT_ID, tenantId);
      const slackClient = getSlackClient(workspaceConnection.botToken);

      let projectList = await fetchProjectsForTenant(tenantId);

      if (projectList.length === 0) {
        const defaultAgent = await getChannelAgentConfig(teamId, channelId);
        if (defaultAgent) {
          projectList = [
            {
              id: defaultAgent.projectId,
              name: defaultAgent.projectName || defaultAgent.projectId,
            },
          ];
        }
      }

      if (projectList.length === 0) {
        logger.info(
          { teamId, channelId, tenantId },
          'No projects configured — cannot open message shortcut modal'
        );
        await slackClient.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: SlackStrings.status.noProjectsConfigured,
        });
        span.end();
        return;
      }

      const firstProject = projectList[0];
      let agentList = await fetchAgentsForProject(tenantId, firstProject.id);

      if (agentList.length === 0) {
        const defaultAgent = await getChannelAgentConfig(teamId, channelId);
        if (defaultAgent && defaultAgent.projectId === firstProject.id) {
          agentList = [
            {
              id: defaultAgent.agentId,
              name: defaultAgent.agentName || defaultAgent.agentId,
              projectId: defaultAgent.projectId,
              projectName: defaultAgent.projectName || defaultAgent.projectId,
            },
          ];
        }
      }

      const modalMetadata: ModalMetadata = {
        channel: channelId,
        threadTs,
        messageTs,
        teamId,
        slackUserId: userId,
        tenantId,
        isInThread: Boolean(threadTs),
        messageContext: messageText,
      };

      const modal = buildMessageShortcutModal({
        projects: projectList,
        agents: agentList.map((a) => ({
          id: a.id,
          name: a.name,
          projectId: a.projectId,
          projectName: a.projectName || a.projectId,
        })),
        metadata: modalMetadata,
        selectedProjectId: firstProject.id,
        messageContext: messageText,
      });

      await slackClient.views.open({
        trigger_id: triggerId,
        view: modal,
      });

      logger.info(
        {
          teamId,
          channelId,
          messageTs,
          projectCount: projectList.length,
          agentCount: agentList.length,
        },
        'Opened message shortcut modal'
      );
      span.end();
    } catch (error) {
      if (error instanceof Error) setSpanWithError(span, error);
      logger.error({ error, teamId }, 'Failed to open message shortcut modal');
      if (responseUrl) {
        await sendResponseUrlMessage(responseUrl, {
          text: SlackStrings.errors.failedToOpenSelector,
          response_type: 'ephemeral',
        }).catch((e) => logger.warn({ error: e }, 'Failed to send shortcut error notification'));
      }
      span.end();
    }
  });
}
