/**
 * API Client for Graph Full Operations
 *
 * This module provides HTTP client functions to communicate with the
 * inkeep-chat backend GraphFull REST API endpoints.
 */

import { ApiError } from '../types/errors';
import type {
  CreateGraphResponse,
  FullGraphDefinition,
  GetGraphResponse,
  Graph,
  UpdateGraphResponse,
} from '../types/graph-full';
import type { ListResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export async function fetchGraphs(
  tenantId: string,
  projectId: string
): Promise<ListResponse<Graph>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<ListResponse<Graph>>(
    `tenants/${tenantId}/crud/projects/${projectId}/agent-graphs`
  );
}

/**
 * Create a new full graph
 */
export async function createFullGraph(
  tenantId: string,
  projectId: string,
  graphData: FullGraphDefinition
): Promise<CreateGraphResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<CreateGraphResponse>(
    `tenants/${tenantId}/crud/projects/${projectId}/graph`,
    {
      method: 'POST',
      body: JSON.stringify(graphData),
    }
  );
}

/**
 * Get a full graph by ID
 */
export async function getFullGraph(
  tenantId: string,
  projectId: string,
  graphId: string
): Promise<GetGraphResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<GetGraphResponse>(
    `tenants/${tenantId}/crud/projects/${projectId}/graph/${graphId}`,
    {
      method: 'GET',
    }
  );
}

/**
 * Update or create a full graph (upsert)
 */
export async function updateFullGraph(
  tenantId: string,
  projectId: string,
  graphId: string,
  graphData: FullGraphDefinition
): Promise<UpdateGraphResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<UpdateGraphResponse>(
    `tenants/${tenantId}/crud/projects/${projectId}/graph/${graphId}`,
    {
      method: 'PUT',
      body: JSON.stringify(graphData),
    }
  );
}

/**
 * Delete a full graph
 */
export async function deleteFullGraph(
  tenantId: string,
  projectId: string,
  graphId: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest(
    `tenants/${tenantId}/crud/projects/${projectId}/graph/${graphId}`,
    {
      method: 'DELETE',
    }
  );
}

// Export the error class for use in server actions
export { ApiError };
