/**
 * API Client for Data Components Operations
 *
 * This module provides HTTP client functions to communicate with the
 * inkeep-chat backend Data Components REST API endpoints.
 */

'use server';

import type {
  DataComponentApiInsert,
  DataComponentApiSelect,
  DataComponentApiUpdate,
} from '@inkeep/agents-core';
import type { ListResponse, SingleResponse } from '../types/response';
// Configuration for the API client
import { type ApiRequestOptions, makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

// Re-export types from core package for convenience
// Note: DataComponentApiSelect might have nullable props, but UI expects non-nullable
export type DataComponent = Omit<DataComponentApiSelect, 'props'> & {
  props: Record<string, any>; // Ensure props is non-nullable for UI compatibility
  render?: {
    component: string;
    mockData: Record<string, unknown>;
  } | null;
};

/**
 * Fetch all data components for a tenant
 */
export async function fetchDataComponents(
  tenantId: string,
  projectId: string,
  options?: ApiRequestOptions
): Promise<ListResponse<DataComponent>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<ListResponse<DataComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/data-components`,
    options
  );

  // Transform the response to ensure props is non-nullable
  return {
    ...response,
    data: response.data.map((item) => ({
      ...item,
      props: item.props || {},
    })),
  };
}

/**
 * Fetch a single data component by ID
 */
export async function fetchDataComponent(
  tenantId: string,
  projectId: string,
  dataComponentId: string,
  options?: ApiRequestOptions
): Promise<DataComponent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<DataComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/data-components/${dataComponentId}`,
    options
  );

  // Transform the response to ensure props is non-nullable
  return {
    ...response.data,
    props: response.data.props || {},
  };
}

/**
 * Create a new data component
 */
export async function createDataComponent(
  tenantId: string,
  projectId: string,
  dataComponent: DataComponentApiInsert,
  options?: ApiRequestOptions
): Promise<DataComponent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<DataComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/data-components`,
    {
      ...options,
      method: 'POST',
      body: JSON.stringify(dataComponent),
    }
  );

  // Transform the response to ensure props is non-nullable
  return {
    ...response.data,
    props: response.data.props || {},
  };
}

/**
 * Update an existing data component
 */
export async function updateDataComponent(
  tenantId: string,
  projectId: string,
  dataComponent: DataComponentApiUpdate & { id: string },
  options?: ApiRequestOptions
): Promise<DataComponent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<DataComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/data-components/${dataComponent.id}`,
    {
      ...options,
      method: 'PUT',
      body: JSON.stringify(dataComponent),
    }
  );

  // Transform the response to ensure props is non-nullable
  return {
    ...response.data,
    props: response.data.props || {},
  };
}

/**
 * Delete a data component
 */
export async function deleteDataComponent(
  tenantId: string,
  projectId: string,
  dataComponentId: string,
  options?: ApiRequestOptions
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/data-components/${dataComponentId}`,
    {
      ...options,
      method: 'DELETE',
    }
  );
}
