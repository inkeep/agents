'use server';

import type { ListResponse, SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateTenantId } from './resource-validation';

/**
 * Branch information returned by the API
 * - baseName: User-provided branch name (e.g., "feature-x")
 * - fullName: Full namespaced branch name (e.g., "tenant_project_feature-x")
 * - hash: Current commit hash of the branch
 */
export interface Branch {
  baseName: string;
  fullName: string;
  hash: string;
}

export interface CreateBranchData {
  name: string;
  from?: string;
}

export async function fetchBranches(
  tenantId: string,
  projectId: string
): Promise<ListResponse<Branch>> {
  validateTenantId(tenantId);

  return makeManagementApiRequest<ListResponse<Branch>>(
    `tenants/${tenantId}/projects/${projectId}/branches`
  );
}

export async function fetchBranchesWithAgent(
  tenantId: string,
  projectId: string,
  agentId: string
): Promise<ListResponse<Branch>> {
  validateTenantId(tenantId);

  return makeManagementApiRequest<ListResponse<Branch>>(
    `tenants/${tenantId}/projects/${projectId}/branches/agents/${agentId}`
  );
}

export async function fetchBranch(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<SingleResponse<Branch>> {
  validateTenantId(tenantId);

  return makeManagementApiRequest<SingleResponse<Branch>>(
    `tenants/${tenantId}/projects/${projectId}/branches/${encodeURIComponent(branchName)}`
  );
}

export async function createBranch(
  tenantId: string,
  projectId: string,
  data: CreateBranchData
): Promise<SingleResponse<Branch>> {
  validateTenantId(tenantId);

  return makeManagementApiRequest<SingleResponse<Branch>>(
    `tenants/${tenantId}/projects/${projectId}/branches`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

export async function deleteBranch(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<void> {
  validateTenantId(tenantId);

  await makeManagementApiRequest<void>(
    `tenants/${tenantId}/projects/${projectId}/branches/${encodeURIComponent(branchName)}`,
    {
      method: 'DELETE',
    }
  );
}
