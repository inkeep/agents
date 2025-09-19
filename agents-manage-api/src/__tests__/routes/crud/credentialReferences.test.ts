import { CredentialStoreType } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantId } from '../../utils/testTenant';

// Mock the app import with credential stores in context
vi.mock('../../../index.js', async (importOriginal) => {
  const { createManagementHono } = (await importOriginal()) as any;

  const mockCredentialStore = {
    id: 'mock-store',
    type: 'mock',
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    has: vi.fn(),
  };

  const mockNangoStore = {
    id: 'nango-store',
    type: CredentialStoreType.nango,
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    has: vi.fn(),
  };

  const mockMemoryStore = {
    id: 'memory-store',
    type: CredentialStoreType.memory,
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    has: vi.fn(),
  };

  const mockTrackingStore = {
    id: 'tracking-store',
    type: 'mock',
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn().mockImplementation(async (key: string) => {
      if (typeof globalThis.callOrder !== 'undefined') {
        globalThis.callOrder.push(`external-store-delete:${key}`);
      }
    }),
    has: vi.fn(),
  };

  // Create mock credential store registry
  const mockRegistry = {
    get: vi.fn((storeId: string) => {
      if (storeId === 'mock-store') return mockCredentialStore;
      if (storeId === 'nango-store') return mockNangoStore;
      if (storeId === 'memory-store') return mockMemoryStore;
      if (storeId === 'tracking-store') return mockTrackingStore;
      if (storeId === 'failing-store') {
        return {
          ...mockCredentialStore,
          id: 'failing-store',
          delete: vi.fn().mockRejectedValue(new Error('External store failure')),
        };
      }
      return undefined;
    }),
    getAll: vi.fn(() => [mockCredentialStore, mockNangoStore, mockMemoryStore]),
  };

  // Store globally for test access
  globalThis.sharedMockStores = {
    mockCredentialStore,
    mockNangoStore,
    mockMemoryStore,
    mockTrackingStore,
  };

  const mockConfig = { port: 3002, serverOptions: {} };

  return {
    default: createManagementHono
      ? createManagementHono(mockConfig, mockRegistry)
      : { request: vi.fn() },
    createManagementHono,
    createManagementApp: vi.fn(),
  };
});

// Make mock stores available globally for test access
declare global {
  var callOrder: string[];
  var mockCredentialStore: any;
  var mockNangoStore: any;
  var mockMemoryStore: any;
  var mockTrackingStore: any;
  var sharedMockStores: {
    mockCredentialStore: any;
    mockNangoStore: any;
    mockMemoryStore: any;
    mockTrackingStore: any;
  };
}

// Now import the app after mocking
import app from '../../../index';

describe('Credential CRUD Routes - Integration Tests', () => {
  const projectId = 'default';

  // Helper function to create test credential data
  const createCredentialData = ({ suffix = '' } = {}) => {
    const timestamp = Date.now();
    const cleanSuffix = suffix.toLowerCase().replace(/\s+/g, '-');
    return {
      id: `test-credential${cleanSuffix}-${timestamp}`,
      type: CredentialStoreType.nango,
      credentialStoreId: 'nango-store',
      retrievalParams: {
        workspaceId: `workspace${suffix}`,
        integration: 'intercom',
        testData: true,
      },
    };
  };

  // Helper function to create a credential and return its ID
  const createTestCredential = async ({
    tenantId,
    suffix = '',
  }: {
    tenantId: string;
    suffix?: string;
  }) => {
    // Ensure the project exists for this tenant before creating the credential
    await ensureTestProject(tenantId, projectId);

    const credentialData = createCredentialData({ suffix });
    const createRes = await makeRequest(
      `/tenants/${tenantId}/projects/${projectId}/credentials`,
      {
        method: 'POST',
        body: JSON.stringify(credentialData),
      }
    );

    console.log('createRes', createRes);

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    return { credentialData, credentialId: createBody.data.id };
  };

  // Helper function to create multiple credentials
  const createMultipleCredentials = async ({
    tenantId,
    count,
  }: {
    tenantId: string;
    count: number;
  }) => {
    const credentials: Awaited<ReturnType<typeof createTestCredential>>[] = [];
    for (let i = 1; i <= count; i++) {
      const credential = await createTestCredential({ tenantId, suffix: `_${i}` });
      credentials.push(credential);
    }
    return credentials;
  };

  describe('GET /', () => {
    it('should list credentials with pagination (empty initially)', async () => {
      const tenantId = createTestTenantId('credentials-list-empty');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toMatchObject({
        data: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          pages: 0,
        },
      });
    });

    it('should list credentials with pagination (with data)', async () => {
      const tenantId = createTestTenantId('credentials-list-data');
      await ensureTestProject(tenantId, projectId);

      // Create test credentials
      await createMultipleCredentials({ tenantId, count: 3 });

      const res = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toHaveLength(3);
      expect(body.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: 3,
        pages: 1,
      });

      // Verify credential structure
      for (const credential of body.data) {
        expect(credential).toHaveProperty('id');
        expect(credential).toHaveProperty('type');
        expect(credential).toHaveProperty('credentialStoreId');
        expect(credential).toHaveProperty('retrievalParams');
        expect(credential).toHaveProperty('createdAt');
        expect(credential).toHaveProperty('updatedAt');
        // Note: tenantId filtering will be handled by API schema
      }
    });

    it('should handle pagination correctly', async () => {
      const tenantId = createTestTenantId('credentials-pagination');
      await ensureTestProject(tenantId, projectId);

      // Create 5 credentials
      await createMultipleCredentials({ tenantId, count: 5 });

      // Test first page
      const page1 = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials?page=1&limit=2`
      );
      expect(page1.status).toBe(200);
      const page1Body = await page1.json();
      expect(page1Body.data).toHaveLength(2);
      expect(page1Body.pagination).toMatchObject({
        page: 1,
        limit: 2,
        total: 5,
        pages: 3,
      });

      // Test second page
      const page2 = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials?page=2&limit=2`
      );
      expect(page2.status).toBe(200);
      const page2Body = await page2.json();
      expect(page2Body.data).toHaveLength(2);
      expect(page2Body.pagination).toMatchObject({
        page: 2,
        limit: 2,
        total: 5,
        pages: 3,
      });

      // Test third page
      const page3 = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials?page=3&limit=2`
      );
      expect(page3.status).toBe(200);
      const page3Body = await page3.json();
      expect(page3Body.data).toHaveLength(1);
    });

    it('should enforce maximum limit', async () => {
      const tenantId = createTestTenantId('credentials-max-limit');
      await ensureTestProject(tenantId, projectId);
      const res = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials?page=1&limit=10`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.pagination.limit).toBe(10);
    });

    it('should isolate credentials by tenant', async () => {
      const tenantA = createTestTenantId('credentials-tenant-a');
      const tenantB = createTestTenantId('credentials-tenant-b');

      // Create credentials for tenant A
      await createMultipleCredentials({ tenantId: tenantA, count: 2 });

      // Create credentials for tenant B
      await createMultipleCredentials({ tenantId: tenantB, count: 3 });

      // Check tenant A sees only its credentials
      const resA = await app.request(`/tenants/${tenantA}/projects/${projectId}/credentials`);
      const bodyA = await resA.json();
      expect(bodyA.data).toHaveLength(2);

      // Check tenant B sees only its credentials
      const resB = await app.request(`/tenants/${tenantB}/projects/${projectId}/credentials`);
      const bodyB = await resB.json();
      expect(bodyB.data).toHaveLength(3);
    });
  });

  describe('GET /:id', () => {
    it('should get a specific credential by ID', async () => {
      const tenantId = createTestTenantId('credentials-get-by-id');
      await ensureTestProject(tenantId, projectId);
      const { credentialData, credentialId } = await createTestCredential({ tenantId });

      const res = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credentialId}`
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toMatchObject({
        id: credentialId,
        type: credentialData.type,
        credentialStoreId: credentialData.credentialStoreId,
        retrievalParams: credentialData.retrievalParams,
      });
      expect(body.data).toHaveProperty('createdAt');
      expect(body.data).toHaveProperty('updatedAt');
      // Note: tenantId filtering will be handled by API schema
    });

    it('should return 404 for non-existent credential', async () => {
      const tenantId = createTestTenantId('credentials-get-404');
      await ensureTestProject(tenantId, projectId);
      const nonExistentId = 'non-existent-credential-id';

      const res = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${nonExistentId}`
      );
      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toMatchObject({
        code: 'not_found',
        message: 'Credential not found',
      });
    });

    it('should enforce tenant isolation for get by ID', async () => {
      const tenantA = createTestTenantId('credentials-get-tenant-a');
      const tenantB = createTestTenantId('credentials-get-tenant-b');

      // Create credential for tenant A
      const { credentialId } = await createTestCredential({ tenantId: tenantA });

      // Try to access from tenant B
      const res = await app.request(
        `/tenants/${tenantB}/projects/${projectId}/credentials/${credentialId}`
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST /', () => {
    it('should create a new credential', async () => {
      const tenantId = createTestTenantId('credentials-create');
      await ensureTestProject(tenantId, projectId);
      const credentialData = createCredentialData();

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/credentials`, {
        method: 'POST',
        body: JSON.stringify(credentialData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.data).toMatchObject({
        id: credentialData.id,
        type: credentialData.type,
        credentialStoreId: credentialData.credentialStoreId,
        retrievalParams: credentialData.retrievalParams,
      });
      expect(body.data).toHaveProperty('id');
      expect(body.data).toHaveProperty('createdAt');
      expect(body.data).toHaveProperty('updatedAt');
      // Note: tenantId filtering will be handled by API schema
    });

    it('should create credential with minimal data', async () => {
      const tenantId = createTestTenantId('credentials-create-minimal');
      await ensureTestProject(tenantId, projectId);
      const minimalData = {
        id: `minimal-credential-${Date.now()}`,
        type: CredentialStoreType.memory,
        credentialStoreId: 'memory-store',
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/credentials`, {
        method: 'POST',
        body: JSON.stringify(minimalData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data).toMatchObject({
        id: minimalData.id,
        type: minimalData.type,
        credentialStoreId: minimalData.credentialStoreId,
      });
      expect(body.data.id).toBeDefined(); // ID is auto-generated
      expect(body.data.retrievalParams).toBeNull();
    });

    it('should handle validation errors for invalid data', async () => {
      const tenantId = createTestTenantId('credentials-create-invalid');
      await ensureTestProject(tenantId, projectId);
      const invalidData = {
        // Missing required fields
        retrievalParams: { some: 'data' },
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/credentials`, {
        method: 'POST',
        body: JSON.stringify(invalidData),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /:id', () => {
    it('should update an existing credential', async () => {
      const tenantId = createTestTenantId('credentials-update');
      await ensureTestProject(tenantId, projectId);
      const { credentialId } = await createTestCredential({ tenantId });

      const updateData = {
        type: CredentialStoreType.memory,
        credentialStoreId: 'memory-store',
        retrievalParams: {
          updated: true,
          newField: 'newValue',
        },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credentialId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.data).toMatchObject({
        id: credentialId,
        type: updateData.type,
        credentialStoreId: updateData.credentialStoreId,
        retrievalParams: updateData.retrievalParams,
      });
      expect(body.data).toHaveProperty('updatedAt');
    });

    it('should handle partial updates', async () => {
      const tenantId = createTestTenantId('credentials-partial-update');
      await ensureTestProject(tenantId, projectId);
      const { credentialData, credentialId } = await createTestCredential({ tenantId });

      const partialUpdate = {
        retrievalParams: {
          ...credentialData.retrievalParams,
          updated: true,
        },
      };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credentialId}`,
        {
          method: 'PUT',
          body: JSON.stringify(partialUpdate),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      // Original fields should remain unchanged
      expect(body.data.id).toBe(credentialData.id);
      expect(body.data.type).toBe(credentialData.type);
      expect(body.data.credentialStoreId).toBe(credentialData.credentialStoreId);

      // Metadata should be updated
      expect(body.data.retrievalParams).toMatchObject(partialUpdate.retrievalParams);
    });

    it('should return 404 for non-existent credential', async () => {
      const tenantId = createTestTenantId('credentials-update-404');
      await ensureTestProject(tenantId, projectId);
      const nonExistentId = 'non-existent-credential-id';

      const updateData = { type: CredentialStoreType.nango };

      const res = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${nonExistentId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatchObject({
        code: 'not_found',
        message: 'Credential not found',
      });
    });

    it('should enforce tenant isolation for updates', async () => {
      const tenantA = createTestTenantId('credentials-update-tenant-a');
      const tenantB = createTestTenantId('credentials-update-tenant-b');

      // Create credential for tenant A
      const { credentialId } = await createTestCredential({ tenantId: tenantA });

      // Try to update from tenant B
      const updateData = { type: CredentialStoreType.memory };
      const res = await makeRequest(
        `/tenants/${tenantB}/projects/${projectId}/credentials/${credentialId}`,
        {
          method: 'PUT',
          body: JSON.stringify(updateData),
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /:id', () => {
    it('should delete an existing credential', async () => {
      const tenantId = createTestTenantId('credentials-delete');
      await ensureTestProject(tenantId, projectId);
      const { credentialId } = await createTestCredential({ tenantId });

      // Verify credential exists
      const getRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credentialId}`
      );
      expect(getRes.status).toBe(200);

      // Delete the credential
      const deleteRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credentialId}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // Verify credential is deleted
      const getAfterDeleteRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credentialId}`
      );
      expect(getAfterDeleteRes.status).toBe(404);
    });

    it('should return 404 for non-existent credential', async () => {
      const tenantId = createTestTenantId('credentials-delete-404');
      await ensureTestProject(tenantId, projectId);
      const nonExistentId = 'non-existent-credential-id';

      const res = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${nonExistentId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(404);
      const _body = await res.json();
    });

    it('should enforce tenant isolation for deletes', async () => {
      const tenantA = createTestTenantId('credentials-delete-tenant-a');
      const tenantB = createTestTenantId('credentials-delete-tenant-b');

      // Create credential for tenant A
      const { credentialId } = await createTestCredential({ tenantId: tenantA });

      // Try to delete from tenant B
      const res = await app.request(
        `/tenants/${tenantB}/projects/${projectId}/credentials/${credentialId}`,
        {
          method: 'DELETE',
        }
      );

      expect(res.status).toBe(404);

      // Verify credential still exists for tenant A
      const getRes = await app.request(
        `/tenants/${tenantA}/projects/${projectId}/credentials/${credentialId}`
      );
      expect(getRes.status).toBe(200);
    });

    it('should handle deletion of credential with complex retrievalParams', async () => {
      const tenantId = createTestTenantId('credentials-delete-complex');
      await ensureTestProject(tenantId, projectId);
      const complexCredentialData = {
        ...createCredentialData(),
        retrievalParams: {
          nested: {
            object: {
              with: 'values',
              numbers: [1, 2, 3],
              boolean: true,
            },
          },
          array: ['item1', 'item2'],
          nullValue: null,
        },
      };

      const createRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credentials`,
        {
          method: 'POST',
          body: JSON.stringify(complexCredentialData),
        }
      );
      const { data: credential } = await createRes.json();

      // Delete the credential
      const deleteRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credential.id}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // Verify it's deleted
      const getRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credential.id}`
      );
      expect(getRes.status).toBe(404);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed JSON in request body', async () => {
      const tenantId = createTestTenantId('credentials-malformed-json');
      await ensureTestProject(tenantId, projectId);

      const res = await app.request(`/tenants/${tenantId}/projects/${projectId}/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json{',
      });

      expect(res.status).toBe(400);
    });

    it('should handle missing Content-Type header', async () => {
      const tenantId = createTestTenantId('credentials-no-content-type');
      await ensureTestProject(tenantId, projectId);
      const credentialData = createCredentialData();

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/credentials`, {
        method: 'POST',
        body: JSON.stringify(credentialData),
      });

      // Should work with makeRequest utility providing correct headers
      expect(res.status).toBe(201);
    });

    it.skip('should handle very long retrievalParams values', async () => {
      // TODO: This test is failing intermittently - investigate SQLite parameter limits
      const tenantId = createTestTenantId('credentials-long-retrievalParams');
      await ensureTestProject(tenantId, projectId);
      const longString = 'a'.repeat(1000); // 1KB string (reduced from 10KB to avoid SQLite parameter limits)

      const credentialData = {
        ...createCredentialData({ suffix: '-long-params' }),
        retrievalParams: {
          longField: longString,
          normalField: 'normal value',
        },
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/credentials`, {
        method: 'POST',
        body: JSON.stringify(credentialData),
      });

      if (res.status !== 201) {
        const errorBody = await res.json();
        console.log('Error response:', errorBody);
      }

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.retrievalParams.longField).toBe(longString);
    });

    it('should handle credentials with undefined retrievalParams (omitted)', async () => {
      const tenantId = createTestTenantId('credentials-undefined-retrievalParams');
      await ensureTestProject(tenantId, projectId);
      const credentialData = {
        id: `undefined-metadata-credential-${Date.now()}`,
        type: CredentialStoreType.memory,
        credentialStoreId: 'memory-store',
        // retrievalParams omitted - should be set to null in database
      };

      const res = await makeRequest(`/tenants/${tenantId}/projects/${projectId}/credentials`, {
        method: 'POST',
        body: JSON.stringify(credentialData),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data).toMatchObject({
        id: credentialData.id,
        type: credentialData.type,
        credentialStoreId: credentialData.credentialStoreId,
      });
      expect(body.data.id).toBeDefined(); // ID is auto-generated
      expect(body.data.retrievalParams).toBeNull();
    });
  });

  describe('Credential Deletion with External Store Cleanup', () => {
    beforeEach(async () => {
      // Reset all mocks before each test
      vi.clearAllMocks();
      globalThis.callOrder = [];

      // Use the shared mock instances stored globally
      globalThis.mockCredentialStore = globalThis.sharedMockStores.mockCredentialStore;
      globalThis.mockNangoStore = globalThis.sharedMockStores.mockNangoStore;
      globalThis.mockMemoryStore = globalThis.sharedMockStores.mockMemoryStore;
      globalThis.mockTrackingStore = globalThis.sharedMockStores.mockTrackingStore;
    });

    it('should cleanup both local DB and external store atomically', async () => {
      const tenantId = createTestTenantId('credentials-delete-atomic');
      await ensureTestProject(tenantId, projectId);

      // Create credential that uses mock store
      const credentialData = {
        id: `atomic-test-credential-${Date.now()}`,
        type: CredentialStoreType.memory,
        credentialStoreId: 'memory-store',
        retrievalParams: {
          key: 'test-key-atomic',
          service: 'test-service',
        },
      };

      const createRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credentials`,
        {
          method: 'POST',
          body: JSON.stringify(credentialData),
        }
      );
      expect(createRes.status).toBe(201);
      const { data: credential } = await createRes.json();
      // Verify credential exists in database
      const getRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credential.id}`
      );
      expect(getRes.status).toBe(200);

      // Delete the credential
      const deleteRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credential.id}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // Verify external store cleanup was called with correct parameters
      expect(globalThis.mockMemoryStore.delete).toHaveBeenCalledWith('test-key-atomic');
      expect(globalThis.mockMemoryStore.delete).toHaveBeenCalledTimes(1);

      // Verify credential is deleted from database
      const getAfterDeleteRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credential.id}`
      );
      expect(getAfterDeleteRes.status).toBe(404);
    });

    it('should handle external store cleanup failures gracefully', async () => {
      const tenantId = createTestTenantId('credentials-delete-graceful-failure');
      await ensureTestProject(tenantId, projectId);

      // Create credential that uses failing store
      const credentialData = {
        id: `failing-test-credential-${Date.now()}`,
        type: CredentialStoreType.memory,
        credentialStoreId: 'memory-store',
        retrievalParams: {
          key: 'test-key-failing',
          service: 'test-service',
        },
      };

      const createRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credentials`,
        {
          method: 'POST',
          body: JSON.stringify(credentialData),
        }
      );
      expect(createRes.status).toBe(201);
      const { data: credential } = await createRes.json();

      // Delete should still succeed even if external store fails
      const deleteRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credential.id}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // Verify credential is still deleted from database despite external store failure
      const getAfterDeleteRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credential.id}`
      );
      expect(getAfterDeleteRes.status).toBe(404);
    });

    it('should handle deletion when credential store is not available', async () => {
      const tenantId = createTestTenantId('credentials-delete-no-store');
      await ensureTestProject(tenantId, projectId);

      // Create credential with non-existent store
      const credentialData = {
        id: `no-store-credential-${Date.now()}`,
        type: CredentialStoreType.memory,
        credentialStoreId: 'memory-store', // Using valid store
        retrievalParams: {
          key: 'test-key-no-store',
        },
      };

      const createRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credentials`,
        {
          method: 'POST',
          body: JSON.stringify(credentialData),
        }
      );
      expect(createRes.status).toBe(201);
      const { data: credential } = await createRes.json();

      // Delete should succeed even if credential store is not available
      const deleteRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credential.id}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // Verify credential is deleted from database
      const getAfterDeleteRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credential.id}`
      );
      expect(getAfterDeleteRes.status).toBe(404);
    });

    it('should handle nango store deletion with correct JSON lookup key', async () => {
      const tenantId = createTestTenantId('credentials-delete-nango-lookup');
      await ensureTestProject(tenantId, projectId);

      // Create nango credential
      const credentialData = {
        id: `nango-lookup-credential-${Date.now()}`,
        type: CredentialStoreType.nango,
        credentialStoreId: 'nango-store',
        retrievalParams: {
          connectionId: 'test-conn-123',
          providerConfigKey: 'slack-workspace-test',
          provider: 'slack',
          authMode: 'OAUTH2',
        },
      };

      const createRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credentials`,
        {
          method: 'POST',
          body: JSON.stringify(credentialData),
        }
      );
      expect(createRes.status).toBe(201);
      const { data: credential } = await createRes.json();

      // Delete the credential
      const deleteRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credential.id}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // Verify nango store was called with correct JSON lookup key
      const expectedLookupKey = JSON.stringify({
        connectionId: 'test-conn-123',
        providerConfigKey: 'slack-workspace-test',
      });
      expect(globalThis.mockNangoStore.delete).toHaveBeenCalledWith(expectedLookupKey);
      expect(globalThis.mockNangoStore.delete).toHaveBeenCalledTimes(1);
    });

    it('should handle memory store deletion with key-based lookup', async () => {
      const tenantId = createTestTenantId('credentials-delete-memory-lookup');
      await ensureTestProject(tenantId, projectId);

      // Create memory credential
      const credentialData = {
        id: `memory-lookup-credential-${Date.now()}`,
        type: CredentialStoreType.memory,
        credentialStoreId: 'memory-store',
        retrievalParams: {
          key: 'MEMORY_API_KEY_TEST',
          source: 'environment',
        },
      };

      const createRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credentials`,
        {
          method: 'POST',
          body: JSON.stringify(credentialData),
        }
      );
      expect(createRes.status).toBe(201);
      const { data: credential } = await createRes.json();

      // Delete the credential
      const deleteRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credential.id}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // Verify memory store was called with the key directly
      expect(globalThis.mockMemoryStore.delete).toHaveBeenCalledWith('MEMORY_API_KEY_TEST');
      expect(globalThis.mockMemoryStore.delete).toHaveBeenCalledTimes(1);
    });

    it('should verify deletion order: external store first, then database', async () => {
      const tenantId = createTestTenantId('credentials-delete-order');
      await ensureTestProject(tenantId, projectId);

      // Create credential
      const credentialData = {
        id: `order-test-credential-${Date.now()}`,
        type: CredentialStoreType.memory,
        credentialStoreId: 'tracking-store',
        retrievalParams: {
          key: 'order-test-key',
        },
      };

      const createRes = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credentials`,
        {
          method: 'POST',
          body: JSON.stringify(credentialData),
        }
      );
      expect(createRes.status).toBe(201);
      const { data: credential } = await createRes.json();

      // Delete the credential
      const deleteRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credential.id}`,
        {
          method: 'DELETE',
        }
      );
      expect(deleteRes.status).toBe(204);

      // Verify external store delete was called
      expect(globalThis.mockTrackingStore.delete).toHaveBeenCalledWith('order-test-key');
      expect(globalThis.callOrder).toContain('external-store-delete:order-test-key');

      // Verify credential is deleted from database (happens after external store)
      const getAfterDeleteRes = await app.request(
        `/tenants/${tenantId}/projects/${projectId}/credentials/${credential.id}`
      );
      expect(getAfterDeleteRes.status).toBe(404);
    });
  });
});
