'use server';

import type { McpTool, ToolApiInsert } from '@inkeep/agents-core';

import type { ListResponse, SingleResponse } from '../types/response';
// Default configuration
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

// Use Omit to make id optional for creation, and add metadata field
type CreateMCPToolRequest = Omit<ToolApiInsert, 'id'> & {
  id?: string; // Make id optional for creation
  metadata?: {
    tags?: string[];
    category?: string;
    vendor?: string;
    documentation_url?: string;
    support_contact?: string;
  };
};

/**
 * List all MCP tools for the current tenant
 */
export async function fetchMCPTools(
  tenantId: string,
  projectId: string,
  page = 1,
  pageSize = 50,
  status?: McpTool['status']
): Promise<McpTool[]> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const params = new URLSearchParams({
    page: page.toString(),
    limit: pageSize.toString(),
  });

  if (status) {
    params.append('status', status);
  }

  const response = await makeManagementApiRequest<ListResponse<McpTool>>(
    `tenants/${tenantId}/projects/${projectId}/tools?${params}`
  );

  // Filter to only return MCP tools (config.type === 'mcp')
  return response.data.filter((tool) => tool.config?.type === 'mcp');
}

/**
 * Get a single MCP tool by ID
 */
export async function fetchMCPTool(
  tenantId: string,
  projectId: string,
  id: string
): Promise<McpTool> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<McpTool>>(
    `tenants/${tenantId}/projects/${projectId}/tools/${id}`
  );

  return response.data;
}

/**
 * Create a new MCP tool
 */
export async function createMCPTool(
  tenantId: string,
  projectId: string,
  data: CreateMCPToolRequest
): Promise<McpTool> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<McpTool>>(
    `tenants/${tenantId}/projects/${projectId}/tools`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );

  return response.data;
}

/**
 * Update an existing MCP tool
 */
export async function updateMCPTool(
  tenantId: string,
  projectId: string,
  id: string,
  data: Partial<CreateMCPToolRequest>
): Promise<McpTool> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<McpTool>>(
    `tenants/${tenantId}/projects/${projectId}/tools/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  );

  return response.data;
}

/**
 * Delete an MCP tool
 */
export async function deleteMCPTool(
  tenantId: string,
  projectId: string,
  id: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest<void>(`tenants/${tenantId}/projects/${projectId}/tools/${id}`, {
    method: 'DELETE',
  });
}
