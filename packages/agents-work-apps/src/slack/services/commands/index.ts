import type { SlackLinkIntent } from '@inkeep/agents-core';
import {
  deleteWorkAppSlackUserMapping,
  findWorkAppSlackUserMapping,
  findWorkAppSlackUserMappingBySlackUser,
  flushTraces,
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
  createErrorMessage,
  createNotLinkedMessage,
  createStatusMessage,
  createUnlinkSuccessMessage,
  createUpdatedHelpMessage,
} from '../blocks';
import { getSlackChannelInfo, getSlackClient, getSlackUserInfo } from '../client';
import { executeAgentPublicly } from '../events/execution';
import {
  fetchAgentsForProject,
  fetchProjectsForTenant,
  formatChannelContext,
  formatSlackQuery,
  generateSlackConversationId,
  getChannelAgentConfig,
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

  const userTenantId = existingLink.tenantId;
  const slackClient = getSlackClient(botToken);

  const [resolvedAgent, channelInfo, userInfo] = await Promise.all([
    resolveEffectiveAgent({
      tenantId: userTenantId,
      teamId: payload.teamId,
      channelId: payload.channelId,
      userId: payload.userId,
    }),
    getSlackChannelInfo(slackClient, payload.channelId),
    getSlackUserInfo(slackClient, payload.userId),
  ]);

  if (!resolvedAgent) {
    const message = createErrorMessage(
      'No default agent configured. Ask your admin to set a workspace default in the dashboard.'
    );
    return { response_type: 'ephemeral', ...message };
  }

  const channelContext = formatChannelContext(channelInfo);
  const userName = userInfo?.displayName || 'User';
  const formattedQuestion = formatSlackQuery({
    text: question,
    channelContext,
    userName,
  });

  const slackUserToken = await signSlackUserToken({
    inkeepUserId: existingLink.inkeepUserId,
    tenantId: userTenantId,
    slackTeamId: payload.teamId,
    slackUserId: payload.userId,
    slackEnterpriseId: payload.enterpriseId,
    slackAuthorized: resolvedAgent.grantAccessToMembers,
    slackAuthSource: resolvedAgent.source === 'none' ? undefined : resolvedAgent.source,
    slackChannelId: payload.channelId,
    slackAuthorizedProjectId: resolvedAgent.projectId,
  });

  const now = Date.now();
  const messageTs = `${Math.floor(now / 1000)}.${String(now % 1000).padStart(3, '0')}000`;

  const conversationId = generateSlackConversationId({
    teamId: payload.teamId,
    messageTs,
    agentId: resolvedAgent.agentId,
  });

  const questionWork = executeAgentPublicly({
    slackClient,
    channel: payload.channelId,
    slackUserId: payload.userId,
    teamId: payload.teamId,
    jwtToken: slackUserToken,
    projectId: resolvedAgent.projectId,
    agentId: resolvedAgent.agentId,
    agentName: resolvedAgent.agentName || resolvedAgent.agentId,
    question: formattedQuestion,
    rawMessageText: question,
    conversationId,
    entryPoint: 'slash_command',
  })
    .catch(async (error) => {
      logger.error({ error }, 'Background execution promise rejected');
      if (payload.responseUrl) {
        try {
          await fetch(payload.responseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              response_type: 'ephemeral',
              text: SlackStrings.errors.generic,
            }),
          });
        } catch (e) {
          logger.warn({ e }, 'Failed to send error via response_url');
        }
      }
    })
    .finally(() => flushTraces());

  const waitUntil = await getWaitUntil();
  if (waitUntil) waitUntil(questionWork);

  return {};
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
