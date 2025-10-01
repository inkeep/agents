/**
 * API Client for Artifacts Operations
 *
 * This module provides HTTP client functions to communicate with the
 * inkeep-chat backend Artifacts REST API endpoints.
 */

'use server';

import type {
  ArtifactComponentApiInsert,
  ArtifactComponentApiSelect,
  ArtifactComponentApiUpdate,
} from '@inkeep/agents-core';
import type { ListResponse, SingleResponse } from '../types/response';
// Configuration for the API client
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

// Re-export types from core package for convenience
// Note: ArtifactComponentApiSelect might have nullable props, but UI expects non-nullable
export type ArtifactComponent = Omit<ArtifactComponentApiSelect, 'summaryProps' | 'fullProps'> & {
  summaryProps: Record<string, any>; // Ensure summaryProps is non-nullable for UI compatibility
  fullProps: Record<string, any>; // Ensure fullProps is non-nullable for UI compatibility
};

/**
 * Fetch all artifacts for a tenant
 */
export async function fetchArtifactComponents(
  tenantId: string,
  projectId: string
): Promise<ListResponse<ArtifactComponent>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<ListResponse<ArtifactComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/artifact-components`
  );

  // Transform the response to ensure props are non-nullable
  return {
    ...response,
    data: response.data.map((item) => ({
      ...item,
      summaryProps: item.summaryProps || {},
      fullProps: item.fullProps || {},
    })),
  };
}

/**
 * Fetch a single artifact by ID
 */
export async function fetchArtifactComponent(
  tenantId: string,
  projectId: string,
  artifactComponentId: string
): Promise<ArtifactComponent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<ArtifactComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponentId}`
  );

  // Transform the response to ensure props are non-nullable
  return {
    ...response.data,
    summaryProps: response.data.summaryProps || {},
    fullProps: response.data.fullProps || {},
  };
}

/**
 * Create a new artifact
 */
export async function createArtifactComponent(
  tenantId: string,
  projectId: string,
  artifactComponent: ArtifactComponentApiInsert
): Promise<ArtifactComponent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<ArtifactComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/artifact-components`,
    {
      method: 'POST',
      body: JSON.stringify(artifactComponent),
    }
  );

  // Transform the response to ensure props are non-nullable
  return {
    ...response.data,
    summaryProps: response.data.summaryProps || {},
    fullProps: response.data.fullProps || {},
  };
}

/**
 * Update an existing artifact
 */
export async function updateArtifactComponent(
  tenantId: string,
  projectId: string,
  artifactComponent: ArtifactComponentApiUpdate & { id: string }
): Promise<ArtifactComponent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<ArtifactComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponent.id}`,
    {
      method: 'PUT',
      body: JSON.stringify(artifactComponent),
    }
  );

  // Transform the response to ensure props are non-nullable
  return {
    ...response.data,
    summaryProps: response.data.summaryProps || {},
    fullProps: response.data.fullProps || {},
  };
}

/**
 * Delete an artifact
 */
export async function deleteArtifactComponent(
  tenantId: string,
  projectId: string,
  artifactComponentId: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponentId}`,
    {
      method: 'DELETE',
    }
  );
}
