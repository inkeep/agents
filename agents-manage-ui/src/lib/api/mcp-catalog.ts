'use server';

import type { MCPCatalogListResponse, ThirdPartyMCPServerResponse } from '@inkeep/agents-core';
import type z from 'zod';
import { makeManagementApiRequest } from './api-config';

type MCPCatalogListResponseType = z.infer<typeof MCPCatalogListResponse>;
type ThirdPartyMCPServerResponseType = z.infer<typeof ThirdPartyMCPServerResponse>;

/**
 * Fetch the full MCP catalog from the management API
 * Includes both static prebuilt servers and Composio servers (if configured)
 */
export async function fetchMCPCatalog(
  tenantId: string,
  projectId: string
): Promise<MCPCatalogListResponseType> {
  const endpoint = `tenants/${tenantId}/projects/${projectId}/mcp-catalog`;
  const response = await makeManagementApiRequest<MCPCatalogListResponseType>(endpoint);
  return response;
}

/**
 * Fetch details for a specific third-party MCP server (e.g., Composio)
 * Returns authentication status and connect URL if not authenticated
 * @param credentialScope - 'project' for shared team credentials, 'user' for per-user credentials
 */
export async function fetchThirdPartyMCPServer(
  tenantId: string,
  projectId: string,
  url: string,
  credentialScope: 'project' | 'user' = 'project'
): Promise<ThirdPartyMCPServerResponseType> {
  const endpoint = `tenants/${tenantId}/projects/${projectId}/third-party-mcp-servers`;
  const response = await makeManagementApiRequest<ThirdPartyMCPServerResponseType>(endpoint, {
    method: 'POST',
    body: JSON.stringify({ url, credentialScope }),
  });
  return response;
}

type OAuthRedirectResponse = { data: { redirectUrl: string | null } };

/**
 * Get the OAuth redirect URL for a third-party MCP server based on credential scope
 * Call this AFTER scope selection to get the correct URL for the selected scope
 * @param credentialScope - 'project' for shared team credentials, 'user' for per-user credentials
 */
export async function getThirdPartyOAuthRedirectUrl(
  tenantId: string,
  projectId: string,
  url: string,
  credentialScope: 'project' | 'user'
): Promise<string | null> {
  const endpoint = `tenants/${tenantId}/projects/${projectId}/third-party-mcp-servers/oauth-redirect`;
  const response = await makeManagementApiRequest<OAuthRedirectResponse>(endpoint, {
    method: 'POST',
    body: JSON.stringify({ url, credentialScope }),
  });
  return response.data.redirectUrl;
}
