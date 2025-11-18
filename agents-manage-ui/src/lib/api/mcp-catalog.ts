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
 */
export async function fetchThirdPartyMCPServer(
  tenantId: string,
  projectId: string,
  url: string
): Promise<ThirdPartyMCPServerResponseType> {
  const endpoint = `tenants/${tenantId}/projects/${projectId}/third-party-mcp-servers`;
  const response = await makeManagementApiRequest<ThirdPartyMCPServerResponseType>(endpoint, {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  return response;
}
