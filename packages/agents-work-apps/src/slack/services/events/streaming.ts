/**
 * Slack streaming utilities for agent responses
 *
 * Uses SlackUserToken JWT for authentication to Run API.
 */

import { env } from '../../../env';
import { getLogger } from '../../../logger';
import type { getSlackClient } from '../client';
import {
  classifyError,
  getUserFriendlyErrorMessage,
  markdownToMrkdwn,
  SlackErrorType,
} from './utils';

const logger = getLogger('slack-streaming');

export interface StreamResult {
  success: boolean;
  errorType?: SlackErrorType;
  errorMessage?: string;
}

export async function streamAgentResponse(params: {
  slackClient: ReturnType<typeof getSlackClient>;
  channel: string;
  threadTs: string;
  thinkingMessageTs: string;
  slackUserId: string;
  teamId: string;
  jwtToken: string;
  projectId: string;
  agentId: string;
  question: string;
  agentName: string;
  conversationId?: string;
  isEphemeral?: boolean;
}): Promise<StreamResult> {
  const {
    slackClient,
    channel,
    threadTs,
    thinkingMessageTs,
    slackUserId,
    teamId,
    jwtToken,
    projectId,
    agentId,
    question,
    agentName,
    conversationId,
    isEphemeral = false,
  } = params;

  const apiUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

  logger.debug(
    { conversationId, channel, threadTs },
    'Streaming agent response with conversation context'
  );

  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/run/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwtToken}`,
      'x-inkeep-project-id': projectId,
      'x-inkeep-agent-id': agentId,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: question }],
      stream: true,
      ...(conversationId && { conversationId }),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    logger.error({ status: response.status, errorBody }, 'Agent streaming request failed');

    const errorType = classifyError(null, response.status);
    const errorMessage = getUserFriendlyErrorMessage(errorType, agentName);

    if (isEphemeral) {
      await slackClient.chat.postEphemeral({
        channel,
        user: slackUserId,
        thread_ts: threadTs,
        text: errorMessage,
      });
    } else {
      await slackClient.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: errorMessage,
      });
    }

    if (thinkingMessageTs) {
      try {
        await slackClient.chat.delete({ channel, ts: thinkingMessageTs });
      } catch {
        // Ignore delete errors
      }
    }

    return { success: false, errorType, errorMessage };
  }

  if (!response.body) {
    const errorType = SlackErrorType.API_ERROR;
    const errorMessage = getUserFriendlyErrorMessage(errorType, agentName);

    await slackClient.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: errorMessage,
    });

    if (thinkingMessageTs) {
      try {
        await slackClient.chat.delete({ channel, ts: thinkingMessageTs });
      } catch {
        // Ignore delete errors
      }
    }

    return { success: false, errorType, errorMessage };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  if (isEphemeral) {
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
            if (
              data.type === 'data-operation' ||
              data.type === 'text-start' ||
              data.type === 'text-end'
            ) {
              continue;
            }
            if (data.type === 'text-delta' && data.delta) {
              fullText += data.delta;
            } else if (
              data.object === 'chat.completion.chunk' &&
              data.choices?.[0]?.delta?.content
            ) {
              const content = data.choices[0].delta.content;
              try {
                const parsed = JSON.parse(content);
                if (parsed.type === 'data-operation') continue;
              } catch {
                // Not JSON, use as-is
              }
              fullText += content;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      // Convert markdown to Slack mrkdwn format
      const formattedText = markdownToMrkdwn(fullText);

      const contextBlock = {
        type: 'context' as const,
        elements: [
          {
            type: 'mrkdwn' as const,
            text: `_Private response_ • Powered by *${agentName}* via Inkeep`,
          },
        ],
      };

      // Build share buttons - if in a thread, show both "Share to Thread" (primary) and "Share to Channel"
      const shareButtons: Array<{
        type: 'button';
        text: { type: 'plain_text'; text: string; emoji: boolean };
        action_id: string;
        value: string;
        style?: 'primary';
      }> = [];

      if (threadTs) {
        shareButtons.push({
          type: 'button',
          text: { type: 'plain_text', text: 'Share to Thread', emoji: true },
          action_id: 'share_to_thread',
          style: 'primary',
          value: JSON.stringify({ channelId: channel, threadTs, text: formattedText, agentName }),
        });
      }

      shareButtons.push({
        type: 'button',
        text: { type: 'plain_text', text: 'Share to Channel', emoji: true },
        action_id: 'share_to_channel',
        value: JSON.stringify({ channelId: channel, text: formattedText, agentName }),
      });

      await slackClient.chat.postEphemeral({
        channel,
        user: slackUserId,
        thread_ts: threadTs,
        text: formattedText,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: formattedText } },
          contextBlock,
          { type: 'actions', elements: shareButtons },
        ],
      });

      logger.debug(
        { channel, threadTs, responseLength: fullText.length, isEphemeral },
        'Ephemeral response posted'
      );

      return { success: true };
    } catch (error) {
      logger.error({ error }, 'Error posting ephemeral response');

      const errorType = classifyError(error);
      const errorMessage = getUserFriendlyErrorMessage(errorType, agentName);

      try {
        await slackClient.chat.postEphemeral({
          channel,
          user: slackUserId,
          thread_ts: threadTs,
          text: errorMessage,
        });
      } catch {
        // Ignore - we tried our best
      }

      return { success: false, errorType, errorMessage };
    }
  }

  const streamer = slackClient.chatStream({
    channel,
    recipient_team_id: teamId,
    recipient_user_id: slackUserId,
    thread_ts: threadTs,
  });

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

          if (data.type === 'data-operation') {
            continue;
          }

          if (data.type === 'text-start' || data.type === 'text-end') {
            continue;
          }

          if (data.type === 'text-delta' && data.delta) {
            fullText += data.delta;
            await streamer.append({ markdown_text: data.delta });
          } else if (data.object === 'chat.completion.chunk' && data.choices?.[0]?.delta?.content) {
            const content = data.choices[0].delta.content;
            try {
              const parsed = JSON.parse(content);
              if (parsed.type === 'data-operation') {
                continue;
              }
            } catch {
              // Not JSON, use as-is
            }
            fullText += content;
            await streamer.append({ markdown_text: content });
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    // Public responses don't need "Share to Channel" - content is already visible
    const contextBlock = {
      type: 'context' as const,
      elements: [
        {
          type: 'mrkdwn' as const,
          text: `Powered by *${agentName}* via Inkeep`,
        },
      ],
    };

    await streamer.stop({ blocks: [contextBlock] });

    if (thinkingMessageTs) {
      try {
        await slackClient.chat.delete({
          channel,
          ts: thinkingMessageTs,
        });
      } catch (deleteError) {
        logger.warn({ deleteError }, 'Failed to delete acknowledgement message');
      }
    }

    logger.debug({ channel, threadTs, responseLength: fullText.length }, 'Streaming completed');

    return { success: true };
  } catch (streamError) {
    logger.error({ streamError }, 'Error during Slack streaming');
    await streamer.stop();

    if (thinkingMessageTs) {
      try {
        await slackClient.chat.delete({
          channel,
          ts: thinkingMessageTs,
        });
      } catch {
        // Ignore delete errors in error path
      }
    }

    const errorType = classifyError(streamError);
    const errorMessage = getUserFriendlyErrorMessage(errorType, agentName);

    try {
      await slackClient.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: errorMessage,
      });
    } catch {
      // Ignore - we tried our best
    }

    return { success: false, errorType, errorMessage };
  }
}
