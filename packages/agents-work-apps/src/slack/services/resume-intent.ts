import type { SlackLinkIntent } from '@inkeep/agents-core';
import { signSlackUserToken } from '@inkeep/agents-core';
import { env } from '../../env';
import { getLogger } from '../../logger';
import { resolveEffectiveAgent } from './agent-resolution';
import { createContextBlock } from './blocks';
import { getSlackClient } from './client';
import { streamAgentResponse } from './events/streaming';
import { generateSlackConversationId, sendResponseUrlMessage } from './events/utils';
import { findWorkspaceConnectionByTeamId } from './nango';

const logger = getLogger('slack-resume-intent');

export interface ResumeSmartLinkIntentParams {
  intent: SlackLinkIntent;
  teamId: string;
  slackUserId: string;
  inkeepUserId: string;
  tenantId: string;
  slackEnterpriseId?: string;
  slackUsername?: string;
}

export async function resumeSmartLinkIntent(params: ResumeSmartLinkIntentParams): Promise<void> {
  const { intent, teamId, slackUserId, inkeepUserId, tenantId, slackEnterpriseId } = params;
  const startTime = Date.now();

  try {
    const workspaceConnection = await findWorkspaceConnectionByTeamId(teamId);
    const botToken = workspaceConnection?.botToken;

    if (!botToken) {
      logger.error({ teamId, entryPoint: intent.entryPoint }, 'No bot token available for resume');
      return;
    }

    const slackClient = getSlackClient(botToken);

    const slackUserToken = await signSlackUserToken({
      inkeepUserId,
      tenantId,
      slackTeamId: teamId,
      slackUserId,
      slackEnterpriseId,
    });

    switch (intent.entryPoint) {
      case 'mention':
        await resumeMention(intent, slackClient, slackUserToken, slackUserId, teamId);
        break;
      case 'question_command':
        await resumeCommand(intent, slackClient, slackUserToken, slackUserId, teamId, tenantId);
        break;
      case 'run_command':
        await resumeRunCommand(intent, slackClient, slackUserToken, slackUserId, teamId, tenantId);
        break;
    }

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        event: 'smart_link_intent_resumed',
        entryPoint: intent.entryPoint,
        channelId: intent.channelId,
        durationMs,
      },
      'Smart link intent resumed'
    );
  } catch (error) {
    logger.error(
      {
        event: 'smart_link_intent_failed',
        entryPoint: intent.entryPoint,
        error: error instanceof Error ? error.message : String(error),
      },
      'Smart link intent resume failed'
    );
  }
}

async function resumeMention(
  intent: SlackLinkIntent,
  slackClient: ReturnType<typeof getSlackClient>,
  slackUserToken: string,
  slackUserId: string,
  teamId: string
): Promise<void> {
  if (!intent.agentId || !intent.projectId) {
    logger.error({ intent }, 'Mention intent missing agentId or projectId');
    await postErrorToChannel(slackClient, intent.channelId, slackUserId, intent.threadTs);
    return;
  }

  const replyThreadTs = intent.threadTs || intent.messageTs;
  if (!replyThreadTs) {
    logger.error({ intent }, 'Mention intent missing threadTs and messageTs');
    return;
  }

  const ackMessage = await slackClient.chat.postMessage({
    channel: intent.channelId,
    thread_ts: replyThreadTs,
    text: '_Preparing a response..._',
  });

  const conversationId = generateSlackConversationId({
    teamId,
    threadTs: replyThreadTs,
    channel: intent.channelId,
    isDM: false,
    agentId: intent.agentId,
  });

  await streamAgentResponse({
    slackClient,
    channel: intent.channelId,
    threadTs: replyThreadTs,
    thinkingMessageTs: ackMessage.ts || '',
    slackUserId,
    teamId,
    jwtToken: slackUserToken,
    projectId: intent.projectId,
    agentId: intent.agentId,
    question: intent.question,
    agentName: intent.agentId,
    conversationId,
  });
}

async function resumeCommand(
  intent: SlackLinkIntent,
  slackClient: ReturnType<typeof getSlackClient>,
  slackUserToken: string,
  slackUserId: string,
  teamId: string,
  tenantId: string
): Promise<void> {
  const resolvedAgent = await resolveEffectiveAgent({
    tenantId,
    teamId,
    channelId: intent.channelId,
    userId: slackUserId,
  });

  if (!resolvedAgent) {
    await postErrorToChannel(
      slackClient,
      intent.channelId,
      slackUserId,
      undefined,
      "The agent couldn't be found. Try asking your question again."
    );
    return;
  }

  await executeAndDeliver({
    intent,
    slackClient,
    slackUserToken,
    teamId,
    agentId: resolvedAgent.agentId,
    agentName: resolvedAgent.agentName || resolvedAgent.agentId,
    projectId: resolvedAgent.projectId,
  });
}

async function resumeRunCommand(
  intent: SlackLinkIntent,
  slackClient: ReturnType<typeof getSlackClient>,
  slackUserToken: string,
  slackUserId: string,
  teamId: string,
  tenantId: string
): Promise<void> {
  if (!intent.agentIdentifier) {
    logger.error({ intent }, 'Run command intent missing agentIdentifier');
    await postErrorToChannel(slackClient, intent.channelId, slackUserId);
    return;
  }

  const authToken = await signSlackUserToken({
    inkeepUserId: slackUserId,
    tenantId,
    slackTeamId: teamId,
    slackUserId,
  });

  const agentInfo = await findAgentByIdentifierViaApi(tenantId, intent.agentIdentifier, authToken);

  if (!agentInfo) {
    await postErrorToChannel(
      slackClient,
      intent.channelId,
      slackUserId,
      undefined,
      `Agent "${intent.agentIdentifier}" couldn't be found. Try asking your question again.`
    );
    return;
  }

  await executeAndDeliver({
    intent,
    slackClient,
    slackUserToken,
    teamId,
    agentId: agentInfo.id,
    agentName: agentInfo.name || agentInfo.id,
    projectId: agentInfo.projectId,
  });
}

async function findAgentByIdentifierViaApi(
  tenantId: string,
  identifier: string,
  authToken: string
): Promise<{ id: string; name: string | null; projectId: string } | null> {
  const apiBaseUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const projectsResponse = await fetch(`${apiBaseUrl}/manage/tenants/${tenantId}/projects`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      signal: controller.signal,
    });

    if (!projectsResponse.ok) return null;

    const projectsData = await projectsResponse.json();
    const projects = projectsData.data || projectsData || [];

    const agentResults = await Promise.all(
      projects.map(async (project: { id: string }) => {
        try {
          const agentsResponse = await fetch(
            `${apiBaseUrl}/manage/tenants/${tenantId}/projects/${project.id}/agents`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
              },
              signal: controller.signal,
            }
          );

          if (!agentsResponse.ok) return [];

          const agentsData = await agentsResponse.json();
          const agents = agentsData.data || agentsData || [];
          return agents.map((agent: { id: string; name: string | null }) => ({
            id: agent.id,
            name: agent.name,
            projectId: project.id,
          }));
        } catch {
          return [];
        }
      })
    );

    const allAgents = agentResults.flat();
    return (
      allAgents.find(
        (a: { id: string; name: string | null }) =>
          a.id === identifier || a.name?.toLowerCase() === identifier.toLowerCase()
      ) || null
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

interface ExecuteAndDeliverParams {
  intent: SlackLinkIntent;
  slackClient: ReturnType<typeof getSlackClient>;
  slackUserToken: string;
  teamId: string;
  agentId: string;
  agentName: string;
  projectId: string;
}

async function executeAndDeliver(params: ExecuteAndDeliverParams): Promise<void> {
  const { intent, slackClient, slackUserToken, teamId, agentId, agentName, projectId } = params;
  const apiBaseUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/run/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${slackUserToken}`,
        'x-inkeep-project-id': projectId,
        'x-inkeep-agent-id': agentId,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: intent.question }],
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if ((error as Error).name === 'AbortError') {
      logger.warn({ teamId, timeoutMs: 30000 }, 'Resume agent execution timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    logger.error({ status: response.status, agentId, projectId }, 'Resume run API call failed');
    return;
  }

  const result = await response.json();
  const assistantMessage =
    result.choices?.[0]?.message?.content || result.message?.content || 'No response received';

  const contextBlock = createContextBlock({ agentName });

  if (intent.responseUrl) {
    try {
      await sendResponseUrlMessage(intent.responseUrl, {
        response_type: 'ephemeral',
        text: assistantMessage,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: assistantMessage } },
          contextBlock,
        ],
      });
      return;
    } catch {
      logger.warn(
        { channelId: intent.channelId },
        'response_url delivery failed, falling back to bot channel post'
      );
    }
  }

  await slackClient.chat.postMessage({
    channel: intent.channelId,
    text: assistantMessage,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: assistantMessage } }, contextBlock],
  });
}

async function postErrorToChannel(
  slackClient: ReturnType<typeof getSlackClient>,
  channelId: string,
  slackUserId: string,
  threadTs?: string,
  message = "The agent couldn't be found. Try asking your question again."
): Promise<void> {
  try {
    await slackClient.chat.postEphemeral({
      channel: channelId,
      user: slackUserId,
      thread_ts: threadTs,
      text: message,
    });
  } catch (error) {
    logger.warn({ error, channelId }, 'Failed to post error message to Slack');
  }
}
