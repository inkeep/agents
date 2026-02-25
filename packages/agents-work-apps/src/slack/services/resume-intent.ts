import type { SlackLinkIntent } from '@inkeep/agents-core';
import { signSlackUserToken } from '@inkeep/agents-core';
import { env } from '../../env';
import { getLogger } from '../../logger';
import { type ResolvedAgentConfig, resolveEffectiveAgent } from './agent-resolution';
import { createContextBlock } from './blocks';
import { getSlackClient } from './client';
import { executeAgentPublicly } from './events/execution';
import { streamAgentResponse } from './events/streaming';
import { generateSlackConversationId, sendResponseUrlMessage } from './events/utils';
import { findWorkspaceConnectionByTeamId } from './nango';

const logger = getLogger('slack-resume-intent');

interface TokenSigningContext {
  inkeepUserId: string;
  tenantId: string;
  slackTeamId: string;
  slackUserId: string;
  slackEnterpriseId?: string;
}

function getChannelAuthClaims(agentConfig: ResolvedAgentConfig | null, channelId: string) {
  return {
    slackAuthorized: agentConfig?.grantAccessToMembers ?? false,
    slackAuthSource:
      agentConfig?.source && agentConfig.source !== 'none' ? agentConfig.source : undefined,
    slackChannelId: channelId,
    slackAuthorizedProjectId: agentConfig?.projectId,
  };
}

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

    const tokenCtx: TokenSigningContext = {
      inkeepUserId,
      tenantId,
      slackTeamId: teamId,
      slackUserId,
      slackEnterpriseId,
    };

    let resolvedAgentId: string | undefined;
    let deliveryMethod: string | undefined;

    switch (intent.entryPoint) {
      case 'mention':
        resolvedAgentId = intent.agentId;
        deliveryMethod = 'streaming';
        await resumeMention(intent, slackClient, tokenCtx, teamId, tenantId);
        break;
      case 'question_command':
        deliveryMethod = intent.responseUrl ? 'response_url' : 'bot_token';
        await resumeCommand(intent, slackClient, tokenCtx, teamId, tenantId);
        break;
      case 'run_command':
        deliveryMethod = intent.responseUrl ? 'response_url' : 'bot_token';
        await resumeRunCommand(intent, slackClient, tokenCtx, teamId, tenantId);
        break;
      case 'dm':
        resolvedAgentId = intent.agentId;
        deliveryMethod = 'streaming';
        await resumeDirectMessage(intent, slackClient, tokenCtx, teamId);
        break;
    }

    const durationMs = Date.now() - startTime;
    logger.info(
      {
        event: 'smart_link_intent_resumed',
        entryPoint: intent.entryPoint,
        channelId: intent.channelId,
        agentId: resolvedAgentId || intent.agentId,
        deliveryMethod,
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
  tokenCtx: TokenSigningContext,
  teamId: string,
  tenantId: string
): Promise<void> {
  const { slackUserId } = tokenCtx;

  if (!intent.agentId || !intent.projectId) {
    logger.error(
      {
        entryPoint: intent.entryPoint,
        channelId: intent.channelId,
        hasAgentId: !!intent.agentId,
        hasProjectId: !!intent.projectId,
      },
      'Mention intent missing agentId or projectId'
    );
    await postErrorToChannel(slackClient, intent.channelId, slackUserId, intent.threadTs);
    return;
  }

  const replyThreadTs = intent.threadTs || intent.messageTs;
  if (!replyThreadTs) {
    logger.error(
      { entryPoint: intent.entryPoint, channelId: intent.channelId },
      'Mention intent missing threadTs and messageTs'
    );
    await postErrorToChannel(
      slackClient,
      intent.channelId,
      slackUserId,
      undefined,
      "We couldn't resume your question due to a technical issue. Please try mentioning @Inkeep again."
    );
    return;
  }

  const agentConfig = await resolveEffectiveAgent({
    tenantId,
    teamId,
    channelId: intent.channelId,
  });

  const slackUserToken = await signSlackUserToken({
    ...tokenCtx,
    ...getChannelAuthClaims(agentConfig, intent.channelId),
  });

  const ackMessage = await slackClient.chat.postMessage({
    channel: intent.channelId,
    thread_ts: replyThreadTs,
    text: '_Answering your question..._',
  });

  const conversationId = generateSlackConversationId({
    teamId,
    messageTs: intent.messageTs || replyThreadTs,
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

async function resumeDirectMessage(
  intent: SlackLinkIntent,
  slackClient: ReturnType<typeof getSlackClient>,
  tokenCtx: TokenSigningContext,
  teamId: string
): Promise<void> {
  const { slackUserId } = tokenCtx;

  if (!intent.agentId || !intent.projectId) {
    logger.error(
      {
        entryPoint: intent.entryPoint,
        channelId: intent.channelId,
        hasAgentId: !!intent.agentId,
        hasProjectId: !!intent.projectId,
      },
      'DM intent missing agentId or projectId'
    );
    await postErrorToChannel(slackClient, intent.channelId, slackUserId);
    return;
  }

  const slackUserToken = await signSlackUserToken({
    ...tokenCtx,
    slackAuthorized: false,
  });

  const conversationId = generateSlackConversationId({
    teamId,
    messageTs: intent.messageTs || '',
    agentId: intent.agentId,
    isDM: true,
  });

  await executeAgentPublicly({
    slackClient,
    channel: intent.channelId,
    threadTs: intent.messageTs,
    slackUserId,
    teamId,
    jwtToken: slackUserToken,
    projectId: intent.projectId,
    agentId: intent.agentId,
    agentName: intent.agentId,
    question: intent.question,
    conversationId,
  });
}

async function resumeCommand(
  intent: SlackLinkIntent,
  slackClient: ReturnType<typeof getSlackClient>,
  tokenCtx: TokenSigningContext,
  teamId: string,
  tenantId: string
): Promise<void> {
  const { slackUserId } = tokenCtx;

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

  const slackUserToken = await signSlackUserToken({
    ...tokenCtx,
    ...getChannelAuthClaims(resolvedAgent, intent.channelId),
  });

  await executeAndDeliver({
    intent,
    slackClient,
    slackUserToken,
    slackUserId,
    teamId,
    agentId: resolvedAgent.agentId,
    agentName: resolvedAgent.agentName || resolvedAgent.agentId,
    projectId: resolvedAgent.projectId,
  });
}

async function resumeRunCommand(
  intent: SlackLinkIntent,
  slackClient: ReturnType<typeof getSlackClient>,
  tokenCtx: TokenSigningContext,
  teamId: string,
  tenantId: string
): Promise<void> {
  const { slackUserId } = tokenCtx;

  if (!intent.agentIdentifier) {
    logger.error(
      { entryPoint: intent.entryPoint, channelId: intent.channelId },
      'Run command intent missing agentIdentifier'
    );
    await postErrorToChannel(slackClient, intent.channelId, slackUserId);
    return;
  }

  const agentConfig = await resolveEffectiveAgent({
    tenantId,
    teamId,
    channelId: intent.channelId,
  });

  const slackUserToken = await signSlackUserToken({
    ...tokenCtx,
    ...getChannelAuthClaims(agentConfig, intent.channelId),
  });

  const agentInfo = await findAgentByIdentifierViaApi(
    tenantId,
    intent.agentIdentifier,
    slackUserToken
  );

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
    slackUserId,
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
        } catch (error) {
          logger.warn(
            {
              error: error instanceof Error ? error.message : String(error),
              projectId: project.id,
            },
            'Failed to fetch agents for project during identifier lookup'
          );
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
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        tenantId,
        identifier,
        isTimeout,
      },
      'Failed to find agent by identifier'
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

interface ExecuteAndDeliverParams {
  intent: SlackLinkIntent;
  slackClient: ReturnType<typeof getSlackClient>;
  slackUserToken: string;
  slackUserId: string;
  teamId: string;
  agentId: string;
  agentName: string;
  projectId: string;
}

async function executeAndDeliver(params: ExecuteAndDeliverParams): Promise<void> {
  const {
    intent,
    slackClient,
    slackUserToken,
    slackUserId,
    teamId,
    agentId,
    agentName,
    projectId,
  } = params;
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
    await postErrorToChannel(
      slackClient,
      intent.channelId,
      slackUserId,
      undefined,
      'Something went wrong while answering your question. Please try again.'
    );
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
