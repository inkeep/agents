import { sql } from 'drizzle-orm';
import dbClient from '../../data/db/dbClient';

/**
 * Delete all branches matching a tenant prefix
 * Used for cleaning up integration test data
 */
export const cleanupTenantBranches = async (tenantId: string): Promise<void> => {
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
 * Delete specific tags by name
 * Used for cleaning up integration test data
 */
export const cleanupTags = async (tagNames: Set<string> | string[]): Promise<void> => {
  try {
    for (const tagName of tagNames) {
      try {
        await dbClient.execute(sql.raw(`CALL DOLT_TAG('-d', '${tagName}')`));
      } catch (error) {
        console.debug(`Could not delete tag ${tagName}:`, error);
      }
    }
  } catch (error) {
    console.error('Error cleaning up tags:', error);
  }
};

/**
 * Comprehensive cleanup for a tenant: deletes tags and branches
 * Used for cleaning up integration test data
 */
export const cleanupTenant = async (tenantId: string, tagNames?: Set<string>): Promise<void> => {
  try {
    // Delete all tags first (if provided)
    if (tagNames && tagNames.size > 0) {
      await cleanupTags(tagNames);
    }

    // Then delete all branches for this tenant
    await cleanupTenantBranches(tenantId);
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
  tagNames?: Set<string>
): Promise<void> => {
  // Clean up tags first
  if (tagNames && tagNames.size > 0) {
    await cleanupTags(tagNames);
  }

  // Then clean up all tenant branches
  for (const tenantId of tenantIds) {
    await cleanupTenantBranches(tenantId);
  }
};
