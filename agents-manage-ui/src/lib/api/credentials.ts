'use server';

import type {
  CredentialReferenceApiInsert,
  CredentialReferenceApiSelect,
  McpTool,
} from '@inkeep/agents-core';
import type { ListResponse, SingleResponse } from '../types/response';
// Default configuration
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

// Re-export types from core package for convenience
export type Credential = CredentialReferenceApiSelect & {
  tools?: McpTool[];
};
export type CreateCredentialRequest = CredentialReferenceApiInsert;

/**
 * List all credentials for the current tenant
 */
export async function fetchCredentials(
  tenantId: string,
  projectId: string,
  page = 1,
  pageSize = 50
): Promise<Credential[]> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const params = new URLSearchParams({
    page: page.toString(),
    limit: pageSize.toString(),
  });

  const response = await makeManagementApiRequest<ListResponse<CredentialReferenceApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/credentials?${params}`
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
  id: string
): Promise<Credential> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<CredentialReferenceApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/credentials/${id}`
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
  data: CredentialReferenceApiInsert
): Promise<Credential> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<CredentialReferenceApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/credentials`,
    {
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
  data: Partial<CredentialReferenceApiInsert>
): Promise<Credential> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<CredentialReferenceApiSelect>>(
    `tenants/${tenantId}/projects/${projectId}/credentials/${id}`,
    {
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
  id: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest<void>(
    `tenants/${tenantId}/projects/${projectId}/credentials/${id}`,
    {
      method: 'DELETE',
    }
  );
}
