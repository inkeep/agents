import {
  createWorkAppSlackAccountLinkCode,
  deleteWorkAppSlackUserMapping,
  findWorkAppSlackUserMapping,
  listAgents,
  listProjectsPaginated,
  signSlackUserToken,
} from '@inkeep/agents-core';
import manageDbClient from '../../../../../data/db/manageDbClient';
import runDbClient from '../../../../../data/db/runDbClient';
import { env } from '../../../../../env';
import { getLogger } from '../../../../../logger';
import {
  createAgentListMessage,
  createAlreadyLinkedMessage,
  createDeviceCodeMessage,
  createErrorMessage,
  createNotLinkedMessage,
  createUnlinkSuccessMessage,
  createUpdatedHelpMessage,
} from '../blocks';
import { findWorkspaceConnectionByTeamId } from '../nango';
import type { SlackCommandPayload, SlackCommandResponse } from '../types';

const DEFAULT_CLIENT_ID = 'work-apps-slack';
const LINK_CODE_TTL_MINUTES = 60;

const logger = getLogger('slack-commands');

export async function handleLinkCommand(
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
    const message = createAlreadyLinkedMessage(
      existingLink.slackEmail || existingLink.slackUsername || 'Unknown',
      existingLink.linkedAt,
      dashboardUrl
    );
    return { response_type: 'ephemeral', ...message };
  }

  try {
    const { plaintextCode } = await createWorkAppSlackAccountLinkCode(runDbClient)({
      tenantId,
      slackUserId: payload.userId,
      slackTeamId: payload.teamId,
      slackEnterpriseId: payload.enterpriseId,
      slackUsername: payload.userName,
    });

    const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';
    const linkUrl = `${manageUiUrl}/link?code=${plaintextCode}`;

    logger.info(
      { slackUserId: payload.userId, tenantId },
      'Generated device link code (hash stored)'
    );

    const message = createDeviceCodeMessage(plaintextCode, linkUrl, LINK_CODE_TTL_MINUTES);
    return { response_type: 'ephemeral', ...message };
  } catch (error) {
    logger.error({ error, slackUserId: payload.userId, tenantId }, 'Failed to generate link code');
    const message = createErrorMessage('Failed to generate link code. Please try again.');
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
    const message = createAlreadyLinkedMessage(
      existingLink.slackEmail || existingLink.slackUsername || payload.userName,
      existingLink.linkedAt,
      dashboardUrl
    );
    return { response_type: 'ephemeral', ...message };
  }

  const message = createNotLinkedMessage();
  return { response_type: 'ephemeral', ...message };
}

export async function handleLogoutCommand(
  payload: SlackCommandPayload,
  tenantId: string
): Promise<SlackCommandResponse> {
  return handleUnlinkCommand(payload, tenantId);
}

export async function handleHelpCommand(): Promise<SlackCommandResponse> {
  const message = createUpdatedHelpMessage();
  return { response_type: 'ephemeral', ...message };
}

export interface OriginalIntent {
  command: string;
  text?: string;
  agentName?: string;
  question?: string;
}

async function generateLinkCodeWithIntent(
  payload: SlackCommandPayload,
  tenantId: string,
  _dashboardUrl: string,
  originalIntent?: OriginalIntent
): Promise<SlackCommandResponse> {
  try {
    const { plaintextCode } = await createWorkAppSlackAccountLinkCode(runDbClient)({
      tenantId,
      slackUserId: payload.userId,
      slackTeamId: payload.teamId,
      slackEnterpriseId: payload.enterpriseId,
      slackUsername: payload.userName,
      originalIntent: originalIntent
        ? (originalIntent as unknown as Record<string, unknown>)
        : undefined,
    });

    const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';
    const linkUrl = `${manageUiUrl}/link?code=${plaintextCode}`;

    logger.info(
      { slackUserId: payload.userId, tenantId, hasIntent: !!originalIntent },
      'Generated device link code with intent'
    );

    const message = createDeviceCodeMessage(plaintextCode, linkUrl, LINK_CODE_TTL_MINUTES);
    return { response_type: 'ephemeral', ...message };
  } catch (error) {
    logger.error({ error, slackUserId: payload.userId, tenantId }, 'Failed to generate link code');
    const message = createErrorMessage('Failed to generate link code. Please try again.');
    return { response_type: 'ephemeral', ...message };
  }
}

export async function handleQuestionCommand(
  payload: SlackCommandPayload,
  question: string,
  dashboardUrl: string,
  tenantId: string
): Promise<SlackCommandResponse> {
  const existingLink = await findWorkAppSlackUserMapping(runDbClient)(
    tenantId,
    payload.userId,
    payload.teamId,
    DEFAULT_CLIENT_ID
  );

  if (!existingLink) {
    return generateLinkCodeWithIntent(payload, tenantId, dashboardUrl, {
      command: 'question',
      question,
    });
  }

  const message = createErrorMessage(
    'Direct agent invocation is coming soon! Use `/inkeep list` to see available agents, or `/inkeep run [agent] [question]` to run a specific agent.'
  );
  return { response_type: 'ephemeral', ...message };
}

async function executeAgentInBackground(
  payload: SlackCommandPayload,
  existingLink: { inkeepUserId: string },
  targetAgent: { id: string; name: string | null; projectId: string },
  question: string,
  tenantId: string
): Promise<void> {
  try {
    const slackUserToken = await signSlackUserToken({
      inkeepUserId: existingLink.inkeepUserId,
      tenantId,
      slackTeamId: payload.teamId,
      slackUserId: payload.userId,
      slackEnterpriseId: payload.enterpriseId,
    });

    const apiBaseUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

    const response = await fetch(`${apiBaseUrl}/run/api/chat`, {
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
    });

    let responsePayload: {
      response_type: 'ephemeral' | 'in_channel';
      text?: string;
      blocks?: unknown[];
    };

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
      responsePayload = {
        response_type: 'ephemeral',
        text: `Failed to run agent: ${response.status} ${response.statusText}`,
      };
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

      responsePayload = {
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: assistantMessage,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Powered by *${targetAgent.name || targetAgent.id}* via Inkeep`,
              },
            ],
          },
        ],
      };
    }

    await fetch(payload.responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(responsePayload),
    });
  } catch (error) {
    logger.error({ error, slackUserId: payload.userId }, 'Background agent execution failed');

    try {
      await fetch(payload.responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response_type: 'ephemeral',
          text: 'An error occurred while running the agent. Please try again.',
        }),
      });
    } catch {
      logger.error({ slackUserId: payload.userId }, 'Failed to send error response to Slack');
    }
  }
}

export async function handleRunCommand(
  payload: SlackCommandPayload,
  agentIdentifier: string,
  question: string,
  dashboardUrl: string,
  tenantId: string
): Promise<SlackCommandResponse> {
  const existingLink = await findWorkAppSlackUserMapping(runDbClient)(
    tenantId,
    payload.userId,
    payload.teamId,
    DEFAULT_CLIENT_ID
  );

  if (!existingLink) {
    return generateLinkCodeWithIntent(payload, tenantId, dashboardUrl, {
      command: 'run',
      agentName: agentIdentifier,
      question,
    });
  }

  try {
    const projectsResult = await listProjectsPaginated(manageDbClient)({
      tenantId,
      pagination: { limit: 100 },
    });

    let targetAgent: { id: string; name: string | null; projectId: string } | null = null;

    for (const project of projectsResult.data) {
      const agents = await listAgents(manageDbClient)({
        scopes: { tenantId, projectId: project.id },
      });

      const foundAgent = agents.find(
        (a) => a.id === agentIdentifier || a.name?.toLowerCase() === agentIdentifier.toLowerCase()
      );

      if (foundAgent) {
        targetAgent = {
          id: foundAgent.id,
          name: foundAgent.name,
          projectId: project.id,
        };
        break;
      }
    }

    if (!targetAgent) {
      const message = createErrorMessage(
        `Agent "${agentIdentifier}" not found. Use \`/inkeep list\` to see available agents.`
      );
      return { response_type: 'ephemeral', ...message };
    }

    executeAgentInBackground(payload, existingLink, targetAgent, question, tenantId).catch(
      (error) => {
        logger.error({ error }, 'Background execution promise rejected');
      }
    );

    return {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🤔 _${targetAgent.name || targetAgent.id} is thinking..._`,
          },
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage, tenantId }, 'Failed to run agent');

    const message = createErrorMessage(
      'Failed to run agent. Please try again or visit the dashboard.'
    );
    return { response_type: 'ephemeral', ...message };
  }
}

export async function handleSettingsCommand(
  payload: SlackCommandPayload,
  _subCommand: string | undefined,
  _agentName: string | undefined,
  _dashboardUrl: string,
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

  const message = createErrorMessage(
    'Settings configuration is coming soon! For now, use `/inkeep list` to see available agents.'
  );
  return { response_type: 'ephemeral', ...message };
}

export async function handleAgentListCommand(
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

  if (!existingLink) {
    const message = createNotLinkedMessage();
    return { response_type: 'ephemeral', ...message };
  }

  try {
    const projectsResult = await listProjectsPaginated(manageDbClient)({
      tenantId,
      pagination: { limit: 100 },
    });

    const allAgents: Array<{
      id: string;
      name: string | null;
      projectId: string;
      projectName: string | null;
    }> = [];

    for (const project of projectsResult.data) {
      const agents = await listAgents(manageDbClient)({
        scopes: { tenantId, projectId: project.id },
      });
      for (const agent of agents) {
        allAgents.push({
          id: agent.id,
          name: agent.name,
          projectId: project.id,
          projectName: project.name,
        });
      }
    }

    logger.info(
      {
        slackUserId: payload.userId,
        tenantId,
        agentCount: allAgents.length,
      },
      'Listed agents for linked Slack user'
    );

    if (allAgents.length === 0) {
      const message = createErrorMessage(
        'No agents found. Create an agent in the Inkeep dashboard first.'
      );
      return { response_type: 'ephemeral', ...message };
    }

    const userDashboardUrl = dashboardUrl.replace('/work-apps/slack', '');
    const message = createAgentListMessage(allAgents, userDashboardUrl);
    return { response_type: 'ephemeral', ...message };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage, tenantId }, 'Failed to list agents');

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

  const workspaceConnection = await findWorkspaceConnectionByTeamId(payload.teamId);
  const tenantId = workspaceConnection?.tenantId || 'default';
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
    case 'connect':
      return handleLinkCommand(payload, dashboardUrl, tenantId);

    case 'status':
      return handleStatusCommand(payload, dashboardUrl, tenantId);

    case 'unlink':
    case 'logout':
    case 'disconnect':
      return handleUnlinkCommand(payload, tenantId);

    case 'list':
      return handleAgentListCommand(payload, dashboardUrl, tenantId);

    case 'run': {
      if (parts.length < 3) {
        const message = createErrorMessage(
          'Usage: `/inkeep run [agent-name] [question]`\n\nExample: `/inkeep run my-agent What is the weather?`'
        );
        return { response_type: 'ephemeral', ...message };
      }
      const agentName = parts[1];
      const question = parts.slice(2).join(' ');
      return handleRunCommand(payload, agentName, question, dashboardUrl, tenantId);
    }

    case 'settings': {
      const settingsSubcommand = parts[1]?.toLowerCase();
      const agentName = parts.slice(2).join(' ') || parts[2];
      return handleSettingsCommand(payload, settingsSubcommand, agentName, dashboardUrl, tenantId);
    }

    case 'help':
    case '':
      if (text === '' || text === 'help') {
        return handleHelpCommand();
      }
      return handleQuestionCommand(payload, text, dashboardUrl, tenantId);

    default:
      return handleQuestionCommand(payload, text, dashboardUrl, tenantId);
  }
}
