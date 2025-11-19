import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import type { DatabaseClient } from '../db/client';
import * as schema from '../db/schema';
import type { ResolvedRef } from '../dolt/ref';
import { resolveRef } from '../dolt/ref';
import { getLogger } from '../utils/logger';

const logger = getLogger('branch-scoped-executor');

/**
 * Get the underlying connection pool from a Drizzle database client
 */
function getPoolFromClient(client: DatabaseClient): Pool | null {
  if ('$client' in client && client.$client) {
    return client.$client as Pool;
  }
  return null;
}

/**
 * Options for executing code within a branch context
 */
export interface BranchScopedExecuteOptions {
  /**
   * The base database client (used to get the connection pool)
   */
  dbClient: DatabaseClient;
  /**
   * The ref to checkout (branch name, tag, or commit hash)
   * If a string is provided, it will be resolved to a ResolvedRef
   */
  ref: ResolvedRef;
  /**
   * Whether to auto-commit changes after execution (default: false)
   */
  autoCommit?: boolean;
  /**
   * Commit message for auto-commit (required if autoCommit is true)
   */
  commitMessage?: string;
}

/**
 * Executes a function within a branch-scoped database context
 *
 * This function:
 * 1. Gets a connection from the pool
 * 2. Checks out the specified ref (branch/tag/commit)
 * 3. Creates a branch-scoped Drizzle client
 * 4. Executes the provided function with the branch-scoped client
 * 5. Optionally auto-commits changes
 * 6. Cleans up by checking out main and releasing the connection
 *
 * @example
 *script
 * const result = await executeInBranch({
 *   dbClient: mainDb,
 *   ref: 'default_my-project_main',
 *   autoCommit: true,
 *   commitMessage: 'Created task via API'
 * }, async (branchDb) => {
 *   return await createTask(branchDb)({
 *     id: 'task-123',
 *     tenantId: 'default',
 *     projectId: 'my-project',
 *     // ... other fields
 *   });
 * });
 *  */
export async function executeInBranch<T>(
  options: BranchScopedExecuteOptions,
  fn: (branchDb: DatabaseClient) => Promise<T>
): Promise<T> {
  const { dbClient, ref, autoCommit = false, commitMessage } = options;

  // Get connection pool from dbClient
  const pool = getPoolFromClient(dbClient);
  if (!pool) {
    throw new Error('Could not get connection pool from dbClient');
  }

  // Skip branch checkout in test environment
  if (process.env.ENVIRONMENT === 'test') {
    return fn(dbClient);
  }

  // Resolve ref if it's a string
  let resolvedRef: ResolvedRef;
  if (typeof ref === 'string') {
    const refResult = await resolveRef(dbClient)(ref);
    if (!refResult) {
      throw new Error(`Failed to resolve ref: ${ref}`);
    }
    resolvedRef = refResult;
  } else {
    resolvedRef = ref;
  }

  // Get a dedicated connection from the pool
  const connection: PoolClient = await pool.connect();
  let tempBranch: string | null = null;

  try {
    // Checkout the appropriate ref on this connection
    if (resolvedRef.type === 'branch') {
      logger.debug({ branch: resolvedRef.name }, 'Checking out branch for execution');
      await connection.query(`SELECT DOLT_CHECKOUT($1)`, [resolvedRef.name]);
    } else {
      // For tags/commits, create temporary branch (needed for reads/writes)
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T.]/g, '')
        .slice(0, 14);
      tempBranch = `temp_${resolvedRef.type}_${resolvedRef.hash}_${timestamp}`;
      logger.debug(
        { tempBranch, hash: resolvedRef.hash },
        'Creating temporary branch for execution'
      );
      await connection.query(`SELECT DOLT_CHECKOUT('-b', $1, $2)`, [tempBranch, resolvedRef.hash]);
    }

    // Verify checkout succeeded
    const branchCheck = await connection.query(`SELECT active_branch()`);
    logger.debug({ activeBranch: branchCheck.rows[0]?.active_branch }, 'Verified branch checkout');

    // Create branch-scoped Drizzle client wrapping this specific connection
    const branchDb = drizzle(connection, { schema });

    // Execute the provided function with the branch-scoped client
    const result = await fn(branchDb);

    // Auto-commit if requested
    if (autoCommit && resolvedRef.type === 'branch') {
      if (!commitMessage) {
        throw new Error('commitMessage is required when autoCommit is true');
      }

      try {
        const { doltStatus, doltAddAndCommit } = await import('../dolt/commit');
        const statusResult = await doltStatus(branchDb)();

        if (statusResult.length > 0) {
          logger.info(
            { branch: resolvedRef.name, message: commitMessage },
            'Auto-committing changes after branch execution'
          );

          await doltAddAndCommit(branchDb)({
            message: commitMessage,
            author: {
              name: 'branch-scoped-executor',
              email: 'executor@inkeep.com',
            },
          });

          logger.info({ branch: resolvedRef.name }, 'Successfully committed changes');
        }
      } catch (error) {
        logger.error({ error, branch: resolvedRef.name }, 'Failed to auto-commit changes');
        throw error;
      }
    }

    return result;
  } finally {
    // Always cleanup: checkout main and release connection
    try {
      await connection.query(`SELECT DOLT_CHECKOUT('main')`);

      if (tempBranch) {
        await connection.query(`SELECT DOLT_BRANCH('-D', $1)`, [tempBranch]);
      }
    } catch (cleanupError) {
      logger.error({ error: cleanupError }, 'Error during connection cleanup');
    } finally {
      connection.release();
    }
  }
}
