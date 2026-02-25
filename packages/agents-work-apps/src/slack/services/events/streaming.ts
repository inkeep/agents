/**
 * Slack streaming utilities for public agent responses (@mention flow)
 *
 * Uses SlackUserToken JWT for authentication to Run API.
 * Streams responses incrementally to Slack using chatStream API.
 */

import { getInProcessFetch, retryWithBackoff } from '@inkeep/agents-core';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { SLACK_SPAN_KEYS, SLACK_SPAN_NAMES, setSpanWithError, tracer } from '../../tracer';
import {
  buildCitationsBlock,
  buildDataArtifactBlocks,
  buildDataComponentBlocks,
  buildSummaryBreadcrumbBlock,
  buildToolApprovalBlocks,
  buildToolApprovalExpiredBlocks,
  buildToolOutputErrorBlock,
  createContextBlock,
  type ToolApprovalButtonValue,
} from '../blocks';
import type { getSlackClient } from '../client';
import {
  classifyError,
  extractApiErrorMessage,
  getUserFriendlyErrorMessage,
  SlackErrorType,
} from './utils';

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

/**
 * Clean up the thinking acknowledgment message after streaming completes or fails.
 * When the thinking message IS the thread anchor (slash commands at channel root),
 * update it to show the user's question or invocation attribution instead of deleting,
 * since deleting a thread anchor leaves "This message was deleted." as the root.
 */
async function cleanupThinkingMessage(params: {
  slackClient: ReturnType<typeof getSlackClient>;
  channel: string;
  thinkingMessageTs: string;
  threadTs?: string;
  slackUserId: string;
  agentName: string;
  question: string;
}): Promise<void> {
  const { slackClient, channel, thinkingMessageTs, threadTs, slackUserId, agentName, question } =
    params;

  if (!thinkingMessageTs) return;

  try {
    if (thinkingMessageTs === threadTs) {
      const text = question
        ? `<@${slackUserId}> to ${agentName}: "${question}"`
        : `<@${slackUserId}> invoked _${agentName}_`;
      await slackClient.chat.update({
        channel,
        ts: thinkingMessageTs,
        text,
      });
    } else {
      await slackClient.chat.delete({
        channel,
        ts: thinkingMessageTs,
      });
    }
  } catch (error) {
    logger.warn({ error, channel, thinkingMessageTs }, 'Failed to clean up thinking message');
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
  threadTs?: string;
  thinkingMessageTs: string;
  slackUserId: string;
  teamId: string;
  jwtToken: string;
  projectId: string;
  agentId: string;
  question: string;
  agentName: string;
  conversationId: string;
  entryPoint?: string;
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
      entryPoint,
    } = params;

    const threadParam = threadTs ? { thread_ts: threadTs } : {};
    const cleanupParams = {
      slackClient,
      channel,
      thinkingMessageTs,
      threadTs,
      slackUserId,
      agentName,
      question,
    };

    span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);
    span.setAttribute(SLACK_SPAN_KEYS.CHANNEL_ID, channel);
    span.setAttribute(SLACK_SPAN_KEYS.USER_ID, slackUserId);
    span.setAttribute(SLACK_SPAN_KEYS.PROJECT_ID, projectId);
    span.setAttribute(SLACK_SPAN_KEYS.AGENT_ID, agentId);
    if (conversationId) span.setAttribute(SLACK_SPAN_KEYS.CONVERSATION_ID, conversationId);
    if (threadTs) span.setAttribute(SLACK_SPAN_KEYS.THREAD_TS, threadTs);

    const apiUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

    logger.info(
      { conversationId, channel, threadTs, agentId, projectId },
      'Starting streaming agent response'
    );

    const abortController = new AbortController();
    // Resolved when the abort fires — used in Promise.race so that a blocked
    // reader.read() is unblocked immediately even when the in-process Hono
    // ReadableStream does not propagate the AbortSignal through its pipeline.
    const abortPromise = new Promise<never>((_, reject) => {
      abortController.signal.addEventListener('abort', () => reject(new Error('Stream timeout')), {
        once: true,
      });
    });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
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
          'x-inkeep-invocation-type': 'slack',
          ...(entryPoint && { 'x-inkeep-invocation-entry-point': entryPoint }),
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
          ...threadParam,
          text: errorMessage,
        });

        await cleanupThinkingMessage(cleanupParams);

        span.end();
        return { success: false, errorType, errorMessage };
      }
      const errorType = classifyError(fetchError);
      const errorMessage = getUserFriendlyErrorMessage(errorType, agentName);

      await slackClient.chat
        .postMessage({
          channel,
          ...threadParam,
          text: errorMessage,
        })
        .catch((e) => logger.warn({ error: e }, 'Failed to send fetch error notification'));

      await cleanupThinkingMessage(cleanupParams);

      if (fetchError instanceof Error) setSpanWithError(span, fetchError);
      span.end();
      return { success: false, errorType, errorMessage };
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      const errorBody = await response.text().catch(() => 'Unknown error');
      logger.error({ status: response.status, errorBody }, 'Agent streaming request failed');

      const apiMessage = extractApiErrorMessage(errorBody);
      const errorType = classifyError(null, response.status);
      const errorMessage = apiMessage
        ? `*Error.* ${apiMessage}`
        : getUserFriendlyErrorMessage(errorType, agentName);

      await slackClient.chat.postMessage({
        channel,
        ...threadParam,
        text: errorMessage,
      });

      await cleanupThinkingMessage(cleanupParams);

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
        ...threadParam,
        text: errorMessage,
      });

      await cleanupThinkingMessage(cleanupParams);

      span.end();
      return { success: false, errorType, errorMessage };
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    const chatStreamArgs = {
      channel,
      recipient_team_id: teamId,
      recipient_user_id: slackUserId,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    } as Parameters<typeof slackClient.chatStream>[0];
    const streamer = slackClient.chatStream(chatStreamArgs);
    /** Tracks whether `chat.startStream` was called (i.e. a Slack streaming message exists). */
    let streamerStarted = false;

    const pendingApprovalMessages: Array<{
      messageTs: string;
      toolName: string;
      toolCallId: string;
    }> = [];
    const toolCallIdToName = new Map<string, string>();
    const toolCallIdToInput = new Map<string, Record<string, unknown>>();
    const toolErrors: Array<{ toolName: string; errorText: string }> = [];
    const successfulToolNames = new Set<string>();
    const citations: Array<{ title?: string; url?: string }> = [];
    const summaryLabels: string[] = [];
    let richMessageCount = 0;
    let richMessageCapWarned = false;
    const MAX_RICH_MESSAGES = 20;

    try {
      let agentCompleted = false;

      while (true) {
        const { done, value } = await Promise.race([reader.read(), abortPromise]);
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
              const toolCallId: string = data.toolCallId;
              const toolName: string = toolCallIdToName.get(toolCallId) || 'Tool';
              const input: Record<string, unknown> | undefined = toolCallIdToInput.get(toolCallId);

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

              const approvalPost = await slackClient.chat
                .postMessage({
                  channel,
                  ...threadParam,
                  text: `Tool approval required: \`${toolName}\``,
                  blocks: buildToolApprovalBlocks({
                    toolName,
                    input,
                    buttonValue: JSON.stringify(buttonValue),
                  }),
                })
                .catch((e) => {
                  logger.warn({ error: e, toolCallId }, 'Failed to post tool approval message');
                  return null;
                });
              if (approvalPost?.ts) {
                pendingApprovalMessages.push({ messageTs: approvalPost.ts, toolName, toolCallId });
              }
              // Clear the stream timeout — we're now waiting for human approval which
              // can take minutes. The backend has its own APPROVAL_TIMEOUT_MS and will
              // close the stream when that expires, triggering the expiry path in catch.
              clearTimeout(timeoutId);
              continue;
            }

            if (data.type === 'tool-input-available' && data.toolCallId && data.toolName) {
              toolCallIdToName.set(String(data.toolCallId), String(data.toolName));
              if (data.input && typeof data.input === 'object') {
                toolCallIdToInput.set(
                  String(data.toolCallId),
                  data.input as Record<string, unknown>
                );
              }
              continue;
            }

            if (data.type === 'tool-output-denied' && data.toolCallId) {
              const idx = pendingApprovalMessages.findIndex(
                (m) => m.toolCallId === data.toolCallId
              );
              if (idx !== -1) pendingApprovalMessages.splice(idx, 1);
              continue;
            }

            if (data.type === 'tool-output-error' && data.toolCallId) {
              const toolName = toolCallIdToName.get(String(data.toolCallId)) || 'Tool';
              toolErrors.push({ toolName, errorText: String(data.errorText || 'Unknown error') });
              continue;
            }

            if (data.type === 'tool-output-available' && data.toolCallId) {
              const toolName = toolCallIdToName.get(String(data.toolCallId));
              if (toolName) successfulToolNames.add(toolName);
              continue;
            }

            if (data.type === 'data-component' && data.data && typeof data.data === 'object') {
              if (richMessageCount < MAX_RICH_MESSAGES) {
                const { blocks, overflowJson, componentType } = buildDataComponentBlocks({
                  id: String(data.id || ''),
                  data: data.data as Record<string, unknown>,
                });
                if (overflowJson) {
                  const label = componentType || 'data-component';
                  await retryWithBackoff(
                    () =>
                      slackClient.files.uploadV2({
                        channel_id: channel,
                        ...threadParam,
                        filename: `${label}.json`,
                        content: overflowJson,
                        initial_comment: `📊 ${label}`,
                      }),
                    { label: 'slack-file-upload' }
                  ).catch((e) =>
                    logger.warn(
                      { error: e, channel, threadTs, agentId, componentType: label },
                      'Failed to upload data component file'
                    )
                  );
                } else {
                  await slackClient.chat
                    .postMessage({
                      channel,
                      ...threadParam,
                      text: '📊 Data component',
                      blocks,
                    })
                    .catch((e) => logger.warn({ error: e }, 'Failed to post data component'));
                }
                richMessageCount++;
              } else if (!richMessageCapWarned) {
                logger.warn(
                  { channel, threadTs, agentId, eventType: 'data-component', MAX_RICH_MESSAGES },
                  'MAX_RICH_MESSAGES cap reached — additional rich content will be dropped'
                );
                richMessageCapWarned = true;
              }
              continue;
            }

            if (data.type === 'data-artifact' && data.data && typeof data.data === 'object') {
              const artifactData = data.data as Record<string, unknown>;
              if (
                typeof artifactData.type === 'string' &&
                artifactData.type.toLowerCase() === 'citation'
              ) {
                const summary = artifactData.artifactSummary as
                  | { title?: string; url?: string }
                  | undefined;
                if (summary?.url && !citations.some((c) => c.url === summary.url)) {
                  citations.push({ title: summary.title, url: summary.url });
                  const citationIndex = citations.length;
                  if (fullText.length > 0) {
                    await withTimeout(
                      streamer.append({ markdown_text: `<${summary.url}|[${citationIndex}]>` }),
                      CHATSTREAM_OP_TIMEOUT_MS,
                      'streamer.append'
                    ).catch((e) => logger.warn({ error: e }, 'Failed to append inline citation'));
                  }
                }
              } else if (richMessageCount < MAX_RICH_MESSAGES) {
                const { blocks, overflowContent, artifactName } = buildDataArtifactBlocks({
                  data: artifactData,
                });
                if (overflowContent) {
                  const label = artifactName || 'artifact';
                  await retryWithBackoff(
                    () =>
                      slackClient.files.uploadV2({
                        channel_id: channel,
                        ...threadParam,
                        filename: `${label}.md`,
                        content: overflowContent,
                        initial_comment: `📄 ${label}`,
                      }),
                    { label: 'slack-file-upload' }
                  ).catch((e) =>
                    logger.warn(
                      { error: e, channel, threadTs, agentId, artifactName: label },
                      'Failed to upload artifact file'
                    )
                  );
                } else {
                  await slackClient.chat
                    .postMessage({ channel, ...threadParam, text: '📄 Data', blocks })
                    .catch((e) => logger.warn({ error: e }, 'Failed to post data artifact'));
                }
                richMessageCount++;
              } else if (!richMessageCapWarned) {
                logger.warn(
                  { channel, threadTs, agentId, eventType: 'data-artifact', MAX_RICH_MESSAGES },
                  'MAX_RICH_MESSAGES cap reached — additional rich content will be dropped'
                );
                richMessageCapWarned = true;
              }
              continue;
            }

            if (data.type === 'data-summary' && data.data?.label) {
              summaryLabels.push(String(data.data.label));
              continue;
            }

            if (data.type === 'text-start' || data.type === 'text-end') {
              continue;
            }

            if (data.type === 'text-delta' && data.delta) {
              fullText += data.delta;
              const appendResult = await withTimeout(
                streamer.append({ markdown_text: data.delta }),
                CHATSTREAM_OP_TIMEOUT_MS,
                'streamer.append'
              );
              if (appendResult != null) streamerStarted = true;
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
              const appendResult = await withTimeout(
                streamer.append({ markdown_text: content }),
                CHATSTREAM_OP_TIMEOUT_MS,
                'streamer.append'
              );
              if (appendResult != null) streamerStarted = true;
            }
          } catch {
            // Skip invalid JSON
          }
        }

        if (agentCompleted) break;
      }

      clearTimeout(timeoutId);

      const stopBlocks: any[] = [];
      for (const { toolName, errorText } of toolErrors) {
        if (successfulToolNames.has(toolName)) continue;
        stopBlocks.push(buildToolOutputErrorBlock(toolName, errorText));
      }
      if (summaryLabels.length > 0) {
        stopBlocks.push(buildSummaryBreadcrumbBlock(summaryLabels));
      }
      if (citations.length > 0) {
        const citationBlocks = buildCitationsBlock(citations);
        stopBlocks.push(...citationBlocks);
      }
      stopBlocks.push(createContextBlock({ agentName }));

      try {
        await withTimeout(
          streamer.stop({ blocks: stopBlocks.slice(0, 50) }),
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

      await cleanupThinkingMessage(cleanupParams);

      logger.info(
        {
          channel,
          threadTs,
          responseLength: fullText.length,
          agentId,
          conversationId,
          toolErrorCount: toolErrors.length,
          citationCount: citations.length,
          richMessageCount,
        },
        'Streaming completed'
      );

      span.end();
      return { success: true };
    } catch (streamError) {
      clearTimeout(timeoutId);
      reader?.cancel().catch(() => {});
      if (streamError instanceof Error) setSpanWithError(span, streamError);

      for (const { messageTs, toolName } of pendingApprovalMessages) {
        await slackClient.chat
          .update({
            channel,
            ts: messageTs,
            text: `⏱️ Expired · \`${toolName}\``,
            blocks: buildToolApprovalExpiredBlocks({ toolName }),
          })
          .catch((e) => logger.warn({ error: e, messageTs }, 'Failed to expire approval message'));
      }

      const contentAlreadyDelivered = fullText.length > 0;

      if (contentAlreadyDelivered) {
        // Content was already streamed to the user — a late error (e.g. streamer.append
        // timeout on the final chunk) should not surface as a user-facing error message.
        span.setAttribute(SLACK_SPAN_KEYS.CONTENT_ALREADY_DELIVERED, true);
        logger.warn(
          { streamError, channel, threadTs, responseLength: fullText.length },
          'Error during Slack streaming after content was already delivered — suppressing user-facing error'
        );
        // Only finalize if the streamer was started (a Slack message exists).
        // Calling stop() on an unstarted streamer would call chat.startStream(),
        // creating a phantom duplicate message.
        if (streamerStarted) {
          await withTimeout(streamer.stop(), CLEANUP_TIMEOUT_MS, 'streamer.stop-cleanup').catch(
            (e) => logger.warn({ error: e }, 'Failed to stop streamer during error cleanup')
          );
        }

        await cleanupThinkingMessage(cleanupParams);

        span.end();
        return { success: true };
      }

      // Approval(s) expired — the stream ended while waiting for tool approval.
      // The approval block is already updated to "Expired"; post a concise follow-up
      // instead of the generic timeout error.
      if (pendingApprovalMessages.length > 0) {
        for (const { toolName } of pendingApprovalMessages) {
          await slackClient.chat
            .postMessage({
              channel,
              ...threadParam,
              text: `Approval for \`${toolName}\` has expired.`,
            })
            .catch((e) =>
              logger.warn({ error: e }, 'Failed to send approval expired notification')
            );
        }
        if (streamerStarted) {
          await withTimeout(streamer.stop(), CLEANUP_TIMEOUT_MS, 'streamer.stop-cleanup').catch(
            (e) => logger.warn({ error: e }, 'Failed to stop streamer during error cleanup')
          );
        }
        await cleanupThinkingMessage(cleanupParams);
        span.end();
        return { success: true };
      }

      // No content was delivered — surface the error to the user.
      // Do NOT call streamer.stop() here: the streamer was never started, so stop()
      // would call chat.startStream() creating a phantom message with buffered content.
      logger.error({ streamError }, 'Error during Slack streaming');

      await cleanupThinkingMessage(cleanupParams);

      const errorType = classifyError(streamError);
      const errorMessage = getUserFriendlyErrorMessage(errorType, agentName);

      try {
        await slackClient.chat.postMessage({
          channel,
          ...threadParam,
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
