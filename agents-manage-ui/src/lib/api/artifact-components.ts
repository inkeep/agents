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
import { type ApiRequestOptions, makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

// Re-export types from core package for convenience
// Props can be null/undefined for optional artifact components
export type ArtifactComponent = ArtifactComponentApiSelect;

/**
 * Fetch all artifacts for a tenant
 */
export async function fetchArtifactComponents(
  tenantId: string,
  projectId: string,
  options?: ApiRequestOptions
): Promise<ListResponse<ArtifactComponent>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<ListResponse<ArtifactComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/artifact-components`,
    options
  );

  return response;
}

/**
 * Fetch a single artifact by ID
 */
export async function fetchArtifactComponent(
  tenantId: string,
  projectId: string,
  artifactComponentId: string,
  options?: ApiRequestOptions
): Promise<ArtifactComponent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<ArtifactComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponentId}`,
    options
  );

  return response.data;
}

/**
 * Create a new artifact
 */
export async function createArtifactComponent(
  tenantId: string,
  projectId: string,
  artifactComponent: ArtifactComponentApiInsert,
  options?: ApiRequestOptions
): Promise<ArtifactComponent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<ArtifactComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/artifact-components`,
    {
      ...options,
      method: 'POST',
      body: JSON.stringify(artifactComponent),
    }
  );

  return response.data;
}

/**
 * Update an existing artifact
 */
export async function updateArtifactComponent(
  tenantId: string,
  projectId: string,
  artifactComponent: ArtifactComponentApiUpdate & { id: string },
  options?: ApiRequestOptions
): Promise<ArtifactComponent> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<ArtifactComponentApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponent.id}`,
    {
      ...options,
      method: 'PUT',
      body: JSON.stringify(artifactComponent),
    }
  );

  return response.data;
}

/**
 * Delete an artifact
 */
export async function deleteArtifactComponent(
  tenantId: string,
  projectId: string,
  artifactComponentId: string,
  options?: ApiRequestOptions
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/artifact-components/${artifactComponentId}`,
    {
      ...options,
      method: 'DELETE',
    }
  );
}
