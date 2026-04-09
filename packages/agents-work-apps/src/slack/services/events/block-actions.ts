/**
 * Handlers for Slack block action events (button clicks, selections, etc.)
 * and message shortcuts
 */

import { getInProcessFetch, signSlackUserToken } from '@inkeep/agents-core';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { SlackStrings } from '../../i18n';
import { SLACK_SPAN_KEYS, SLACK_SPAN_NAMES, setSpanWithError, tracer } from '../../tracer';
import { lookupAgentName } from '../agent-resolution';
import {
  buildToolApprovalBlocks,
  buildToolApprovalDoneBlocks,
  createContextBlock,
  type ToolApprovalButtonValue,
  ToolApprovalButtonValueSchema,
} from '../blocks';
import { getSlackClient } from '../client';
import { buildAgentSelectorModal, buildMessageShortcutModal, type ModalMetadata } from '../modals';
import { findWorkspaceConnectionByTeamId } from '../nango';
import type { InlineSelectorMetadata } from './app-mention';
import {
  fetchAgentsForProject,
  fetchProjectsForTenant,
  findCachedUserMapping,
  getChannelAgentConfig,
  markdownToMrkdwn,
  sendResponseUrlMessage,
} from './utils';

const logger = getLogger('slack-block-actions');

/**
 * Handle tool approval/denial button clicks.
 * Called when a user clicks "Approve" or "Deny" on a tool approval message.
 */
export async function handleToolApproval(params: {
  actionValue: string;
  approved: boolean;
  teamId: string;
  slackUserId: string;
  responseUrl?: string;
}): Promise<void> {
  return tracer.startActiveSpan(SLACK_SPAN_NAMES.TOOL_APPROVAL, async (span) => {
    const { actionValue, approved, teamId, slackUserId, responseUrl } = params;
    span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);
    span.setAttribute(SLACK_SPAN_KEYS.USER_ID, slackUserId);

    try {
      const buttonValue = ToolApprovalButtonValueSchema.parse(JSON.parse(actionValue));
      const { toolCallId, conversationId, projectId, agentId, toolName } = buttonValue;
      span.setAttribute(SLACK_SPAN_KEYS.CONVERSATION_ID, conversationId);

      const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
      if (!workspaceConnection?.botToken) {
        logger.error({ teamId }, 'No bot token for tool approval');
        span.end();
        return;
      }

      const tenantId = workspaceConnection.tenantId;
      const slackClient = getSlackClient(workspaceConnection.botToken);

      const approvalThreadParam = buttonValue.threadTs ? { thread_ts: buttonValue.threadTs } : {};

      if (slackUserId !== buttonValue.slackUserId) {
        await slackClient.chat
          .postEphemeral({
            channel: buttonValue.channel,
            user: slackUserId,
            ...approvalThreadParam,
            text: 'Only the user who started this conversation can approve or deny this action.',
          })
          .catch((e) => logger.warn({ error: e }, 'Failed to send ownership error notification'));
        span.end();
        return;
      }

      const existingLink = await findCachedUserMapping(tenantId, slackUserId, teamId);
      if (!existingLink) {
        await slackClient.chat
          .postEphemeral({
            channel: buttonValue.channel,
            user: slackUserId,
            ...approvalThreadParam,
            text: 'You need to link your Inkeep account first. Use `/inkeep link`.',
          })
          .catch((e) => logger.warn({ error: e }, 'Failed to send not-linked notification'));
        span.end();
        return;
      }

      const slackUserToken = await signSlackUserToken({
        inkeepUserId: existingLink.inkeepUserId,
        tenantId,
        slackTeamId: teamId,
        slackUserId,
      });

      const apiUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

      const approvalResponse = await getInProcessFetch()(`${apiUrl}/run/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${slackUserToken}`,
          'x-inkeep-project-id': projectId,
          'x-inkeep-agent-id': agentId,
          'x-inkeep-invocation-type': 'slack',
          'x-inkeep-invocation-entry-point': 'tool_approval',
        },
        body: JSON.stringify({
          conversationId,
          messages: [
            {
              role: 'tool',
              parts: [
                {
                  type: 'tool-call',
                  toolCallId,
                  state: 'approval-responded',
                  approval: { id: toolCallId, approved },
                },
              ],
            },
          ],
        }),
      });

      if (!approvalResponse.ok) {
        const errorBody = await approvalResponse.text().catch(() => '');
        logger.error(
          { status: approvalResponse.status, errorBody, toolCallId, conversationId },
          'Tool approval API call failed'
        );
        await slackClient.chat
          .postEphemeral({
            channel: buttonValue.channel,
            user: slackUserId,
            ...approvalThreadParam,
            text: `Failed to ${approved ? 'approve' : 'deny'} \`${toolName}\`. Please try again.`,
          })
          .catch((e) => logger.warn({ error: e }, 'Failed to send approval error notification'));
        span.end();
        return;
      }

      if (responseUrl) {
        await sendResponseUrlMessage(responseUrl, {
          text: approved ? `✅ Approved \`${toolName}\`` : `❌ Denied \`${toolName}\``,
          replace_original: true,
          blocks: buildToolApprovalDoneBlocks({ toolName, approved, actorUserId: slackUserId }),
        }).catch((e) => logger.warn({ error: e }, 'Failed to update approval message'));
      }

      logger.info({ toolCallId, conversationId, approved, slackUserId }, 'Tool approval processed');

      // In durable mode, the approval response is an SSE stream containing the
      // continuation (tool execution result + final LLM response). Consume it and
      // post the result back to the Slack thread.
      const contentType = approvalResponse.headers.get('content-type') || '';
      if (approvalResponse.body && contentType.includes('text/event-stream')) {
        const agentName = (await lookupAgentName(tenantId, projectId, agentId)) || agentId;
        await consumeApprovalContinuationStream({
          response: approvalResponse,
          slackClient,
          channel: buttonValue.channel,
          threadTs: buttonValue.threadTs,
          agentName,
          conversationId,
          projectId,
          agentId,
          slackUserId,
        });
      }

      span.end();
    } catch (error) {
      if (error instanceof Error) setSpanWithError(span, error);
      logger.error({ error, teamId, slackUserId }, 'Failed to handle tool approval');
      if (responseUrl) {
        await sendResponseUrlMessage(responseUrl, {
          text: 'Something went wrong processing your request. Please try again.',
          response_type: 'ephemeral',
        }).catch((e) => logger.warn({ error: e }, 'Failed to send error notification'));
      }
      span.end();
    }
  });
}

/**
 * Handle opening the agent selector modal when user clicks "Select Agent" button
 */
export async function handleOpenAgentSelectorModal(params: {
  triggerId: string;
  actionValue: string;
  teamId: string;
  responseUrl: string;
}): Promise<void> {
  return tracer.startActiveSpan(SLACK_SPAN_NAMES.OPEN_AGENT_SELECTOR_MODAL, async (span) => {
    const { triggerId, actionValue, teamId, responseUrl } = params;
    span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);

    try {
      const metadata = JSON.parse(actionValue) as InlineSelectorMetadata;
      const { channel, threadTs, messageTs, slackUserId, tenantId } = metadata;
      span.setAttribute(SLACK_SPAN_KEYS.CHANNEL_ID, channel);
      span.setAttribute(SLACK_SPAN_KEYS.USER_ID, slackUserId);
      span.setAttribute(SLACK_SPAN_KEYS.TENANT_ID, tenantId);

      // Determine if we're actually in a thread (threadTs exists and differs from messageTs)
      const isInThread = Boolean(threadTs && threadTs !== messageTs);

      const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
      if (!workspaceConnection?.botToken) {
        logger.error({ teamId }, 'No bot token for modal');
        span.end();
        return;
      }

      const slackClient = getSlackClient(workspaceConnection.botToken);

      let projectList = await fetchProjectsForTenant(tenantId);

      if (projectList.length === 0) {
        const defaultAgent = await getChannelAgentConfig(teamId, channel);
        if (defaultAgent) {
          projectList = [
            {
              id: defaultAgent.projectId,
              name: defaultAgent.projectName || defaultAgent.projectId,
            },
          ];
        }
      }

      if (projectList.length === 0) {
        logger.info({ teamId, channel, tenantId }, 'No projects configured — cannot open selector');
        await slackClient.chat.postEphemeral({
          channel,
          user: slackUserId,
          thread_ts: isInThread ? threadTs : undefined,
          text: SlackStrings.status.noProjectsConfigured,
        });
        span.end();
        return;
      }

      // Fetch agents for first project (modal updates dynamically on project change)
      const firstProject = projectList[0];
      let agentList = await fetchAgentsForProject(tenantId, firstProject.id);

      if (agentList.length === 0) {
        const defaultAgent = await getChannelAgentConfig(teamId, channel);
        if (defaultAgent && defaultAgent.projectId === firstProject.id) {
          agentList = [
            {
              id: defaultAgent.agentId,
              name: defaultAgent.agentName || defaultAgent.agentId,
              projectId: defaultAgent.projectId,
              projectName: defaultAgent.projectName || defaultAgent.projectId,
            },
          ];
        }
      }

      const modalMetadata: ModalMetadata = {
        channel,
        threadTs: isInThread ? threadTs : undefined,
        messageTs,
        teamId,
        slackUserId,
        tenantId,
        isInThread,
        buttonResponseUrl: responseUrl,
      };

      const modal = buildAgentSelectorModal({
        projects: projectList,
        agents: agentList.map((a) => ({
          id: a.id,
          name: a.name,
          projectId: a.projectId,
          projectName: a.projectName || a.projectId,
        })),
        metadata: modalMetadata,
        selectedProjectId: firstProject.id,
      });

      await slackClient.views.open({
        trigger_id: triggerId,
        view: modal,
      });

      logger.info(
        {
          teamId,
          channel,
          threadTs,
          projectCount: projectList.length,
          agentCount: agentList.length,
        },
        'Opened agent selector modal'
      );
      span.end();
    } catch (error) {
      if (error instanceof Error) setSpanWithError(span, error);
      logger.error({ error, teamId }, 'Failed to open agent selector modal');
      if (responseUrl) {
        await sendResponseUrlMessage(responseUrl, {
          text: SlackStrings.errors.failedToOpenSelector,
          response_type: 'ephemeral',
        }).catch((e) => logger.warn({ error: e }, 'Failed to send selector error notification'));
      }
      span.end();
    }
  });
}

/**
 * Handle message shortcut (context menu action on a message)
 * Opens a modal with the message content pre-filled as context
 */
export async function handleMessageShortcut(params: {
  triggerId: string;
  teamId: string;
  channelId: string;
  userId: string;
  messageTs: string;
  messageText: string;
  threadTs?: string;
  responseUrl?: string;
}): Promise<void> {
  return tracer.startActiveSpan(SLACK_SPAN_NAMES.MESSAGE_SHORTCUT, async (span) => {
    const { triggerId, teamId, channelId, userId, messageTs, messageText, threadTs, responseUrl } =
      params;

    span.setAttribute(SLACK_SPAN_KEYS.TEAM_ID, teamId);
    span.setAttribute(SLACK_SPAN_KEYS.CHANNEL_ID, channelId);
    span.setAttribute(SLACK_SPAN_KEYS.USER_ID, userId);
    span.setAttribute(SLACK_SPAN_KEYS.MESSAGE_TS, messageTs);
    if (threadTs) span.setAttribute(SLACK_SPAN_KEYS.THREAD_TS, threadTs);

    try {
      const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
      if (!workspaceConnection?.botToken) {
        logger.error({ teamId }, 'No bot token for message shortcut modal');
        span.end();
        return;
      }

      const tenantId = workspaceConnection.tenantId;
      span.setAttribute(SLACK_SPAN_KEYS.TENANT_ID, tenantId);
      const slackClient = getSlackClient(workspaceConnection.botToken);

      let projectList = await fetchProjectsForTenant(tenantId);

      if (projectList.length === 0) {
        const defaultAgent = await getChannelAgentConfig(teamId, channelId);
        if (defaultAgent) {
          projectList = [
            {
              id: defaultAgent.projectId,
              name: defaultAgent.projectName || defaultAgent.projectId,
            },
          ];
        }
      }

      if (projectList.length === 0) {
        logger.info(
          { teamId, channelId, tenantId },
          'No projects configured — cannot open message shortcut modal'
        );
        await slackClient.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: SlackStrings.status.noProjectsConfigured,
        });
        span.end();
        return;
      }

      const firstProject = projectList[0];
      let agentList = await fetchAgentsForProject(tenantId, firstProject.id);

      if (agentList.length === 0) {
        const defaultAgent = await getChannelAgentConfig(teamId, channelId);
        if (defaultAgent && defaultAgent.projectId === firstProject.id) {
          agentList = [
            {
              id: defaultAgent.agentId,
              name: defaultAgent.agentName || defaultAgent.agentId,
              projectId: defaultAgent.projectId,
              projectName: defaultAgent.projectName || defaultAgent.projectId,
            },
          ];
        }
      }

      const modalMetadata: ModalMetadata = {
        channel: channelId,
        threadTs,
        messageTs,
        teamId,
        slackUserId: userId,
        tenantId,
        isInThread: Boolean(threadTs),
        messageContext: messageText,
      };

      const modal = buildMessageShortcutModal({
        projects: projectList,
        agents: agentList.map((a) => ({
          id: a.id,
          name: a.name,
          projectId: a.projectId,
          projectName: a.projectName || a.projectId,
        })),
        metadata: modalMetadata,
        selectedProjectId: firstProject.id,
        messageContext: messageText,
      });

      await slackClient.views.open({
        trigger_id: triggerId,
        view: modal,
      });

      logger.info(
        {
          teamId,
          channelId,
          messageTs,
          projectCount: projectList.length,
          agentCount: agentList.length,
        },
        'Opened message shortcut modal'
      );
      span.end();
    } catch (error) {
      if (error instanceof Error) setSpanWithError(span, error);
      logger.error({ error, teamId }, 'Failed to open message shortcut modal');
      if (responseUrl) {
        await sendResponseUrlMessage(responseUrl, {
          text: SlackStrings.errors.failedToOpenSelector,
          response_type: 'ephemeral',
        }).catch((e) => logger.warn({ error: e }, 'Failed to send shortcut error notification'));
      }
      span.end();
    }
  });
}

const CONTINUATION_TIMEOUT_MS = 120_000;

/**
 * Consume the SSE continuation stream returned after a durable tool approval.
 * Accumulates text-delta events and posts the final result to the Slack thread.
 * If the continuation triggers another tool approval (chained/delegated), posts
 * the approval buttons — the next button click will recursively enter this flow.
 */
export async function consumeApprovalContinuationStream(params: {
  response: Response;
  slackClient: ReturnType<typeof getSlackClient>;
  channel: string;
  threadTs?: string;
  agentName: string;
  conversationId: string;
  projectId: string;
  agentId: string;
  slackUserId: string;
}): Promise<void> {
  const {
    response,
    slackClient,
    channel,
    threadTs,
    agentName,
    conversationId,
    projectId,
    agentId,
    slackUserId,
  } = params;
  const threadParam = threadTs ? { thread_ts: threadTs } : {};

  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  const toolCallIdToName = new Map<string, string>();
  const toolCallIdToInput = new Map<string, Record<string, unknown>>();

  const timeoutId = setTimeout(() => {
    reader.cancel().catch(() => {});
  }, CONTINUATION_TIMEOUT_MS);

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

          if (data.type === 'text-delta' && data.delta) {
            fullText += data.delta;
          } else if (data.type === 'tool-input-available' && data.toolCallId && data.toolName) {
            toolCallIdToName.set(String(data.toolCallId), String(data.toolName));
            if (data.input && typeof data.input === 'object') {
              toolCallIdToInput.set(String(data.toolCallId), data.input as Record<string, unknown>);
            }
          } else if (data.type === 'tool-approval-request' && data.toolCallId && conversationId) {
            const toolCallId: string = data.toolCallId;
            const toolName = toolCallIdToName.get(toolCallId) || 'Tool';
            const input = toolCallIdToInput.get(toolCallId);

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
                ...threadParam,
                text: `Tool approval required: \`${toolName}\``,
                blocks: buildToolApprovalBlocks({
                  toolName,
                  input,
                  buttonValue: JSON.stringify(buttonValue),
                }),
              })
              .catch((e) =>
                logger.warn({ error: e, toolCallId }, 'Failed to post chained approval message')
              );

            clearTimeout(timeoutId);
          }
        } catch {
          // skip invalid JSON lines in SSE stream
        }
      }
    }
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        channel,
        threadTs,
        conversationId,
        agentId,
      },
      'Error reading approval continuation stream'
    );
    if (fullText.length === 0) {
      await slackClient.chat
        .postMessage({
          channel,
          ...threadParam,
          text: '_Something went wrong while processing the tool result. Please try again._',
        })
        .catch((e) => logger.warn({ error: e }, 'Failed to post continuation error message'));
    }
  } finally {
    clearTimeout(timeoutId);
    reader.cancel().catch(() => {});
  }

  if (fullText.length > 0) {
    const slackText = markdownToMrkdwn(fullText);
    const SLACK_SECTION_LIMIT = 3000;
    const truncatedText =
      slackText.length > SLACK_SECTION_LIMIT
        ? `${slackText.slice(0, SLACK_SECTION_LIMIT - 3)}...`
        : slackText;

    await slackClient.chat
      .postMessage({
        channel,
        ...threadParam,
        text: slackText,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: truncatedText } },
          createContextBlock({ agentName }),
        ],
      })
      .catch((e) =>
        logger.warn({ error: e, channel, threadTs }, 'Failed to post approval continuation result')
      );

    logger.info(
      { channel, threadTs, conversationId, responseLength: fullText.length },
      'Approval continuation stream completed'
    );
  }
}
