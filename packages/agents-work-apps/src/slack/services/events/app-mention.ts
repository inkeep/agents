/**
 * Handler for Slack @mention events
 *
 * Flow:
 * 1. Resolve agent config (channel override > workspace default)
 * 2. If no agent configured → prompt to set up in dashboard
 * 3. Check if user is linked to Inkeep
 * 4. If not linked → prompt to link account
 * 5. Handle based on context:
 *    - Channel + no query → Show welcome/help message
 *    - Channel + query → Execute agent with streaming response
 *    - Thread + no query → Show modal to select agent
 *    - Thread + query → Execute agent with thread context included
 */

import { findWorkAppSlackUserMapping, signSlackUserToken } from '@inkeep/agents-core';
import runDbClient from '../../../db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { getSlackClient, postMessageInThread } from '../client';
import { findWorkspaceConnectionByTeamId } from '../nango';
import { getBotTokenForTeam } from '../workspace-tokens';
import { streamAgentResponse } from './streaming';
import {
  checkIfBotThread,
  classifyError,
  generateSlackConversationId,
  getChannelAgentConfig,
  getThreadContext,
  getUserFriendlyErrorMessage,
} from './utils';

const logger = getLogger('slack-app-mention');

/**
 * Metadata passed to the agent selector modal via button value
 */
export interface InlineSelectorMetadata {
  channel: string;
  threadTs: string;
  messageTs: string;
  teamId: string;
  slackUserId: string;
  tenantId: string;
  threadMessageCount: number;
}

/**
 * Main handler for @mention events in Slack
 */
export async function handleAppMention(params: {
  slackUserId: string;
  channel: string;
  text: string;
  threadTs: string;
  messageTs: string;
  teamId: string;
  triggerId?: string;
}): Promise<void> {
  const { slackUserId, channel, text, threadTs, messageTs, teamId } = params;
  const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';

  logger.info({ slackUserId, channel, teamId }, 'Handling app mention');

  const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
  const tenantId = workspaceConnection?.tenantId || 'default';
  const dashboardUrl = `${manageUiUrl}/${tenantId}/work-apps/slack`;

  const botToken = await resolveBotToken(teamId);
  if (!botToken) {
    logger.error({ teamId }, 'No bot token available');
    return;
  }

  const slackClient = getSlackClient(botToken);
  const replyThreadTs = threadTs || messageTs;
  const isInThread = Boolean(threadTs && threadTs !== messageTs);
  const hasQuery = Boolean(text && text.trim().length > 0);

  try {
    // Step 1: Resolve agent configuration
    const agentConfig = await getChannelAgentConfig(teamId, channel);

    if (!agentConfig) {
      await slackClient.chat.postEphemeral({
        channel,
        user: slackUserId,
        thread_ts: isInThread ? threadTs : undefined,
        text: `⚙️ No agents configured for this workspace.\n\n👉 *<${dashboardUrl}|Set up agents in the dashboard>*`,
      });
      return;
    }

    const agentDisplayName = agentConfig.agentName || agentConfig.agentId;

    // Step 2: Check if user is linked
    const existingLink = await findWorkAppSlackUserMapping(runDbClient)(
      tenantId,
      slackUserId,
      teamId,
      'work-apps-slack'
    );

    if (!existingLink) {
      await slackClient.chat.postEphemeral({
        channel,
        user: slackUserId,
        thread_ts: isInThread ? threadTs : undefined,
        text:
          `🔗 *Link your account to use @Inkeep*\n\n` +
          `Run \`/inkeep link\` to connect your Slack and Inkeep accounts.\n\n` +
          `This workspace uses: *${agentDisplayName}*`,
      });
      return;
    }

    // Step 3: Handle based on context
    if (isInThread && !hasQuery) {
      // Thread + no query → Check if bot thread or show agent selector
      const isBotThread = await checkIfBotThread(slackClient, channel, threadTs);

      if (isBotThread) {
        await slackClient.chat.postEphemeral({
          channel,
          user: slackUserId,
          thread_ts: threadTs,
          text:
            `💬 *Continue the conversation*\n\n` +
            `Just type your follow-up — no need to mention me in this thread.\n` +
            `Or use \`@Inkeep <prompt>\` to run a new prompt.\n\n` +
            `_Using: ${agentDisplayName}_`,
        });
      } else {
        // Non-bot thread → Show button to open agent selector modal
        const metadata: InlineSelectorMetadata = {
          channel,
          threadTs,
          messageTs,
          teamId,
          slackUserId,
          tenantId,
          threadMessageCount: 0,
        };

        await slackClient.chat.postEphemeral({
          channel,
          user: slackUserId,
          thread_ts: threadTs,
          text: 'Select an agent to analyze this thread',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Run an agent on this thread*\nClick the button below to select an agent and run it with this thread as context.',
              },
            },
            {
              type: 'actions',
              block_id: 'agent_selector_trigger',
              elements: [
                {
                  type: 'button',
                  action_id: 'open_agent_selector_modal',
                  text: { type: 'plain_text', text: 'Select Agent', emoji: true },
                  style: 'primary',
                  value: JSON.stringify(metadata),
                },
              ],
            },
          ],
        });
      }
      return;
    }

    if (!hasQuery) {
      // Channel + no query → Show welcome message
      await slackClient.chat.postEphemeral({
        channel,
        user: slackUserId,
        text:
          `*${agentDisplayName}* is your workspace's default agent.\n\n` +
          `*Get started:*\n` +
          `\`@Inkeep <prompt>\` — Run the agent with your prompt\n\n` +
          `*In threads:*\n` +
          `• \`@Inkeep <prompt>\` — Include thread context automatically\n` +
          `• \`@Inkeep\` (no prompt) — Open agent selector to choose a different agent\n\n` +
          `Use \`/inkeep help\` for more options.`,
      });
      return;
    }

    // Has query → Execute agent with streaming
    let queryText = text;

    // Include thread context if in a thread
    if (isInThread && threadTs) {
      const contextMessages = await getThreadContext(slackClient, channel, threadTs);
      if (contextMessages) {
        queryText = `Based on the following conversation:\n\n${contextMessages}\n\nUser question: ${text}`;
      }
    }

    // Sign JWT token for authentication
    const slackUserToken = await signSlackUserToken({
      inkeepUserId: existingLink.inkeepUserId,
      tenantId,
      slackTeamId: teamId,
      slackUserId,
    });

    // Post acknowledgement message
    const ackMessage = await slackClient.chat.postMessage({
      channel,
      thread_ts: replyThreadTs,
      text: `_${agentDisplayName} is preparing a response..._`,
    });

    const conversationId = generateSlackConversationId({
      teamId,
      threadTs: replyThreadTs,
      channel,
      isDM: false,
    });

    logger.info(
      { projectId: agentConfig.projectId, agentId: agentConfig.agentId, conversationId },
      'Executing agent'
    );

    await streamAgentResponse({
      slackClient,
      channel,
      threadTs: replyThreadTs,
      thinkingMessageTs: ackMessage.ts || '',
      slackUserId,
      teamId,
      jwtToken: slackUserToken,
      projectId: agentConfig.projectId,
      agentId: agentConfig.agentId,
      question: queryText,
      agentName: agentDisplayName,
      conversationId,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage: errorMsg, channel, teamId }, 'Failed in app mention handler');

    const errorType = classifyError(error);
    const userMessage = getUserFriendlyErrorMessage(errorType);

    try {
      await slackClient.chat.postEphemeral({
        channel,
        user: slackUserId,
        thread_ts: isInThread ? threadTs : undefined,
        text: userMessage,
      });
    } catch (postError) {
      logger.error({ error: postError }, 'Failed to post error message');
      try {
        await postMessageInThread(slackClient, channel, replyThreadTs, userMessage);
      } catch {
        // Ignore - we tried our best
      }
    }
  }
}

/**
 * Resolve bot token from various sources (Nango, memory cache, env)
 */
async function resolveBotToken(teamId: string): Promise<string | null> {
  const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
  if (workspaceConnection?.botToken) {
    return workspaceConnection.botToken;
  }

  const memoryToken = getBotTokenForTeam(teamId);
  if (memoryToken) {
    return memoryToken;
  }

  if (env.SLACK_BOT_TOKEN) {
    return env.SLACK_BOT_TOKEN;
  }

  return null;
}
