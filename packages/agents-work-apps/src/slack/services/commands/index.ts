import {
  deleteWorkAppSlackUserMapping,
  findWorkAppSlackUserMapping,
  findWorkAppSlackUserMappingBySlackUser,
  signSlackLinkToken,
  signSlackUserToken,
} from '@inkeep/agents-core';
import runDbClient from '../../../db/runDbClient';
import { env } from '../../../env';
import { getLogger } from '../../../logger';
import { SlackStrings } from '../../i18n';
import { resolveEffectiveAgent } from '../agent-resolution';
import {
  createAgentListMessage,
  createAlreadyLinkedMessage,
  createContextBlock,
  createErrorMessage,
  createJwtLinkMessage,
  createNotLinkedMessage,
  createStatusMessage,
  createUnlinkSuccessMessage,
  createUpdatedHelpMessage,
} from '../blocks';
import { getSlackClient } from '../client';
import {
  fetchAgentsForProject,
  fetchProjectsForTenant,
  getChannelAgentConfig,
  sendResponseUrlMessage,
} from '../events/utils';
import { buildAgentSelectorModal, type ModalMetadata } from '../modals';
import { findWorkspaceConnectionByTeamId, type SlackWorkspaceConnection } from '../nango';
import type { SlackCommandPayload, SlackCommandResponse } from '../types';

interface AgentInfo {
  id: string;
  name: string | null;
  projectId: string;
  projectName: string | null;
}

/**
 * Fetch all agents from the manage API.
 * This uses the proper ref-middleware and Dolt branch resolution.
 * Requires an auth token to access the manage API.
 */
const INTERNAL_FETCH_TIMEOUT_MS = 10_000;

async function fetchAgentsFromManageApi(tenantId: string, authToken: string): Promise<AgentInfo[]> {
  const apiBaseUrl = env.INKEEP_AGENTS_API_URL || 'http://localhost:3002';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INTERNAL_FETCH_TIMEOUT_MS);

  try {
    // First fetch projects
    const projectsResponse = await fetch(`${apiBaseUrl}/manage/tenants/${tenantId}/projects`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      signal: controller.signal,
    });

    if (!projectsResponse.ok) {
      logger.error(
        { status: projectsResponse.status, tenantId },
        'Failed to fetch projects from manage API'
      );
      return [];
    }

    const projectsData = await projectsResponse.json();
    const projects = projectsData.data || projectsData || [];

    logger.info({ projectCount: projects.length, tenantId }, 'Fetched projects from manage API');

    // Fetch agents for all projects in parallel
    const agentResults = await Promise.all(
      projects.map(async (project: { id: string; name: string | null }) => {
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

          if (agentsResponse.ok) {
            const agentsData = await agentsResponse.json();
            const agents = agentsData.data || agentsData || [];

            return agents.map((agent: { id: string; name: string | null }) => ({
              id: agent.id,
              name: agent.name,
              projectId: project.id,
              projectName: project.name,
            }));
          }
          return [];
        } catch (error) {
          logger.error({ error, projectId: project.id }, 'Failed to fetch agents for project');
          return [];
        }
      })
    );

    return agentResults.flat();
  } catch (error) {
    logger.error({ error, tenantId }, 'Failed to fetch agents from manage API');
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Find an agent by name or ID from the manage API.
 */
async function findAgentByIdentifier(
  tenantId: string,
  identifier: string,
  authToken: string
): Promise<AgentInfo | null> {
  const allAgents = await fetchAgentsFromManageApi(tenantId, authToken);

  return (
    allAgents.find(
      (a) => a.id === identifier || a.name?.toLowerCase() === identifier.toLowerCase()
    ) || null
  );
}

const DEFAULT_CLIENT_ID = 'work-apps-slack';
const LINK_CODE_TTL_MINUTES = 10;

const logger = getLogger('slack-commands');

/**
 * Parse agent name and question from command text.
 * Agent name must be in quotes: "agent name" question
 */
function parseAgentAndQuestion(text: string): {
  agentName: string | null;
  question: string | null;
} {
  if (!text.trim()) {
    return { agentName: null, question: null };
  }

  // Agent name must be in quotes: "agent name" question
  const quotedMatch = text.match(/^["']([^"']+)["']\s+(.+)$/);
  if (quotedMatch) {
    return { agentName: quotedMatch[1].trim(), question: quotedMatch[2].trim() };
  }

  return { agentName: null, question: null };
}

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
    const linkToken = await signSlackLinkToken({
      tenantId,
      slackTeamId: payload.teamId,
      slackUserId: payload.userId,
      slackEnterpriseId: payload.enterpriseId,
      slackUsername: payload.userName,
    });

    const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';
    const linkUrl = `${manageUiUrl}/link?token=${encodeURIComponent(linkToken)}`;

    logger.info({ slackUserId: payload.userId, tenantId }, 'Generated JWT link token');

    const message = createJwtLinkMessage(linkUrl, LINK_CODE_TTL_MINUTES);
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

    // Fetch agents for all projects in parallel
    const agentResults = await Promise.all(
      projectList.map((project) => fetchAgentsForProject(tenantId, project.id))
    );
    let agentList = agentResults.flat();

    if (agentList.length === 0 && defaultAgent) {
      agentList = [
        {
          id: defaultAgent.agentId,
          name: defaultAgent.agentName || defaultAgent.agentId,
          projectId: defaultAgent.projectId,
          projectName: defaultAgent.projectName || defaultAgent.projectId,
        },
      ];
    }

    const firstProject = projectList[0];

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
  tenantId: string
): Promise<SlackCommandResponse> {
  try {
    const linkToken = await signSlackLinkToken({
      tenantId,
      slackTeamId: payload.teamId,
      slackUserId: payload.userId,
      slackEnterpriseId: payload.enterpriseId,
      slackUsername: payload.userName,
    });

    const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';
    const linkUrl = `${manageUiUrl}/link?token=${encodeURIComponent(linkToken)}`;

    logger.info({ slackUserId: payload.userId, tenantId }, 'Generated JWT link token with intent');

    const message = createJwtLinkMessage(linkUrl, LINK_CODE_TTL_MINUTES);
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
  tenantId: string
): Promise<SlackCommandResponse> {
  // Find user mapping without tenant filter to get the correct tenant
  const existingLink = await findWorkAppSlackUserMappingBySlackUser(runDbClient)(
    payload.userId,
    payload.teamId,
    DEFAULT_CLIENT_ID
  );

  if (!existingLink) {
    return generateLinkCodeWithIntent(payload, tenantId);
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
      'No default agent configured. Ask your admin to set a workspace default in the dashboard.\n\nUse `/inkeep list` to see available agents.'
    );
    return { response_type: 'ephemeral', ...message };
  }

  const targetAgent = {
    id: resolvedAgent.agentId,
    name: resolvedAgent.agentName || null,
    projectId: resolvedAgent.projectId,
  };

  executeAgentInBackground(payload, existingLink, targetAgent, question, userTenantId).catch(
    (error) => {
      logger.error({ error }, 'Background execution promise rejected');
    }
  );

  // Return empty object - Slack will just acknowledge the command without showing a message
  // The background task will send the actual response via response_url
  return {};
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/run/api/chat`, {
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
      await sendResponseUrlMessage(payload.responseUrl, {
        response_type: 'ephemeral',
        text: `Failed to run agent: ${response.status} ${response.statusText}`,
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
        response_type: 'ephemeral',
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

export async function handleRunCommand(
  payload: SlackCommandPayload,
  agentIdentifier: string,
  question: string,
  _dashboardUrl: string,
  tenantId: string
): Promise<SlackCommandResponse> {
  // Find user mapping without tenant filter to get the correct tenant
  const existingLink = await findWorkAppSlackUserMappingBySlackUser(runDbClient)(
    payload.userId,
    payload.teamId,
    DEFAULT_CLIENT_ID
  );

  if (!existingLink) {
    return generateLinkCodeWithIntent(payload, tenantId);
  }

  // Use the tenant from the user's mapping
  const userTenantId = existingLink.tenantId;

  try {
    // Sign a token for manage API access
    const authToken = await signSlackUserToken({
      inkeepUserId: existingLink.inkeepUserId,
      tenantId: userTenantId,
      slackTeamId: payload.teamId,
      slackUserId: payload.userId,
      slackEnterpriseId: payload.enterpriseId,
    });

    // Use manage API to find agent with proper Dolt branch resolution
    const targetAgent = await findAgentByIdentifier(userTenantId, agentIdentifier, authToken);

    if (!targetAgent) {
      const message = createErrorMessage(
        `Agent "${agentIdentifier}" not found. Use \`/inkeep list\` to see available agents.`
      );
      return { response_type: 'ephemeral', ...message };
    }

    executeAgentInBackground(payload, existingLink, targetAgent, question, userTenantId).catch(
      (error) => {
        logger.error({ error }, 'Background execution promise rejected');
      }
    );

    // Return empty object - Slack will just acknowledge the command without showing a message
    // The background task will send the actual response via response_url
    return {};
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage, tenantId: userTenantId }, 'Failed to run agent');

    const message = createErrorMessage(
      'Failed to run agent. Please try again or visit the dashboard.'
    );
    return { response_type: 'ephemeral', ...message };
  }
}

export async function handleAgentListCommand(
  payload: SlackCommandPayload,
  dashboardUrl: string,
  _tenantId: string
): Promise<SlackCommandResponse> {
  // Find user mapping without tenant filter to get the correct tenant
  const existingLink = await findWorkAppSlackUserMappingBySlackUser(runDbClient)(
    payload.userId,
    payload.teamId,
    DEFAULT_CLIENT_ID
  );

  if (!existingLink) {
    const message = createNotLinkedMessage();
    return { response_type: 'ephemeral', ...message };
  }

  // Use the tenant from the user's mapping, not the workspace default
  const userTenantId = existingLink.tenantId;

  logger.info(
    {
      slackUserId: payload.userId,
      existingLinkTenantId: existingLink.tenantId,
      existingLinkInkeepUserId: existingLink.inkeepUserId,
    },
    'Found user mapping for list command'
  );

  try {
    // Sign a token for manage API access
    const authToken = await signSlackUserToken({
      inkeepUserId: existingLink.inkeepUserId,
      tenantId: userTenantId,
      slackTeamId: payload.teamId,
      slackUserId: payload.userId,
      slackEnterpriseId: payload.enterpriseId,
    });

    // Use manage API to get agents with proper Dolt branch resolution
    const allAgents = await fetchAgentsFromManageApi(userTenantId, authToken);

    logger.info(
      {
        slackUserId: payload.userId,
        tenantId: userTenantId,
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
    logger.error({ error: errorMessage, tenantId: userTenantId }, 'Failed to list agents');

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
      const runText = text.slice(4).trim();
      const parsed = parseAgentAndQuestion(runText);

      if (!parsed.agentName || !parsed.question) {
        const message = createErrorMessage(
          'Usage: `/inkeep run "agent name" [question]`\n\n' +
            'Example: `/inkeep run "my agent" What is the weather?`\n\n' +
            'Agent name must be in quotes.'
        );
        return { response_type: 'ephemeral', ...message };
      }

      return handleRunCommand(payload, parsed.agentName, parsed.question, dashboardUrl, tenantId);
    }

    case 'help':
      return handleHelpCommand();

    case '':
      // No arguments - open agent picker modal (pass pre-resolved connection)
      return handleAgentPickerCommand(payload, tenantId, workspaceConnection);

    default:
      return handleQuestionCommand(payload, text, dashboardUrl, tenantId);
  }
}
