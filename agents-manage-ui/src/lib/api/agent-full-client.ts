/**
 * API Client for Agent Full Operations
 *
 * This module provides HTTP client functions to communicate with the
 * inkeep-chat backend GraphFull REST API endpoints.
 */

import { ApiError } from '../types/errors';
import type {
  CreateGraphResponse,
  FullGraphDefinition,
  GetGraphResponse,
  Agent,
  UpdateGraphResponse,
} from '../types/agent-full';
import type { ListResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export async function fetchGraphs(
  tenantId: string,
  projectId: string
): Promise<ListResponse<Agent>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<ListResponse<Agent>>(
    `tenants/${tenantId}/projects/${projectId}/agents`
  );
}

/**
 * Create a new full agent
 */
export async function createFullGraph(
  tenantId: string,
  projectId: string,
  graphData: FullGraphDefinition
): Promise<CreateGraphResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<CreateGraphResponse>(
    `tenants/${tenantId}/projects/${projectId}/agent`,
    {
      method: 'POST',
      body: JSON.stringify(graphData),
    }
  );
}

/**
 * Get a full agent by ID
 */
export async function getFullGraph(
  tenantId: string,
  projectId: string,
  agentId: string
): Promise<GetGraphResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<GetGraphResponse>(
    `tenants/${tenantId}/projects/${projectId}/agent/${agentId}`,
    {
      method: 'GET',
    }
  );
}

/**
 * Update or create a full agent (upsert)
 */
export async function updateFullGraph(
  tenantId: string,
  projectId: string,
  agentId: string,
  graphData: FullGraphDefinition
): Promise<UpdateGraphResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<UpdateGraphResponse>(
    `tenants/${tenantId}/projects/${projectId}/agent/${agentId}`,
    {
      method: 'PUT',
      body: JSON.stringify(graphData),
    }
  );
}

/**
 * Delete a full agent
 */
export async function deleteFullGraph(
  tenantId: string,
  projectId: string,
  agentId: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest(`tenants/${tenantId}/projects/${projectId}/agent/${agentId}`, {
    method: 'DELETE',
  });
}

// Export the error class for use in server actions
export { ApiError };
