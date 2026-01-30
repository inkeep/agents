/**
 * API Client for Scheduled Triggers Operations
 *
 * This module provides HTTP client functions to communicate with the
 * inkeep-chat backend Scheduled Triggers REST API endpoints.
 */

'use server';

import type {
  ScheduledTriggerApiSelectSchema,
  ScheduledTriggerInvocationApiSelectSchema,
} from '@inkeep/agents-core/client-exports';
import { cache } from 'react';
import type { z } from 'zod';
import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

// Type definitions
export type ScheduledTrigger = z.infer<typeof ScheduledTriggerApiSelectSchema>;
export type ScheduledTriggerInvocation = z.infer<typeof ScheduledTriggerInvocationApiSelectSchema>;

export type CreateScheduledTriggerInput = {
  id?: string;
  name: string;
  description?: string;
  enabled?: boolean;
  cronExpression?: string | null;
  runAt?: string | null;
  payload?: Record<string, unknown> | null;
  messageTemplate?: string;
  maxRetries?: number;
  retryDelaySeconds?: number;
  timeoutSeconds?: number;
};

export type UpdateScheduledTriggerInput = Partial<CreateScheduledTriggerInput>;

/**
 * Fetch all scheduled triggers for an agent
 */
export async function fetchScheduledTriggers(
  tenantId: string,
  projectId: string,
  agentId: string
): Promise<ListResponse<ScheduledTrigger>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<ListResponse<ScheduledTrigger>>(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers?limit=100`
  );

  return response;
}

/**
 * Get a single scheduled trigger by ID
 */
async function $getScheduledTrigger(
  tenantId: string,
  projectId: string,
  agentId: string,
  scheduledTriggerId: string
): Promise<ScheduledTrigger> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<ScheduledTrigger>>(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers/${scheduledTriggerId}`
  );

  return response.data;
}

export const getScheduledTrigger = cache($getScheduledTrigger);

/**
 * Create a new scheduled trigger
 */
export async function createScheduledTrigger(
  tenantId: string,
  projectId: string,
  agentId: string,
  triggerData: CreateScheduledTriggerInput
): Promise<ScheduledTrigger> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<ScheduledTrigger>>(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers`,
    {
      method: 'POST',
      body: JSON.stringify(triggerData),
    }
  );

  return response.data;
}

/**
 * Update a scheduled trigger
 */
export async function updateScheduledTrigger(
  tenantId: string,
  projectId: string,
  agentId: string,
  scheduledTriggerId: string,
  triggerData: UpdateScheduledTriggerInput
): Promise<ScheduledTrigger> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<ScheduledTrigger>>(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers/${scheduledTriggerId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(triggerData),
    }
  );

  return response.data;
}

/**
 * Delete a scheduled trigger
 */
export async function deleteScheduledTrigger(
  tenantId: string,
  projectId: string,
  agentId: string,
  scheduledTriggerId: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers/${scheduledTriggerId}`,
    {
      method: 'DELETE',
    }
  );
}

/**
 * Fetch invocations for a scheduled trigger
 */
export async function fetchScheduledTriggerInvocations(
  tenantId: string,
  projectId: string,
  agentId: string,
  scheduledTriggerId: string,
  options?: {
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    limit?: number;
    page?: number;
  }
): Promise<ListResponse<ScheduledTriggerInvocation>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const params = new URLSearchParams();
  if (options?.status) params.append('status', options.status);
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.page) params.append('page', options.page.toString());

  const queryString = params.toString() ? `?${params.toString()}` : '';

  const response = await makeManagementApiRequest<ListResponse<ScheduledTriggerInvocation>>(
    `tenants/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers/${scheduledTriggerId}/invocations${queryString}`
  );

  return response;
}
