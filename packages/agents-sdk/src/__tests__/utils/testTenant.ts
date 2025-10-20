import { generateId } from '@inkeep/agents-core';

/**
 * Creates a unique tenant ID for testing to avoid conflicts
 * @param prefix Optional prefix for the tenant ID
 * @returns A unique tenant ID
 */
export function createTestTenantId(prefix = 'test'): string {
  return `${prefix}-${generateId(8)}`;
}
