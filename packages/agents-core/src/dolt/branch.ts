import type { DatabaseClient } from '../db/client';
import { sql } from 'drizzle-orm';

export type branchScopes = {
  tenantId: string;
  projectId: string;
  userId: string;
  branchName: string;
};
/**
 * Create a new branch
 */
export const doltBranch =
  (db: DatabaseClient) =>
  async (params: { name: string; startPoint?: string }): Promise<void> => {
    if (params.startPoint) {
      await db.execute(sql.raw(`CALL DOLT_BRANCH('${params.name}', '${params.startPoint}')`));
    } else {
      await db.execute(sql.raw(`CALL DOLT_BRANCH('${params.name}')`));
    }
  };

/**
 * Delete a branch
 */
export const doltDeleteBranch =
  (db: DatabaseClient) =>
  async (params: { name: string; force?: boolean }): Promise<void> => {
    const flag = params.force ? '-D' : '-d';
    await db.execute(sql.raw(`CALL DOLT_BRANCH('${flag}', '${params.name}')`));
  };

/**
 * Rename a branch
 */
export const doltRenameBranch =
  (db: DatabaseClient) =>
  async (params: { oldName: string; newName: string }): Promise<void> => {
    await db.execute(sql.raw(`CALL DOLT_BRANCH('-m', '${params.oldName}', '${params.newName}')`));
  };

/**
 * List all branches
 */
export const doltListBranches =
  (db: DatabaseClient) =>
  async (): Promise<{ name: string; hash: string; latest_commit_date: Date }[]> => {
    const result = await db.execute(sql`SELECT * FROM dolt_branches`);
    return result.rows as any[];
  };

/**
 * Checkout a branch or create and checkout a new branch
 */
export const doltCheckout =
  (db: DatabaseClient) =>
  async (params: { branch: string; create?: boolean }): Promise<void> => {
    params.create
      ? await db.execute(sql.raw(`CALL DOLT_CHECKOUT('-b', '${params.branch}')`))
      : await db.execute(sql.raw(`CALL DOLT_CHECKOUT('${params.branch}')`));
  };

/**
 * Get the currently active branch
 */
export const doltActiveBranch = (db: DatabaseClient) => async (): Promise<string> => {
  const result = await db.execute(sql`SELECT ACTIVE_BRANCH() as branch`);
  return result.rows[0]?.branch as string;
};

export const doltGetBranchNamespace = (scopes: branchScopes) => (): string => {
  return `${scopes.tenantId}_${scopes.projectId}_${scopes.userId}_${scopes.branchName}`;
};