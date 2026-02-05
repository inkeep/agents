/**
 * Handler for Slack modal submission events
 */

import { findWorkAppSlackUserMapping, signSlackUserToken } from '@inkeep/agents-core';
import runDbClient from '../../../db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { SlackStrings } from '../../i18n';
import { buildShareButtons, createContextBlock } from '../blocks';
import { getSlackClient } from '../client';
import type { ModalMetadata, ResponseVisibility } from '../modals';
import { findWorkspaceConnectionByTeamId } from '../nango';
import {
  classifyError,
  getThreadContext,
  getUserFriendlyErrorMessage,
  markdownToMrkdwn,
  sendResponseUrlMessage,
} from './utils';

const logger = getLogger('slack-modal-submission');

export async function handleModalSubmission(view: {
  private_metadata?: string;
  state?: { values?: Record<string, Record<string, unknown>> };
}): Promise<void> {
  try {
    const metadata = JSON.parse(view.private_metadata || '{}') as ModalMetadata & {
      selectedAgentId?: string;
      selectedProjectId?: string;
    };

    const values = view.state?.values || {};

    const agentSelectValue = values.agent_select_block?.agent_select as {
      selected_option?: { value?: string };
    };
    const questionValue = values.question_block?.question_input as { value?: string };
    const includeContextValue = values.context_block?.include_context_checkbox as {
      selected_options?: Array<{ value?: string }>;
    };

    // Parse visibility based on context (radio buttons for channel, checkbox for thread)
    let visibility: ResponseVisibility = 'private';
    if (metadata.isInThread) {
      // Thread context uses checkbox
      const visibilityCheckbox = values.visibility_block?.visibility_checkbox as {
        selected_options?: Array<{ value?: string }>;
      };
      const isEphemeral =
        visibilityCheckbox?.selected_options?.some((o) => o.value === 'ephemeral') || false;
      visibility = isEphemeral ? 'private' : 'thread';
    } else {
      // Channel context uses radio buttons
      const visibilityRadio = values.visibility_block?.visibility_radio as {
        selected_option?: { value?: string };
      };
      visibility = (visibilityRadio?.selected_option?.value as ResponseVisibility) || 'private';
    }

    const question = questionValue?.value || '';
    const includeContext =
      includeContextValue?.selected_options?.some((o) => o.value === 'include_context') ?? true;

    let agentId = metadata.selectedAgentId;
    let projectId = metadata.selectedProjectId;

    if (agentSelectValue?.selected_option?.value) {
      try {
        const parsed = JSON.parse(agentSelectValue.selected_option.value);
        agentId = parsed.agentId;
        projectId = parsed.projectId;
      } catch {
        logger.warn(
          { value: agentSelectValue.selected_option.value },
          'Failed to parse agent select value'
        );
      }
    }

    if (!agentId || !projectId) {
      logger.error({ metadata }, 'Missing agent or project ID in modal submission');
      return;
    }

    const workspaceConnection = await findWorkspaceConnectionByTeamId(metadata.teamId);
    if (!workspaceConnection?.botToken) {
      logger.error({ teamId: metadata.teamId }, 'No bot token for modal submission');
      return;
    }

    const slackClient = getSlackClient(workspaceConnection.botToken);
    const tenantId = metadata.tenantId;

    let fullQuestion = question;

    // Check if this is a message shortcut with pre-filled message context
    if (metadata.messageContext) {
      fullQuestion = question
        ? `Based on the following message:\n\n${metadata.messageContext}\n\nUser request: ${question}`
        : `Based on the following message, please provide a helpful response or analysis:\n\n${metadata.messageContext}`;
    } else if (metadata.isInThread && metadata.threadTs && includeContext) {
      // Regular thread context flow
      const contextMessages = await getThreadContext(
        slackClient,
        metadata.channel,
        metadata.threadTs
      );
      if (contextMessages) {
        fullQuestion = question
          ? `Based on the following conversation:\n\n${contextMessages}\n\nUser request: ${question}`
          : `Based on the following conversation, please provide a helpful response or summary:\n\n${contextMessages}`;
      }
    }

    if (!fullQuestion) {
      logger.warn({ metadata }, 'No question provided in modal submission');
      return;
    }

    const existingLink = await findWorkAppSlackUserMapping(runDbClient)(
      tenantId,
      metadata.slackUserId,
      metadata.teamId,
      'work-apps-slack'
    );

    if (!existingLink) {
      await slackClient.chat.postEphemeral({
        channel: metadata.channel,
        user: metadata.slackUserId,
        text: '🔗 You need to link your account first. Use `/inkeep link` to get started.',
      });
      return;
    }

    const slackUserToken = await signSlackUserToken({
      inkeepUserId: existingLink.inkeepUserId,
      tenantId,
      slackTeamId: metadata.teamId,
      slackUserId: metadata.slackUserId,
    });

    const apiBaseUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
    const replyThreadTs = metadata.threadTs || metadata.messageTs;

    // For "Ask Again" flow with private visibility, we can use buttonResponseUrl to replace messages in-place
    // This avoids stacking multiple ephemeral messages
    const canReplaceInPlace = Boolean(metadata.buttonResponseUrl) && visibility === 'private';

    // For non-private visibility, delete the button message immediately
    if (metadata.buttonResponseUrl && !canReplaceInPlace) {
      sendResponseUrlMessage(metadata.buttonResponseUrl, {
        text: '',
        delete_original: true,
      }).catch((deleteError) => {
        logger.warn({ deleteError }, 'Failed to delete button message');
      });
    }

    // Post thinking message based on visibility
    let thinkingMessageTs: string | undefined;
    const thinkingText = SlackStrings.status.thinking(agentId);
    if (visibility === 'private') {
      if (canReplaceInPlace && metadata.buttonResponseUrl) {
        // Replace the previous response with "thinking..." message
        await sendResponseUrlMessage(metadata.buttonResponseUrl, {
          text: thinkingText,
          response_type: 'ephemeral',
          replace_original: true,
        });
      } else {
        // Initial flow - post new ephemeral
        const thinkingPayload: Parameters<typeof slackClient.chat.postEphemeral>[0] = {
          channel: metadata.channel,
          user: metadata.slackUserId,
          text: thinkingText,
        };
        if (metadata.isInThread && metadata.threadTs) {
          thinkingPayload.thread_ts = metadata.threadTs;
        }
        await slackClient.chat.postEphemeral(thinkingPayload);
      }
    } else if (visibility === 'thread') {
      const thinkingResult = await slackClient.chat.postMessage({
        channel: metadata.channel,
        thread_ts: replyThreadTs,
        text: thinkingText,
      });
      thinkingMessageTs = thinkingResult.ts;
    } else {
      // visibility === 'channel' - post directly to channel
      const thinkingResult = await slackClient.chat.postMessage({
        channel: metadata.channel,
        text: thinkingText,
      });
      thinkingMessageTs = thinkingResult.ts;
    }

    const response = await fetch(`${apiBaseUrl}/run/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${slackUserToken}`,
        'x-inkeep-project-id': projectId,
        'x-inkeep-agent-id': agentId,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: fullQuestion }],
        stream: false,
      }),
    });

    let responseText = 'No response received';
    let isError = false;

    if (response.ok) {
      const result = await response.json();
      const rawContent =
        result.choices?.[0]?.message?.content || result.message?.content || responseText;
      // Convert markdown to Slack mrkdwn format
      responseText = markdownToMrkdwn(rawContent);
    } else {
      isError = true;
      const errorType = classifyError(null, response.status);
      responseText = getUserFriendlyErrorMessage(errorType, agentId);
      logger.warn(
        { status: response.status, statusText: response.statusText, agentId },
        'Agent API returned error'
      );
    }

    // Post response based on visibility
    if (visibility === 'private') {
      try {
        const contextBlock = createContextBlock({ agentName: agentId, isPrivate: true });
        const shareButtons = buildShareButtons({
          channelId: metadata.channel,
          text: responseText,
          agentName: agentId,
          threadTs: metadata.isInThread ? metadata.threadTs : undefined,
          askAgainMetadata: {
            teamId: metadata.teamId,
            slackUserId: metadata.slackUserId,
            tenantId,
            messageTs: metadata.messageTs,
          },
        });

        const responseBlocks = isError
          ? [{ type: 'section' as const, text: { type: 'mrkdwn' as const, text: responseText } }]
          : [
              { type: 'section' as const, text: { type: 'mrkdwn' as const, text: responseText } },
              contextBlock,
              { type: 'actions' as const, elements: shareButtons },
            ];

        if (canReplaceInPlace && metadata.buttonResponseUrl) {
          // Replace "thinking..." with actual response (in-place update)
          await sendResponseUrlMessage(metadata.buttonResponseUrl, {
            text: responseText,
            response_type: 'ephemeral',
            replace_original: true,
            blocks: responseBlocks,
          });
        } else {
          // Initial flow - post new ephemeral
          const ephemeralPayload: Parameters<typeof slackClient.chat.postEphemeral>[0] = {
            channel: metadata.channel,
            user: metadata.slackUserId,
            text: responseText,
            blocks: responseBlocks,
          };

          if (metadata.isInThread && metadata.threadTs) {
            ephemeralPayload.thread_ts = metadata.threadTs;
          }

          await slackClient.chat.postEphemeral(ephemeralPayload);
        }
      } catch (ephemeralError) {
        logger.error({ ephemeralError }, 'Failed to post ephemeral message');
      }
    } else if (visibility === 'thread') {
      // Post to thread
      const blocks = isError
        ? [{ type: 'section' as const, text: { type: 'mrkdwn' as const, text: responseText } }]
        : [
            { type: 'section' as const, text: { type: 'mrkdwn' as const, text: responseText } },
            createContextBlock({ agentName: agentId }),
          ];

      await slackClient.chat.postMessage({
        channel: metadata.channel,
        thread_ts: replyThreadTs,
        text: responseText,
        blocks,
      });

      if (thinkingMessageTs) {
        try {
          await slackClient.chat.delete({
            channel: metadata.channel,
            ts: thinkingMessageTs,
          });
        } catch (deleteError) {
          logger.warn({ deleteError }, 'Failed to delete thinking message');
        }
      }
    } else {
      // visibility === 'channel' - post directly to channel (no thread)
      const blocks = isError
        ? [{ type: 'section' as const, text: { type: 'mrkdwn' as const, text: responseText } }]
        : [
            { type: 'section' as const, text: { type: 'mrkdwn' as const, text: responseText } },
            createContextBlock({ agentName: agentId }),
          ];

      await slackClient.chat.postMessage({
        channel: metadata.channel,
        text: responseText,
        blocks,
      });

      if (thinkingMessageTs) {
        try {
          await slackClient.chat.delete({
            channel: metadata.channel,
            ts: thinkingMessageTs,
          });
        } catch (deleteError) {
          logger.warn({ deleteError }, 'Failed to delete thinking message');
        }
      }
    }

    logger.info(
      { agentId, projectId, tenantId, slackUserId: metadata.slackUserId, visibility },
      'Modal submission agent execution completed'
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ errorMessage: errorMsg, view }, 'Failed to handle modal submission');

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
  }
}
