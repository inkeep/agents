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
// Props can be null/undefined for optional artifact components
export type ArtifactComponent = ArtifactComponentApiSelect;

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

  // Return the response as-is, preserving null/undefined props
  return response;
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

  // Return the response as-is, preserving null/undefined props
  return response.data;
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

  // Return the response as-is, preserving null/undefined props
  return response.data;
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

  // Return the response as-is, preserving null/undefined props
  return response.data;
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
