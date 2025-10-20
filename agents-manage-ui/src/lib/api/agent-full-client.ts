/**
 * API Client for Agent Full Operations
 *
 * This module provides HTTP client functions to communicate with the
 * inkeep-chat backend AgentFull REST API endpoints.
 */

import type {
  Agent,
  CreateAgentResponse,
  FullAgentDefinition,
  GetAgentResponse,
  UpdateAgentResponse,
} from '../types/agent-full';
import { ApiError } from '../types/errors';
import type { ListResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export async function fetchAgents(
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
export async function createFullAgent(
  tenantId: string,
  projectId: string,
  agentData: FullAgentDefinition
): Promise<CreateAgentResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<CreateAgentResponse>(
    `tenants/${tenantId}/projects/${projectId}/agent`,
    {
      method: 'POST',
      body: JSON.stringify(agentData),
    }
  );
}

/**
 * Get a full agent by ID
 */
export async function getFullAgent(
  tenantId: string,
  projectId: string,
  agentId: string
): Promise<GetAgentResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<GetAgentResponse>(
    `tenants/${tenantId}/projects/${projectId}/agent/${agentId}`,
    {
      method: 'GET',
    }
  );
}

/**
 * Update or create a full agent (upsert)
 */
export async function updateFullAgent(
  tenantId: string,
  projectId: string,
  agentId: string,
  agentData: FullAgentDefinition
): Promise<UpdateAgentResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<UpdateAgentResponse>(
    `tenants/${tenantId}/projects/${projectId}/agent/${agentId}`,
    {
      method: 'PUT',
      body: JSON.stringify(agentData),
    }
  );
}

/**
 * Delete a full agent
 */
export async function deleteFullAgent(
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
