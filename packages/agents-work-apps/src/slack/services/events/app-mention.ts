/**
 * Handler for Slack @mention events
 *
 * Flow:
 * 1. Resolve workspace connection (single lookup, cached)
 * 2. Parallel: resolve agent config + check user link
 * 3. If no agent configured → prompt to set up in dashboard
 * 4. If not linked → prompt to link account
 * 5. Handle based on context:
 *    - Channel + no query → Show usage hint
 *    - Channel + query → Execute agent with streaming response
 *    - Thread + no query → Auto-execute agent with thread context as query
 *    - Thread + query → Execute agent with thread context included
 */

import type { SlackLinkIntent } from '@inkeep/agents-core';
import { signSlackLinkToken, signSlackUserToken } from '@inkeep/agents-core';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { SlackStrings } from '../../i18n';
import { SLACK_SPAN_KEYS, SLACK_SPAN_NAMES, setSpanWithError, tracer } from '../../tracer';
import { createSmartLinkMessage } from '../blocks';
import {
  getSlackChannelInfo,
  getSlackClient,
  getSlackUserInfo,
  postMessageInThread,
} from '../client';
import { findWorkspaceConnectionByTeamId } from '../nango';
import { getBotTokenForTeam } from '../workspace-tokens';
import { streamAgentResponse } from './streaming';
import {
  checkIfBotThread,
  classifyError,
  findCachedUserMapping,
  formatChannelContext,
  generateSlackConversationId,
  getThreadContext,
  getUserFriendlyErrorMessage,
  resolveChannelAgentConfig,
  timedOp,
} from './utils';

const logger = getLogger('slack-app-mention');

/**
 * Metadata passed to the agent selector modal via button value
 */
export interface InlineSelectorMetadata {
  channel: string;
  threadTs?: string;
  messageTs: string;
  teamId: string;
  slackUserId: string;
  tenantId: string;
  threadMessageCount?: number;
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
  dispatchedAt?: number;
}): Promise<void> {
  return tracer.startActiveSpan(SLACK_SPAN_NAMES.APP_MENTION, async (span) => {
    const { slackUserId, channel, text, threadTs, messageTs, teamId, dispatchedAt } = params;
    const handlerStartedAt = Date.now();
    const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';

    const dispatchDelayMs = dispatchedAt ? handlerStartedAt - dispatchedAt : undefined;
    span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);
    span.setAttribute(SLACK_SPAN_KEYS.CHANNEL_ID, channel);
    span.setAttribute(SLACK_SPAN_KEYS.USER_ID, slackUserId);
    span.setAttribute(SLACK_SPAN_KEYS.HAS_QUERY, text.trim().length > 0);
    span.setAttribute(SLACK_SPAN_KEYS.IS_IN_THREAD, Boolean(threadTs && threadTs !== messageTs));
    if (threadTs) span.setAttribute(SLACK_SPAN_KEYS.THREAD_TS, threadTs);
    if (messageTs) span.setAttribute(SLACK_SPAN_KEYS.MESSAGE_TS, messageTs);
    if (dispatchDelayMs !== undefined) span.setAttribute('dispatch_delay_ms', dispatchDelayMs);

    logger.info(
      { slackUserId, channel, teamId, dispatchDelayMs, handlerStartedAt },
      'Handling app mention'
    );

    if (dispatchDelayMs !== undefined && dispatchDelayMs > 5000) {
      logger.warn(
        { teamId, channel, dispatchDelayMs, dispatchedAt, handlerStartedAt },
        'Significant delay between dispatch and handler start — possible instance suspension'
      );
    }

    // Step 1: Single workspace connection lookup (cached, includes bot token + default agent)
    const { result: workspaceConnection } = await timedOp(findWorkspaceConnectionByTeamId(teamId), {
      label: 'workspace connection lookup',
      context: { teamId },
    });

    const botToken =
      workspaceConnection?.botToken || getBotTokenForTeam(teamId) || env.SLACK_BOT_TOKEN;
    if (!botToken) {
      logger.error({ teamId }, 'No bot token available — cannot respond to @mention');
      span.end();
      return;
    }

    const tenantId = workspaceConnection?.tenantId;
    if (!tenantId) {
      logger.error(
        { teamId },
        'Workspace connection has no tenantId — workspace may need reinstall'
      );
      const slackClient = getSlackClient(botToken);
      await slackClient.chat
        .postEphemeral({
          channel,
          user: slackUserId,
          text: '⚠️ This workspace is not properly configured. Please reinstall the Slack app from the Inkeep dashboard.',
        })
        .catch((e) =>
          logger.warn({ error: e, channel }, 'Failed to send ephemeral workspace config error')
        );
      span.end();
      return;
    }
    span.setAttribute(SLACK_SPAN_KEYS.TENANT_ID, tenantId);
    const dashboardUrl = `${manageUiUrl}/${tenantId}/work-apps/slack`;

    const slackClient = getSlackClient(botToken);
    const replyThreadTs = threadTs || messageTs;
    const isInThread = Boolean(threadTs && threadTs !== messageTs);
    const hasQuery = Boolean(text && text.trim().length > 0);
    let thinkingMessageTs: string | undefined;

    try {
      // Step 2: Parallel lookup — agent config + user mapping (independent queries)
      const {
        result: [agentConfig, existingLink],
      } = await timedOp(
        Promise.all([
          resolveChannelAgentConfig(teamId, channel, workspaceConnection),
          findCachedUserMapping(tenantId, slackUserId, teamId),
        ]),
        {
          label: 'agent config / user mapping lookup',
          context: { teamId, channel },
        }
      );

      if (!agentConfig) {
        logger.info({ teamId, channel }, 'No agent configured for workspace — prompting setup');
        await slackClient.chat.postEphemeral({
          channel,
          user: slackUserId,
          thread_ts: isInThread ? threadTs : undefined,
          text: `⚙️ No agents configured for this workspace.\n\n👉 *<${dashboardUrl}|Set up agents in the dashboard>*`,
        });
        span.end();
        return;
      }

      span.setAttribute(SLACK_SPAN_KEYS.AGENT_ID, agentConfig.agentId);
      span.setAttribute(SLACK_SPAN_KEYS.PROJECT_ID, agentConfig.projectId);
      const agentDisplayName = agentConfig.agentName || agentConfig.agentId;

      if (!existingLink) {
        logger.info({ slackUserId, teamId, channel }, 'User not linked — prompting account link');

        const intent: SlackLinkIntent = {
          entryPoint: 'mention',
          question: text.slice(0, 2000),
          channelId: channel,
          threadTs: isInThread ? threadTs : undefined,
          messageTs,
          agentId: agentConfig.agentId,
          projectId: agentConfig.projectId,
        };

        const linkToken = await signSlackLinkToken({
          tenantId,
          slackTeamId: teamId,
          slackUserId,
          intent,
        });

        const linkUrl = `${manageUiUrl}/link?token=${encodeURIComponent(linkToken)}`;
        const message = createSmartLinkMessage(linkUrl);

        logger.info(
          {
            event: 'smart_link_intent_captured',
            entryPoint: 'mention',
            questionLength: intent.question.length,
            channelId: channel,
          },
          'Smart link intent captured'
        );

        await slackClient.chat.postEphemeral({
          channel,
          user: slackUserId,
          thread_ts: isInThread ? threadTs : undefined,
          text: "To get started, let's connect your Inkeep account with Slack.",
          blocks: message.blocks,
        });
        span.end();
        return;
      }

      // Step 3: Handle based on context
      if (!isInThread && !hasQuery) {
        logger.info(
          { slackUserId, channel, teamId },
          'Mention in channel with no query — showing usage hint'
        );
        await slackClient.chat.postEphemeral({
          channel,
          user: slackUserId,
          text: SlackStrings.usage.mentionEmpty,
        });
        span.end();
        return;
      }

      if (isInThread && !hasQuery) {
        // Thread + no query → Parallel: check if bot thread + fetch thread context
        const [isBotThread, contextMessages, channelInfo] = await Promise.all([
          checkIfBotThread(slackClient, channel, threadTs),
          getThreadContext(slackClient, channel, threadTs),
          getSlackChannelInfo(slackClient, channel),
        ]);

        if (isBotThread) {
          logger.info(
            { slackUserId, channel, teamId, threadTs },
            'Mention in bot thread with no query — showing continue hint'
          );
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
          span.end();
          return;
        }

        // Non-bot thread → Auto-execute with thread context as query
        if (!contextMessages) {
          logger.warn(
            { channel, teamId, threadTs },
            'Unable to retrieve thread context for auto-execution'
          );
          await slackClient.chat.postEphemeral({
            channel,
            user: slackUserId,
            thread_ts: threadTs,
            text: `Unable to retrieve thread context. Try using \`@Inkeep <your question>\` instead.`,
          });
          span.end();
          return;
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
          thread_ts: threadTs,
          text: `_${agentDisplayName} is reading this thread..._`,
        });
        thinkingMessageTs = ackMessage.ts || undefined;

        const conversationId = generateSlackConversationId({
          teamId,
          threadTs,
          channel,
          isDM: false,
          agentId: agentConfig.agentId,
        });
        span.setAttribute(SLACK_SPAN_KEYS.CONVERSATION_ID, conversationId);

        const channelContext = formatChannelContext(channelInfo);
        const threadQuery = `A user mentioned you in a thread in ${channelContext}.

<slack_thread_context>
${contextMessages}
</slack_thread_context>

Based on the thread above, provide a helpful response. Consider:
- What is the main topic or question being discussed?
- Is there anything that needs clarification or a direct answer?
- If appropriate, summarize key points or provide relevant information.

Respond naturally as if you're joining the conversation to help.`;

        logger.info(
          { projectId: agentConfig.projectId, agentId: agentConfig.agentId, conversationId },
          'Auto-executing agent with thread context'
        );

        await streamAgentResponse({
          slackClient,
          channel,
          threadTs,
          thinkingMessageTs: thinkingMessageTs || '',
          slackUserId,
          teamId,
          jwtToken: slackUserToken,
          projectId: agentConfig.projectId,
          agentId: agentConfig.agentId,
          question: threadQuery,
          agentName: agentDisplayName,
          conversationId,
        });
        span.end();
        return;
      }

      // Has query → Execute agent with streaming
      let queryText = text;

      // Include thread context if in a thread
      if (isInThread && threadTs) {
        const {
          result: [contextMessages, channelInfo],
        } = await timedOp(
          Promise.all([
            getThreadContext(slackClient, channel, threadTs),
            getSlackChannelInfo(slackClient, channel),
          ]),
          {
            label: 'thread context fetch',
            context: { teamId, channel, threadTs },
          }
        );
        if (contextMessages) {
          const channelContext = formatChannelContext(channelInfo);
          queryText = `The following is thread context from ${channelContext}:\n\n<slack_thread_context>\n${contextMessages}\n</slack_thread_context>\n\nMessage from ${slackUserId}: ${text}`;
        }
      } else {
        const {
          result: [channelInfo, userInfo],
        } = await timedOp(
          Promise.all([
            getSlackChannelInfo(slackClient, channel),
            getSlackUserInfo(slackClient, slackUserId),
          ]),
          { label: 'channel/user info fetch', context: { teamId, channel } }
        );
        const channelContext = formatChannelContext(channelInfo);
        const userName = userInfo?.displayName || 'User';
        queryText = `The following is a message from ${channelContext} from ${userName}: """${text}"""`;
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
      thinkingMessageTs = ackMessage.ts || undefined;

      const conversationId = generateSlackConversationId({
        teamId,
        threadTs: replyThreadTs,
        channel,
        isDM: false,
        agentId: agentConfig.agentId,
      });
      span.setAttribute(SLACK_SPAN_KEYS.CONVERSATION_ID, conversationId);

      const totalPreExecMs = Date.now() - handlerStartedAt;
      logger.info(
        {
          projectId: agentConfig.projectId,
          agentId: agentConfig.agentId,
          conversationId,
          totalPreExecMs,
          dispatchDelayMs,
        },
        'Executing agent'
      );

      await streamAgentResponse({
        slackClient,
        channel,
        threadTs: replyThreadTs,
        thinkingMessageTs: thinkingMessageTs || '',
        slackUserId,
        teamId,
        jwtToken: slackUserToken,
        projectId: agentConfig.projectId,
        agentId: agentConfig.agentId,
        question: queryText,
        agentName: agentDisplayName,
        conversationId,
      });
      span.end();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ errorMessage: errorMsg, channel, teamId }, 'Failed in app mention handler');

      if (error instanceof Error) {
        setSpanWithError(span, error);
      }

      if (thinkingMessageTs) {
        try {
          await slackClient.chat.delete({ channel, ts: thinkingMessageTs });
        } catch {
          // Best-effort cleanup
        }
      }

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
        } catch (fallbackError) {
          logger.warn(
            { error: fallbackError, channel, threadTs: replyThreadTs },
            'Both ephemeral and thread message delivery failed'
          );
        }
      }
      span.end();
    }
  });
}
