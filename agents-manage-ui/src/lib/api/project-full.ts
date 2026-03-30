/**
 * API Client for Project Full Operations
 *
 * This module provides HTTP client functions to communicate with the
 * management backend for full project operations.
 */

import type { FullProjectDefinition } from '@inkeep/agents-core';
import type { SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

/**
 * Get a full project definition with all nested resources
 * (agents, tools, dataComponents, artifactComponents, credentials, externalAgents)
 */
export async function getFullProject(
  tenantId: string,
  projectId: string
): Promise<SingleResponse<FullProjectDefinition>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<SingleResponse<FullProjectDefinition>>(
    `tenants/${tenantId}/project-full/${projectId}`
  );
}

export { ApiError } from '../types/errors';
