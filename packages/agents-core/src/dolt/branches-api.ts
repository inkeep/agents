import { sql } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import type { AgentScopeConfig, ProjectScopeConfig } from '../types/utility';
import type { BranchInfo } from '../validation/dolt-schemas';
import { doltBranch, doltDeleteBranch, doltGetBranchNamespace, doltListBranches } from './branch';

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

    let fromFullBranchName: string | undefined;
    if (from && from !== MAIN_BRANCH_SUFFIX) {
      fromFullBranchName = doltGetBranchNamespace({
        tenantId,
        projectId,
        branchName: from,
      })();
    } else {
      fromFullBranchName = getTenantMainBranch(tenantId);
    }

    // Determine start point - default to tenant main branch
    const startPoint = fromFullBranchName;

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

    // Special case: "main" refers to the tenant main branch
    const fullName =
      name === MAIN_BRANCH_SUFFIX
        ? getTenantMainBranch(tenantId)
        : doltGetBranchNamespace({ tenantId, projectId, branchName: name })();

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
 * Includes the tenant main branch and all project-specific branches
 */
export const listBranches =
  (db: DatabaseClient) =>
  async (params: ProjectScopeConfig): Promise<BranchInfo[]> => {
    const { tenantId, projectId } = params;

    // Get all branches
    const allBranches = await doltListBranches(db)();

    const branches: BranchInfo[] = [];

    // Add tenant main branch
    const tenantMain = getTenantMainBranch(tenantId);
    const mainBranch = allBranches.find((b) => b.name === tenantMain);
    if (mainBranch) {
      branches.push({
        baseName: MAIN_BRANCH_SUFFIX,
        fullName: mainBranch.name,
        hash: mainBranch.hash,
      });
    }

    // Filter and add branches that match the project namespace
    const prefix = `${tenantId}_${projectId}_`;
    const projectBranches = allBranches
      .filter((b) => b.name.startsWith(prefix))
      .map((b) => ({
        baseName: b.name.substring(prefix.length),
        fullName: b.name,
        hash: b.hash,
      }));

    branches.push(...projectBranches);

    return branches;
  };

export const listBranchesForAgent =
  (db: DatabaseClient) =>
  async (params: AgentScopeConfig): Promise<BranchInfo[]> => {
    const { tenantId, projectId, agentId } = params;

    // Get all branches
    const allBranches = await listBranches(db)({ tenantId, projectId });

    const branches: BranchInfo[] = [];

    for (const branch of allBranches) {
      try {
        // Query agent table at the specific branch point
        // Dolt AS OF syntax requires the branch name to be quoted
        const result = await db.execute(
          sql.raw(`SELECT id FROM agent AS OF '${branch.fullName}' WHERE id = '${agentId}'`)
        );
        console.log(result);
        // Check if any rows were returned
        if (result.rows.length > 0) {
          branches.push(branch);
        }
      } catch (error) {
        // If branch doesn't exist or query fails, skip this branch
        // This can happen if a branch was deleted or doesn't have the agent table
        console.debug(`Failed to query agent ${agentId} on branch ${branch.fullName}:`, error);
      }
    }

    return branches;
  };
