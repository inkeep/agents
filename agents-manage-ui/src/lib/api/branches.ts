'use server';

import type { SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export interface Branch {
  baseName: string;
  fullName: string;
  isProtected: boolean;
  createdAt?: string;
}

export interface MergeResult {
  status: 'success' | 'conflicts';
  from: string;
  to: string;
  hasConflicts: boolean;
  toHead?: string;
}

export async function fetchBranches(
  tenantId: string,
  projectId: string
): Promise<{ data: Branch[] }> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  return makeManagementApiRequest<{ data: Branch[] }>(
    `tenants/${tenantId}/projects/${projectId}/branches`
  );
}

export async function fetchBranch(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<Branch> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<Branch>>(
    `tenants/${tenantId}/projects/${projectId}/branches/${branchName}`
  );

  return response.data;
}

export async function deleteBranch(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<void> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  await makeManagementApiRequest<void>(
    `tenants/${tenantId}/projects/${projectId}/branches/${branchName}`,
    { method: 'DELETE' }
  );
}

export async function mergeBranch(
  tenantId: string,
  projectId: string,
  branchName: string,
  message?: string
): Promise<MergeResult> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<SingleResponse<MergeResult>>(
    `tenants/${tenantId}/projects/${projectId}/branches/${branchName}/merge`,
    {
      method: 'POST',
      body: JSON.stringify({ message }),
    }
  );

  return response.data;
}
