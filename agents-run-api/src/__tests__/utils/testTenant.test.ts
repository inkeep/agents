import { describe, expect, it } from 'vitest';
import { createTestTenantId, createTestTenantIds, isTestTenant } from './testTenant';

describe('Test Tenant Utilities', () => {
  describe('createTestTenantId', () => {
    it('should generate a unique tenant ID with test-tenant prefix', () => {
      const tenantId = createTestTenantId();

      expect(tenantId).toMatch(
        /^test-tenant-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(tenantId).toContain('test-tenant-');
      expect(tenantId.length).toBeGreaterThan('test-tenant-'.length);
    });

    it('should generate different IDs on each call', () => {
      const tenantId1 = createTestTenantId();
      const tenantId2 = createTestTenantId();

      expect(tenantId1).not.toBe(tenantId2);
      expect(tenantId1).toMatch(/^test-tenant-/);
      expect(tenantId2).toMatch(/^test-tenant-/);
    });

    it('should generate a unique tenant ID with custom prefix', () => {
      const tenantId = createTestTenantId('agents');

      expect(tenantId).toMatch(
        /^test-tenant-agents-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(tenantId).toContain('test-tenant-agents-');
    });

    it('should generate different IDs with same prefix', () => {
      const tenantId1 = createTestTenantId('agents');
      const tenantId2 = createTestTenantId('agents');

      expect(tenantId1).not.toBe(tenantId2);
      expect(tenantId1).toMatch(/^test-tenant-agents-/);
      expect(tenantId2).toMatch(/^test-tenant-agents-/);
    });
  });

  describe('createTestTenantIds', () => {
    it('should generate multiple unique tenant IDs', () => {
      const tenantIds = createTestTenantIds(3);

      expect(tenantIds).toHaveLength(3);
      expect(new Set(tenantIds).size).toBe(3); // All should be unique

      for (const tenantId of tenantIds) {
        expect(tenantId).toMatch(/^test-tenant-/);
      }
    });

    it('should handle edge cases', () => {
      expect(createTestTenantIds(0)).toHaveLength(0);
      expect(createTestTenantIds(1)).toHaveLength(1);
    });

    it('should generate multiple unique tenant IDs with custom prefix', () => {
      const tenantIds = createTestTenantIds(3, 'agents');

      expect(tenantIds).toHaveLength(3);
      expect(new Set(tenantIds).size).toBe(3); // All should be unique

      for (const tenantId of tenantIds) {
        expect(tenantId).toMatch(/^test-tenant-agents-/);
      }
    });
  });

  describe('isTestTenant', () => {
    it('should correctly identify test tenants', () => {
      const testTenantId = createTestTenantId();
      const prefixedTenantId = createTestTenantId('agents');

      expect(isTestTenant(testTenantId)).toBe(true);
      expect(isTestTenant(prefixedTenantId)).toBe(true);
      expect(isTestTenant('test-tenant-123')).toBe(true);
      expect(isTestTenant('test-tenant-agents-123')).toBe(true);
      expect(isTestTenant('test-tenant-')).toBe(true);
    });

    it('should correctly identify non-test tenants', () => {
      expect(isTestTenant('production-tenant')).toBe(false);
      expect(isTestTenant('default')).toBe(false);
      expect(isTestTenant('tenant-test')).toBe(false);
      expect(isTestTenant('')).toBe(false);
    });
  });

  describe('parallel execution safety', () => {
    it('should generate unique IDs when called in parallel', async () => {
      // Simulate parallel test execution
      const promises = Array.from({ length: 10 }, () => Promise.resolve(createTestTenantId()));

      const tenantIds = await Promise.all(promises);

      // All should be unique
      expect(new Set(tenantIds).size).toBe(10);

      // All should be test tenants
      for (const tenantId of tenantIds) {
        expect(isTestTenant(tenantId)).toBe(true);
      }
    });
  });
});
