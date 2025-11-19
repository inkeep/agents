/**
 * API Client for API Keys Operations
 *
 * This module provides HTTP client functions to communicate with the
 * inkeep-chat backend API Keys REST API endpoints.
 */

'use server';

import type {
  ApiKeyApiCreationResponse,
  ApiKeyApiSelect,
} from '@inkeep/agents-core/client-exports';
import type { ListResponse, SingleResponse } from '../types/response';
import { type ApiRequestOptions, makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

// Re-export types from core package for convenience
// Note: ApiKeyApiSelect might not have a 'name' field yet, and UI expects undefined instead of null
export type ApiKey = Omit<ApiKeyApiSelect, 'lastUsedAt' | 'expiresAt' | 'name'> & {
  name: string;
  lastUsedAt?: string; // Convert null to undefined for UI compatibility
  expiresAt?: string; // Convert null to undefined for UI compatibility
};

// The core ApiKeyApiCreationResponse has a 'data' wrapper, but we want a flat structure
export type ApiKeyCreateResponse = {
  apiKey: ApiKey;
  key: string; // The full API key value (shown only once)
};

export async function fetchApiKeys(
  tenantId: string,
  projectId: string,
  options?: ApiRequestOptions
): Promise<ListResponse<ApiKey>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<ListResponse<ApiKeyApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/api-keys`,
    options
  );

  // Transform the response to convert nulls to undefined
  return {
    ...response,
    data: response.data.map((item) => ({
      ...item,
      lastUsedAt: item.lastUsedAt ?? undefined,
      expiresAt: item.expiresAt ?? undefined,
    })),
  } as ListResponse<ApiKey>;
}

/**
 * Create a new api key
 */
export async function createApiKey(
  tenantId: string,
  projectId: string,
  apiKeyData: Partial<ApiKey>,
  options?: ApiRequestOptions
): Promise<ApiKeyCreateResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);
  const response = await makeManagementApiRequest<SingleResponse<ApiKeyApiCreationResponse>>(
    `tenants/${tenantId}/projects/${projectId}/api-keys`,
    {
      ...options,
      method: 'POST',
      body: JSON.stringify(apiKeyData),
    }
  );

  // The response.data contains the ApiKeyApiCreationResponse structure
  // We need to extract and transform it to our expected structure
  const rawResponse = response.data as any;
  if (rawResponse?.data?.apiKey && rawResponse?.data?.key) {
    const { apiKey, key } = rawResponse.data;
    return {
      apiKey: {
        ...apiKey,
        lastUsedAt: apiKey.lastUsedAt ?? undefined,
        expiresAt: apiKey.expiresAt ?? undefined,
      },
      key,
    };
  }

  // Fallback for direct structure (if API returns flat response)
  if (rawResponse?.apiKey && rawResponse?.key) {
    return {
      apiKey: {
        ...rawResponse.apiKey,
        lastUsedAt: rawResponse.apiKey.lastUsedAt ?? undefined,
        expiresAt: rawResponse.apiKey.expiresAt ?? undefined,
      },
      key: rawResponse.key,
    };
  }

  return rawResponse;
}

/**
 * Delete an api key
 */
export async function deleteApiKey(
  tenantId: string,
  projectId: string,
  apiKeyId: string,
  options?: ApiRequestOptions
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest(`tenants/${tenantId}/projects/${projectId}/api-keys/${apiKeyId}`, {
    ...options,
    method: 'DELETE',
  });
}

/**
 * Update an api key
 */
export async function updateApiKey(
  tenantId: string,
  projectId: string,
  apiKeyData: Partial<ApiKey>,
  options?: ApiRequestOptions
): Promise<ApiKey> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<ApiKeyApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/api-keys/${apiKeyData.id}`,
    {
      ...options,
      method: 'PUT',
      body: JSON.stringify(apiKeyData),
    }
  );

  return {
    ...response.data,
    name: response.data.name ?? 'No Name', // name could be null due to backward compatibility
    lastUsedAt: response.data.lastUsedAt ?? undefined,
    expiresAt: response.data.expiresAt ?? undefined,
  };
}
