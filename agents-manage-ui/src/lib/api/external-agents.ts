'use server';

import type { ExternalAgentApiInsert, ExternalAgentApiSelect } from '@inkeep/agents-core';
import { cache } from 'react';
import type { ListResponse, SingleResponse } from '../types/response';
// Default configuration
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

// Use Omit to make id optional for creation
type CreateExternalAgentRequest = Omit<ExternalAgentApiInsert, 'id'> & {
  id?: string; // Make id optional for creation
};

export type ExternalAgent = ExternalAgentApiSelect;

/**
 * List all external agents for the current project
 */
export async function fetchExternalAgents(
  tenantId: string,
  projectId: string,
  page = 1,
  pageSize = 100
): Promise<ExternalAgent[]> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const params = new URLSearchParams({
    page: page.toString(),
    limit: pageSize.toString(),
  });

  const response = await makeManagementApiRequest<ListResponse<ExternalAgent>>(
    `tenants/${tenantId}/projects/${projectId}/external-agents?${params}`
  );

  return response.data;
}

/**
 * Get a single external agent by ID
 */
async function $fetchExternalAgent(
  tenantId: string,
  projectId: string,
  id: string
): Promise<ExternalAgent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<ExternalAgent>>(
    `tenants/${tenantId}/projects/${projectId}/external-agents/${id}`
  );

  return response.data;
}

export const fetchExternalAgent = cache($fetchExternalAgent);

/**
 * Create a new external agent
 */
export async function createExternalAgent(
  tenantId: string,
  projectId: string,
  data: CreateExternalAgentRequest
): Promise<ExternalAgent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<ExternalAgent>>(
    `tenants/${tenantId}/projects/${projectId}/external-agents`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );

  return response.data;
}

/**
 * Update an existing external agent
 */
export async function updateExternalAgent(
  tenantId: string,
  projectId: string,
  id: string,
  data: Partial<CreateExternalAgentRequest>
): Promise<ExternalAgent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<ExternalAgent>>(
    `tenants/${tenantId}/projects/${projectId}/external-agents/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  );

  return response.data;
}

/**
 * Delete an external agent
 */
export async function deleteExternalAgent(
  tenantId: string,
  projectId: string,
  id: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest<void>(
    `tenants/${tenantId}/projects/${projectId}/external-agents/${id}`,
    {
      method: 'DELETE',
    }
  );
}
