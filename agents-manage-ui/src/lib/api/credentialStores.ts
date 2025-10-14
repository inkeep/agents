'use server';

import type { CredentialStoreType } from '@inkeep/agents-core/client-exports';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export interface CredentialStoreStatus {
  id: string;
  type: (typeof CredentialStoreType)[keyof typeof CredentialStoreType];
  available: boolean;
  reason: string | null;
}

export interface CredentialStoresStatusResponse {
  stores: CredentialStoreStatus[];
}

export interface CredentialStoreSetRequest {
  key: string;
  value: string;
}

export interface CredentialStoreSetResponse {
  success: boolean;
  message: string;
}

/**
 * Get credential stores status - shows which credential stores are available and functional
 */
export async function fetchCredentialStoresStatus(
  tenantId: string,
  projectId: string
): Promise<CredentialStoreStatus[]> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<CredentialStoresStatusResponse>(
    `tenants/${tenantId}/projects/${projectId}/credentials/stores/status`
  );

  return response.stores;
}

/**
 * Set a credential in a specific credential store
 */
export async function setCredentialInStore(
  tenantId: string,
  projectId: string,
  storeId: string,
  key: string,
  value: string
): Promise<CredentialStoreSetResponse> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<CredentialStoreSetResponse>(
    `tenants/${tenantId}/projects/${projectId}/credentials/stores/${storeId}/set`,
    {
      method: 'POST',
      body: JSON.stringify({ key, value }),
    }
  );

  return response;
}
