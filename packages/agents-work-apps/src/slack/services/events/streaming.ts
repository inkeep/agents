/**
 * Slack streaming utilities for public agent responses (@mention flow)
 *
 * Uses SlackUserToken JWT for authentication to Run API.
 * Streams responses incrementally to Slack using chatStream API.
 */

import { getInProcessFetch } from '@inkeep/agents-core';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { SLACK_SPAN_KEYS, SLACK_SPAN_NAMES, setSpanWithError, tracer } from '../../tracer';
import {
  buildToolApprovalBlocks,
  createContextBlock,
  type ToolApprovalButtonValue,
} from '../blocks';
import type { getSlackClient } from '../client';
import { classifyError, getUserFriendlyErrorMessage, SlackErrorType } from './utils';

const logger = getLogger('slack-streaming');

const STREAM_TIMEOUT_MS = 600_000;
const CHATSTREAM_OP_TIMEOUT_MS = 20_000;
/** Shorter timeout for best-effort cleanup in error paths to bound total error handling time. */
const CLEANUP_TIMEOUT_MS = 3_000;

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
  conversationId: string;
}): Promise<StreamResult> {
  return tracer.startActiveSpan(SLACK_SPAN_NAMES.STREAM_AGENT_RESPONSE, async (span) => {
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

    span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);
    span.setAttribute(SLACK_SPAN_KEYS.CHANNEL_ID, channel);
    span.setAttribute(SLACK_SPAN_KEYS.USER_ID, slackUserId);
    span.setAttribute(SLACK_SPAN_KEYS.PROJECT_ID, projectId);
    span.setAttribute(SLACK_SPAN_KEYS.AGENT_ID, agentId);
    if (conversationId) span.setAttribute(SLACK_SPAN_KEYS.CONVERSATION_ID, conversationId);
    span.setAttribute(SLACK_SPAN_KEYS.THREAD_TS, threadTs);

    const apiUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

    logger.info(
      { conversationId, channel, threadTs, agentId, projectId },
      'Starting streaming agent response'
    );

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      logger.warn({ channel, threadTs, timeoutMs: STREAM_TIMEOUT_MS }, 'Stream timeout reached');
      abortController.abort();
    }, STREAM_TIMEOUT_MS);

    let response: Response;
    try {
      response = await getInProcessFetch()(`${apiUrl.replace(/\/$/, '')}/run/api/chat`, {
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

        span.end();
        return { success: false, errorType, errorMessage };
      }
      const errorType = classifyError(fetchError);
      const errorMessage = getUserFriendlyErrorMessage(errorType, agentName);

      await slackClient.chat
        .postMessage({
          channel,
          thread_ts: threadTs,
          text: errorMessage,
        })
        .catch((e) => logger.warn({ error: e }, 'Failed to send fetch error notification'));

      if (thinkingMessageTs) {
        try {
          await slackClient.chat.delete({ channel, ts: thinkingMessageTs });
        } catch {
          // Ignore delete errors
        }
      }

      if (fetchError instanceof Error) setSpanWithError(span, fetchError);
      span.end();
      return { success: false, errorType, errorMessage };
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

      span.end();
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

      span.end();
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
      let agentCompleted = false;

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
              if (data.data?.type === 'completion') {
                agentCompleted = true;
                break;
              }
              continue;
            }

            if (data.type === 'tool-approval-request' && conversationId) {
              const toolName: string = data.toolName || 'Tool';
              const toolCallId: string = data.toolCallId;
              const input: Record<string, unknown> | undefined = data.input;

              const buttonValue: ToolApprovalButtonValue = {
                toolCallId,
                conversationId,
                projectId,
                agentId,
                slackUserId,
                channel,
                threadTs,
                toolName,
              };

              await slackClient.chat
                .postMessage({
                  channel,
                  thread_ts: threadTs,
                  text: `Tool approval required: \`${toolName}\``,
                  blocks: buildToolApprovalBlocks({
                    toolName,
                    input,
                    buttonValue: JSON.stringify(buttonValue),
                  }),
                })
                .catch((e) =>
                  logger.warn({ error: e, toolCallId }, 'Failed to post tool approval message')
                );
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
            } else if (
              data.object === 'chat.completion.chunk' &&
              data.choices?.[0]?.delta?.content
            ) {
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

        if (agentCompleted) break;
      }

      clearTimeout(timeoutId);

      const contextBlock = createContextBlock({ agentName });
      try {
        await withTimeout(
          streamer.stop({ blocks: [contextBlock] }),
          CHATSTREAM_OP_TIMEOUT_MS,
          'streamer.stop'
        );
      } catch (stopError) {
        // If content was already delivered to the user, a streamer.stop() timeout
        // is a non-critical finalization error — log it but don't surface to user
        span.setAttribute(SLACK_SPAN_KEYS.STREAM_FINALIZATION_FAILED, true);
        logger.warn(
          { stopError, channel, threadTs, responseLength: fullText.length },
          'Failed to finalize chatStream — content was already delivered'
        );
      }

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

      logger.info(
        { channel, threadTs, responseLength: fullText.length, agentId, conversationId },
        'Streaming completed'
      );

      span.end();
      return { success: true };
    } catch (streamError) {
      clearTimeout(timeoutId);
      if (streamError instanceof Error) setSpanWithError(span, streamError);

      const contentAlreadyDelivered = fullText.length > 0;

      if (contentAlreadyDelivered) {
        // Content was already streamed to the user — a late error (e.g. streamer.append
        // timeout on the final chunk) should not surface as a user-facing error message.
        span.setAttribute(SLACK_SPAN_KEYS.CONTENT_ALREADY_DELIVERED, true);
        logger.warn(
          { streamError, channel, threadTs, responseLength: fullText.length },
          'Error during Slack streaming after content was already delivered — suppressing user-facing error'
        );
        await withTimeout(streamer.stop(), CLEANUP_TIMEOUT_MS, 'streamer.stop-cleanup').catch((e) =>
          logger.warn({ error: e }, 'Failed to stop streamer during error cleanup')
        );

        if (thinkingMessageTs) {
          try {
            await slackClient.chat.delete({ channel, ts: thinkingMessageTs });
          } catch {
            // Ignore delete errors in error path
          }
        }

        span.end();
        return { success: true };
      }

      // No content was delivered — surface the error to the user
      logger.error({ streamError }, 'Error during Slack streaming');
      await withTimeout(streamer.stop(), CLEANUP_TIMEOUT_MS, 'streamer.stop-cleanup').catch((e) =>
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

      span.end();
      return { success: false, errorType, errorMessage };
    }
  });
}
