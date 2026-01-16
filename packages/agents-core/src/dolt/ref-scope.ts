import { AsyncLocalStorage } from 'async_hooks';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import * as schema from '../db/manage/manage-schema';
import { getLogger } from '../utils/logger';
import { generateId } from '../utils/conversations';
import type { ResolvedRef } from '../validation/dolt-schemas';
import { checkoutBranch } from './branches-api';

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
 * Execute a function with a database connection scoped to a specific ref (branch/tag/commit).
 *
 * This function:
 * 1. Gets a dedicated connection from the pool
 * 2. For branches: checks out the branch directly
 * 3. For tags/commits: creates a temporary branch from the hash, then checks out
 * 4. Executes the callback with a Drizzle client scoped to that connection
 * 5. Cleans up: checks out main, deletes temp branch if created, releases connection
 *
 * Important:
 * - The callback should only perform database operations
 * - Do NOT hold the connection while making external API calls
 * - Use this for reads; for writes that need auto-commit, use the branch-scoped middleware
 *
 * @param pool - The PostgreSQL connection pool
 * @param resolvedRef - The resolved ref (branch, tag, or commit)
 * @param dataAccessFn - The function to execute with the scoped database client
 * @returns The result of the callback function
 *
 * @example
 * ```typescript
 * // Simple read
 * const agent = await withRef(pool, resolvedRef, (db) =>
 *   getAgent(db, agentId)
 * );
 *
 * // Batch multiple reads
 * const { agent, tools } = await withRef(pool, resolvedRef, async (db) => {
 *   const [agent, tools] = await Promise.all([
 *     getAgent(db, agentId),
 *     getTools(db, projectId),
 *   ]);
 *   return { agent, tools };
 * });
 * ```
 */
export async function withRef<T>(
  pool: Pool,
  resolvedRef: ResolvedRef,
  dataAccessFn: (db: AgentsManageDatabaseClient) => Promise<T>,
): Promise<T> {
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
      return await refScopeStorage.run({ db, ref: resolvedRef.name, connectionId }, () => dataAccessFn(db));
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

    logger.debug(
      { ref: resolvedRef.name, duration: Date.now() - startTime, connectionId },
      'Ref scope completed successfully'
    );

    return result;
  } catch (error) {
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
