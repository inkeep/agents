import type { DatabaseClient } from '../db/client';
import type { BranchInfo } from '../validation/dolt-schemas';
import { doltBranch, doltDeleteBranch, doltGetBranchNamespace, doltListBranches } from './branch';
import type { BranchInfo } from '../validation/dolt-schemas';

export const MAIN_BRANCH_SUFFIX = 'main';

/**
 * Get the tenant-scoped main branch name
 */
export const getTenantMainBranch = (tenantId: string): string =>
  `${tenantId}_${MAIN_BRANCH_SUFFIX}`;

/**
 * Check if a branch name (without tenant/project prefix) is a protected branch
 */
export const isProtectedBranchName = (branchName: string): boolean => {
  return branchName === MAIN_BRANCH_SUFFIX;
};

export type CreateBranchParams = {
  tenantId: string;
  projectId: string;
  name: string;
  from?: string;
};

export type DeleteBranchParams = {
  tenantId: string;
  projectId: string;
  name: string;
};

export type GetBranchParams = {
  tenantId: string;
  projectId: string;
  name: string;
};

export type ListBranchesParams = {
  tenantId: string;
  projectId: string;
};

/**
 * Create a new branch
 */
export const createBranch =
  (db: DatabaseClient) =>
  async (params: CreateBranchParams): Promise<BranchInfo> => {
    const { tenantId, projectId, name, from } = params;

    // Validate branch name
    if (!name || name.trim() === '') {
      throw new Error('Branch name cannot be empty');
    }

    // Get full branch name
    const fullName = doltGetBranchNamespace({ tenantId, projectId, branchName: name })();

    // Check if branch already exists
    const existingBranches = await doltListBranches(db)();
    const branchExists = existingBranches.some((b) => b.name === fullName);

    if (branchExists) {
      throw new Error(`Branch '${name}' already exists`);
    }

    // Determine start point - default to tenant main branch
    const startPoint = from || getTenantMainBranch(tenantId);

    // Create the branch
    await doltBranch(db)({ name: fullName, startPoint });

    // Get the hash of the newly created branch
    const branches = await doltListBranches(db)();
    const newBranch = branches.find((b) => b.name === fullName);

    if (!newBranch) {
      throw new Error('Failed to create branch');
    }

    return {
      baseName: name,
      fullName,
      hash: newBranch.hash,
    };
  };

/**
 * Delete a branch
 */
export const deleteBranch =
  (db: DatabaseClient) =>
  async (params: DeleteBranchParams): Promise<void> => {
    const { tenantId, projectId, name } = params;

    // Check if trying to delete a protected branch
    if (isProtectedBranchName(name)) {
      throw new Error(`Cannot delete protected branch '${name}'`);
    }

    // Get full branch name
    const fullName = doltGetBranchNamespace({ tenantId, projectId, branchName: name })();

    // Check if branch exists
    const existingBranches = await doltListBranches(db)();
    const branchExists = existingBranches.some((b) => b.name === fullName);

    if (!branchExists) {
      throw new Error(`Branch '${name}' not found`);
    }

    // Delete the branch
    await doltDeleteBranch(db)({ name: fullName });
  };

/**
 * Get a single branch
 */
export const getBranch =
  (db: DatabaseClient) =>
  async (params: GetBranchParams): Promise<BranchInfo | null> => {
    const { tenantId, projectId, name } = params;

    // Get full branch name
    const fullName = doltGetBranchNamespace({ tenantId, projectId, branchName: name })();

    // Find the branch
    const branches = await doltListBranches(db)();
    const branch = branches.find((b) => b.name === fullName);

    if (!branch) {
      return null;
    }

    return {
      baseName: name,
      fullName,
      hash: branch.hash,
    };
  };

/**
 * List all branches for a project
 */
export const listBranches =
  (db: DatabaseClient) =>
  async (params: ListBranchesParams): Promise<BranchInfo[]> => {
    const { tenantId, projectId } = params;

    // Get all branches
    const allBranches = await doltListBranches(db)();

    // Filter branches that match the project namespace
    const prefix = `${tenantId}_${projectId}_`;
    const projectBranches = allBranches
      .filter((b) => b.name.startsWith(prefix))
      .map((b) => ({
        baseName: b.name.substring(prefix.length),
        fullName: b.name,
        hash: b.hash,
      }));

    return projectBranches;
  };
