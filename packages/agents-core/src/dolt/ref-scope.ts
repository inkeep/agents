import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import * as schema from '../db/manage/manage-schema';
import { generateId } from '../utils/conversations';
import { getLogger } from '../utils/logger';
import type { ResolvedRef } from '../validation/dolt-schemas';
import { checkoutBranch } from './branches-api';
import { doltAddAndCommit, doltReset, doltStatus } from './commit';

const logger = getLogger('ref-scope');

/**
 * Context stored in AsyncLocalStorage to detect nested withRef calls
 */
interface RefScopeContext {
  db: AgentsManageDatabaseClient;
  ref: string;
  connectionId: string;
}

/**
 * AsyncLocalStorage to track active ref scope and detect nesting
 */
const refScopeStorage = new AsyncLocalStorage<RefScopeContext>();

/**
 * Error thrown when nested withRef calls are detected with different refs
 */
export class NestedRefScopeError extends Error {
  constructor(existingRef: string, attemptedRef: string) {
    super(
      `Nested withRef detected. Already in ref scope '${existingRef}', attempted to enter '${attemptedRef}'. ` +
        `Either reuse the existing db from the outer scope, or batch your operations in a single withRef call.`
    );
    this.name = 'NestedRefScopeError';
  }
}

/**
 * Options for withRef function
 */
export interface WithRefOptions {
  /**
   * Whether to auto-commit changes after successful callback execution.
   * Only applies to branch refs (tags/commits are immutable).
   * @default false
   */
  commit?: boolean;

  /**
   * Commit message to use when committing changes.
   * @default 'withRef auto-commit'
   */
  commitMessage?: string;

  /**
   * Author information for the commit.
   * @default { name: 'agents-api', email: 'api@inkeep.com' }
   */
  author?: {
    name: string;
    email: string;
  };
}

/**
 * Execute a function with a database connection scoped to a specific ref (branch/tag/commit).
 *
 * This function:
 * 1. Gets a dedicated connection from the pool
 * 2. For branches: checks out the branch directly
 * 3. For tags/commits: creates a temporary branch from the hash, then checks out
 * 4. Executes the callback with a Drizzle client scoped to that connection
 * 5. Optionally auto-commits changes on success (if commit: true)
 * 6. Cleans up: checks out main, deletes temp branch if created, releases connection
 *
 * Important:
 * - The callback should only perform database operations
 * - Do NOT hold the connection while making external API calls
 *
 * @param pool - The PostgreSQL connection pool
 * @param resolvedRef - The resolved ref (branch, tag, or commit)
 * @param dataAccessFn - The function to execute with the scoped database client
 * @param options - Optional configuration for commit behavior
 * @returns The result of the callback function
 *
 * @example
 * ```typescript
 * // Simple read (no commit)
 * const agent = await withRef(pool, resolvedRef, (db) =>
 *   getAgent(db, agentId)
 * );
 *
 * // Write with auto-commit
 * await withRef(pool, resolvedRef, async (db) => {
 *   await updateAgent(db, agentId, data);
 * }, { commit: true, commitMessage: 'Update agent config' });
 *
 * // Batch multiple operations with commit
 * const result = await withRef(pool, resolvedRef, async (db) => {
 *   await createCredential(db, credData);
 *   await updateTool(db, toolId, { credentialId });
 *   return { success: true };
 * }, { commit: true, author: { name: 'oauth', email: 'oauth@inkeep.com' } });
 * ```
 */
export async function withRef<T>(
  pool: Pool,
  resolvedRef: ResolvedRef,
  dataAccessFn: (db: AgentsManageDatabaseClient) => Promise<T>,
  options?: WithRefOptions
): Promise<T> {
  const { commit = false, commitMessage = 'withRef auto-commit', author } = options ?? {};
  const startTime = Date.now();
  const connectionId = generateId();

  // Check for nested calls
  const existingScope = refScopeStorage.getStore();
  if (existingScope) {
    if (existingScope.ref === resolvedRef.name) {
      logger.debug(
        { ref: resolvedRef.name, existingConnectionId: existingScope.connectionId },
        'Reusing existing ref scope'
      );
      return dataAccessFn(existingScope.db);
    }
    throw new NestedRefScopeError(existingScope.ref, resolvedRef.name);
  }

  // Test environment bypass - skip branch operations
  if (process.env.ENVIRONMENT === 'test') {
    const connection = await pool.connect();
    try {
      const db = drizzle(connection, { schema }) as unknown as AgentsManageDatabaseClient;
      return await refScopeStorage.run({ db, ref: resolvedRef.name, connectionId }, () =>
        dataAccessFn(db)
      );
    } finally {
      connection.release();
    }
  }

  logger.debug(
    { ref: resolvedRef.name, refType: resolvedRef.type, connectionId },
    'Acquiring connection for ref scope'
  );

  const connection: PoolClient = await pool.connect();
  let tempBranch: string | null = null;

  try {
    const db = drizzle(connection, { schema }) as unknown as AgentsManageDatabaseClient;

    if (resolvedRef.type === 'branch') {
      logger.debug({ branch: resolvedRef.name, connectionId }, 'Checking out branch');
      await checkoutBranch(db)({ branchName: resolvedRef.name, syncSchema: false });
    } else {
      // For tags/commits, create temporary branch from the hash
      // Include timestamp for easier cleanup of orphaned branches
      tempBranch = `temp_${resolvedRef.type}_${Date.now()}_${generateId()}`;
      logger.debug(
        { tempBranch, hash: resolvedRef.hash, refType: resolvedRef.type, connectionId },
        'Creating temporary branch from ref'
      );
      await connection.query(`SELECT DOLT_CHECKOUT('-b', $1, $2)`, [tempBranch, resolvedRef.hash]);
    }

    // Execute the callback within the AsyncLocalStorage context
    const result = await refScopeStorage.run({ db, ref: resolvedRef.name, connectionId }, () =>
      dataAccessFn(db)
    );

    // Auto-commit for successful operations on branches (if commit: true)
    if (commit && resolvedRef.type === 'branch') {
      try {
        const statusResult = await doltStatus(db)();

        if (statusResult.length > 0) {
          logger.info(
            { branch: resolvedRef.name, message: commitMessage, connectionId },
            'Auto-committing changes'
          );

          await doltAddAndCommit(db)({
            message: commitMessage,
            author: author ?? {
              name: 'agents-api',
              email: 'api@inkeep.com',
            },
          });

          logger.info({ branch: resolvedRef.name, connectionId }, 'Successfully committed changes');
        }
      } catch (commitError) {
        // Log but don't fail - the operation already succeeded
        logger.error(
          { error: commitError, branch: resolvedRef.name, connectionId },
          'Failed to auto-commit changes'
        );
      }
    }

    logger.debug(
      { ref: resolvedRef.name, duration: Date.now() - startTime, connectionId },
      'Ref scope completed successfully'
    );

    return result;
  } catch (error) {
    // Reset uncommitted changes on failure (if commit mode was enabled)
    if (commit && resolvedRef.type === 'branch') {
      try {
        const db = drizzle(connection, { schema }) as unknown as AgentsManageDatabaseClient;
        const statusResult = await doltStatus(db)();

        if (statusResult.length > 0) {
          await doltReset(db)();
          logger.info(
            { branch: resolvedRef.name, connectionId },
            'Reset uncommitted changes due to failed operation'
          );
        }
      } catch (resetError) {
        logger.error(
          { error: resetError, branch: resolvedRef.name, connectionId },
          'Failed to reset changes after error'
        );
      }
    }

    logger.error(
      { ref: resolvedRef.name, duration: Date.now() - startTime, connectionId, error },
      'Ref scope failed'
    );
    throw error;
  } finally {
    // Cleanup: checkout main, delete temp branch, release connection
    try {
      await connection.query(`SELECT DOLT_CHECKOUT('main')`);

      if (tempBranch) {
        logger.debug({ tempBranch, connectionId }, 'Deleting temporary branch');
        await connection.query(`SELECT DOLT_BRANCH('-D', $1)`, [tempBranch]);
      }
    } catch (cleanupError) {
      logger.error(
        { error: cleanupError, tempBranch, connectionId },
        'Error during ref scope cleanup'
      );
    } finally {
      connection.release();
      logger.debug(
        { ref: resolvedRef.name, duration: Date.now() - startTime, connectionId },
        'Connection released'
      );
    }
  }
}

/**
 * Check if currently inside a withRef scope
 */
export function isInRefScope(): boolean {
  return refScopeStorage.getStore() !== undefined;
}

/**
 * Get the current ref scope context if inside one
 */
export function getCurrentRefScope(): RefScopeContext | undefined {
  return refScopeStorage.getStore();
}

/**
 * Get the database client from the current ref scope.
 * Throws if not inside a withRef scope.
 */
export function getRefScopedDb(): AgentsManageDatabaseClient {
  const scope = refScopeStorage.getStore();
  if (!scope) {
    throw new Error(
      'Not inside a withRef scope. Wrap your code in withRef() to get a ref-scoped database client.'
    );
  }
  return scope.db;
}
