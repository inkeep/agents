/**
 * API Client for Triggers Operations
 *
 * This module provides HTTP client functions to communicate with the
 * inkeep-chat backend Triggers REST API endpoints.
 */

'use server';

import type { TriggerApiSelect } from '@inkeep/agents-core/client-exports';
import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

// Re-export types from core package for convenience
export type Trigger = TriggerApiSelect & {
  webhookUrl: string; // Added by management API
};

export async function fetchTriggers(
  tenantId: string,
  projectId: string,
  agentId: string
): Promise<ListResponse<Trigger>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<ListResponse<Trigger>>(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers?limit=100`
  );

  return response;
}

/**
 * Get a single trigger by ID
 */
export async function getTrigger(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerId: string
): Promise<Trigger> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<Trigger>>(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${triggerId}`
  );

  return response.data;
}

/**
 * Create a new trigger (POST)
 */
export async function createTrigger(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerData: Partial<Trigger>
): Promise<Trigger> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<Trigger>>(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`,
    {
      method: 'POST',
      body: JSON.stringify(triggerData),
    }
  );

  return response.data;
}

/**
 * Update a trigger (PATCH)
 */
export async function updateTrigger(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerId: string,
  triggerData: Partial<Trigger>
): Promise<Trigger> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<Trigger>>(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${triggerId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(triggerData),
    }
  );

  return response.data;
}

/**
 * Delete a trigger
 */
export async function deleteTrigger(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerId: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${triggerId}`,
    {
      method: 'DELETE',
    }
  );
}
