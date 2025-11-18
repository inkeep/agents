import { Composio } from '@composio/core';
import { getLogger } from './logger';

const logger = getLogger('third-party-check');

/**
 * Extract server ID from a Composio MCP URL
 * Example: https://backend.composio.dev/v3/mcp/1234-1234-1234?user_id=... -> 1234-1234-1234
 */
export function extractComposioServerId(mcpUrl: string): string | null {
  try {
    const urlObj = new URL(mcpUrl);
    const pathParts = urlObj.pathname.split('/');
    const mcpIndex = pathParts.indexOf('mcp');
    if (mcpIndex !== -1 && pathParts[mcpIndex + 1]) {
      return pathParts[mcpIndex + 1];
    }
    return null;
  } catch {
    return null;
  }
}

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * Fetch connected accounts from Composio for a given user
 * Returns null if the API call fails
 */
async function fetchComposioConnectedAccounts(
  derivedUserId: string
): Promise<Awaited<ReturnType<typeof composio.connectedAccounts.list>> | null> {
  try {
    // List accounts for a specific user
    const connectedAccounts = await composio.connectedAccounts.list({
      userIds: [derivedUserId],
    });

    return connectedAccounts;
  } catch (error) {
    logger.error({ error }, 'Error fetching Composio connected accounts');
    return null;
  }
}

/**
 * Check if a Composio MCP server is authenticated for the given tenant/project
 * Returns true if authenticated, false otherwise
 */
export async function isThirdPartyMCPServerAuthenticated(
  tenantId: string,
  projectId: string,
  mcpServerUrl: string
): Promise<boolean> {
  const composioApiKey = process.env.COMPOSIO_API_KEY;
  if (!composioApiKey) {
    logger.info({}, 'Composio API key not configured, skipping auth check');
    return false;
  }

  const serverId = extractComposioServerId(mcpServerUrl);
  if (!serverId) {
    logger.info({ mcpServerUrl }, 'Could not extract Composio server ID from URL');
    return false;
  }

  const separator = '||';
  const derivedUserId = `${tenantId}${separator}${projectId}`;

  try {
    const composioMcpServer = await composio.mcp.get(serverId);

    const firstAuthConfigId = composioMcpServer.authConfigIds.length > 0 ? composioMcpServer.authConfigIds[0] : null;

    if (!firstAuthConfigId) {
      return false;
    }

    const connectedAccounts = await fetchComposioConnectedAccounts(derivedUserId);

    if (!connectedAccounts) {
      return false;
    }

    // Check if there's an ACTIVE account for this auth config
    const activeAccount = connectedAccounts.items.find(
      (account) => account.authConfig.id === firstAuthConfigId && account.status === 'ACTIVE'
    );

    return !!activeAccount;
  } catch (error) {
    logger.error({ error, mcpServerUrl }, 'Error checking Composio authentication status');
    return false;
  }
}
