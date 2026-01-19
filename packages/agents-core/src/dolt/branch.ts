import { sql } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import { doltHashOf } from './commit';

// Cache the Dolt detection result to avoid checking on every withBranch call
// WeakMap allows garbage collection of db instances while caching results
const isDoltCache = new WeakMap<AgentsManageDatabaseClient, boolean>();

// In test environments (PGlite), skip Dolt operations entirely
const isTestEnvironment = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

/**
 * Check if the database supports Dolt operations (cached per db instance)
 */
async function checkIsDolt(db: AgentsManageDatabaseClient): Promise<boolean> {
  // In test environment, always return false (PGlite doesn't support Dolt)
  if (isTestEnvironment) {
    return false;
  }

  // Check cache first
  const cached = isDoltCache.get(db);
  if (cached !== undefined) {
    return cached;
  }

  // Check if ACTIVE_BRANCH() is available
  let isDolt = true;
  try {
    await db.execute(sql`SELECT ACTIVE_BRANCH() as branch`);
  } catch {
    isDolt = false;
  }

  // Cache the result
  isDoltCache.set(db, isDolt);
  return isDolt;
}

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
 * Execute a callback function with the database connection on a specific branch.
 * After the callback completes (success or error), the connection is returned to the original branch.
 *
 * @param db - The database client
 * @param branchName - The branch to checkout before executing the callback
 * @param callback - The async function to execute while on the specified branch
 * @returns The result of the callback function
 *
 * @example
 * ```ts
 * const result = await withBranch(db)({
 *   branchName: 'default_andrew1_main',
 *   callback: async () => {
 *     return await getFullProjectWithRelationIds(db)({ scopes });
 *   },
 * });
 * ```
 */
/**
 * Execute a callback function with the database connection on a specific branch.
 *
 * IMPORTANT: This function uses a transaction to ensure all queries within the callback
 * run on the same database connection. This is critical because DoltGres branching is
 * connection-scoped - a DOLT_CHECKOUT only affects the specific connection that runs it.
 * Without a transaction, subsequent queries might use different connections from the pool
 * that are still on the original branch.
 *
 * After the callback completes (success or error), the connection is returned to the original branch.
 *
 * @param db - The database client
 * @param branchName - The branch to checkout before executing the callback
 * @param callback - The async function to execute while on the specified branch
 * @returns The result of the callback function
 *
 * @example
 * ```ts
 * const result = await withBranch(db)({
 *   branchName: 'default_andrew1_main',
 *   callback: async (txDb) => {
 *     return await getFullProjectWithRelationIds(txDb)({ scopes });
 *   },
 * });
 * ```
 */
export const withBranch =
  (db: AgentsManageDatabaseClient) =>
  async <T>(params: {
    branchName: string;
    callback: (txDb: AgentsManageDatabaseClient) => Promise<T>;
  }): Promise<T> => {
    const { branchName, callback } = params;

    // Check if Dolt is available (cached check, skipped entirely in test environment)
    const isDolt = await checkIsDolt(db);

    // If not on Dolt, just run the callback directly without branch operations
    if (!isDolt) {
      return callback(db);
    }

    // Use a transaction to ensure all queries run on the same connection
    // This is critical because DOLT_CHECKOUT is connection-scoped
    return db.transaction(async (tx) => {
      // Get the current branch
      const originalBranchResult = await tx.execute(sql`SELECT ACTIVE_BRANCH() as branch`);
      const originalBranch = originalBranchResult.rows[0]?.branch as string;

      // If already on the target branch, just run the callback
      if (originalBranch === branchName) {
        return callback(tx as unknown as AgentsManageDatabaseClient);
      }

      try {
        // Checkout the target branch on this connection
        await tx.execute(sql.raw(`SELECT DOLT_CHECKOUT('${branchName}')`));

        // Execute the callback with the transaction connection
        return await callback(tx as unknown as AgentsManageDatabaseClient);
      } finally {
        // Restore the original branch
        if (originalBranch !== branchName) {
          await tx.execute(sql.raw(`SELECT DOLT_CHECKOUT('${originalBranch}')`));
        }
      }
    });
  };

/**
 * Generate the standard project branch name from tenant and project IDs.
 * Format: {tenantId}_{projectId}_main
 */
export const getProjectBranchName = (tenantId: string, projectId: string): string => {
  return `${tenantId}_${projectId}_main`;
};
