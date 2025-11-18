/**
 * Composio integration service
 * Handles fetching and transforming MCP servers from Composio
 */

import { Composio } from '@composio/core';
import {
  extractComposioServerId,
  MCPTransportType,
  type PrebuiltMCPServerSchema,
} from '@inkeep/agents-core';
import type z from 'zod';
import { getLogger } from '../logger';

type PrebuiltMCPServer = z.infer<typeof PrebuiltMCPServerSchema>;

const logger = getLogger('composio-service');

// Toolkit to category mapping for Composio servers
const TOOLKIT_TO_CATEGORY: Record<string, string> = {
  github: 'development',
  gitlab: 'development',
  bitbucket: 'development',
  jira: 'project_management',
  asana: 'project_management',
  linear: 'project_management',
  trello: 'project_management',
  monday: 'project_management',
  slack: 'communication',
  discord: 'communication',
  teams: 'communication',
  zoom: 'communication',
  notion: 'knowledge',
  confluence: 'knowledge',
  docs: 'knowledge',
  drive: 'storage',
  dropbox: 'storage',
  box: 'storage',
  stripe: 'payments',
  paypal: 'payments',
  square: 'payments',
  gmail: 'communication',
  outlook: 'communication',
  calendar: 'productivity',
  sheets: 'productivity',
  airtable: 'database',
  salesforce: 'crm',
  hubspot: 'crm',
  zendesk: 'communication',
  intercom: 'communication',
};

/**
 * Add user_id query parameter to a URL and remove transport parameter (composio adds sse for no reason)
 */
function addUserIdToUrl(url: string, userId: string): string {
  const urlObj = new URL(url);
  urlObj.searchParams.set('user_id', userId);
  urlObj.searchParams.delete('transport');
  return urlObj.toString();
}

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
});

/**
 * Delete a Composio connected account
 * Returns true if successful, false if failed (non-blocking)
 */
async function deleteComposioConnectedAccount(accountId: string): Promise<boolean> {
  try {
    await composio.connectedAccounts.delete(accountId);
    return true;
  } catch (error) {
    logger.warn({ error }, 'Error deleting Composio connected account');
    return false;
  }
}

/**
 * Transform Composio server to PrebuiltMCPServer format
 * Returns null if the server is not authenticated and we can't get a redirect URL
 */
async function transformComposioServer(
  composioMcpServer: Awaited<ReturnType<typeof composio.mcp.list>>['items'][number],
  authenticatedAuthConfigIds: Set<string>,
  initiatedAccounts: Awaited<ReturnType<typeof composio.connectedAccounts.list>>['items'],
  derivedUserId: string
): Promise<PrebuiltMCPServer | null> {
  const firstToolkit = composioMcpServer.toolkits[0];
  const category = firstToolkit
    ? TOOLKIT_TO_CATEGORY[firstToolkit] || 'integration'
    : 'integration';
  const imageUrl = composioMcpServer.toolkitIcons?.[firstToolkit];
  const description =
    composioMcpServer.toolkits.length > 0
      ? `${composioMcpServer.toolkits.slice(0, 3).join(', ')} integration${composioMcpServer.toolkits.length > 1 ? 's' : ''} via Composio`
      : 'Integration via Composio';

  // Check if user has authenticated this MCP server
  const isAuthenticated = composioMcpServer.authConfigIds.some((authConfigId) =>
    authenticatedAuthConfigIds.has(authConfigId)
  );

  // Adjust URL if authenticated
  let url = composioMcpServer.MCPUrl;
  let thirdPartyConnectAccountUrl: string | undefined;

  if (isAuthenticated) {
    url = addUserIdToUrl(url, derivedUserId);
  } else {
    // Check for existing INITIATED account and delete it to create a fresh one
    const firstAuthConfigId = composioMcpServer.authConfigIds[0];
    if (!firstAuthConfigId) {
      logger.error({ serverId: composioMcpServer.id }, 'No auth config ID found for MCP server');
      return null; // Can't authenticate without auth config ID
    }

    // Look for an existing INITIATED account with matching authConfig
    const existingInitiatedAccount = initiatedAccounts.find(
      (account) => account.authConfig.id === firstAuthConfigId
    );

    // Delete existing INITIATED account if found to avoid duplicates
    if (existingInitiatedAccount) {
      await deleteComposioConnectedAccount(existingInitiatedAccount.id);
    }

    // Create a new connected account to get the redirect URL
    try {
      const createAccountResponse = await composio.connectedAccounts.link(
        derivedUserId,
        firstAuthConfigId
      );

      thirdPartyConnectAccountUrl = createAccountResponse.redirectUrl ?? undefined;

      // Add user_id query param to the URL after successful account creation
      url = addUserIdToUrl(url, derivedUserId);
    } catch (error) {
      logger.error(
        { serverId: composioMcpServer.id, error },
        'Error creating connected account for MCP server'
      );
      return null; // Can't use this server without redirect URL
    }
  }

  return {
    id: composioMcpServer.id,
    name: composioMcpServer.name,
    url,
    transport: MCPTransportType.streamableHttp,
    imageUrl,
    category,
    description,
    isOpen: isAuthenticated,
    thirdPartyConnectAccountUrl,
  };
}

/**
 * Fetch and transform Composio MCP servers for a tenant/project
 */
export async function fetchComposioServers(
  tenantId: string,
  projectId: string
): Promise<PrebuiltMCPServer[]> {
  const composioApiKey = process.env.COMPOSIO_API_KEY;

  if (!composioApiKey) {
    logger.info({}, 'COMPOSIO_API_KEY not configured, skipping Composio servers');
    return [];
  }

  const separator = '||';

  const derivedUserId = `${tenantId}${separator}${projectId}`;

  try {
    const composioMcpServers = await composio.mcp.list({
      limit: 100,
      toolkits: [],
      page: 1,
      authConfigs: [],
    });

    const userConnectedAccounts = await composio.connectedAccounts.list({
      userIds: [derivedUserId],
    });

    // Separate ACTIVE and INITIATED accounts
    const activeAccounts = userConnectedAccounts?.items.filter(
      (account) => account.status === 'ACTIVE'
    );
    const initiatedAccounts = userConnectedAccounts?.items.filter(
      (account) => account.status === 'INITIATED'
    );

    // Extract authenticated auth config IDs from ACTIVE accounts
    const authenticatedAuthConfigIds = new Set(
      activeAccounts?.map((account) => account.authConfig.id) ?? []
    );

    // Transform servers with authentication info (in parallel)
    const transformedServers = await Promise.all(
      composioMcpServers?.items.map((server) =>
        transformComposioServer(
          server,
          authenticatedAuthConfigIds,
          initiatedAccounts ?? [],
          derivedUserId
        )
      )
    );

    // Filter out null values (servers that failed to get redirect URL)
    const validServers = transformedServers.filter(
      (server): server is PrebuiltMCPServer => server !== null
    );

    return validServers;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch Composio servers');
    return [];
  }
}

/**
 * Fetch a single Composio MCP server by URL and return its details with auth status
 * This is similar to fetchComposioServers but for a single server
 */
export async function fetchSingleComposioServer(
  tenantId: string,
  projectId: string,
  mcpServerUrl: string
): Promise<PrebuiltMCPServer | null> {
  const composioApiKey = process.env.COMPOSIO_API_KEY;

  if (!composioApiKey) {
    logger.debug({}, 'COMPOSIO_API_KEY not configured');
    return null;
  }

  const separator = '||';

  const derivedUserId = `${tenantId}${separator}${projectId}`;

  try {
    // Extract server ID from URL
    const serverId = extractComposioServerId(mcpServerUrl);
    if (!serverId) {
      logger.error({ mcpServerUrl }, 'Could not extract Composio server ID from URL');
      return null;
    }

    // Fetch the specific MCP server details
    const composioMcpServer = await composio.mcp.get(serverId);

    // List accounts for a specific user
    const userConnectedAccounts = await composio.connectedAccounts.list({
      userIds: [derivedUserId],
    });

    // Separate ACTIVE and INITIATED accounts
    const activeAccounts = userConnectedAccounts?.items.filter(
      (account) => account.status === 'ACTIVE'
    );
    const initiatedAccounts = userConnectedAccounts?.items.filter(
      (account) => account.status === 'INITIATED'
    );

    // Extract authenticated auth config IDs from ACTIVE accounts
    const authenticatedAuthConfigIds = new Set(
      activeAccounts?.map((account) => account.authConfig.id) ?? []
    );

    // Transform the server with authentication info
    const transformedServer = await transformComposioServer(
      composioMcpServer,
      authenticatedAuthConfigIds,
      initiatedAccounts ?? [],
      derivedUserId
    );

    return transformedServer;
  } catch (error) {
    logger.error({ error, mcpServerUrl }, 'Failed to fetch single Composio server');
    return null;
  }
}
