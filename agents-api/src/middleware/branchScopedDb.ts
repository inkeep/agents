import type { AgentsManageDatabaseClient, ResolvedRef } from '@inkeep/agents-core';
import {
  checkoutBranch,
  doltAddAndCommit,
  doltReset,
  doltStatus,
  generateId,
} from '@inkeep/agents-core';
import * as schema from '@inkeep/agents-core/db/manage-schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Context, Next } from 'hono';
import type { Pool, PoolClient } from 'pg';
import manageDbClient from '../data/db/manageDbClient';
import { getLogger } from '../logger';

const logger = getLogger('branch-scoped-db');

export function isProjectDeleteOperation(path: string, method: string): boolean {
  const projectDeletePattern = /^\/tenants\/[^/]+\/(?:projects|project-full)\/[^/]+\/?$/;
  return method.toUpperCase() === 'DELETE' && projectDeletePattern.test(path);
}

/**
 * Get the underlying connection pool from a Drizzle database client
 */
export function getPoolFromClient(client: AgentsManageDatabaseClient): Pool | null {
  if ('$client' in client && client.$client) {
    return client.$client as Pool;
  }
  return null;
}

/**
 * Middleware that provides branch-scoped database connections
 *
 * Flow:
 * 1. Get a dedicated connection from the pool
 * 2. If ref is specified, checkout that branch/tag/commit on this connection
 * 3. Create a Drizzle client wrapping this specific connection
 * 4. Inject into context as 'db' (request-scoped database client)
 * 5. Execute the route handler
 * 6. For write operations on branches: auto-commit changes
 * 7. Always cleanup: checkout main and release connection
 *
 * This ensures:
 * - All operations in a request use the same connection (correct)
 * - Only one checkout per request (performant)
 * - Automatic commits for successful writes on branches
 * - Proper connection cleanup
 */
export const branchScopedDbMiddleware = async (c: Context, next: Next) => {
  const resolvedRef = c.get('resolvedRef') as ResolvedRef;
  const method = c.req.method;
  const userId = c.get('userId') as string;
  const userEmail = c.get('userEmail') as string;

  // Get connection pool from dbClient
  const pool = getPoolFromClient(manageDbClient);
  if (!pool) {
    logger.error({}, 'Could not get connection pool from dbClient');
    c.set('db', manageDbClient);
    await next();
    return;
  }

  if (process.env.ENVIRONMENT === 'test') {
    c.set('db', manageDbClient);
    await next();
    return;
  }

  // Get a dedicated connection from the pool
  const connection: PoolClient = await pool.connect();
  let tempBranch: string | null = null;

  try {
    // Create a Drizzle client wrapping this specific connection
    const requestDb = drizzle(connection, { schema }) as unknown as AgentsManageDatabaseClient;

    if (resolvedRef.type === 'branch') {
      logger.debug({ branch: resolvedRef.name }, 'Checking out branch');
      await checkoutBranch(requestDb)({ branchName: resolvedRef.name, autoCommitPending: true });
    } else {
      // For tags/commits, create temporary branch (needed for reads)
      tempBranch = `temp_${resolvedRef.type}_${resolvedRef.hash}_${generateId()}`;
      logger.debug({ tempBranch, hash: resolvedRef.hash }, 'Creating temporary branch');
      await connection.query(`SELECT DOLT_CHECKOUT('-b', $1, $2)`, [tempBranch, resolvedRef.hash]);
    }

    // Create request-scoped Drizzle client wrapping this specific connection
    c.set('db', requestDb);

    // Execute the route handler
    await next();

    // Auto-commit for successful writes on branches (skip for read-only methods)
    const isReadMethod = method === 'GET' || method === 'HEAD';
    const status = c.res.status;
    const projectDeleteOperation = isProjectDeleteOperation(c.req.path, method);
    const operationSuccess = status >= 200 && status < 300;
    const shouldCommit =
      resolvedRef.type === 'branch' && operationSuccess && !projectDeleteOperation && !isReadMethod;

    if (shouldCommit) {
      try {
        // Check if there are uncommitted changes
        const statusResult = await doltStatus(requestDb)();

        // If there are uncommitted changes and the operation was successful, commit the changes
        if (statusResult.length > 0 && operationSuccess) {
          const path = c.req.path;
          const commitMessage = generateCommitMessage(method, path);

          logger.info(
            { branch: resolvedRef.name, message: commitMessage },
            'Auto-committing changes'
          );

          await doltAddAndCommit(requestDb)({
            message: commitMessage,
            author: {
              name: userId ?? 'agents-api',
              email: userEmail ?? 'api@inkeep.com',
            },
          });

          logger.info({ branch: resolvedRef.name }, 'Successfully committed changes');
        } else if (statusResult.length > 0 && !operationSuccess) {
          await doltReset(requestDb)();
          logger.info(
            { branch: resolvedRef.name },
            'Successfully reset changes due to failed operation'
          );
        }
      } catch (error) {
        // Log but don't fail - the write already succeeded
        logger.error({ error, branch: resolvedRef.name }, 'Failed to auto-commit changes');
      }
    }
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
};

/**
 * Generate a commit message based on HTTP method and path
 */
function generateCommitMessage(method: string, path: string): string {
  // Extract resource info from path

  let operation: string;
  switch (method) {
    case 'POST':
      operation = 'Create';
      break;
    case 'PUT':
    case 'PATCH':
      operation = 'Update';
      break;
    case 'DELETE':
      operation = 'Delete';
      break;
    default:
      operation = method;
  }

  return `${operation} ${path} via API`;
}
