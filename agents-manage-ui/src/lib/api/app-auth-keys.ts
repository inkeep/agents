'use server';

import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export interface PublicKeyConfig {
  kid: string;
  publicKey: string;
  algorithm: string;
  addedAt: string;
}

export async function fetchAppAuthKeys(
  tenantId: string,
  projectId: string,
  appId: string
): Promise<PublicKeyConfig[]> {
  const response = await makeManagementApiRequest<{ data: PublicKeyConfig[] }>(
    `tenants/${tenantId}/projects/${projectId}/apps/${appId}/auth/keys`
  );

  return response.data;
}

export async function addAppAuthKey(
  tenantId: string,
  projectId: string,
  appId: string,
  body: { kid: string; publicKey: string; algorithm: string }
): Promise<PublicKeyConfig> {
  const response = await makeManagementApiRequest<{ data: PublicKeyConfig }>(
    `tenants/${tenantId}/projects/${projectId}/apps/${appId}/auth/keys`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );

  return response.data;
}

export async function deleteAppAuthKey(
  tenantId: string,
  projectId: string,
  appId: string,
  kid: string
): Promise<void> {
  await makeManagementApiRequest(
    `tenants/${tenantId}/projects/${projectId}/apps/${appId}/auth/keys/${encodeURIComponent(kid)}`,
    {
      method: 'DELETE',
    }
  );
}
