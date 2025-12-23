/**
 * API Client for Policy Operations
 */
'use server';

import type { PolicyApiInsert, PolicyApiSelect, PolicyApiUpdate } from '@inkeep/agents-core';
import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export type Policy = PolicyApiSelect;

export async function fetchPolicies(
  tenantId: string,
  projectId: string
): Promise<ListResponse<Policy>> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<ListResponse<Policy>>(
    `tenants/${tenantId}/projects/${projectId}/policies?limit=100`
  );
}

export async function fetchPolicy(
  tenantId: string,
  projectId: string,
  policyId: string
): Promise<Policy> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<Policy>>(
    `tenants/${tenantId}/projects/${projectId}/policies/${policyId}`
  );

  return response.data;
}

export async function createPolicy(
  tenantId: string,
  projectId: string,
  policy: PolicyApiInsert
): Promise<Policy> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<Policy>>(
    `tenants/${tenantId}/projects/${projectId}/policies`,
    {
      method: 'POST',
      body: JSON.stringify(policy),
    }
  );

  return response.data;
}

export async function updatePolicy(
  tenantId: string,
  projectId: string,
  policyId: string,
  policy: PolicyApiUpdate
): Promise<Policy> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<Policy>>(
    `tenants/${tenantId}/projects/${projectId}/policies/${policyId}`,
    {
      method: 'PUT',
      body: JSON.stringify(policy),
    }
  );

  return response.data;
}

export async function deletePolicy(tenantId: string, projectId: string, policyId: string) {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest(`tenants/${tenantId}/projects/${projectId}/policies/${policyId}`, {
    method: 'DELETE',
  });
}
