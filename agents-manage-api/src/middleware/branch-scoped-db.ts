import type { DatabaseClient, ResolvedRef } from '@inkeep/agents-core';
import { doltAddAndCommit, doltStatus } from '@inkeep/agents-core';
import * as schema from '@inkeep/agents-core/schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Context, Next } from 'hono';
import type { Pool, PoolClient } from 'pg';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

const logger = getLogger('branch-scoped-db');

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
  const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  // Get connection pool from dbClient
  const pool = getPoolFromClient(dbClient);
  if (!pool) {
    logger.error({}, 'Could not get connection pool from dbClient');
    c.set('db', dbClient);
    await next();
    return;
  }

  if (process.env.ENVIRONMENT === 'test') {
    c.set('db', dbClient);
    await next();
    return;
  }

  // Get a dedicated connection from the pool
  const connection: PoolClient = await pool.connect();
  let tempBranch: string | null = null;

  try {
    // Checkout the appropriate ref on this connection
    if (resolvedRef.type === 'branch') {
      logger.debug({ branch: resolvedRef.name }, 'Checking out branch');
      await connection.query(`SELECT DOLT_CHECKOUT($1)`, [resolvedRef.name]);
    } else {
      // For tags/commits, create temporary branch (needed for reads)
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T.]/g, '')
        .slice(0, 14);
      tempBranch = `temp_${resolvedRef.type}_${resolvedRef.hash}_${timestamp}`;
      logger.debug({ tempBranch, hash: resolvedRef.hash }, 'Creating temporary branch');
      await connection.query(`SELECT DOLT_CHECKOUT('-b', $1, $2)`, [tempBranch, resolvedRef.hash]);
    }

    // Create request-scoped Drizzle client wrapping this specific connection
    const requestDb = drizzle(connection, { schema });
    c.set('db', requestDb);

    // Execute the route handler
    await next();

    // Auto-commit for successful writes on branches
    const status = c.res.status;
    const shouldCommit =
      isWriteOperation && resolvedRef.type === 'branch' && status >= 200 && status < 300;

    if (shouldCommit) {
      try {
        // Check if there are uncommitted changes
        const statusResult = await doltStatus(requestDb)();

        if (statusResult.length > 0) {
          const path = c.req.path;
          const commitMessage = generateCommitMessage(method, path);

          logger.info(
            { branch: resolvedRef.name, message: commitMessage },
            'Auto-committing changes'
          );

          await doltAddAndCommit(requestDb)({
            message: commitMessage,
            author: {
              name: 'agents-manage-api',
              email: 'api@inkeep.com',
            },
          });

          logger.info({ branch: resolvedRef.name }, 'Successfully committed changes');
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
