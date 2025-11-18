/**
 * Third-Party MCP Server Authentication Check
 * Generic interface for checking authentication status of third-party MCP servers
 */

import { getLogger } from '../logger';
import { extractComposioServerId, isComposioMCPServerAuthenticated } from './composio-client';

const logger = getLogger('third-party-check');

/**
 * Check if a third-party MCP server is authenticated for the given tenant/project
 * This is a generic function that routes to the appropriate provider-specific check
 * Returns true if authenticated, false otherwise
 */
export async function isThirdPartyMCPServerAuthenticated(
  tenantId: string,
  projectId: string,
  mcpServerUrl: string
): Promise<boolean> {
  // Check if it's a Composio server
  const composioServerId = extractComposioServerId(mcpServerUrl);
  if (composioServerId) {
    logger.debug({ mcpServerUrl }, 'Detected Composio MCP server, checking auth status');
    return isComposioMCPServerAuthenticated(tenantId, projectId, mcpServerUrl);
  }

  // Add other provider checks here in the future
  // Example:
  // if (isNangoServer(mcpServerUrl)) {
  //   return isNangoMCPServerAuthenticated(tenantId, projectId, mcpServerUrl);
  // }

  logger.info({ mcpServerUrl }, 'Unknown third-party MCP server provider');
  return false;
}

