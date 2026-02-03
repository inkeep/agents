/**
 * Handler for Slack modal submission events
 */

import { findWorkAppSlackUserMapping, signSlackUserToken } from '@inkeep/agents-core';
import runDbClient from '../../../db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { getSlackClient } from '../client';
import type { ModalMetadata } from '../modals';
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
    const visibilityValue = values.visibility_block?.visibility_checkbox as {
      selected_options?: Array<{ value?: string }>;
    };
    const includeContextValue = values.context_block?.include_context_checkbox as {
      selected_options?: Array<{ value?: string }>;
    };

    const question = questionValue?.value || '';
    const isEphemeral =
      visibilityValue?.selected_options?.some((o) => o.value === 'ephemeral') || false;
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

    if (metadata.isInThread && metadata.threadTs && includeContext) {
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
      if (isEphemeral) {
        await slackClient.chat.postEphemeral({
          channel: metadata.channel,
          user: metadata.slackUserId,
          text: '🔗 You need to link your account first. Use `/inkeep link` to get started.',
        });
      } else {
        await slackClient.chat.postMessage({
          channel: metadata.channel,
          thread_ts: metadata.threadTs || metadata.messageTs,
          text: '🔗 You need to link your account first. Use `/inkeep link` to get started.',
        });
      }
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

    let thinkingMessageTs: string | undefined;
    if (isEphemeral) {
      const thinkingPayload: Parameters<typeof slackClient.chat.postEphemeral>[0] = {
        channel: metadata.channel,
        user: metadata.slackUserId,
        text: `_${agentId} is thinking..._`,
      };
      if (metadata.isInThread && metadata.threadTs) {
        thinkingPayload.thread_ts = metadata.threadTs;
      }
      await slackClient.chat.postEphemeral(thinkingPayload);
    } else {
      const thinkingResult = await slackClient.chat.postMessage({
        channel: metadata.channel,
        thread_ts: replyThreadTs,
        text: `_${agentId} is thinking..._`,
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

    if (isEphemeral) {
      try {
        if (isError) {
          // Error response - just show the error message
          const ephemeralPayload: Parameters<typeof slackClient.chat.postEphemeral>[0] = {
            channel: metadata.channel,
            user: metadata.slackUserId,
            text: responseText,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: responseText },
              },
            ],
          };

          if (metadata.isInThread && metadata.threadTs) {
            ephemeralPayload.thread_ts = metadata.threadTs;
          }

          await slackClient.chat.postEphemeral(ephemeralPayload);
        } else {
          // Success response - show with context and share buttons
          // If in a thread, show both "Share to Thread" (primary) and "Share to Channel"
          // If not in a thread, only show "Share to Channel"
          const shareButtons: Array<{
            type: 'button';
            text: { type: 'plain_text'; text: string; emoji: boolean };
            action_id: string;
            value: string;
            style?: 'primary';
          }> = [];

          if (metadata.isInThread && metadata.threadTs) {
            // Share to Thread is primary when in a thread
            shareButtons.push({
              type: 'button',
              text: { type: 'plain_text', text: 'Share to Thread', emoji: true },
              action_id: 'share_to_thread',
              style: 'primary',
              value: JSON.stringify({
                channelId: metadata.channel,
                threadTs: metadata.threadTs,
                text: responseText,
                agentName: agentId,
              }),
            });
          }

          // Always include Share to Channel
          shareButtons.push({
            type: 'button',
            text: { type: 'plain_text', text: 'Share to Channel', emoji: true },
            action_id: 'share_to_channel',
            value: JSON.stringify({
              channelId: metadata.channel,
              text: responseText,
              agentName: agentId,
            }),
          });

          const ephemeralPayload: Parameters<typeof slackClient.chat.postEphemeral>[0] = {
            channel: metadata.channel,
            user: metadata.slackUserId,
            text: responseText,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: responseText },
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `Powered by *${agentId}* via Inkeep • Only visible to you`,
                  },
                ],
              },
              {
                type: 'actions',
                elements: shareButtons,
              },
            ],
          };

          if (metadata.isInThread && metadata.threadTs) {
            ephemeralPayload.thread_ts = metadata.threadTs;
          }

          await slackClient.chat.postEphemeral(ephemeralPayload);
        }
      } catch (ephemeralError) {
        logger.error({ ephemeralError }, 'Failed to post ephemeral message');
      }
    } else {
      if (isError) {
        // Error response - just show the error message
        await slackClient.chat.postMessage({
          channel: metadata.channel,
          thread_ts: replyThreadTs,
          text: responseText,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: responseText },
            },
          ],
        });
      } else {
        // Success response - show with context
        await slackClient.chat.postMessage({
          channel: metadata.channel,
          thread_ts: replyThreadTs,
          text: responseText,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: responseText },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `Powered by *${agentId}* via Inkeep`,
                },
              ],
            },
          ],
        });
      }

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

    if (metadata.buttonResponseUrl) {
      try {
        await sendResponseUrlMessage(metadata.buttonResponseUrl, {
          text: '',
          delete_original: true,
        });
      } catch (deleteError) {
        logger.warn({ deleteError }, 'Failed to delete button message');
      }
    }

    logger.info(
      { agentId, projectId, tenantId, slackUserId: metadata.slackUserId, isEphemeral },
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
