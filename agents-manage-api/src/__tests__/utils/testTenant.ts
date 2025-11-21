import { randomUUID } from 'node:crypto';
import { organization } from '@inkeep/agents-core';
import { createTestOrganization as createTestOrg } from '@inkeep/agents-core/db/test-client';
import { eq } from 'drizzle-orm';
import dbClient from '../../data/db/dbClient';

/**
 * Creates a unique tenant ID for test isolation.
 *
 * Each test run gets its own tenant to ensure parallel tests don't interfere with each other.
 * The generated tenant ID follows the format: test-tenant-{prefix}-{uuid} or test-tenant-{uuid}
 *
 * @param prefix - Optional prefix to include in the tenant ID (e.g., test file name)
 * @returns A unique tenant ID for test isolation
 *
 * @example
 * ```typescript
 * import { createTestTenantId } from './utils/testTenant';
 *
 * describe('My test suite', () => {
 *   const tenantId = createTestTenantId('agents');
 *
 *   it('should work with isolated tenant', async () => {
 *     // Your test code using the unique tenant ID
 *     console.log(tenantId); // e.g., "test-tenant-agents-123e4567-e89b-12d3-a456-426614174000"
 *   });
 * });
 * ```
 */
export function createTestTenantId(prefix?: string): string {
  const uuid = randomUUID();
  return prefix ? `test-tenant-${prefix}-${uuid}` : `test-tenant-${uuid}`;
}

/**
 * Creates a test organization in the database for the given tenant ID.
 * This is required because projects now have a foreign key to the organization table.
 *
 * @param tenantId - The tenant ID to create an organization for
 * @returns The created organization record
 *
 * @example
 * ```typescript
 * import { createTestTenantId, createTestOrganization } from './utils/testTenant';
 *
 * describe('My test suite', () => {
 *   it('should work with organization', async () => {
 *     const tenantId = createTestTenantId('agents');
 *     await createTestOrganization(tenantId);
 *     // Now you can create projects with this tenantId
 *   });
 * });
 * ```
 */
export async function createTestOrganization(tenantId: string) {
  await createTestOrg(dbClient, tenantId);
  
  // Return the created organization for test assertions
  const [org] = await dbClient
    .select()
    .from(organization)
    .where(eq(organization.id, tenantId))
    .limit(1);
  
  return org;
}

/**
 * Creates a unique tenant ID and corresponding organization for test isolation.
 * This is the recommended way to create test tenants as it ensures the organization exists.
 *
 * @param prefix - Optional prefix to include in the tenant ID (e.g., test file name)
 * @returns A unique tenant ID with organization already created
 *
 * @example
 * ```typescript
 * import { createTestTenantWithOrg } from './utils/testTenant';
 *
 * describe('My test suite', () => {
 *   it('should work with tenant and org', async () => {
 *     const tenantId = await createTestTenantWithOrg('agents');
 *     // Organization already exists, can create projects immediately
 *   });
 * });
 * ```
 */
export async function createTestTenantWithOrg(prefix?: string): Promise<string> {
  const tenantId = createTestTenantId(prefix);
  await createTestOrganization(tenantId);
  return tenantId;
}

/**
 * Creates multiple unique tenant IDs for test isolation.
 *
 * Useful when you need multiple tenants in a single test.
 *
 * @param count - Number of tenant IDs to generate
 * @param prefix - Optional prefix to include in all tenant IDs
 * @returns Array of unique tenant IDs
 *
 * @example
 * ```typescript
 * import { createTestTenantIds } from './utils/testTenant';
 *
 * describe('Multi-tenant test suite', () => {
 *   const [tenantA, tenantB] = createTestTenantIds(2, 'multi-tenant');
 *
 *   it('should handle cross-tenant operations', async () => {
 *     // Test operations across different tenants
 *   });
 * });
 * ```
 */
export function createTestTenantIds(count: number, prefix?: string): string[] {
  return Array.from({ length: count }, () => createTestTenantId(prefix));
}

/**
 * Checks if a tenant ID is a test tenant.
 *
 * @param tenantId - The tenant ID to check
 * @returns True if the tenant ID is a test tenant
 *
 * @example
 * ```typescript
 * import { isTestTenant } from './utils/testTenant';
 *
 * const tenantId = createTestTenantId();
 * console.log(isTestTenant(tenantId)); // true
 * console.log(isTestTenant('production-tenant')); // false
 * ```
 */
export function isTestTenant(tenantId: string): boolean {
  return tenantId.startsWith('test-tenant-');
}
