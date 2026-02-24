/**
 * API Client for Agent Full Operations
 *
 * This module provides HTTP client functions to communicate with the
 * inkeep-chat backend AgentFull REST API endpoints.
 */

import type { AgentApiInsert } from '@inkeep/agents-core/client-exports';
import { cache } from 'react';
import type {
  Agent,
  CreateAgentResponse,
  FullAgentDefinition,
  GetAgentResponse,
  UpdateAgentResponse,
  UpdateFullAgentResponse,
} from '../types/agent-full';
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
    `tenants/${tenantId}/projects/${projectId}/agents?limit=100`
  );
}

export async function createAgent(
  tenantId: string,
  projectId: string,
  agentData: AgentApiInsert
): Promise<CreateAgentResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<CreateAgentResponse>(
    `tenants/${tenantId}/projects/${projectId}/agents`,
    {
      method: 'POST',
      body: JSON.stringify(agentData),
    }
  );
}

/**
 * Partial update: For renaming / editing the description of an agent
 */
export async function updateAgent(
  tenantId: string,
  projectId: string,
  agentId: string,
  agentData: AgentApiInsert
): Promise<UpdateAgentResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);
  return makeManagementApiRequest<UpdateAgentResponse>(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}`,
    {
      method: 'PUT',
      body: JSON.stringify(agentData),
    }
  );
}

/**
 * Get a full agent by ID
 */
async function $getFullAgent(
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

export const getFullAgent = cache($getFullAgent);

/**
 * Update or create a full agent (upsert)
 */
export async function updateFullAgent(
  tenantId: string,
  projectId: string,
  agentId: string,
  agentData: FullAgentDefinition
): Promise<UpdateFullAgentResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<UpdateFullAgentResponse>(
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
export { ApiError } from '../types/errors';
