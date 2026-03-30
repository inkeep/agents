import { getTempBranchSuffix } from '@inkeep/agents-core';
import type { ManagementApiClient } from '../api';

export interface WithLocalStateBranchParams<T> {
  apiClient: ManagementApiClient;
  projectId: string;
  fromCommit: string;
  localDefinition: unknown;
  branchPrefix: string;
  fn: (branchName: string) => Promise<T>;
}

export async function withLocalStateBranch<T>({
  apiClient,
  projectId,
  fromCommit,
  localDefinition,
  branchPrefix,
  fn,
}: WithLocalStateBranchParams<T>): Promise<T> {
  const tempBranchName = getTempBranchSuffix(branchPrefix);

  try {
    await apiClient.createBranch(projectId, {
      name: tempBranchName,
      fromCommit,
    });

    await apiClient.pushFullProject(projectId, tempBranchName, localDefinition);

    return await fn(tempBranchName);
  } finally {
    try {
      await apiClient.deleteBranch(projectId, tempBranchName, true);
    } catch {
      // Best-effort cleanup
    }
  }
}
