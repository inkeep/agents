import { env } from '../../../../../env';
import { getLogger } from '../../../../../logger';
import { createSlackApiClient, SlackApiError } from '../api-client';
import {
  createAlreadyConnectedMessage,
  createErrorMessage,
  createHelpMessage,
  createLinkMessage,
  createLogoutSuccessMessage,
  createNoProjectsMessage,
  createProjectListMessage,
  createStatusConnectedMessage,
  createStatusNotConnectedMessage,
} from '../blocks';
import { deleteConnection, findConnectionBySlackUser } from '../nango';
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
  const message = createHelpMessage();
  return { response_type: 'ephemeral', ...message };
}

export async function handleCommand(payload: SlackCommandPayload): Promise<SlackCommandResponse> {
  const subcommand = payload.text.trim().toLowerCase().split(' ')[0];
  const manageUiUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';

  const connection = await findConnectionBySlackUser(payload.userId);
  const tenantId = connection?.tenantId || 'default';
  const dashboardUrl = `${manageUiUrl}/${tenantId}/work-apps/slack`;

  console.log('=== SLACK COMMAND RECEIVED ===');
  console.log({
    command: payload.command,
    text: payload.text,
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
      return handleListCommand(payload, dashboardUrl);
    default:
      return handleHelpCommand();
  }
}
