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
