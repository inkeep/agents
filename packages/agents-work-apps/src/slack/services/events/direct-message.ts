import type { SlackLinkIntent } from '@inkeep/agents-core';
import { signSlackUserToken } from '@inkeep/agents-core';
import { getLogger } from '../../../logger';
import { SlackStrings } from '../../i18n';
import { SLACK_SPAN_KEYS, SLACK_SPAN_NAMES, setSpanWithError, tracer } from '../../tracer';
import { getSlackClient, getSlackUserInfo } from '../client';
import { buildLinkPromptMessage, resolveUnlinkedUserAction } from '../link-prompt';
import { findWorkspaceConnectionByTeamId } from '../nango';
import { executeAgentPublicly } from './execution';
import {
  classifyError,
  findCachedUserMapping,
  formatSlackQuery,
  generateSlackConversationId,
  getThreadContext,
  getUserFriendlyErrorMessage,
} from './utils';

const logger = getLogger('slack-direct-message');

export async function handleDirectMessage(params: {
  slackUserId: string;
  channel: string;
  text: string;
  threadTs?: string;
  messageTs: string;
  teamId: string;
}): Promise<void> {
  return tracer.startActiveSpan(SLACK_SPAN_NAMES.DIRECT_MESSAGE, async (span) => {
    const { slackUserId, channel, text, threadTs, messageTs, teamId } = params;

    span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);
    span.setAttribute(SLACK_SPAN_KEYS.CHANNEL_ID, channel);
    span.setAttribute(SLACK_SPAN_KEYS.USER_ID, slackUserId);
    span.setAttribute(SLACK_SPAN_KEYS.MESSAGE_TS, messageTs);
    if (threadTs) span.setAttribute(SLACK_SPAN_KEYS.THREAD_TS, threadTs);

    logger.info({ slackUserId, channel, teamId }, 'Handling direct message');

    const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);

    if (!workspaceConnection?.botToken) {
      logger.error({ teamId }, 'No bot token available — cannot respond to DM');
      span.end();
      return;
    }

    const { botToken, tenantId } = workspaceConnection;
    if (!tenantId) {
      logger.error({ teamId }, 'Workspace connection has no tenantId');
      span.end();
      return;
    }
    span.setAttribute(SLACK_SPAN_KEYS.TENANT_ID, tenantId);

    const slackClient = getSlackClient(botToken);
    const replyThreadTs = threadTs || messageTs;
    const isInThread = Boolean(threadTs && threadTs !== messageTs);

    try {
      const defaultAgent = workspaceConnection.defaultAgent;
      if (!defaultAgent?.agentId || !defaultAgent?.projectId) {
        logger.info({ teamId }, 'No default agent configured — sending hint in DM');
        await slackClient.chat.postMessage({
          channel,
          thread_ts: replyThreadTs,
          text: SlackStrings.errors.noAgentConfigured,
        });
        span.end();
        return;
      }

      span.setAttribute(SLACK_SPAN_KEYS.AGENT_ID, defaultAgent.agentId);
      span.setAttribute(SLACK_SPAN_KEYS.PROJECT_ID, defaultAgent.projectId);
      const agentDisplayName = defaultAgent.agentName || defaultAgent.agentId;

      const [existingLink, userInfo] = await Promise.all([
        findCachedUserMapping(tenantId, slackUserId, teamId),
        getSlackUserInfo(slackClient, slackUserId),
      ]);

      if (!existingLink) {
        logger.info({ slackUserId, teamId }, 'User not linked — sending link prompt in DM');

        const intent: SlackLinkIntent = {
          entryPoint: 'dm',
          question: text.slice(0, 2000),
          channelId: channel,
          messageTs,
          agentId: defaultAgent.agentId,
          projectId: defaultAgent.projectId,
        };

        const linkResult = await resolveUnlinkedUserAction({
          tenantId,
          teamId,
          slackUserId,
          botToken,
          intent,
        });
        const message = buildLinkPromptMessage(linkResult);

        await slackClient.chat.postMessage({
          channel,
          thread_ts: replyThreadTs,
          text: SlackStrings.linkPrompt.intro,
          blocks: message.blocks,
        });
        span.end();
        return;
      }

      const userName = userInfo?.displayName || 'User';
      const dmChannelContext = 'a Slack direct message';

      const senderTimezone = userInfo?.tz ?? undefined;

      let queryText: string;
      if (isInThread && threadTs) {
        const contextMessages = await getThreadContext(slackClient, channel, threadTs);
        if (contextMessages) {
          queryText = formatSlackQuery({
            text: text || '',
            channelContext: dmChannelContext,
            userName,
            threadContext: contextMessages,
            isAutoExecute: !text,
            messageTs,
            senderTimezone,
          });
        } else {
          queryText = formatSlackQuery({
            text,
            channelContext: dmChannelContext,
            userName,
            messageTs,
            senderTimezone,
          });
        }
      } else {
        queryText = formatSlackQuery({
          text,
          channelContext: dmChannelContext,
          userName,
          messageTs,
          senderTimezone,
        });
      }

      const slackUserToken = await signSlackUserToken({
        inkeepUserId: existingLink.inkeepUserId,
        tenantId,
        slackTeamId: teamId,
        slackUserId,
        slackAuthorized: false,
      });

      const conversationId = generateSlackConversationId({
        teamId,
        messageTs,
        agentId: defaultAgent.agentId,
        isDM: true,
      });
      span.setAttribute(SLACK_SPAN_KEYS.CONVERSATION_ID, conversationId);

      logger.info(
        { agentId: defaultAgent.agentId, projectId: defaultAgent.projectId, conversationId },
        'Executing agent for DM'
      );

      await executeAgentPublicly({
        slackClient,
        channel,
        threadTs: replyThreadTs,
        slackUserId,
        teamId,
        jwtToken: slackUserToken,
        projectId: defaultAgent.projectId,
        agentId: defaultAgent.agentId,
        agentName: agentDisplayName,
        question: queryText,
        rawMessageText: text,
        conversationId,
        entryPoint: 'direct_message',
      });
      span.end();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ errorMessage: errorMsg, channel, teamId }, 'Failed in DM handler');
      if (error instanceof Error) setSpanWithError(span, error);

      const errorType = classifyError(error);
      const userMessage = getUserFriendlyErrorMessage(errorType);

      try {
        await slackClient.chat.postMessage({
          channel,
          thread_ts: replyThreadTs,
          text: userMessage,
        });
      } catch (postError) {
        logger.error({ error: postError }, 'Failed to post DM error message');
      }
      span.end();
    }
  });
}
