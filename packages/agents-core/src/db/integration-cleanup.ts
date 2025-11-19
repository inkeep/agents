import { sql } from 'drizzle-orm';
import { loadEnvironmentFiles } from '../env';
import type { DatabaseClient } from './client';
import { createDatabaseClient } from './client';

loadEnvironmentFiles();

/**
 * Get a database client for cleanup operations
 * Allows passing a custom client or uses a default one
 */
export const getIntegrationTestClient = (db?: DatabaseClient): DatabaseClient => {
  if (db) return db;
  return createDatabaseClient({ connectionString: process.env.DATABASE_URL });
};

/**
 * Delete all branches matching a prefix pattern
 * Used for cleaning up integration test data
 */
export const cleanupBranchesByPrefix = async (
  prefix: string,
  db?: DatabaseClient
): Promise<void> => {
  const dbClient = getIntegrationTestClient(db);
  try {
    // Get all branches matching the prefix
    const branches = await dbClient.execute(
      sql.raw(`SELECT name FROM dolt_branches WHERE name LIKE '${prefix}%'`)
    );

    // Delete each branch (force delete with -D flag)
    for (const branch of branches.rows) {
      const branchName = (branch as any).name;
      try {
        await dbClient.execute(sql.raw(`CALL DOLT_BRANCH('-D', '${branchName}')`));
      } catch (error) {
        // Ignore errors (e.g., trying to delete current branch)
        console.debug(`Could not delete branch ${branchName}:`, error);
      }
    }
  } catch (error) {
    console.error(`Error cleaning up branches with prefix ${prefix}:`, error);
  }
};

/**
 * Delete all tags matching a prefix pattern
 * Used for cleaning up integration test data
 */
export const cleanupTagsByPrefix = async (prefix: string, db?: DatabaseClient): Promise<void> => {
  const dbClient = getIntegrationTestClient(db);
  try {
    // Get all tags matching the prefix
    const tags = await dbClient.execute(
      sql.raw(`SELECT tag_name FROM dolt_tags WHERE tag_name LIKE '${prefix}%'`)
    );

    // Delete each tag
    for (const tag of tags.rows) {
      const tagName = (tag as any).tag_name;
      try {
        await dbClient.execute(sql.raw(`CALL DOLT_TAG('-d', '${tagName}')`));
      } catch (error) {
        console.debug(`Could not delete tag ${tagName}:`, error);
      }
    }
  } catch (error) {
    console.error(`Error cleaning up tags with prefix ${prefix}:`, error);
  }
};

/**
 * Delete specific branches by name
 * Used for cleaning up integration test data
 */
export const cleanupBranches = async (
  branchNames: Set<string>,
  db?: DatabaseClient
): Promise<void> => {
  const dbClient = getIntegrationTestClient(db);
  for (const branchName of branchNames) {
    try {
      await dbClient.execute(sql.raw(`CALL DOLT_BRANCH('-D', '${branchName}')`));
    } catch (error) {
      console.debug(`Could not delete branch ${branchName}:`, error);
    }
  }
};

/**
 * Delete specific tags by name
 * Used for cleaning up integration test data
 */
export const cleanupTags = async (tagNames: Set<string>, db?: DatabaseClient): Promise<void> => {
  const dbClient = getIntegrationTestClient(db);
  for (const tagName of tagNames) {
    try {
      await dbClient.execute(sql.raw(`CALL DOLT_TAG('-d', '${tagName}')`));
    } catch (error) {
      console.debug(`Could not delete tag ${tagName}:`, error);
    }
  }
};

/**
 * Comprehensive cleanup for test data by prefix
 * Used for cleaning up integration test data
 */
export const cleanupTestData = async (
  prefix: string,
  branches?: Set<string>,
  tags?: Set<string>,
  db?: DatabaseClient
): Promise<void> => {
  // Clean up specific tags first
  if (tags && tags.size > 0) {
    await cleanupTags(tags, db);
  }

  // Clean up tags by prefix
  await cleanupTagsByPrefix(prefix, db);

  // Clean up specific branches
  if (branches && branches.size > 0) {
    await cleanupBranches(branches, db);
  }

  // Clean up branches by prefix
  await cleanupBranchesByPrefix(prefix, db);
};

/**
 * Delete all branches matching a tenant prefix
 * Used for cleaning up integration test data
 */
export const cleanupTenantBranches = async (
  tenantId: string,
  db?: DatabaseClient
): Promise<void> => {
  const dbClient = getIntegrationTestClient(db);
  try {
    // Get all branches for this tenant
    const pattern = `${tenantId}_%`;
    const branches = await dbClient.execute(
      sql.raw(`SELECT name FROM dolt_branches WHERE name LIKE '${pattern}'`)
    );

    // Delete each branch (force delete with -D flag)
    for (const branch of branches.rows) {
      const branchName = (branch as any).name;
      try {
        await dbClient.execute(sql.raw(`CALL DOLT_BRANCH('-D', '${branchName}')`));
      } catch (error) {
        // Ignore errors (e.g., trying to delete current branch)
        console.debug(`Could not delete branch ${branchName}:`, error);
      }
    }
  } catch (error) {
    console.error(`Error cleaning up branches for tenant ${tenantId}:`, error);
  }
};

/**
 * Comprehensive cleanup for a tenant: deletes tags and branches
 * Used for cleaning up integration test data
 */
export const cleanupTenant = async (
  tenantId: string,
  tagNames?: Set<string>,
  db?: DatabaseClient
): Promise<void> => {
  try {
    // Delete all tags first (if provided)
    if (tagNames && tagNames.size > 0) {
      await cleanupTags(tagNames, db);
    }

    // Then delete all branches for this tenant
    await cleanupTenantBranches(tenantId, db);
  } catch (error) {
    console.error(`Error cleaning up tenant ${tenantId}:`, error);
  }
};

/**
 * Cleanup multiple tenants
 * Used for cleaning up integration test data
 */
export const cleanupTenants = async (
  tenantIds: Set<string>,
  tagNames?: Set<string>,
  db?: DatabaseClient
): Promise<void> => {
  // Clean up tags first
  if (tagNames && tagNames.size > 0) {
    await cleanupTags(tagNames, db);
  }

  // Then clean up all tenant branches
  for (const tenantId of tenantIds) {
    await cleanupTenantBranches(tenantId, db);
  }
};
