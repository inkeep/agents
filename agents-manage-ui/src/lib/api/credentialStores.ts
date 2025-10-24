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

export interface CredentialStoresListResponse {
  data: CredentialStoreStatus[];
}

export interface CreateCredentialInStoreRequest {
  key: string;
  value: string;
  metadata?: Record<string, string>;
}

export interface CreateCredentialInStoreResponse {
  data: {
    key: string;
    storeId: string;
    createdAt: string;
  };
}

/**
 * List credential stores - shows which credential stores are available and functional
 */
export async function listCredentialStores(
  tenantId: string,
  projectId: string
): Promise<CredentialStoreStatus[]> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<CredentialStoresListResponse>(
    `tenants/${tenantId}/projects/${projectId}/credential-stores`
  );

  return response.data;
}

/**
 * Create a credential in a specific credential store
 */
export async function createCredentialInStore({
  tenantId,
  projectId,
  storeId,
  key,
  value,
  metadata,
}: {
  tenantId: string;
  projectId: string;
  storeId: string;
  key: string;
  value: string;
  metadata?: Record<string, string>;
}): Promise<CreateCredentialInStoreResponse['data']> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<CreateCredentialInStoreResponse>(
    `tenants/${tenantId}/projects/${projectId}/credential-stores/${storeId}/credentials`,
    {
      method: 'POST',
      body: JSON.stringify({ key, value, metadata }),
    }
  );

  return response.data;
}
