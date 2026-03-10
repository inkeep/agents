'use server';

import type { SingleResponse } from '../types/response';
import { makeManagementApiRequest } from './api-config';
import { validateProjectId, validateTenantId } from './resource-validation';

export interface Branch {
  baseName: string;
  fullName: string;
  isProtected: boolean;
  createdAt?: string;
  latestCommitDate?: string | null;
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

export interface BranchDiffSummaryItem {
  tableName: string;
  diffType: string;
  dataChange: boolean;
  schemaChange: boolean;
}

export async function fetchBranchDiffSummary(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<BranchDiffSummaryItem[]> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<{ data: BranchDiffSummaryItem[] }>(
    `tenants/${tenantId}/projects/${projectId}/branches/${branchName}/diff`
  );

  return response.data;
}

export interface BranchDiffField {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  renderAsCode: boolean;
}

export interface BranchDiffChange {
  entityId: string;
  entityName: string;
  changeType: string;
  fields: BranchDiffField[];
}

export interface BranchDiffDetailItem {
  tableName: string;
  displayName: string;
  diffType: string;
  changes: BranchDiffChange[];
}

export async function fetchBranchDiffDetails(
  tenantId: string,
  projectId: string,
  branchName: string
): Promise<BranchDiffDetailItem[]> {
  validateTenantId(tenantId);
  validateProjectId(projectId);

  const response = await makeManagementApiRequest<{ data: BranchDiffDetailItem[] }>(
    `tenants/${tenantId}/projects/${projectId}/branches/${branchName}/diff/details`
  );

  return response.data;
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
