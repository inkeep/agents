/**
 * API Client for Triggers Operations
 *
 * This module provides HTTP client functions to communicate with the
 * inkeep-chat backend Triggers REST API endpoints.
 */

'use server';

import type { Part } from '@inkeep/agents-core';
import type {
  TriggerApiSelect,
  TriggerInvocationApiSelect,
} from '@inkeep/agents-core/client-exports';
import { cache } from 'react';
import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

// Re-export types from core package for convenience
export type Trigger = TriggerApiSelect & {
  webhookUrl: string; // Added by management API
};

export type TriggerInvocation = TriggerInvocationApiSelect;

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
async function $getTrigger(
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

export const getTrigger = cache($getTrigger);

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

/**
 * Rerun a trigger with a given user message
 */
export async function rerunTrigger(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerId: string,
  params: {
    userMessage: string;
    messageParts?: Part[];
  }
): Promise<{ success: boolean; invocationId: string; conversationId: string }> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${triggerId}/rerun`,
    {
      method: 'POST',
      body: JSON.stringify(params),
    }
  );
}

/**
 * Fetch invocations for a trigger
 */
export async function fetchTriggerInvocations(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerId: string,
  options?: {
    status?: 'pending' | 'success' | 'failed';
    limit?: number;
    page?: number;
  }
): Promise<ListResponse<TriggerInvocation>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const params = new URLSearchParams();
  if (options?.status) params.append('status', options.status);
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.page) params.append('page', options.page.toString());

  const queryString = params.toString() ? `?${params.toString()}` : '';

  const response = await makeManagementApiRequest<ListResponse<TriggerInvocation>>(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}/triggers/${triggerId}/invocations${queryString}`
  );

  return response;
}
