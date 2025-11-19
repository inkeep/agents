/**
 * Composio MCP Server Client
 * Handles all Composio-specific operations for MCP server integration
 */

import { Composio } from '@composio/core';
import type z from 'zod';
import { MCPTransportType } from '../../types/utility';
import type { PrebuiltMCPServerSchema } from '../../validation/schemas';
import { getLogger } from '../logger';

type PrebuiltMCPServer = z.infer<typeof PrebuiltMCPServerSchema>;

const logger = getLogger('composio-client');

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

let composio: Composio | null = null;

/**
 * Get or create a Composio instance
 * Returns null if COMPOSIO_API_KEY is not configured
 */
function getComposioInstance(): Composio | null {
  if (!process.env.COMPOSIO_API_KEY) {
    return null;
  }

  if (!composio) {
    composio = new Composio({
      apiKey: process.env.COMPOSIO_API_KEY,
    });
  }

  return composio;
}

/**
 * Derive a Composio user ID from tenant and project IDs
 * This creates a unique identifier for Composio connected accounts per tenant/project
 */
function deriveComposioUserId(tenantId: string, projectId: string): string {
  const SEPARATOR = '||';
  return `${tenantId}${SEPARATOR}${projectId}`;
}

/**
 * Extract server ID from a Composio MCP URL
 * Example: https://backend.composio.dev/v3/mcp/1234-1234-1234?user_id=... -> 1234-1234-1234
 */
export function extractComposioServerId(mcpUrl: string): string | null {
  if (!mcpUrl.includes('composio.dev')) {
    return null;
  }

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

/**
 * Add user_id query parameter to a URL and remove transport parameter
 * (Composio adds sse transport by default which we don't want)
 */
function addUserIdToUrl(url: string, userId: string): string {
  const urlObj = new URL(url);
  urlObj.searchParams.set('user_id', userId);
  urlObj.searchParams.delete('transport');
  return urlObj.toString();
}

/**
 * Delete a Composio connected account
 * Returns true if successful, false if failed (non-blocking)
 */
async function deleteComposioConnectedAccount(accountId: string): Promise<boolean> {
  const composioInstance = getComposioInstance();
  if (!composioInstance) {
    logger.info({}, 'Composio not configured, skipping account deletion');
    return false;
  }

  try {
    await composioInstance.connectedAccounts.delete(accountId);
    return true;
  } catch (error) {
    logger.warn({ error }, 'Error deleting Composio connected account');
    return false;
  }
}

/**
 * Fetch connected accounts from Composio for a given user
 * Returns null if the API call fails or Composio is not configured
 */
async function fetchComposioConnectedAccounts(
  derivedUserId: string
): Promise<Awaited<ReturnType<Composio['connectedAccounts']['list']>> | null> {
  const composioInstance = getComposioInstance();
  if (!composioInstance) {
    logger.info({}, 'Composio not configured, skipping connected accounts fetch');
    return null;
  }

  try {
    const connectedAccounts = await composioInstance.connectedAccounts.list({
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
export async function isComposioMCPServerAuthenticated(
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

  const derivedUserId = deriveComposioUserId(tenantId, projectId);

  const composioInstance = getComposioInstance();
  if (!composioInstance) {
    logger.info({}, 'Composio not configured, skipping auth check');
    return false;
  }

  try {
    const composioMcpServer = await composioInstance.mcp.get(serverId);

    const firstAuthConfigId =
      composioMcpServer.authConfigIds.length > 0 ? composioMcpServer.authConfigIds[0] : null;

    if (!firstAuthConfigId) {
      return false;
    }

    const connectedAccounts = await fetchComposioConnectedAccounts(derivedUserId);

    if (!connectedAccounts) {
      return false;
    }

    const activeAccount = connectedAccounts.items.find(
      (account) => account.authConfig.id === firstAuthConfigId && account.status === 'ACTIVE'
    );

    return !!activeAccount;
  } catch (error) {
    logger.error({ error, mcpServerUrl }, 'Error checking Composio authentication status');
    return false;
  }
}

/**
 * Convert Composio server data to PrebuiltMCPServer format
 */
function transformComposioServerData(
  composioMcpServer: Awaited<ReturnType<Composio['mcp']['list']>>['items'][number],
  isAuthenticated: boolean,
  url: string,
  thirdPartyConnectAccountUrl?: string
): PrebuiltMCPServer {
  const firstToolkit = composioMcpServer.toolkits[0];
  const category = firstToolkit
    ? TOOLKIT_TO_CATEGORY[firstToolkit] || 'integration'
    : 'integration';
  const imageUrl = composioMcpServer.toolkitIcons?.[firstToolkit];
  const description =
    composioMcpServer.toolkits.length > 0
      ? `${composioMcpServer.toolkits.slice(0, 3).join(', ')} integration${composioMcpServer.toolkits.length > 1 ? 's' : ''} via Composio`
      : 'Integration via Composio';

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
 * Side effects: Ensure Composio account exists for the given server
 * Handles account creation/deletion and returns the redirect URL
 * Returns null if account creation fails
 */
async function ensureComposioAccount(
  composioMcpServer: Awaited<ReturnType<Composio['mcp']['list']>>['items'][number],
  derivedUserId: string,
  initiatedAccounts: Awaited<ReturnType<Composio['connectedAccounts']['list']>>['items']
): Promise<string | null> {
  const firstAuthConfigId = composioMcpServer.authConfigIds[0];
  if (!firstAuthConfigId) {
    logger.error({ serverId: composioMcpServer.id }, 'No auth config ID found for MCP server');
    return null;
  }

  const existingInitiatedAccount = initiatedAccounts.find(
    (account) => account.authConfig.id === firstAuthConfigId
  );

  if (existingInitiatedAccount) {
    await deleteComposioConnectedAccount(existingInitiatedAccount.id);
  }

  try {
    const composioInstance = getComposioInstance();
    if (!composioInstance) {
      logger.error({ serverId: composioMcpServer.id }, 'Composio not configured');
      return null;
    }

    const createAccountResponse = await composioInstance.connectedAccounts.link(
      derivedUserId,
      firstAuthConfigId
    );

    return createAccountResponse.redirectUrl ?? null;
  } catch (error) {
    logger.error(
      { serverId: composioMcpServer.id, error },
      'Error creating connected account for MCP server'
    );
    return null;
  }
}

/**
 * Orchestration: Transform Composio server to PrebuiltMCPServer format
 * Coordinates authentication checks and account management
 * Returns null if the server cannot be properly configured
 */
async function transformComposioServer(
  composioMcpServer: Awaited<ReturnType<Composio['mcp']['list']>>['items'][number],
  authenticatedAuthConfigIds: Set<string>,
  initiatedAccounts: Awaited<ReturnType<Composio['connectedAccounts']['list']>>['items'],
  derivedUserId: string
): Promise<PrebuiltMCPServer | null> {
  const isAuthenticated = composioMcpServer.authConfigIds.some((authConfigId) =>
    authenticatedAuthConfigIds.has(authConfigId)
  );

  let url = composioMcpServer.MCPUrl;
  let thirdPartyConnectAccountUrl: string | undefined;

  if (isAuthenticated) {
    url = addUserIdToUrl(url, derivedUserId);
  } else {
    const redirectUrl = await ensureComposioAccount(
      composioMcpServer,
      derivedUserId,
      initiatedAccounts
    );

    if (!redirectUrl) {
      return null;
    }

    thirdPartyConnectAccountUrl = redirectUrl;
    url = addUserIdToUrl(url, derivedUserId);
  }

  return transformComposioServerData(
    composioMcpServer,
    isAuthenticated,
    url,
    thirdPartyConnectAccountUrl
  );
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

  const derivedUserId = deriveComposioUserId(tenantId, projectId);

  const composioInstance = getComposioInstance();
  if (!composioInstance) {
    logger.info({}, 'Composio not configured, returning empty list');
    return [];
  }

  try {
    const composioMcpServers = await composioInstance.mcp.list({
      limit: 100,
      toolkits: [],
      page: 1,
      authConfigs: [],
    });

    const userConnectedAccounts = await composioInstance.connectedAccounts.list({
      userIds: [derivedUserId],
    });

    const activeAccounts = userConnectedAccounts?.items.filter(
      (account) => account.status === 'ACTIVE'
    );
    const initiatedAccounts = userConnectedAccounts?.items.filter(
      (account) => account.status === 'INITIATED'
    );

    const authenticatedAuthConfigIds = new Set(
      activeAccounts?.map((account) => account.authConfig.id) ?? []
    );

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

    const validServers = transformedServers.filter(
      (server: PrebuiltMCPServer | null): server is PrebuiltMCPServer => server !== null
    );

    return validServers;
  } catch (error) {
    logger.error({ error }, 'Failed to fetch Composio servers');
    return [];
  }
}

/**
 * Fetch a single Composio MCP server by URL and return its details with auth status
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

  const derivedUserId = deriveComposioUserId(tenantId, projectId);

  const composioInstance = getComposioInstance();
  if (!composioInstance) {
    logger.info({}, 'Composio not configured, returning null');
    return null;
  }

  try {
    const serverId = extractComposioServerId(mcpServerUrl);
    if (!serverId) {
      logger.error({ mcpServerUrl }, 'Could not extract Composio server ID from URL');
      return null;
    }

    const composioMcpServer = await composioInstance.mcp.get(serverId);

    const userConnectedAccounts = await composioInstance.connectedAccounts.list({
      userIds: [derivedUserId],
    });

    const activeAccounts = userConnectedAccounts?.items.filter(
      (account) => account.status === 'ACTIVE'
    );
    const initiatedAccounts = userConnectedAccounts?.items.filter(
      (account) => account.status === 'INITIATED'
    );

    const authenticatedAuthConfigIds = new Set(
      activeAccounts?.map((account) => account.authConfig.id) ?? []
    );

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
