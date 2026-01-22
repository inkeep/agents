import { logger } from '@composio/core';
import { sql } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import { doltHashOf } from './commit';
import { resolveRef } from './ref-helpers';

export type branchScopes = {
  tenantId: string;
  projectId: string;
  branchName: string;
};
/**
 * Create a new branch
 */
export const doltBranch =
  (db: AgentsManageDatabaseClient) =>
  async (params: { name: string; startPoint?: string }): Promise<void> => {
    if (params.startPoint) {
      // Get the commit hash of the startPoint (branch, commit, or tag)
      // Dolt requires a commit hash when creating a branch from a start point
      const startPointHash = await doltHashOf(db)({ revision: params.startPoint });
      await db.execute(sql.raw(`SELECT DOLT_BRANCH('${params.name}', '${startPointHash}')`));
    } else {
      await db.execute(sql.raw(`SELECT DOLT_BRANCH('${params.name}')`));
    }
  };

/**
 * Delete a branch
 */
export const doltDeleteBranch =
  (db: AgentsManageDatabaseClient) =>
  async (params: { name: string; force?: boolean }): Promise<void> => {
    const flag = params.force ? '-D' : '-d';
    await db.execute(sql.raw(`SELECT DOLT_BRANCH('${flag}', '${params.name}')`));
  };

/**
 * Rename a branch
 */
export const doltRenameBranch =
  (db: AgentsManageDatabaseClient) =>
  async (params: { oldName: string; newName: string }): Promise<void> => {
    await db.execute(sql.raw(`SELECT DOLT_BRANCH('-m', '${params.oldName}', '${params.newName}')`));
  };

/**
 * List all branches
 */
export const doltListBranches =
  (db: AgentsManageDatabaseClient) =>
  async (): Promise<{ name: string; hash: string; latest_commit_date: Date }[]> => {
    const result = await db.execute(sql`SELECT * FROM dolt_branches`);
    return result.rows as any[];
  };

/**
 * Check if a branch exists
 */
export const doltBranchExists =
  (db: AgentsManageDatabaseClient) =>
  async (params: { name: string }): Promise<boolean> => {
    const result = await db.execute(
      sql.raw(`SELECT * FROM dolt_branches WHERE name = '${params.name}'`)
    );
    return result.rows.length > 0;
  };
/**
 * Checkout a branch or create and checkout a new branch
 */
export const doltCheckout =
  (db: AgentsManageDatabaseClient) =>
  async (params: { branch: string; create?: boolean }): Promise<void> => {
    params.create
      ? await db.execute(sql.raw(`SELECT DOLT_CHECKOUT('-b', '${params.branch}')`))
      : await db.execute(sql.raw(`SELECT DOLT_CHECKOUT('${params.branch}')`));
  };

/**
 * Get the currently active branch
 */
export const doltActiveBranch = (db: AgentsManageDatabaseClient) => async (): Promise<string> => {
  const result = await db.execute(sql`SELECT ACTIVE_BRANCH() as branch`);
  return result.rows[0]?.branch as string;
};

export const doltGetBranchNamespace = (scopes: branchScopes) => (): string => {
  return `${scopes.tenantId}_${scopes.projectId}_${scopes.branchName}`;
};

/**
 * Create a branch if it doesn't exist, handling race conditions gracefully.
 * If multiple concurrent requests try to create the same branch, only one will succeed.
 */
export const ensureBranchExists = async (
  db: AgentsManageDatabaseClient,
  branchName: string
): Promise<void> => {
  const existingBranch = await resolveRef(db)(branchName);
  if (existingBranch) {
    logger.debug({ branchName }, 'Branch already exists, skipping creation');
    return;
  }

  try {
    await doltBranch(db)({ name: branchName });
    logger.debug({ branchName }, 'Branch created successfully');
  } catch (error) {
    const branchNowExists = await resolveRef(db)(branchName);
    if (branchNowExists) {
      logger.debug(
        { branchName },
        'Branch creation failed but branch exists (concurrent creation), continuing'
      );
      return;
    }

    logger.error({ branchName, error }, 'Branch creation failed and branch does not exist');
    throw error;
  }
};
