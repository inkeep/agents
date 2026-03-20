/**
 * Third-Party MCP Server Authentication Check
 * Generic interface for checking authentication status of third-party MCP servers
 */

import { getLogger } from '../logger';
import {
  type ComposioAuthResult,
  type CredentialScope,
  extractComposioServerId,
  isComposioMCPServerAuthenticated,
} from './composio-client';

const logger = getLogger('third-party-check');

export type { ComposioAuthResult };

/**
 * Check if a third-party MCP server is authenticated for the given tenant/project/user
 * This is a generic function that routes to the appropriate provider-specific check
 * @param credentialScope - 'project' for shared team credentials, 'user' for per-user credentials
 * @param userId - The actual user ID (required if credentialScope is 'user')
 */
export async function isThirdPartyMCPServerAuthenticated(
  tenantId: string,
  projectId: string,
  mcpServerUrl: string,
  credentialScope: CredentialScope = 'project',
  userId?: string
): Promise<ComposioAuthResult> {
  const composioServerId = extractComposioServerId(mcpServerUrl);
  if (composioServerId) {
    logger.debug({ mcpServerUrl }, 'Detected Composio MCP server, checking auth status');
    return isComposioMCPServerAuthenticated(
      tenantId,
      projectId,
      mcpServerUrl,
      credentialScope,
      userId
    );
  }

  logger.info({ mcpServerUrl }, 'Unknown third-party MCP server provider');
  return { authenticated: false };
}
