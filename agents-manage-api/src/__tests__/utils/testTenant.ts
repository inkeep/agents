import { randomUUID } from 'node:crypto';

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
