'use server';

import type {
  CredentialReferenceApiInsert,
  CredentialReferenceApiSelect,
  ExternalAgentApiSelect,
  McpTool,
} from '@inkeep/agents-core';
import type { ListResponse, SingleResponse } from '../types/response';
// Default configuration
import { type ApiRequestOptions, makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

// Re-export types from core package for convenience
export type Credential = CredentialReferenceApiSelect & {
  tools?: McpTool[];
  externalAgents?: ExternalAgentApiSelect[];
};

/**
 * List all credentials for the current tenant
 */
export async function fetchCredentials(
  tenantId: string,
  projectId: string,
  options?: ApiRequestOptions,
  page = 1,
  pageSize = 100
): Promise<Credential[]> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const params = new URLSearchParams({
    page: page.toString(),
    limit: pageSize.toString(),
  });

  const response = await makeManagementApiRequest<ListResponse<CredentialReferenceApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/credentials?${params}`,
    options
  );

  // Cast to Credential type (includes optional tools field)
  return response.data as Credential[];
}

/**
 * Get a single credential by ID
 */
export async function fetchCredential(
  tenantId: string,
  projectId: string,
  id: string,
  options?: ApiRequestOptions
): Promise<Credential> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<CredentialReferenceApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/credentials/${id}`,
    options
  );

  // Cast to Credential type (includes optional tools field)
  return response.data as Credential;
}

/**
 * Create a new credential
 */
export async function createCredential(
  tenantId: string,
  projectId: string,
  data: CredentialReferenceApiInsert,
  options?: ApiRequestOptions
): Promise<Credential> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<CredentialReferenceApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/credentials`,
    {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    }
  );

  // Cast to Credential type (includes optional tools field)
  return response.data as Credential;
}

/**
 * Update an existing credential
 */
export async function updateCredential(
  tenantId: string,
  projectId: string,
  id: string,
  data: Partial<CredentialReferenceApiInsert>,
  options?: ApiRequestOptions
): Promise<Credential> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<CredentialReferenceApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/credentials/${id}`,
    {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    }
  );

  // Cast to Credential type (includes optional tools field)
  return response.data as Credential;
}

/**
 * Delete a credential
 */
export async function deleteCredential(
  tenantId: string,
  projectId: string,
  id: string,
  options?: ApiRequestOptions
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest<void>(
    `tenants/${tenantId}/projects/${projectId}/credentials/${id}`,
    {
      ...options,
      method: 'DELETE',
    }
  );
}

/**
 * Get user-scoped credential for a specific tool
 * Returns null if the user hasn't connected yet
 */
export async function fetchUserScopedCredential(
  tenantId: string,
  projectId: string,
  toolId: string
): Promise<Credential | null> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  try {
    const response = await makeManagementApiRequest<SingleResponse<CredentialReferenceApiSelect>>(
      `tenants/${tenantId}/projects/${projectId}/tools/${toolId}/user-credential`
    );
    return response.data as Credential;
  } catch {
    // User hasn't connected yet
    return null;
  }
}
