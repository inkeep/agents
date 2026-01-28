import { env } from '../../../../../env';
import { getLogger } from '../../../../../logger';
import {
  createAgentExecutionClient,
  createSlackApiClient,
  SlackApiError,
  sendDeferredResponse,
} from '../api-client';
import {
  createAgentListMessage,
  createAgentResponseMessage,
  createAlreadyConnectedMessage,
  createErrorMessage,
  createLinkMessage,
  createLogoutSuccessMessage,
  createNoDefaultAgentMessage,
  createNoProjectsMessage,
  createProjectListMessage,
  createSettingsMessage,
  createSettingsUpdatedMessage,
  createStatusConnectedMessage,
  createStatusNotConnectedMessage,
  createThinkingMessage,
  createUpdatedHelpMessage,
} from '../blocks';
import {
  deleteConnection,
  findConnectionBySlackUser,
  getUserSettings,
  setUserDefaultAgent,
} from '../nango';
import type { SlackCommandPayload, SlackCommandResponse } from '../types';

const logger = getLogger('slack-commands');

export async function handleLinkCommand(
  payload: SlackCommandPayload,
  dashboardUrl: string
): Promise<SlackCommandResponse> {
  const connection = await findConnectionBySlackUser(payload.userId);

  if (connection) {
    const message = createAlreadyConnectedMessage(
      connection.appUserEmail,
      connection.linkedAt,
      dashboardUrl
    );
    return { response_type: 'ephemeral', ...message };
  }

  const message = createLinkMessage(dashboardUrl);
  return { response_type: 'ephemeral', ...message };
}

export async function handleStatusCommand(
  payload: SlackCommandPayload,
  dashboardUrl: string
): Promise<SlackCommandResponse> {
  const connection = await findConnectionBySlackUser(payload.userId);

  if (connection) {
    const message = createStatusConnectedMessage(
      payload.userName,
      connection.appUserEmail,
      connection.linkedAt,
      dashboardUrl
    );
    return { response_type: 'ephemeral', ...message };
  }

  const message = createStatusNotConnectedMessage(
    payload.userName,
    payload.teamDomain,
    dashboardUrl
  );
  return { response_type: 'ephemeral', ...message };
}

export async function handleLogoutCommand(
  payload: SlackCommandPayload
): Promise<SlackCommandResponse> {
  const connection = await findConnectionBySlackUser(payload.userId);

  if (!connection) {
    return {
      response_type: 'ephemeral',
      text: '❌ No connection found. You are not currently linked to an Inkeep account.',
    };
  }

  const success = await deleteConnection(connection.connectionId);

  if (!success) {
    const message = createErrorMessage(
      'Failed to logout. Please try again or visit the dashboard.'
    );
    return { response_type: 'ephemeral', ...message };
  }

  logger.info(
    { slackUserId: payload.userId, connectionId: connection.connectionId },
    'User disconnected from Slack'
  );

  const message = createLogoutSuccessMessage();
  return { response_type: 'ephemeral', ...message };
}

export async function handleListCommand(
  payload: SlackCommandPayload,
  dashboardUrl: string
): Promise<SlackCommandResponse> {
  const connection = await findConnectionBySlackUser(payload.userId);

  if (!connection) {
    const message = createStatusNotConnectedMessage(
      payload.userName,
      payload.teamDomain,
      dashboardUrl
    );
    return { response_type: 'ephemeral', ...message };
  }

  try {
    const client = createSlackApiClient(connection);
    const tenantId = client.getTenantId();
    const result = await client.listProjects();
    const projects = result.data || [];

    logger.info(
      {
        slackUserId: payload.userId,
        tenantId,
        projectCount: projects.length,
      },
      'Listed projects for Slack user'
    );

    if (projects.length === 0) {
      const message = createNoProjectsMessage(connection.appUserEmail, dashboardUrl);
      return { response_type: 'ephemeral', ...message };
    }

    const userDashboardUrl = dashboardUrl.replace('/default/', `/${tenantId}/`);
    const message = createProjectListMessage(
      connection.appUserEmail,
      projects,
      userDashboardUrl,
      result.pagination?.total || projects.length
    );
    return { response_type: 'ephemeral', ...message };
  } catch (error) {
    if (error instanceof SlackApiError && error.isUnauthorized) {
      const message = createErrorMessage(
        'Your session has expired. Please visit the dashboard to re-link your account.'
      );
      return { response_type: 'ephemeral', ...message };
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to fetch projects');

    const message = createErrorMessage(
      'Failed to fetch projects. Please try again or visit the dashboard.'
    );
    return { response_type: 'ephemeral', ...message };
  }
}

export async function handleHelpCommand(): Promise<SlackCommandResponse> {
  const message = createUpdatedHelpMessage();
  return { response_type: 'ephemeral', ...message };
}

export async function handleQuestionCommand(
  payload: SlackCommandPayload,
  question: string,
  dashboardUrl: string
): Promise<SlackCommandResponse> {
  const connection = await findConnectionBySlackUser(payload.userId);

  if (!connection) {
    const message = createStatusNotConnectedMessage(
      payload.userName,
      payload.teamDomain,
      dashboardUrl
    );
    return { response_type: 'ephemeral', ...message };
  }

  const settings = await getUserSettings(connection.connectionId);

  if (!settings.defaultAgentApiKey || !settings.defaultAgentId) {
    const message = createNoDefaultAgentMessage(dashboardUrl);
    return { response_type: 'ephemeral', ...message };
  }

  const agentName = settings.defaultAgentName || 'Inkeep Agent';

  processQuestionAsync(
    payload.responseUrl,
    question,
    agentName,
    settings.defaultAgentApiKey,
    payload.channelId
  );

  const message = createThinkingMessage(agentName);
  return { response_type: 'ephemeral', ...message };
}

async function processQuestionAsync(
  responseUrl: string,
  question: string,
  agentName: string,
  apiKey: string,
  channelId: string
): Promise<void> {
  try {
    const executionClient = createAgentExecutionClient(apiKey);
    const response = await executionClient.chat(question);

    const message = createAgentResponseMessage(agentName, response, channelId);
    await sendDeferredResponse(responseUrl, { response_type: 'ephemeral', ...message });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to execute agent (async)');

    let userMessage = 'Failed to get a response from the agent. Please try again.';
    if (error instanceof SlackApiError && error.isUnauthorized) {
      userMessage =
        'Your agent API key has expired. Please reconfigure your default agent with `/inkeep settings set [agent]`.';
    }

    const message = createErrorMessage(userMessage);
    await sendDeferredResponse(responseUrl, { response_type: 'ephemeral', ...message });
  }
}

export async function handleRunCommand(
  payload: SlackCommandPayload,
  agentName: string,
  question: string,
  dashboardUrl: string
): Promise<SlackCommandResponse> {
  const connection = await findConnectionBySlackUser(payload.userId);

  if (!connection) {
    const message = createStatusNotConnectedMessage(
      payload.userName,
      payload.teamDomain,
      dashboardUrl
    );
    return { response_type: 'ephemeral', ...message };
  }

  try {
    const client = createSlackApiClient(connection);
    const agent = await client.findAgentByName(agentName);

    if (!agent) {
      const message = createErrorMessage(
        `Agent "${agentName}" not found. Use \`/inkeep list\` to see available agents.`
      );
      return { response_type: 'ephemeral', ...message };
    }

    const apiKey = await client.getOrCreateAgentApiKey(agent.projectId, agent.id);
    const displayName = agent.name || agent.id;

    processRunAsync(payload.responseUrl, question, displayName, apiKey, payload.channelId);

    const message = createThinkingMessage(displayName);
    return { response_type: 'ephemeral', ...message };
  } catch (error) {
    if (error instanceof SlackApiError && error.isUnauthorized) {
      const message = createErrorMessage(
        'Your session has expired. Please visit the dashboard to re-link your account.'
      );
      return { response_type: 'ephemeral', ...message };
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to prepare agent run');

    const message = createErrorMessage(
      'Failed to run the agent. Please try again or check your permissions.'
    );
    return { response_type: 'ephemeral', ...message };
  }
}

async function processRunAsync(
  responseUrl: string,
  question: string,
  agentName: string,
  apiKey: string,
  channelId: string
): Promise<void> {
  try {
    const executionClient = createAgentExecutionClient(apiKey);
    const response = await executionClient.chat(question);

    const message = createAgentResponseMessage(agentName, response, channelId);
    await sendDeferredResponse(responseUrl, { response_type: 'ephemeral', ...message });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to run agent (async)');

    let userMessage = 'Failed to run the agent. Please try again or check your permissions.';
    if (error instanceof SlackApiError && error.isUnauthorized) {
      userMessage = 'Your session has expired. Please visit the dashboard to re-link your account.';
    }

    const message = createErrorMessage(userMessage);
    await sendDeferredResponse(responseUrl, { response_type: 'ephemeral', ...message });
  }
}

export async function handleSettingsCommand(
  payload: SlackCommandPayload,
  subCommand: string | undefined,
  agentName: string | undefined,
  dashboardUrl: string
): Promise<SlackCommandResponse> {
  const connection = await findConnectionBySlackUser(payload.userId);

  if (!connection) {
    const message = createStatusNotConnectedMessage(
      payload.userName,
      payload.teamDomain,
      dashboardUrl
    );
    return { response_type: 'ephemeral', ...message };
  }

  if (subCommand === 'set' && agentName) {
    try {
      const client = createSlackApiClient(connection);
      const agent = await client.findAgentByName(agentName);

      if (!agent) {
        const message = createErrorMessage(
          `Agent "${agentName}" not found. Use \`/inkeep list\` to see available agents.`
        );
        return { response_type: 'ephemeral', ...message };
      }

      const apiKey = await client.getOrCreateAgentApiKey(agent.projectId, agent.id);

      await setUserDefaultAgent(connection.connectionId, {
        agentId: agent.id,
        agentName: agent.name || agent.id,
        projectId: agent.projectId,
        apiKey,
      });

      logger.info(
        {
          slackUserId: payload.userId,
          agentId: agent.id,
          agentName: agent.name,
        },
        'User set default agent'
      );

      const message = createSettingsUpdatedMessage(agent.name || agent.id);
      return { response_type: 'ephemeral', ...message };
    } catch (error) {
      if (error instanceof SlackApiError && error.isUnauthorized) {
        const message = createErrorMessage(
          'Your session has expired. Please visit the dashboard to re-link your account.'
        );
        return { response_type: 'ephemeral', ...message };
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: errorMessage }, 'Failed to set default agent');

      const message = createErrorMessage(
        'Failed to set default agent. Please try again or check your permissions.'
      );
      return { response_type: 'ephemeral', ...message };
    }
  }

  const settings = await getUserSettings(connection.connectionId);
  const message = createSettingsMessage(
    connection.appUserEmail,
    settings.defaultAgentName,
    dashboardUrl
  );
  return { response_type: 'ephemeral', ...message };
}

export async function handleAgentListCommand(
  payload: SlackCommandPayload,
  dashboardUrl: string
): Promise<SlackCommandResponse> {
  const connection = await findConnectionBySlackUser(payload.userId);

  if (!connection) {
    const message = createStatusNotConnectedMessage(
      payload.userName,
      payload.teamDomain,
      dashboardUrl
    );
    return { response_type: 'ephemeral', ...message };
  }

  try {
    const client = createSlackApiClient(connection);
    const agents = await client.listAllAgents();

    logger.info(
      {
        slackUserId: payload.userId,
        agentCount: agents.length,
      },
      'Listed agents for Slack user'
    );

    if (agents.length === 0) {
      const message = createErrorMessage(
        'No agents found. Create an agent in the Inkeep dashboard first.'
      );
      return { response_type: 'ephemeral', ...message };
    }

    const userDashboardUrl = dashboardUrl.replace('/work-apps/slack', '');
    const message = createAgentListMessage(agents, userDashboardUrl);
    return { response_type: 'ephemeral', ...message };
  } catch (error) {
    if (error instanceof SlackApiError && error.isUnauthorized) {
      const message = createErrorMessage(
        'Your session has expired. Please visit the dashboard to re-link your account.'
      );
      return { response_type: 'ephemeral', ...message };
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to list agents');

    const message = createErrorMessage(
      'Failed to list agents. Please try again or visit the dashboard.'
    );
    return { response_type: 'ephemeral', ...message };
  }
}

export async function handleCommand(payload: SlackCommandPayload): Promise<SlackCommandResponse> {
  const text = payload.text.trim();
  const parts = text.split(/\s+/);
  const subcommand = parts[0]?.toLowerCase() || '';
  const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';

  const connection = await findConnectionBySlackUser(payload.userId);
  const tenantId = connection?.tenantId || 'default';
  const dashboardUrl = `${manageUiUrl}/${tenantId}/work-apps/slack`;

  console.log('=== SLACK COMMAND RECEIVED ===');
  console.log({
    command: payload.command,
    text: payload.text,
    subcommand,
    slackUserId: payload.userId,
    userName: payload.userName,
    teamId: payload.teamId,
    teamDomain: payload.teamDomain,
    tenantId,
  });
  console.log('==============================');

  switch (subcommand) {
    case 'link':
      return handleLinkCommand(payload, dashboardUrl);

    case 'status':
      return handleStatusCommand(payload, dashboardUrl);

    case 'logout':
    case 'disconnect':
      return handleLogoutCommand(payload);

    case 'list':
      return handleAgentListCommand(payload, dashboardUrl);

    case 'run': {
      if (parts.length < 3) {
        const message = createErrorMessage(
          'Usage: `/inkeep run [agent-name] [question]`\n\nExample: `/inkeep run my-agent What is the weather?`'
        );
        return { response_type: 'ephemeral', ...message };
      }
      const agentName = parts[1];
      const question = parts.slice(2).join(' ');
      return handleRunCommand(payload, agentName, question, dashboardUrl);
    }

    case 'settings': {
      const settingsSubcommand = parts[1]?.toLowerCase();
      const agentName = parts.slice(2).join(' ') || parts[2];
      return handleSettingsCommand(payload, settingsSubcommand, agentName, dashboardUrl);
    }

    case 'help':
    case '':
      if (text === '' || text === 'help') {
        return handleHelpCommand();
      }
      return handleQuestionCommand(payload, text, dashboardUrl);

    default:
      return handleQuestionCommand(payload, text, dashboardUrl);
  }
}
