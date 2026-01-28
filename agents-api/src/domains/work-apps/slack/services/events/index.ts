/**
 * Slack Events Handler
 *
 * Handles Slack events including:
 * - app_mention: @inkeep mentions in channels (uses streaming)
 * - message.im: DM conversations with the bot
 * - block_actions: Interactive button clicks (share to channel, etc.)
 */

import { WebClient } from '@slack/web-api';
import { getLogger } from '../../../../../logger';
import { type AgentExecutionClient, createAgentExecutionClient } from '../api-client';
import { findWorkspaceConnectionByTeamId } from '../nango';

const logger = getLogger('slack-events');

export interface SlackEventDetails {
  type: string;
  user?: string;
  channel?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  team?: string;
  event_ts?: string;
}

export interface SlackEventCallbackPayload {
  type: string;
  token?: string;
  team_id?: string;
  api_app_id?: string;
  event?: SlackEventDetails;
  event_id?: string;
  event_time?: number;
  authorizations?: Array<{
    enterprise_id?: string;
    team_id?: string;
    user_id?: string;
    is_bot?: boolean;
  }>;
}

export interface BlockAction {
  type: string;
  action_id: string;
  block_id?: string;
  value?: string;
  action_ts?: string;
}

export interface BlockActionsPayload {
  type: 'block_actions';
  user: { id: string; username: string; name: string; team_id: string };
  channel: { id: string; name: string };
  message: { ts: string; text?: string; blocks?: unknown[] };
  actions: BlockAction[];
  response_url: string;
  trigger_id: string;
  team: { id: string; domain: string };
}

/**
 * Agent configuration for a channel/workspace
 */
export interface AgentConfig {
  agentId: string;
  agentName: string;
  projectId: string;
  apiKey: string;
}

/**
 * Get agent configuration for a workspace/channel
 *
 * For beta: Uses the first connected user's default agent config from Nango.
 * In production: Will use database tables for global/channel defaults.
 *
 * Priority: Channel override → Global default → First admin's config → null
 */
async function getAgentConfigForWorkspace(teamId: string): Promise<AgentConfig | null> {
  try {
    const nango = (await import('../nango')).getSlackNango();
    const integrationId = (await import('../nango')).getSlackIntegrationId();

    const connections = await nango.listConnections();

    for (const conn of connections.connections) {
      if (conn.provider_config_key === integrationId) {
        try {
          const fullConn = await nango.getConnection(integrationId, conn.connection_id);
          const connectionConfig = fullConn.connection_config as Record<string, string> | undefined;
          const metadata = fullConn.metadata as Record<string, string> | undefined;

          const connTeamId = connectionConfig?.['team.id'] || metadata?.slack_team_id;

          if (connTeamId === teamId && metadata?.default_agent_api_key) {
            return {
              agentId: metadata.default_agent_id || 'default',
              agentName: metadata.default_agent_name || 'Inkeep Agent',
              projectId: metadata.default_project_id || 'default',
              apiKey: metadata.default_agent_api_key,
            };
          }
        } catch {}
      }
    }

    return null;
  } catch (error) {
    logger.error({ error, teamId }, 'Failed to get agent config for workspace');
    return null;
  }
}

/**
 * Handle @mention events
 * Per document: @mentions use channel/global default agent and stream public responses
 */
export async function handleAppMention(
  event: SlackEventDetails,
  payload: SlackEventCallbackPayload
): Promise<void> {
  logger.info(
    { channel: event.channel, user: event.user, teamId: payload.team_id },
    'Processing app_mention event'
  );

  if (!event.channel || !event.text || !event.ts) {
    logger.warn({ event }, 'Invalid app_mention event: missing required fields');
    return;
  }

  const teamId = payload.team_id || '';
  const userId = event.user || '';

  if (!teamId) {
    logger.error({}, 'No team_id in app_mention payload');
    return;
  }

  logger.debug({ teamId }, 'Looking up workspace connection');

  const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);

  if (!workspaceConnection) {
    logger.error({ teamId }, 'No workspace connection found for team - bot may not be installed');
    return;
  }

  logger.debug({ connectionId: workspaceConnection.connectionId }, 'Found workspace connection');

  const slackClient = new WebClient(workspaceConnection.botToken);

  const mentionPattern = /<@[A-Z0-9]+>/gi;
  const question = event.text.replace(mentionPattern, '').trim();

  if (!question) {
    await slackClient.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: "I'm here! What can I help you with?",
    });
    return;
  }

  logger.debug({ teamId }, 'Looking up agent config for workspace');

  const agentConfig = await getAgentConfigForWorkspace(teamId);

  if (!agentConfig) {
    logger.info({ teamId, channel: event.channel }, 'No agent configured for workspace');

    await slackClient.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: 'No agent is configured for this channel. Ask your admin to set up a default.',
    });
    return;
  }

  logger.info(
    { agentId: agentConfig.agentId, agentName: agentConfig.agentName },
    'Found agent config, starting response'
  );

  try {
    const initialMessage = await slackClient.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: `🤔 _${agentConfig.agentName} is thinking..._`,
    });

    if (!initialMessage.ts) {
      throw new Error('Failed to post initial message');
    }

    const executionClient = createAgentExecutionClient(agentConfig.apiKey);
    await streamAgentResponseToSlack(
      executionClient,
      question,
      slackClient,
      {
        channelId: event.channel,
        teamId,
        userId,
        threadTs: event.ts,
        initialMessageTs: initialMessage.ts,
      },
      agentConfig.agentName
    );
  } catch (error) {
    logger.error({ error, channelId: event.channel }, 'Failed to handle app_mention');

    await slackClient.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: '❌ Sorry, I encountered an error processing your request. Please try again.',
    });
  }
}

/**
 * Stream agent response to Slack using the chatStream API
 */
async function streamAgentResponseToSlack(
  executionClient: AgentExecutionClient,
  question: string,
  slackClient: WebClient,
  config: {
    channelId: string;
    teamId: string;
    userId: string;
    threadTs: string;
    initialMessageTs: string;
  },
  agentName: string
): Promise<void> {
  const apiUrl =
    (executionClient as unknown as { apiUrl: string }).apiUrl || 'http://localhost:3002';
  const apiKey = (executionClient as unknown as { apiKey: string }).apiKey;

  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/run/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'default',
      messages: [{ role: 'user', content: question }],
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Agent execution failed: ${response.status}`);
  }

  await slackClient.chat.delete({
    channel: config.channelId,
    ts: config.initialMessageTs,
  });

  const streamer = slackClient.chatStream({
    channel: config.channelId,
    recipient_team_id: config.teamId,
    recipient_user_id: config.userId,
    thread_ts: config.threadTs,
  });

  if (!response.body) {
    throw new Error('No response body from agent');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const data = JSON.parse(jsonStr);

          if (data.type === 'text-delta' && data.delta) {
            await streamer.append({ markdown_text: data.delta });
          } else if (data.type === 'data-operation') {
          } else if (data.type === 'text-start' || data.type === 'text-end') {
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    const feedbackBlock = {
      type: 'context_actions' as const,
      elements: [
        {
          type: 'feedback_buttons' as const,
          action_id: 'agent_feedback',
          positive_button: {
            text: { type: 'plain_text' as const, text: '👍' },
            value: 'positive',
          },
          negative_button: {
            text: { type: 'plain_text' as const, text: '👎' },
            value: 'negative',
          },
        },
      ],
    };

    const contextBlock = {
      type: 'context' as const,
      elements: [
        {
          type: 'mrkdwn' as const,
          text: `Powered by *${agentName}* via Inkeep`,
        },
      ],
    };

    await streamer.stop({ blocks: [contextBlock, feedbackBlock] });
  } catch (error) {
    logger.error({ error }, 'Error during Slack streaming');
    await streamer.stop();
    throw error;
  }
}

/**
 * Handle block_actions (button clicks)
 */
export async function handleBlockActions(payload: BlockActionsPayload): Promise<void> {
  logger.debug({ payload: JSON.stringify(payload, null, 2) }, 'Received block_actions payload');

  const teamId = payload.team?.id;

  if (!teamId) {
    logger.error({ payloadKeys: Object.keys(payload) }, 'No team ID in block_actions payload');
    return;
  }

  logger.debug({ teamId }, 'Looking up workspace connection');

  const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);

  if (!workspaceConnection) {
    logger.error({ teamId }, 'No workspace connection found for team');
    await sendResponseUrlMessage(payload.response_url, {
      text: '❌ Could not find workspace configuration. Please reinstall the app.',
      response_type: 'ephemeral',
    });
    return;
  }

  const slackClient = new WebClient(workspaceConnection.botToken);

  for (const action of payload.actions) {
    logger.debug({ actionId: action.action_id }, 'Processing action');

    switch (action.action_id) {
      case 'share_to_channel':
        await handleShareToChannel(payload, slackClient, action);
        break;

      case 'agent_feedback':
        await handleFeedback(payload, action, slackClient);
        break;

      default:
        logger.debug({ actionId: action.action_id }, 'Unhandled action');
    }
  }
}

async function sendResponseUrlMessage(
  responseUrl: string,
  message: { text: string; response_type?: 'ephemeral' | 'in_channel' }
): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to send response_url message');
  }
}

/**
 * Handle "Share to Channel" button click
 * Posts the ephemeral response as a public thread
 *
 * Note: For ephemeral messages, payload.message is undefined.
 * We pass the text to share in the button's value field.
 */
async function handleShareToChannel(
  payload: BlockActionsPayload,
  slackClient: WebClient,
  action: BlockAction
): Promise<void> {
  logger.info(
    { channelId: payload.channel.id, userId: payload.user.id },
    'Sharing response to channel'
  );

  let textToShare = '';
  let agentName = 'Inkeep';

  if (action.value) {
    try {
      const valueData = JSON.parse(action.value);
      textToShare = valueData.text || '';
      agentName = valueData.agentName || 'Inkeep';
      logger.debug(
        { textLength: textToShare.length, agentName },
        'Extracted text from button value'
      );
    } catch {
      logger.warn({ value: action.value }, 'Failed to parse button value as JSON');
    }
  }

  if (!textToShare && payload.message) {
    const message = payload.message;
    textToShare = message.text || '';

    if (message.blocks && Array.isArray(message.blocks)) {
      const sectionBlock = message.blocks.find(
        (b: unknown) => (b as { type: string }).type === 'section'
      );
      if (sectionBlock) {
        textToShare = (sectionBlock as { text?: { text?: string } }).text?.text || textToShare;
      }
    }
  }

  if (!textToShare) {
    logger.warn({}, 'No text content found to share');
    await sendResponseUrlMessage(payload.response_url, {
      text: '❌ Could not find content to share.',
      response_type: 'ephemeral',
    });
    return;
  }

  try {
    logger.debug({ textLength: textToShare.length }, 'Posting shared message');

    await slackClient.chat.postMessage({
      channel: payload.channel.id,
      text: textToShare,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: textToShare },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Shared by <@${payload.user.id}> • Powered by *${agentName}* via Inkeep`,
            },
          ],
        },
      ],
    });

    logger.info({}, 'Successfully shared message to channel');

    await fetch(payload.response_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        replace_original: false,
        text: '✅ Response shared to channel!',
      }),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to share message to channel');
  }
}

/**
 * Handle feedback button clicks
 */
async function handleFeedback(
  payload: BlockActionsPayload,
  action: BlockAction,
  slackClient: WebClient
): Promise<void> {
  const isPositive = action.value === 'positive';

  logger.info(
    {
      userId: payload.user.id,
      channelId: payload.channel.id,
      feedback: isPositive ? 'positive' : 'negative',
    },
    'Received agent feedback'
  );

  try {
    await slackClient.chat.postEphemeral({
      channel: payload.channel.id,
      user: payload.user.id,
      text: isPositive
        ? "Thanks for the feedback! We're glad this was helpful."
        : "Thanks for letting us know. We'll work to improve.",
    });
  } catch (error) {
    logger.error({ error }, 'Failed to acknowledge feedback');
  }
}
