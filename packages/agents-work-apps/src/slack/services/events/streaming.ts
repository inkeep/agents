/**
 * Slack streaming utilities for public agent responses (@mention flow)
 *
 * Uses SlackUserToken JWT for authentication to Run API.
 * Streams responses incrementally to Slack using chatStream API.
 */

import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { createContextBlock } from '../blocks';
import type { getSlackClient } from '../client';
import { classifyError, getUserFriendlyErrorMessage, SlackErrorType } from './utils';

const logger = getLogger('slack-streaming');

const STREAM_TIMEOUT_MS = 120_000;
const CHATSTREAM_OP_TIMEOUT_MS = 10_000;

/**
 * Wrap a promise with a timeout to prevent indefinite blocking on Slack API calls.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

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
  } = params;

  const apiUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

  logger.debug(
    { conversationId, channel, threadTs },
    'Streaming agent response with conversation context'
  );

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.warn({ channel, threadTs, timeoutMs: STREAM_TIMEOUT_MS }, 'Stream timeout reached');
    abortController.abort();
  }, STREAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${apiUrl.replace(/\/$/, '')}/run/api/chat`, {
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
      signal: abortController.signal,
    });
  } catch (fetchError) {
    clearTimeout(timeoutId);
    if ((fetchError as Error).name === 'AbortError') {
      const errorType = SlackErrorType.TIMEOUT;
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
    throw fetchError;
  }

  if (!response.ok) {
    clearTimeout(timeoutId);
    const errorBody = await response.text().catch(() => 'Unknown error');
    logger.error({ status: response.status, errorBody }, 'Agent streaming request failed');

    const errorType = classifyError(null, response.status);
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

  if (!response.body) {
    clearTimeout(timeoutId);
    logger.error(
      { status: response.status, channel, threadTs },
      'Agent API returned 200 but no response body'
    );
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
            await withTimeout(
              streamer.append({ markdown_text: data.delta }),
              CHATSTREAM_OP_TIMEOUT_MS,
              'streamer.append'
            );
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
            await withTimeout(
              streamer.append({ markdown_text: content }),
              CHATSTREAM_OP_TIMEOUT_MS,
              'streamer.append'
            );
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    clearTimeout(timeoutId);

    const contextBlock = createContextBlock({ agentName });
    await withTimeout(
      streamer.stop({ blocks: [contextBlock] }),
      CHATSTREAM_OP_TIMEOUT_MS,
      'streamer.stop'
    );

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
    clearTimeout(timeoutId);
    logger.error({ streamError }, 'Error during Slack streaming');
    await withTimeout(streamer.stop(), CHATSTREAM_OP_TIMEOUT_MS, 'streamer.stop').catch((e) =>
      logger.warn({ error: e }, 'Failed to stop streamer during error cleanup')
    );

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
    } catch (notifyError) {
      logger.warn({ notifyError, channel, threadTs }, 'Failed to notify user of stream error');
    }

    return { success: false, errorType, errorMessage };
  }
}
