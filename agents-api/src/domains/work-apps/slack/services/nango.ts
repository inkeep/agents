import { Nango } from '@nangohq/node';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import type { SlackUserConnection } from './types';

const logger = getLogger('slack-nango');

export function getSlackNango(): Nango {
  const secretKey = env.NANGO_SLACK_SECRET_KEY || env.NANGO_SECRET_KEY;
  if (!secretKey) {
    throw new Error('NANGO_SLACK_SECRET_KEY or NANGO_SECRET_KEY is required for Slack integration');
  }
  return new Nango({ secretKey });
}

export function getSlackIntegrationId(): string {
  return env.NANGO_SLACK_INTEGRATION_ID || 'slack-agent';
}

export async function findConnectionBySlackUser(
  slackUserId: string
): Promise<SlackUserConnection | null> {
  try {
    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();

    const connections = await nango.listConnections();

    const matchingConnections: SlackUserConnection[] = [];

    for (const conn of connections.connections) {
      if (conn.provider_config_key === integrationId) {
        try {
          const fullConn = await nango.getConnection(integrationId, conn.connection_id);
          const metadata = fullConn.metadata as Record<string, string> | undefined;

          if (metadata?.slack_user_id === slackUserId) {
            matchingConnections.push({
              connectionId: conn.connection_id,
              appUserId: metadata.app_user_id || '',
              appUserEmail: metadata.app_user_email || '',
              slackDisplayName: metadata.slack_display_name || metadata.slack_username || '',
              linkedAt: metadata.linked_at || '',
              tenantId: metadata.tenant_id || 'default',
              slackUserId: metadata.slack_user_id,
              slackTeamId: metadata.slack_team_id,
              inkeepSessionToken: metadata.inkeep_session_token,
              inkeepSessionExpiresAt: metadata.inkeep_session_expires_at,
              defaultAgent: metadata.default_agent,
            });
          }
        } catch {}
      }
    }

    if (matchingConnections.length === 0) {
      return null;
    }

    if (matchingConnections.length > 1) {
      console.log('=== MULTIPLE CONNECTIONS FOUND FOR SLACK USER ===');
      console.log(JSON.stringify(matchingConnections, null, 2));
      console.log('=================================================');

      matchingConnections.sort(
        (a, b) => new Date(b.linkedAt).getTime() - new Date(a.linkedAt).getTime()
      );
    }

    return matchingConnections[0];
  } catch (error) {
    logger.error({ error }, 'Failed to find connection by Slack user');
    return null;
  }
}

export async function findConnectionByAppUser(
  appUserId: string
): Promise<SlackUserConnection | null> {
  try {
    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();

    const connections = await nango.listConnections();

    const matchingConnections: SlackUserConnection[] = [];

    for (const conn of connections.connections) {
      if (conn.provider_config_key === integrationId) {
        try {
          const fullConn = await nango.getConnection(integrationId, conn.connection_id);
          const metadata = fullConn.metadata as Record<string, string> | undefined;

          if (metadata?.app_user_id === appUserId) {
            matchingConnections.push({
              connectionId: conn.connection_id,
              appUserId: metadata.app_user_id || '',
              appUserEmail: metadata.app_user_email || '',
              slackDisplayName: metadata.slack_display_name || metadata.slack_username || '',
              linkedAt: metadata.linked_at || '',
            });
          }
        } catch {}
      }
    }

    if (matchingConnections.length === 0) {
      return null;
    }

    if (matchingConnections.length > 1) {
      console.log('=== MULTIPLE CONNECTIONS FOUND FOR APP USER ===');
      console.log(JSON.stringify(matchingConnections, null, 2));
      console.log('================================================');

      matchingConnections.sort(
        (a, b) => new Date(b.linkedAt).getTime() - new Date(a.linkedAt).getTime()
      );
    }

    return matchingConnections[0];
  } catch (error) {
    logger.error({ error }, 'Failed to find connection by app user');
    return null;
  }
}

export async function getConnectionStatus(
  appUserId: string
): Promise<{ connected: boolean; connection: SlackUserConnection | null }> {
  const connection = await findConnectionByAppUser(appUserId);
  return {
    connected: connection !== null,
    connection,
  };
}

export async function deleteConnection(connectionId: string): Promise<boolean> {
  try {
    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();
    await nango.deleteConnection(integrationId, connectionId);
    return true;
  } catch (error) {
    logger.error({ error, connectionId }, 'Failed to delete Nango connection');
    return false;
  }
}

export async function createConnectSession(params: {
  userId: string;
  userEmail?: string;
  userName?: string;
  tenantId: string;
}): Promise<{ sessionToken: string } | null> {
  try {
    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();

    const session = await nango.createConnectSession({
      end_user: {
        id: params.userId,
        email: params.userEmail,
        display_name: params.userName,
      },
      organization: {
        id: params.tenantId,
        display_name: params.tenantId,
      },
      allowed_integrations: [integrationId],
    });

    logger.info(
      {
        userId: params.userId,
        userEmail: params.userEmail,
        integrationId,
      },
      'Created Nango connect session'
    );

    return { sessionToken: session.data.token };
  } catch (error) {
    logger.error({ error }, 'Failed to create Nango connect session');
    return null;
  }
}

export async function getConnectionAccessToken(connectionId: string): Promise<string | null> {
  try {
    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();
    const connection = await nango.getConnection(integrationId, connectionId);
    return (
      (connection as { credentials?: { access_token?: string } }).credentials?.access_token || null
    );
  } catch (error) {
    logger.error({ error, connectionId }, 'Failed to get connection access token');
    return null;
  }
}

export interface SlackConnectionWithToken extends SlackUserConnection {
  botToken: string;
}

export interface DefaultAgentConfig {
  agentId: string;
  agentName: string;
  projectId: string;
  projectName: string;
}

export interface SlackWorkspaceConnection {
  connectionId: string;
  teamId: string;
  teamName?: string;
  botToken: string;
  tenantId: string;
  defaultAgent?: DefaultAgentConfig;
}

/**
 * Find a workspace connection by Slack team ID.
 * Used for @mentions where any user can trigger the bot.
 * Returns the bot token for the workspace.
 */
export async function findWorkspaceConnectionByTeamId(
  teamId: string
): Promise<SlackWorkspaceConnection | null> {
  try {
    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();

    const connections = await nango.listConnections();

    for (const conn of connections.connections) {
      if (conn.provider_config_key === integrationId) {
        try {
          const fullConn = await nango.getConnection(integrationId, conn.connection_id);
          const connectionConfig = fullConn.connection_config as Record<string, string> | undefined;
          const metadata = fullConn.metadata as Record<string, string> | undefined;
          const credentials = fullConn as { credentials?: { access_token?: string } };

          const connTeamId = connectionConfig?.['team.id'] || metadata?.slack_team_id;

          if (connTeamId === teamId && credentials.credentials?.access_token) {
            let defaultAgent: DefaultAgentConfig | undefined;
            if (metadata?.default_agent) {
              try {
                defaultAgent = JSON.parse(metadata.default_agent);
              } catch {
                // Invalid JSON, ignore
              }
            }

            return {
              connectionId: conn.connection_id,
              teamId,
              teamName: metadata?.slack_team_name,
              botToken: credentials.credentials.access_token,
              tenantId: metadata?.tenant_id || 'default',
              defaultAgent,
            };
          }
        } catch {
          // Continue to next connection
        }
      }
    }

    return null;
  } catch (error) {
    logger.error({ error, teamId }, 'Failed to find workspace connection by team ID');
    return null;
  }
}

export async function getConnectionWithBotToken(
  connectionId: string
): Promise<SlackConnectionWithToken | null> {
  try {
    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();
    const connection = await nango.getConnection(integrationId, connectionId);

    const credentials = connection as { credentials?: { access_token?: string } };
    const metadata = connection.metadata as Record<string, string> | undefined;
    const botToken = credentials.credentials?.access_token;

    if (!botToken || !metadata) {
      return null;
    }

    return {
      connectionId,
      appUserId: metadata.app_user_id || '',
      appUserEmail: metadata.app_user_email || '',
      slackDisplayName: metadata.slack_display_name || metadata.slack_username || '',
      linkedAt: metadata.linked_at || '',
      tenantId: metadata.tenant_id || 'default',
      slackUserId: metadata.slack_user_id,
      slackTeamId: metadata.slack_team_id,
      inkeepSessionToken: metadata.inkeep_session_token,
      inkeepSessionExpiresAt: metadata.inkeep_session_expires_at,
      botToken,
    };
  } catch (error) {
    logger.error({ error, connectionId }, 'Failed to get connection with bot token');
    return null;
  }
}

export async function updateConnectionMetadata(
  connectionId: string,
  metadata: Record<string, string>
): Promise<boolean> {
  try {
    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();
    await nango.updateMetadata(integrationId, connectionId, metadata);
    return true;
  } catch (error) {
    logger.error({ error, connectionId }, 'Failed to update connection metadata');
    return false;
  }
}

export interface SlackUserSettings {
  defaultAgentId?: string;
  defaultAgentName?: string;
  defaultProjectId?: string;
  defaultAgentApiKey?: string;
}

export async function getUserSettings(connectionId: string): Promise<SlackUserSettings> {
  try {
    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();
    const connection = await nango.getConnection(integrationId, connectionId);
    const metadata = connection.metadata as Record<string, string> | undefined;

    return {
      defaultAgentId: metadata?.default_agent_id,
      defaultAgentName: metadata?.default_agent_name,
      defaultProjectId: metadata?.default_project_id,
      defaultAgentApiKey: metadata?.default_agent_api_key,
    };
  } catch (error) {
    logger.error({ error, connectionId }, 'Failed to get user settings');
    return {};
  }
}

export async function setUserDefaultAgent(
  connectionId: string,
  settings: {
    agentId: string;
    agentName: string;
    projectId: string;
    apiKey: string;
  }
): Promise<boolean> {
  return updateConnectionMetadata(connectionId, {
    default_agent_id: settings.agentId,
    default_agent_name: settings.agentName,
    default_project_id: settings.projectId,
    default_agent_api_key: settings.apiKey,
  });
}

export async function clearUserDefaultAgent(connectionId: string): Promise<boolean> {
  return updateConnectionMetadata(connectionId, {
    default_agent_id: '',
    default_agent_name: '',
    default_project_id: '',
    default_agent_api_key: '',
  });
}

export async function setWorkspaceDefaultAgent(
  teamId: string,
  defaultAgent: DefaultAgentConfig
): Promise<boolean> {
  try {
    const workspace = await findWorkspaceConnectionByTeamId(teamId);
    if (!workspace) {
      logger.warn({ teamId }, 'No workspace connection found to set default agent');
      return false;
    }

    return updateConnectionMetadata(workspace.connectionId, {
      default_agent: JSON.stringify(defaultAgent),
    });
  } catch (error) {
    logger.error({ error, teamId }, 'Failed to set workspace default agent');
    return false;
  }
}

export async function getWorkspaceDefaultAgentFromNango(
  teamId: string
): Promise<DefaultAgentConfig | null> {
  try {
    const workspace = await findWorkspaceConnectionByTeamId(teamId);
    return workspace?.defaultAgent || null;
  } catch (error) {
    logger.error({ error, teamId }, 'Failed to get workspace default agent');
    return null;
  }
}
