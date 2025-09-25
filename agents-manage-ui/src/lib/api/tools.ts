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

  return response.data;
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

  await makeManagementApiRequest<void>(
    `tenants/${tenantId}/projects/${projectId}/tools/${id}`,
    {
      method: 'DELETE',
    }
  );
}

/**
 * Check health of an MCP tool
 */
export async function checkMCPToolHealth(
  tenantId: string,
  projectId: string,
  id: string
): Promise<{
  tool: McpTool;
  healthCheck: {
    status: McpTool['status'];
    error?: string;
  };
}> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<
    SingleResponse<{
      tool: McpTool;
      healthCheck: {
        status: McpTool['status'];
        error?: string;
      };
    }>
  >(`tenants/${tenantId}/projects/${projectId}/tools/${id}/health-check`, {
    method: 'POST',
  });

  return response.data;
}

/**
 * Get available tools from an MCP server
 */
export async function getMCPToolAvailableTools(
  tenantId: string,
  projectId: string,
  id: string
): Promise<{
  availableTools: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
  lastSync?: string;
  status: McpTool['status'];
}> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<
    SingleResponse<{
      availableTools: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
      }>;
      lastSync?: string;
      status: McpTool['status'];
    }>
  >(`tenants/${tenantId}/projects/${projectId}/tools/${id}/available-tools`);

  return response.data;
}

/**
 * Sync tool definitions from an MCP server
 */
export async function syncMCPTool(
  tenantId: string,
  projectId: string,
  id: string
): Promise<McpTool> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<McpTool>>(
    `tenants/${tenantId}/projects/${projectId}/tools/${id}/sync`,
    {
      method: 'POST',
    }
  );

  return response.data;
}
