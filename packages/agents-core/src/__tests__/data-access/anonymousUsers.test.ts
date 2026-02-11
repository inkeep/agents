import { beforeEach, describe, expect, it } from 'vitest';
import { createAnonymousUser, getAnonymousUser } from '../../data-access/runtime/anonymousUsers';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { testRunDbClient } from '../setup';

describe('Anonymous Users Data Access', () => {
  let db: AgentsRunDatabaseClient;
  const testTenantId = 'test-tenant';
  const testProjectId = 'test-project';

  beforeEach(async () => {
    db = testRunDbClient;
  });

  describe('createAnonymousUser', () => {
    it('should create an anonymous user', async () => {
      const userId = `anon_test_${Date.now()}`;
      const result = await createAnonymousUser(db)({
        id: userId,
        tenantId: testTenantId,
        projectId: testProjectId,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(userId);
      expect(result.tenantId).toBe(testTenantId);
      expect(result.projectId).toBe(testProjectId);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should create an anonymous user with metadata', async () => {
      const userId = `anon_meta_${Date.now()}`;
      const metadata = { browser: 'Chrome', source: 'widget' };

      const result = await createAnonymousUser(db)({
        id: userId,
        tenantId: testTenantId,
        projectId: testProjectId,
        metadata,
      });

      expect(result).toBeDefined();
      expect(result.metadata).toEqual(metadata);
    });
  });

  describe('getAnonymousUser', () => {
    it('should retrieve an existing anonymous user', async () => {
      const userId = `anon_get_${Date.now()}`;
      await createAnonymousUser(db)({
        id: userId,
        tenantId: testTenantId,
        projectId: testProjectId,
      });

      const result = await getAnonymousUser(db)({
        id: userId,
        tenantId: testTenantId,
        projectId: testProjectId,
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(userId);
    });

    it('should return undefined for non-existent user', async () => {
      const result = await getAnonymousUser(db)({
        id: 'non-existent',
        tenantId: testTenantId,
        projectId: testProjectId,
      });

      expect(result).toBeUndefined();
    });
  });
});
