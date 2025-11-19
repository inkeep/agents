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
import type { TeamAgent } from '../types/team-agents';
import type { ApiRequestOptions } from './api-config';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export async function fetchAgents(
  tenantId: string,
  projectId: string,
  options?: ApiRequestOptions
): Promise<ListResponse<Agent>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<ListResponse<Agent>>(
    `tenants/${tenantId}/projects/${projectId}/agents`,
    options
  );
}

/**
 * Fetch barebones metadata for all agents in a project to be used with team agent relations
 */
export async function fetchTeamAgents(
  tenantId: string,
  projectId: string,
  options?: ApiRequestOptions
): Promise<TeamAgent[]> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const agents = await fetchAgents(tenantId, projectId, options);
  return agents.data.map((agent) => {
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description || '',
    };
  });
}

/**
 * Create a new full agent
 */
export async function createFullAgent(
  tenantId: string,
  projectId: string,
  agentData: FullAgentDefinition,
  options?: ApiRequestOptions
): Promise<CreateAgentResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<CreateAgentResponse>(
    `tenants/${tenantId}/projects/${projectId}/agent`,
    {
      ...options,
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
  agentId: string,
  options?: ApiRequestOptions
): Promise<GetAgentResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<GetAgentResponse>(
    `tenants/${tenantId}/projects/${projectId}/agent/${agentId}`,
    {
      ...options,
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
  agentData: FullAgentDefinition,
  options?: ApiRequestOptions
): Promise<UpdateAgentResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<UpdateAgentResponse>(
    `tenants/${tenantId}/projects/${projectId}/agent/${agentId}`,
    {
      ...options,
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
  agentId: string,
  options?: ApiRequestOptions
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest(`tenants/${tenantId}/projects/${projectId}/agent/${agentId}`, {
    ...options,
    method: 'DELETE',
  });
}

// Export the error class for use in server actions
export { ApiError };
