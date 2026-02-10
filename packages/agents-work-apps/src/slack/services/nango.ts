/**
 * Nango Service for Slack OAuth Token Management
 *
 * ARCHITECTURE NOTE: PostgreSQL is the authoritative source of truth for:
 * - User linking data (work_app_slack_user_mappings table)
 * - Workspace metadata (work_app_slack_workspaces table)
 * - Channel agent configs (work_app_slack_channel_agent_configs table)
 *
 * Nango is used ONLY for:
 * - OAuth token storage and refresh (bot tokens for workspaces)
 * - OAuth flow management (createConnectSession)
 * - Workspace default agent config (stored in connection metadata)
 *
 * PERFORMANCE: Workspace lookups use PostgreSQL first (O(1)), with Nango
 * fallback only when needed for bot token retrieval.
 *
 * For user data, use the PostgreSQL data access layer:
 * @see packages/agents-core/src/data-access/runtime/workAppSlack.ts
 */

import { findWorkAppSlackWorkspaceBySlackTeamId } from '@inkeep/agents-core';
import { Nango } from '@nangohq/node';
import runDbClient from '../../db/runDbClient';
import { env } from '../../env';
import { getLogger } from '../../logger';

const workspaceConnectionCache = new Map<
  string,
  { connection: SlackWorkspaceConnection; expiresAt: number }
>();
const CACHE_TTL_MS = 60_000;

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

export interface DefaultAgentConfig {
  agentId: string;
  agentName?: string;
  projectId: string;
  projectName?: string;
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
 * Uses PostgreSQL first (O(1)) with in-memory caching, then falls back to Nango.
 *
 * Performance: This function is called on every @mention and command.
 * The PostgreSQL-first approach with caching provides O(1) lookups.
 */
export async function findWorkspaceConnectionByTeamId(
  teamId: string
): Promise<SlackWorkspaceConnection | null> {
  const cached = workspaceConnectionCache.get(teamId);
  if (cached && cached.expiresAt > Date.now()) {
    logger.debug({ teamId }, 'Workspace connection cache hit');
    return cached.connection;
  }

  try {
    const dbWorkspace = await findWorkAppSlackWorkspaceBySlackTeamId(runDbClient)(teamId);

    if (dbWorkspace?.nangoConnectionId) {
      const botToken = await getConnectionAccessToken(dbWorkspace.nangoConnectionId);

      if (botToken) {
        const connection: SlackWorkspaceConnection = {
          connectionId: dbWorkspace.nangoConnectionId,
          teamId,
          teamName: dbWorkspace.slackTeamName || undefined,
          botToken,
          tenantId: dbWorkspace.tenantId,
          defaultAgent: undefined,
        };

        const defaultAgentConfig = await getWorkspaceDefaultAgentFromNangoByConnectionId(
          dbWorkspace.nangoConnectionId
        );
        if (defaultAgentConfig) {
          connection.defaultAgent = defaultAgentConfig;
        }

        workspaceConnectionCache.set(teamId, {
          connection,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });

        logger.debug({ teamId }, 'Workspace connection found via PostgreSQL');
        return connection;
      }
    }

    logger.debug({ teamId }, 'PostgreSQL lookup failed, falling back to Nango iteration');
    return findWorkspaceConnectionByTeamIdFromNango(teamId);
  } catch (error) {
    logger.error({ error, teamId }, 'Failed to find workspace connection by team ID');
    return findWorkspaceConnectionByTeamIdFromNango(teamId);
  }
}

async function getWorkspaceDefaultAgentFromNangoByConnectionId(
  connectionId: string
): Promise<DefaultAgentConfig | null> {
  try {
    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();
    const fullConn = await nango.getConnection(integrationId, connectionId);
    const metadata = fullConn.metadata as Record<string, string> | undefined;

    if (metadata?.default_agent) {
      try {
        return JSON.parse(metadata.default_agent);
      } catch {
        return null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Legacy fallback: Find workspace by iterating all Nango connections.
 * Only used when PostgreSQL lookup fails.
 */
async function findWorkspaceConnectionByTeamIdFromNango(
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

            const connection: SlackWorkspaceConnection = {
              connectionId: conn.connection_id,
              teamId,
              teamName: metadata?.slack_team_name,
              botToken: credentials.credentials.access_token,
              tenantId: metadata?.tenant_id || 'default',
              defaultAgent,
            };

            workspaceConnectionCache.set(teamId, {
              connection,
              expiresAt: Date.now() + CACHE_TTL_MS,
            });

            return connection;
          }
        } catch {
          // Continue to next connection
        }
      }
    }

    return null;
  } catch (error) {
    logger.error({ error, teamId }, 'Failed to find workspace connection from Nango');
    return null;
  }
}

export function clearWorkspaceConnectionCache(teamId?: string): void {
  if (teamId) {
    workspaceConnectionCache.delete(teamId);
  } else {
    workspaceConnectionCache.clear();
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

export async function setWorkspaceDefaultAgent(
  teamId: string,
  defaultAgent: DefaultAgentConfig | null
): Promise<boolean> {
  try {
    const workspace = await findWorkspaceConnectionByTeamId(teamId);
    if (!workspace) {
      logger.warn({ teamId }, 'No workspace connection found to set default agent');
      return false;
    }

    const success = await updateConnectionMetadata(workspace.connectionId, {
      default_agent: defaultAgent ? JSON.stringify(defaultAgent) : '',
    });

    if (success) {
      clearWorkspaceConnectionCache(teamId);
    }

    return success;
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

/**
 * Compute a stable, deterministic connection ID for a Slack workspace.
 * Format: "T:<team_id>" or "E:<enterprise_id>:T:<team_id>" for Enterprise Grid
 */
export function computeWorkspaceConnectionId(params: {
  teamId: string;
  enterpriseId?: string;
}): string {
  const { teamId, enterpriseId } = params;
  if (enterpriseId) {
    return `E:${enterpriseId}:T:${teamId}`;
  }
  return `T:${teamId}`;
}

export interface WorkspaceInstallData {
  teamId: string;
  teamName?: string;
  teamDomain?: string;
  enterpriseId?: string;
  enterpriseName?: string;
  botUserId?: string;
  botToken: string;
  botScopes?: string;
  installerUserId?: string;
  installerUserName?: string;
  isEnterpriseInstall?: boolean;
  appId?: string;
  tenantId?: string;
  workspaceUrl?: string;
  workspaceIconUrl?: string;
  installationSource?: string;
}

/**
 * Store a workspace installation in Nango.
 * Uses upsert semantics - will update if the connection already exists.
 */
export async function storeWorkspaceInstallation(
  data: WorkspaceInstallData
): Promise<{ connectionId: string; success: boolean }> {
  const connectionId = computeWorkspaceConnectionId({
    teamId: data.teamId,
    enterpriseId: data.enterpriseId,
  });

  try {
    const integrationId = getSlackIntegrationId();
    const secretKey = env.NANGO_SLACK_SECRET_KEY || env.NANGO_SECRET_KEY;

    if (!secretKey) {
      logger.error({}, 'No Nango secret key available');
      return { connectionId, success: false };
    }

    const nangoApiUrl = env.NANGO_SERVER_URL || 'https://api.nango.dev';

    logger.info(
      { integrationId, connectionId, teamId: data.teamId, teamName: data.teamName },
      'Importing connection to Nango'
    );

    const displayName = data.enterpriseName
      ? `${data.teamName || data.teamId} (${data.enterpriseName})`
      : data.teamName || data.teamId;

    const workspaceUrl =
      data.workspaceUrl || (data.teamDomain ? `https://${data.teamDomain}.slack.com` : '');

    const now = new Date().toISOString();

    const requestBody = {
      provider_config_key: integrationId,
      connection_id: connectionId,
      credentials: {
        type: 'OAUTH2',
        access_token: data.botToken,
      },
      metadata: {
        display_name: displayName,
        connection_type: 'workspace',

        slack_team_id: data.teamId,
        slack_team_name: data.teamName || '',
        slack_team_domain: data.teamDomain || '',
        slack_workspace_url: workspaceUrl,
        slack_workspace_icon_url: data.workspaceIconUrl || '',

        slack_enterprise_id: data.enterpriseId || '',
        slack_enterprise_name: data.enterpriseName || '',
        is_enterprise_install: String(data.isEnterpriseInstall || false),

        slack_bot_user_id: data.botUserId || '',
        slack_bot_scopes: data.botScopes || '',
        slack_app_id: data.appId || '',

        installed_by_slack_user_id: data.installerUserId || '',
        installed_by_slack_user_name: data.installerUserName || '',
        installed_at: now,
        last_updated_at: now,
        installation_source: data.installationSource || 'dashboard',

        inkeep_tenant_id: data.tenantId || 'default',
        status: 'active',
      },
      connection_config: {
        'team.id': data.teamId,
      },
    };

    const response = await fetch(`${nangoApiUrl}/connections`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();

    if (!response.ok) {
      logger.error(
        { status: response.status, errorBody: responseText, connectionId },
        'Failed to import connection to Nango'
      );
      return { connectionId, success: false };
    }

    logger.info(
      {
        connectionId,
        teamId: data.teamId,
        teamName: data.teamName,
      },
      'Stored workspace installation in Nango'
    );

    return { connectionId, success: true };
  } catch (error) {
    logger.error(
      { error, connectionId, teamId: data.teamId },
      'Failed to store workspace installation'
    );
    return { connectionId, success: false };
  }
}

/**
 * List all workspace installations from Nango.
 */
export async function listWorkspaceInstallations(): Promise<SlackWorkspaceConnection[]> {
  try {
    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();

    const connections = await nango.listConnections();
    const workspaces: SlackWorkspaceConnection[] = [];

    for (const conn of connections.connections) {
      if (conn.provider_config_key === integrationId) {
        try {
          const fullConn = await nango.getConnection(integrationId, conn.connection_id);
          const metadata = fullConn.metadata as Record<string, string> | undefined;
          const credentials = fullConn as { credentials?: { access_token?: string } };

          if (metadata?.connection_type === 'workspace' && credentials.credentials?.access_token) {
            let defaultAgent: DefaultAgentConfig | undefined;
            if (metadata?.default_agent) {
              try {
                defaultAgent = JSON.parse(metadata.default_agent);
              } catch {
                // Invalid JSON, ignore
              }
            }

            workspaces.push({
              connectionId: conn.connection_id,
              teamId: metadata.slack_team_id || '',
              teamName: metadata.slack_team_name,
              botToken: credentials.credentials.access_token,
              tenantId: metadata.tenant_id || 'default',
              defaultAgent,
            });
          }
        } catch {
          // Continue to next connection
        }
      }
    }

    return workspaces;
  } catch (error) {
    logger.error({ error }, 'Failed to list workspace installations');
    return [];
  }
}

/**
 * Delete a workspace installation from Nango.
 */
export async function deleteWorkspaceInstallation(connectionId: string): Promise<boolean> {
  try {
    const nango = getSlackNango();
    const integrationId = getSlackIntegrationId();

    logger.info({ connectionId, integrationId }, 'Attempting to delete workspace installation');

    await nango.deleteConnection(integrationId, connectionId);
    logger.info({ connectionId }, 'Deleted workspace installation from Nango');
    return true;
  } catch (error: unknown) {
    const errorObj = error as { status?: number; message?: string };
    const errorMessage = errorObj?.message || String(error);
    const statusCode = errorObj?.status;

    if (statusCode === 404 || errorMessage.includes('404') || errorMessage.includes('not found')) {
      logger.warn({ connectionId }, 'Connection not found in Nango, treating as already deleted');
      return true;
    }

    logger.error(
      { error: errorMessage, statusCode, connectionId },
      'Failed to delete workspace installation'
    );
    return false;
  }
}
