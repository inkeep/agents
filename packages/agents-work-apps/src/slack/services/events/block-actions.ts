/**
 * Handlers for Slack block action events (button clicks, selections, etc.)
 * and message shortcuts
 */

import { getLogger } from '../../../logger';
import { SlackStrings } from '../../i18n';
import { createContextBlock } from '../blocks';
import { getSlackClient } from '../client';
import { buildAgentSelectorModal, buildMessageShortcutModal, type ModalMetadata } from '../modals';
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
 * Handle "Share to Thread" button click from ephemeral responses
 * Posts the response to the current thread instead of the main channel
 */
export async function handleShareToThread(params: {
  teamId: string;
  channelId: string;
  userId: string;
  actionValue: string;
  responseUrl: string;
}): Promise<void> {
  const { teamId, channelId, userId, actionValue, responseUrl } = params;

  let textToShare = '';
  let agentName = 'Inkeep';
  let threadTs = '';

  try {
    const valueData = JSON.parse(actionValue);
    textToShare = valueData.text || '';
    agentName = valueData.agentName || 'Inkeep';
    threadTs = valueData.threadTs || '';
  } catch {
    logger.warn({ actionValue }, 'Failed to parse share_to_thread action value');
    return;
  }

  if (!textToShare) {
    if (responseUrl) {
      await sendResponseUrlMessage(responseUrl, {
        text: SlackStrings.errors.couldNotFindContent,
        response_type: 'ephemeral',
      });
    }
    return;
  }

  if (!threadTs) {
    if (responseUrl) {
      await sendResponseUrlMessage(responseUrl, {
        text: SlackStrings.errors.couldNotFindThread,
        response_type: 'ephemeral',
      });
    }
    return;
  }

  const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
  if (!workspaceConnection?.botToken) {
    logger.error({ teamId }, 'No bot token for share_to_thread');
    if (responseUrl) {
      await sendResponseUrlMessage(responseUrl, {
        text: SlackStrings.errors.couldNotShareToThread,
        response_type: 'ephemeral',
      });
    }
    return;
  }

  const slackClient = getSlackClient(workspaceConnection.botToken);

  try {
    const contextBlock = createContextBlock({ agentName, sharedBy: userId });
    await slackClient.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: textToShare,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: textToShare },
        },
        contextBlock,
      ],
    });

    logger.info({ channelId, threadTs, userId }, 'Shared message to thread');

    if (responseUrl) {
      await sendResponseUrlMessage(responseUrl, {
        text: SlackStrings.status.sharedToThread,
        response_type: 'ephemeral',
      });
    }
  } catch (error) {
    logger.error({ error, channelId, threadTs }, 'Failed to share message to thread');
    if (responseUrl) {
      await sendResponseUrlMessage(responseUrl, {
        text: SlackStrings.errors.couldNotShareToThread,
        response_type: 'ephemeral',
      });
    }
  }
}

/**
 * Handle "Share to Channel" button click from ephemeral responses
 */
export async function handleShareToChannel(params: {
  teamId: string;
  channelId: string;
  userId: string;
  actionValue: string;
  responseUrl: string;
}): Promise<void> {
  const { teamId, channelId, userId, actionValue, responseUrl } = params;

  let textToShare = '';
  let agentName = 'Inkeep';

  try {
    const valueData = JSON.parse(actionValue);
    textToShare = valueData.text || '';
    agentName = valueData.agentName || 'Inkeep';
  } catch {
    logger.warn({ actionValue }, 'Failed to parse share_to_channel action value');
    return;
  }

  if (!textToShare) {
    if (responseUrl) {
      await sendResponseUrlMessage(responseUrl, {
        text: SlackStrings.errors.couldNotFindContent,
        response_type: 'ephemeral',
      });
    }
    return;
  }

  const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
  if (!workspaceConnection?.botToken) {
    logger.error({ teamId }, 'No bot token for share_to_channel');
    if (responseUrl) {
      await sendResponseUrlMessage(responseUrl, {
        text: SlackStrings.errors.couldNotShareToChannel,
        response_type: 'ephemeral',
      });
    }
    return;
  }

  const slackClient = getSlackClient(workspaceConnection.botToken);

  try {
    const channelContextBlock = createContextBlock({ agentName, sharedBy: userId });
    await slackClient.chat.postMessage({
      channel: channelId,
      text: textToShare,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: textToShare },
        },
        channelContextBlock,
      ],
    });

    logger.info({ channelId, userId }, 'Shared message to channel');

    if (responseUrl) {
      await sendResponseUrlMessage(responseUrl, {
        text: SlackStrings.status.sharedToChannel,
        response_type: 'ephemeral',
      });
    }
  } catch (error) {
    logger.error({ error, channelId }, 'Failed to share message to channel');
    if (responseUrl) {
      await sendResponseUrlMessage(responseUrl, {
        text: SlackStrings.errors.couldNotShareToChannel,
        response_type: 'ephemeral',
      });
    }
  }
}

/**
 * Handle opening the agent selector modal when user clicks "Select Agent" button
 */
export async function handleOpenAgentSelectorModal(params: {
  triggerId: string;
  actionValue: string;
  teamId: string;
  responseUrl: string;
}): Promise<void> {
  const { triggerId, actionValue, teamId, responseUrl } = params;

  try {
    const metadata = JSON.parse(actionValue) as InlineSelectorMetadata;
    const { channel, threadTs, messageTs, slackUserId, tenantId } = metadata;

    // Determine if we're actually in a thread (threadTs exists and differs from messageTs)
    const isInThread = Boolean(threadTs && threadTs !== messageTs);

    const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
    if (!workspaceConnection?.botToken) {
      logger.error({ teamId }, 'No bot token for modal');
      return;
    }

    const slackClient = getSlackClient(workspaceConnection.botToken);

    // Fetch projects, falling back to default agent config
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
      await slackClient.chat.postEphemeral({
        channel,
        user: slackUserId,
        thread_ts: isInThread ? threadTs : undefined,
        text: SlackStrings.status.noProjectsConfigured,
      });
      return;
    }

    // Fetch agents for first project
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
      { teamId, channel, threadTs, projectCount: projectList.length, agentCount: agentList.length },
      'Opened agent selector modal'
    );
  } catch (error) {
    logger.error({ error, teamId }, 'Failed to open agent selector modal');
  }
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
  const { triggerId, teamId, channelId, userId, messageTs, messageText, threadTs, responseUrl } =
    params;

  try {
    const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
    if (!workspaceConnection?.botToken) {
      logger.error({ teamId }, 'No bot token for message shortcut modal');
      return;
    }

    const tenantId = workspaceConnection.tenantId;
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
      await slackClient.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: SlackStrings.status.noProjectsConfigured,
      });
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
  } catch (error) {
    logger.error({ error, teamId }, 'Failed to open message shortcut modal');
    if (responseUrl) {
      await sendResponseUrlMessage(responseUrl, {
        text: SlackStrings.errors.failedToOpenSelector,
        response_type: 'ephemeral',
      }).catch(() => {});
    }
  }
}
