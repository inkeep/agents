'use server';

import type {
  WebhookDestinationApiInsert,
  WebhookDestinationApiSelect,
  WebhookDestinationApiUpdate,
} from '@inkeep/agents-core';
import { cache } from 'react';
import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';

export type WebhookDestination = WebhookDestinationApiSelect;
export type CreateWebhookDestinationInput = WebhookDestinationApiInsert;
export type UpdateWebhookDestinationInput = WebhookDestinationApiUpdate;

export async function fetchWebhookDestinations(
  tenantId: string,
  projectId: string,
  agentId?: string
): Promise<ListResponse<WebhookDestination>> {
  const params = new URLSearchParams({ limit: '100' });
  if (agentId) params.set('agentId', agentId);
  return makeManagementApiRequest<ListResponse<WebhookDestination>>(
    `tenants/${tenantId}/projects/${projectId}/webhook-destinations?${params.toString()}`
  );
}

async function $getWebhookDestination(
  tenantId: string,
  projectId: string,
  webhookDestinationId: string
): Promise<WebhookDestination> {
  const response = await makeManagementApiRequest<SingleResponse<WebhookDestination>>(
    `tenants/${tenantId}/projects/${projectId}/webhook-destinations/${webhookDestinationId}`
  );
  return response.data;
}

export const getWebhookDestination = cache($getWebhookDestination);

export async function createWebhookDestination(
  tenantId: string,
  projectId: string,
  data: CreateWebhookDestinationInput
): Promise<WebhookDestination> {
  const response = await makeManagementApiRequest<SingleResponse<WebhookDestination>>(
    `tenants/${tenantId}/projects/${projectId}/webhook-destinations`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
  return response.data;
}

export async function updateWebhookDestination(
  tenantId: string,
  projectId: string,
  webhookDestinationId: string,
  data: UpdateWebhookDestinationInput
): Promise<WebhookDestination> {
  const response = await makeManagementApiRequest<SingleResponse<WebhookDestination>>(
    `tenants/${tenantId}/projects/${projectId}/webhook-destinations/${webhookDestinationId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    }
  );
  return response.data;
}

export async function deleteWebhookDestination(
  tenantId: string,
  projectId: string,
  webhookDestinationId: string
): Promise<void> {
  await makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/webhook-destinations/${webhookDestinationId}`,
    {
      method: 'DELETE',
    }
  );
}

export async function testWebhookDestination(
  tenantId: string,
  projectId: string,
  webhookDestinationId: string
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  return makeManagementApiRequest<{ success: boolean; statusCode?: number; error?: string }>(
    `tenants/${tenantId}/projects/${projectId}/webhook-destinations/${webhookDestinationId}/test`,
    {
      method: 'POST',
    }
  );
}
