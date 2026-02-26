import { signSlackUserToken } from '@inkeep/agents-core';
import { getLogger } from '../../../logger';
import { SLACK_SPAN_KEYS, SLACK_SPAN_NAMES, setSpanWithError, tracer } from '../../tracer';
import { getSlackChannelInfo, getSlackClient, getSlackUserInfo } from '../client';
import type { ModalMetadata } from '../modals';
import { findWorkspaceConnectionByTeamId } from '../nango';
import { executeAgentPublicly } from './execution';
import {
  classifyError,
  findCachedUserMapping,
  formatChannelContext,
  formatSlackQuery,
  generateSlackConversationId,
  getThreadContext,
  getUserFriendlyErrorMessage,
} from './utils';

const logger = getLogger('slack-modal-submission');

export async function handleModalSubmission(view: {
  private_metadata?: string;
  callback_id?: string;
  state?: { values?: Record<string, Record<string, unknown>> };
}): Promise<void> {
  return tracer.startActiveSpan(SLACK_SPAN_NAMES.MODAL_SUBMISSION, async (span) => {
    try {
      const metadata = JSON.parse(view.private_metadata || '{}') as ModalMetadata & {
        selectedAgentId?: string;
        selectedProjectId?: string;
      };
      span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, metadata.teamId || '');
      span.setAttribute(SLACK_SPAN_KEYS.CHANNEL_ID, metadata.channel || '');
      span.setAttribute(SLACK_SPAN_KEYS.USER_ID, metadata.slackUserId || '');
      span.setAttribute(SLACK_SPAN_KEYS.TENANT_ID, metadata.tenantId || '');

      const values = view.state?.values || {};

      const agentSelectValue = Object.values(values)
        .map((block) => (block as Record<string, unknown>).agent_select)
        .find(Boolean) as { selected_option?: { value?: string } } | undefined;
      const questionValue = values.question_block?.question_input as { value?: string };
      const includeContextValue = values.context_block?.include_context_checkbox as {
        selected_options?: Array<{ value?: string }>;
      };

      const question = questionValue?.value || '';
      const includeContext =
        includeContextValue?.selected_options?.some((o) => o.value === 'include_context') ?? true;

      let agentId = metadata.selectedAgentId;
      let projectId = metadata.selectedProjectId;
      let agentName: string | null = null;

      if (agentSelectValue?.selected_option?.value) {
        try {
          const parsed = JSON.parse(agentSelectValue.selected_option.value);
          agentId = parsed.agentId;
          projectId = parsed.projectId;
          agentName = parsed.agentName || null;
        } catch {
          logger.warn(
            { value: agentSelectValue.selected_option.value },
            'Failed to parse agent select value'
          );
        }
      }

      const agentDisplayName = agentName || agentId || 'Agent';

      if (!agentId || !projectId) {
        logger.error({ metadata }, 'Missing agent or project ID in modal submission');
        span.end();
        return;
      }
      span.setAttribute(SLACK_SPAN_KEYS.AGENT_ID, agentId);
      span.setAttribute(SLACK_SPAN_KEYS.PROJECT_ID, projectId);
      span.setAttribute(SLACK_SPAN_KEYS.AUTHORIZED, false);

      const tenantId = metadata.tenantId;

      const [workspaceConnection, existingLink] = await Promise.all([
        findWorkspaceConnectionByTeamId(metadata.teamId),
        findCachedUserMapping(tenantId, metadata.slackUserId, metadata.teamId),
      ]);

      if (!workspaceConnection?.botToken) {
        logger.error({ teamId: metadata.teamId }, 'No bot token for modal submission');
        span.end();
        return;
      }

      const slackClient = getSlackClient(workspaceConnection.botToken);

      const [channelInfo, userInfo] = await Promise.all([
        getSlackChannelInfo(slackClient, metadata.channel),
        getSlackUserInfo(slackClient, metadata.slackUserId),
      ]);
      const channelContext = formatChannelContext(channelInfo);
      const userName = userInfo?.displayName || 'User';

      let fullQuestion: string;

      if (metadata.messageContext) {
        fullQuestion = formatSlackQuery({
          text: question || '',
          channelContext,
          userName,
          threadContext: metadata.messageContext,
          isAutoExecute: !question,
        });
      } else if (metadata.isInThread && metadata.threadTs && includeContext) {
        const contextMessages = await getThreadContext(
          slackClient,
          metadata.channel,
          metadata.threadTs
        );
        if (contextMessages) {
          fullQuestion = formatSlackQuery({
            text: question || '',
            channelContext,
            userName,
            threadContext: contextMessages,
            isAutoExecute: !question,
          });
        } else {
          fullQuestion = formatSlackQuery({ text: question, channelContext, userName });
        }
      } else {
        fullQuestion = formatSlackQuery({ text: question, channelContext, userName });
      }

      if (!existingLink) {
        logger.info(
          { slackUserId: metadata.slackUserId, teamId: metadata.teamId },
          'User not linked — prompting account link in modal submission'
        );
        await slackClient.chat.postEphemeral({
          channel: metadata.channel,
          user: metadata.slackUserId,
          text: 'Link your account first. Run `/inkeep link` to connect.',
        });
        span.end();
        return;
      }

      const slackUserToken = await signSlackUserToken({
        inkeepUserId: existingLink.inkeepUserId,
        tenantId,
        slackTeamId: metadata.teamId,
        slackUserId: metadata.slackUserId,
        slackAuthorized: false,
      });

      const conversationId = generateSlackConversationId({
        teamId: metadata.teamId,
        messageTs: metadata.messageTs,
        agentId,
      });
      span.setAttribute(SLACK_SPAN_KEYS.CONVERSATION_ID, conversationId);

      // For message shortcuts, always thread on the original message so the reply
      // appears as a thread reply rather than a new channel-root message.
      // For agent selector modals (no messageContext), only thread if already in a thread.
      const threadTs = metadata.messageContext
        ? metadata.threadTs || metadata.messageTs
        : metadata.isInThread
          ? metadata.threadTs || metadata.messageTs
          : undefined;

      await executeAgentPublicly({
        slackClient,
        channel: metadata.channel,
        threadTs,
        slackUserId: metadata.slackUserId,
        teamId: metadata.teamId,
        jwtToken: slackUserToken,
        projectId,
        agentId,
        agentName: agentDisplayName,
        question: fullQuestion,
        conversationId,
        entryPoint: metadata.messageContext ? 'message_shortcut' : 'modal_submission',
      });

      logger.info(
        { agentId, projectId, tenantId, slackUserId: metadata.slackUserId, conversationId },
        'Modal submission agent execution completed'
      );
      span.end();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ errorMessage: errorMsg, view }, 'Failed to handle modal submission');
      if (error instanceof Error) setSpanWithError(span, error);

      try {
        const metadata = JSON.parse(view.private_metadata || '{}') as ModalMetadata;
        const workspaceConnection = await findWorkspaceConnectionByTeamId(metadata.teamId);

        if (workspaceConnection?.botToken) {
          const slackClient = getSlackClient(workspaceConnection.botToken);
          const errorType = classifyError(error);
          const userMessage = getUserFriendlyErrorMessage(errorType);

          await slackClient.chat.postEphemeral({
            channel: metadata.channel,
            user: metadata.slackUserId,
            text: userMessage,
          });
        }
      } catch (notifyError) {
        logger.error({ notifyError }, 'Failed to notify user of modal submission error');
      }
      span.end();
    }
  });
}
