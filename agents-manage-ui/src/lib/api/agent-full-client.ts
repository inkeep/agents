'use server';
/**
 * API Client for Agent Full Operations
 *
 * This module provides HTTP client functions to communicate with the
 * inkeep-chat backend AgentFull REST API endpoints.
 */

import type { AgentApiInsert, DuplicateAgentRequest } from '@inkeep/agents-core';
import { cache } from 'react';
import type {
  Agent,
  CreateAgentResponse,
  DuplicateAgentResponse,
  FullAgentPayload,
  GetAgentResponse,
  UpdateAgentResponse,
  UpdateFullAgentResponse,
} from '../types/agent-full';
import type { ListResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';

async function $fetchAgents(tenantId: string, projectId: string): Promise<ListResponse<Agent>> {
  return makeManagementApiRequest<ListResponse<Agent>>(
    `tenants/${tenantId}/projects/${projectId}/agents?limit=100`
  );
}

export const fetchAgents = cache($fetchAgents);

export async function createAgent(
  tenantId: string,
  projectId: string,
  agentData: AgentApiInsert
): Promise<CreateAgentResponse> {
  return makeManagementApiRequest<CreateAgentResponse>(
    `tenants/${tenantId}/projects/${projectId}/agents`,
    {
      method: 'POST',
      body: JSON.stringify(agentData),
    }
  );
}

export async function duplicateAgent(
  tenantId: string,
  projectId: string,
  agentId: string,
  duplicateData: DuplicateAgentRequest
): Promise<DuplicateAgentResponse> {
  return makeManagementApiRequest<DuplicateAgentResponse>(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}/duplicate`,
    {
      method: 'POST',
      body: JSON.stringify(duplicateData),
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
  agentData: FullAgentPayload
): Promise<UpdateFullAgentResponse> {
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
  await makeManagementApiRequest(`tenants/${tenantId}/projects/${projectId}/agent/${agentId}`, {
    method: 'DELETE',
  });
}
