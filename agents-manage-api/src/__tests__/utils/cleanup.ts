import {
  cleanupTags as coreCleanupTags,
  cleanupTenant as coreCleanupTenant,
  cleanupTenantBranches as coreCleanupTenantBranches,
  cleanupTenants as coreCleanupTenants,
} from '@inkeep/agents-core';
import dbClient from '../../data/db/dbClient';

/**
 * Delete all branches matching a tenant prefix
 * Used for cleaning up integration test data
 */
export const cleanupTenantBranches = async (tenantId: string): Promise<void> => {
  await coreCleanupTenantBranches(tenantId, dbClient);
};

/**
 * Delete specific tags by name
 * Used for cleaning up integration test data
 */
export const cleanupTags = async (tagNames: Set<string>): Promise<void> => {
  await coreCleanupTags(tagNames, dbClient);
};

/**
 * Comprehensive cleanup for a tenant: deletes tags and branches
 * Used for cleaning up integration test data
 */
export const cleanupTenant = async (tenantId: string, tagNames?: Set<string>): Promise<void> => {
  await coreCleanupTenant(tenantId, tagNames, dbClient);
};

/**
 * Cleanup multiple tenants
 * Used for cleaning up integration test data
 */
export const cleanupTenants = async (
  tenantIds: Set<string>,
  tagNames?: Set<string>
): Promise<void> => {
  await coreCleanupTenants(tenantIds, tagNames, dbClient);
};
