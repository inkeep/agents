import type { SlackLinkIntent } from '@inkeep/agents-core';
import {
  deleteWorkAppSlackUserMapping,
  findWorkAppSlackUserMapping,
  findWorkAppSlackUserMappingBySlackUser,
  flushTraces,
  getInProcessFetch,
  getWaitUntil,
  signSlackUserToken,
} from '@inkeep/agents-core';
import runDbClient from '../../../db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { SlackStrings } from '../../i18n';
import { resolveEffectiveAgent } from '../agent-resolution';
import {
  createAlreadyLinkedMessage,
  createContextBlock,
  createErrorMessage,
  createNotLinkedMessage,
  createStatusMessage,
  createUnlinkSuccessMessage,
  createUpdatedHelpMessage,
} from '../blocks';
import { getSlackClient } from '../client';
import {
  extractApiErrorMessage,
  fetchAgentsForProject,
  fetchProjectsForTenant,
  getChannelAgentConfig,
  sendResponseUrlMessage,
} from '../events/utils';
import { buildLinkPromptMessage, resolveUnlinkedUserAction } from '../link-prompt';
import { buildAgentSelectorModal, type ModalMetadata } from '../modals';
import { findWorkspaceConnectionByTeamId, type SlackWorkspaceConnection } from '../nango';
import type { SlackCommandPayload, SlackCommandResponse } from '../types';

const DEFAULT_CLIENT_ID = 'work-apps-slack';

const logger = getLogger('slack-commands');

export async function handleLinkCommand(
  payload: SlackCommandPayload,
  dashboardUrl: string,
  tenantId: string,
  botToken?: string
): Promise<SlackCommandResponse> {
  const existingLink = await findWorkAppSlackUserMapping(runDbClient)(
    tenantId,
    payload.userId,
    payload.teamId,
    DEFAULT_CLIENT_ID
  );

  if (existingLink) {
    const message = createAlreadyLinkedMessage(
      existingLink.slackEmail || existingLink.slackUsername || 'Unknown',
      existingLink.linkedAt,
      dashboardUrl
    );
    return { response_type: 'ephemeral', ...message };
  }

  try {
    const linkResult = await resolveUnlinkedUserAction({
      tenantId,
      teamId: payload.teamId,
      slackUserId: payload.userId,
      botToken: botToken || '',
      slackEnterpriseId: payload.enterpriseId,
      slackUsername: payload.userName,
    });
    console.log('linkResult', linkResult);
    const message = buildLinkPromptMessage(linkResult);
    return { response_type: 'ephemeral', ...message };
  } catch (error) {
    logger.error({ error, slackUserId: payload.userId, tenantId }, 'Failed to generate link token');
    const message = createErrorMessage('Failed to generate link. Please try again.');
    return { response_type: 'ephemeral', ...message };
  }
}

export async function handleUnlinkCommand(
  payload: SlackCommandPayload,
  tenantId: string
): Promise<SlackCommandResponse> {
  const existingLink = await findWorkAppSlackUserMapping(runDbClient)(
    tenantId,
    payload.userId,
    payload.teamId,
    DEFAULT_CLIENT_ID
  );

  if (!existingLink) {
    const message = createNotLinkedMessage();
    return { response_type: 'ephemeral', ...message };
  }

  try {
    const success = await deleteWorkAppSlackUserMapping(runDbClient)(
      tenantId,
      payload.userId,
      payload.teamId,
      DEFAULT_CLIENT_ID
    );

    if (success) {
      logger.info({ slackUserId: payload.userId, tenantId }, 'User unlinked Slack account');
      const message = createUnlinkSuccessMessage();
      return { response_type: 'ephemeral', ...message };
    }

    const message = createErrorMessage('Failed to unlink account. Please try again.');
    return { response_type: 'ephemeral', ...message };
  } catch (error) {
    logger.error({ error, slackUserId: payload.userId, tenantId }, 'Failed to unlink account');
    const message = createErrorMessage('Failed to unlink account. Please try again.');
    return { response_type: 'ephemeral', ...message };
  }
}

export async function handleStatusCommand(
  payload: SlackCommandPayload,
  dashboardUrl: string,
  tenantId: string
): Promise<SlackCommandResponse> {
  const existingLink = await findWorkAppSlackUserMapping(runDbClient)(
    tenantId,
    payload.userId,
    payload.teamId,
    DEFAULT_CLIENT_ID
  );

  if (existingLink) {
    // Get agent configuration sources
    const { getAgentConfigSources } = await import('../agent-resolution');
    const agentConfigs = await getAgentConfigSources({
      tenantId,
      teamId: payload.teamId,
      channelId: payload.channelId,
      userId: payload.userId,
    });

    const message = createStatusMessage(
      existingLink.slackEmail || existingLink.slackUsername || payload.userName,
      existingLink.linkedAt,
      dashboardUrl,
      agentConfigs
    );
    return { response_type: 'ephemeral', ...message };
  }

  const message = createNotLinkedMessage();
  return { response_type: 'ephemeral', ...message };
}

export async function handleHelpCommand(): Promise<SlackCommandResponse> {
  const message = createUpdatedHelpMessage();
  return { response_type: 'ephemeral', ...message };
}

/**
 * Handle `/inkeep` with no arguments - opens the agent picker modal
 * Similar to @mention behavior in channels
 */
export async function handleAgentPickerCommand(
  payload: SlackCommandPayload,
  tenantId: string,
  workspaceConnection?: SlackWorkspaceConnection | null
): Promise<SlackCommandResponse> {
  const { triggerId, teamId, channelId, userId, responseUrl } = payload;

  try {
    const connection = workspaceConnection ?? (await findWorkspaceConnectionByTeamId(teamId));
    if (!connection?.botToken) {
      logger.error({ teamId }, 'No bot token for agent picker modal');
      const message = createErrorMessage(SlackStrings.errors.generic);
      return { response_type: 'ephemeral', ...message };
    }

    const slackClient = getSlackClient(connection.botToken);

    // Parallel: fetch projects + channel agent config (used as fallback)
    const [projectListResult, defaultAgent] = await Promise.all([
      fetchProjectsForTenant(tenantId),
      getChannelAgentConfig(teamId, channelId),
    ]);

    let projectList = projectListResult;

    if (projectList.length === 0 && defaultAgent) {
      projectList = [
        {
          id: defaultAgent.projectId,
          name: defaultAgent.projectName || defaultAgent.projectId,
        },
      ];
    }

    if (projectList.length === 0) {
      const message = createErrorMessage(SlackStrings.status.noProjectsConfigured);
      return { response_type: 'ephemeral', ...message };
    }

    // Fetch agents for first project (modal updates dynamically on project change)
    const firstProject = projectList[0];
    let agentList = await fetchAgentsForProject(tenantId, firstProject.id);

    if (agentList.length === 0 && defaultAgent && defaultAgent.projectId === firstProject.id) {
      agentList = [
        {
          id: defaultAgent.agentId,
          name: defaultAgent.agentName || defaultAgent.agentId,
          projectId: defaultAgent.projectId,
          projectName: defaultAgent.projectName || defaultAgent.projectId,
        },
      ];
    }

    // Generate a Slack-compatible timestamp (seconds.microseconds format)
    const now = Date.now();
    const slackTs = `${Math.floor(now / 1000)}.${String(now % 1000).padStart(3, '0')}000`;

    const modalMetadata: ModalMetadata = {
      channel: channelId,
      messageTs: slackTs,
      teamId,
      slackUserId: userId,
      tenantId,
      isInThread: false,
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
      { teamId, channelId, projectCount: projectList.length, agentCount: agentList.length },
      'Opened agent picker modal from slash command'
    );

    // Return empty response - modal will handle the interaction
    return {};
  } catch (error) {
    logger.error({ error, teamId }, 'Failed to open agent picker modal from slash command');
    const message = createErrorMessage(SlackStrings.errors.failedToOpenSelector);
    return { response_type: 'ephemeral', ...message };
  }
}

async function generateLinkCodeWithIntent(
  payload: SlackCommandPayload,
  tenantId: string,
  botToken: string,
  intent?: SlackLinkIntent
): Promise<SlackCommandResponse> {
  try {
    const linkResult = await resolveUnlinkedUserAction({
      tenantId,
      teamId: payload.teamId,
      slackUserId: payload.userId,
      botToken,
      slackEnterpriseId: payload.enterpriseId,
      slackUsername: payload.userName,
      intent,
    });

    const hasIntent = !!intent;
    if (hasIntent) {
      logger.info(
        {
          event: 'smart_link_intent_captured',
          entryPoint: intent.entryPoint,
          linkType: linkResult.type,
          questionLength: intent.question.length,
          channelId: payload.channelId,
        },
        'Smart link intent captured'
      );
    }

    const message = buildLinkPromptMessage(linkResult);
    return { response_type: 'ephemeral', ...message };
  } catch (error) {
    logger.error({ error, slackUserId: payload.userId, tenantId }, 'Failed to generate link token');
    const message = createErrorMessage('Failed to generate link. Please try again.');
    return { response_type: 'ephemeral', ...message };
  }
}

export async function handleQuestionCommand(
  payload: SlackCommandPayload,
  question: string,
  _dashboardUrl: string,
  tenantId: string,
  botToken: string
): Promise<SlackCommandResponse> {
  // Find user mapping without tenant filter to get the correct tenant
  const existingLink = await findWorkAppSlackUserMappingBySlackUser(runDbClient)(
    payload.userId,
    payload.teamId,
    DEFAULT_CLIENT_ID
  );

  if (!existingLink) {
    const intent: SlackLinkIntent = {
      entryPoint: 'question_command',
      question: question.slice(0, 2000),
      channelId: payload.channelId,
      responseUrl: payload.responseUrl,
    };
    return generateLinkCodeWithIntent(payload, tenantId, botToken, intent);
  }

  // Use the tenant from the user's mapping
  const userTenantId = existingLink.tenantId;

  const resolvedAgent = await resolveEffectiveAgent({
    tenantId: userTenantId,
    teamId: payload.teamId,
    channelId: payload.channelId,
    userId: payload.userId,
  });

  if (!resolvedAgent) {
    const message = createErrorMessage(
      'No default agent configured. Ask your admin to set a workspace default in the dashboard.'
    );
    return { response_type: 'ephemeral', ...message };
  }

  const targetAgent = {
    id: resolvedAgent.agentId,
    name: resolvedAgent.agentName || null,
    projectId: resolvedAgent.projectId,
  };

  const questionWork = executeAgentInBackground(
    payload,
    existingLink,
    targetAgent,
    question,
    userTenantId,
    {
      slackAuthorized: resolvedAgent.grantAccessToMembers,
      slackAuthSource: resolvedAgent.source === 'none' ? undefined : resolvedAgent.source,
      slackChannelId: payload.channelId,
      slackAuthorizedProjectId: resolvedAgent.projectId,
    }
  )
    .catch((error) => {
      logger.error({ error }, 'Background execution promise rejected');
    })
    .finally(() => flushTraces());
  const waitUntil = await getWaitUntil();
  if (waitUntil) waitUntil(questionWork);

  // Return empty object - Slack will just acknowledge the command without showing a message
  // The background task will send the actual response via response_url
  return {};
}

async function executeAgentInBackground(
  payload: SlackCommandPayload,
  existingLink: { inkeepUserId: string },
  targetAgent: { id: string; name: string | null; projectId: string },
  question: string,
  tenantId: string,
  channelAuth?: {
    slackAuthorized?: boolean;
    slackAuthSource?: 'channel' | 'workspace';
    slackChannelId?: string;
    slackAuthorizedProjectId?: string;
  }
): Promise<void> {
  try {
    const slackUserToken = await signSlackUserToken({
      inkeepUserId: existingLink.inkeepUserId,
      tenantId,
      slackTeamId: payload.teamId,
      slackUserId: payload.userId,
      slackEnterpriseId: payload.enterpriseId,
      ...channelAuth,
    });

    const apiBaseUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    try {
      response = await getInProcessFetch()(`${apiBaseUrl}/run/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${slackUserToken}`,
          'x-inkeep-project-id': targetAgent.projectId,
          'x-inkeep-agent-id': targetAgent.id,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: question }],
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      if ((error as Error).name === 'AbortError') {
        logger.warn(
          { teamId: payload.teamId, timeoutMs: 30000 },
          'Background agent execution timed out'
        );
        await sendResponseUrlMessage(payload.responseUrl, {
          response_type: 'ephemeral',
          text: 'Request timed out. Please try again.',
        });
        return;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          status: response.status,
          error: errorText,
          agentId: targetAgent.id,
          projectId: targetAgent.projectId,
        },
        'Run API call failed'
      );
      const apiMessage = extractApiErrorMessage(errorText);
      const errorMessage = apiMessage
        ? `*Error.* ${apiMessage}`
        : `Failed to run agent: ${response.status} ${response.statusText}`;
      await sendResponseUrlMessage(payload.responseUrl, {
        response_type: 'ephemeral',
        text: errorMessage,
      });
    } else {
      const result = await response.json();
      const assistantMessage =
        result.choices?.[0]?.message?.content || result.message?.content || 'No response received';

      logger.info(
        {
          slackUserId: payload.userId,
          agentId: targetAgent.id,
          projectId: targetAgent.projectId,
          tenantId,
        },
        'Agent execution completed via Slack'
      );

      const contextBlock = createContextBlock({ agentName: targetAgent.name || targetAgent.id });
      await sendResponseUrlMessage(payload.responseUrl, {
        response_type: 'in_channel',
        text: assistantMessage,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: assistantMessage,
            },
          },
          contextBlock,
        ],
      });
    }
  } catch (error) {
    logger.error({ error, slackUserId: payload.userId }, 'Background agent execution failed');

    await sendResponseUrlMessage(payload.responseUrl, {
      response_type: 'ephemeral',
      text: 'An error occurred while running the agent. Please try again.',
    });
  }
}

export async function handleCommand(payload: SlackCommandPayload): Promise<SlackCommandResponse> {
  const text = payload.text.trim();
  const parts = text.split(/\s+/);
  const subcommand = parts[0]?.toLowerCase() || '';
  const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';

  const workspaceConnection = await findWorkspaceConnectionByTeamId(payload.teamId);
  if (!workspaceConnection?.tenantId) {
    logger.error({ teamId: payload.teamId }, 'No workspace connection or missing tenantId');
    return {
      response_type: 'ephemeral',
      text: 'This workspace is not properly configured. Please reinstall the Slack app from the Inkeep dashboard.',
    };
  }
  const tenantId = workspaceConnection.tenantId;
  const dashboardUrl = `${manageUiUrl}/${tenantId}/work-apps/slack`;

  logger.info(
    {
      command: payload.command,
      subcommand,
      slackUserId: payload.userId,
      teamId: payload.teamId,
      tenantId,
    },
    'Slack command received'
  );

  switch (subcommand) {
    case 'link':
    case 'connect':
      return handleLinkCommand(payload, dashboardUrl, tenantId, workspaceConnection.botToken);

    case 'status':
      return handleStatusCommand(payload, dashboardUrl, tenantId);

    case 'unlink':
    case 'logout':
    case 'disconnect':
      return handleUnlinkCommand(payload, tenantId);

    case 'help':
      return handleHelpCommand();

    case '':
      // No arguments - open agent picker modal (pass pre-resolved connection)
      return handleAgentPickerCommand(payload, tenantId, workspaceConnection);

    default:
      return handleQuestionCommand(
        payload,
        text,
        dashboardUrl,
        tenantId,
        workspaceConnection.botToken
      );
  }
}
