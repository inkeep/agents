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
import { cache } from 'react';
import type { ListResponse, SingleResponse } from '../types/response';
// Configuration for the API client
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

// Re-export types from core package for convenience
// Note: DataComponentApiSelect might have nullable props, but UI expects non-nullable
export interface DataComponent extends Omit<DataComponentApiSelect, 'render'> {
  render?: {
    component: string;
    mockData: Record<string, unknown>;
  } | null;
}

/**
 * Fetch all data components for a tenant
 */
export async function fetchDataComponents(
  tenantId: string,
  projectId: string
): Promise<ListResponse<DataComponent>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<ListResponse<DataComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/data-components?limit=100`
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
async function $fetchDataComponent(
  tenantId: string,
  projectId: string,
  dataComponentId: string
): Promise<DataComponent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<DataComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/data-components/${dataComponentId}`
  );

  // Transform the response to ensure props is non-nullable
  return {
    ...response.data,
    props: response.data.props || {},
  };
}

export const fetchDataComponent = cache($fetchDataComponent);

/**
 * Create a new data component
 */
export async function createDataComponent(
  tenantId: string,
  projectId: string,
  dataComponent: DataComponentApiInsert
): Promise<DataComponent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<DataComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/data-components`,
    {
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
  dataComponent: DataComponentApiUpdate & { id: string }
): Promise<DataComponent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<DataComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/data-components/${dataComponent.id}`,
    {
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
  dataComponentId: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/data-components/${dataComponentId}`,
    {
      method: 'DELETE',
    }
  );
}
