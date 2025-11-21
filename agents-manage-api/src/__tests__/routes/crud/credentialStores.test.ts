import { CredentialStoreType } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import dbClient from '../../../data/db/dbClient';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantWithOrg } from '../../utils/testTenant';

// Factory functions for creating mock stores with different behaviors
const createMockStore = (
  id: string,
  type: (typeof CredentialStoreType)[keyof typeof CredentialStoreType],
  overrides = {}
) => ({
  id,
  type,
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(null),
  delete: vi.fn().mockResolvedValue(false),
  has: vi.fn().mockResolvedValue(false),
  checkAvailability: vi.fn().mockResolvedValue({ available: true }),
  ...overrides,
});

const createNonFunctionalKeychainStore = () =>
  createMockStore('keychain-default', CredentialStoreType.keychain, {
    has: vi.fn().mockRejectedValue(new Error('keytar not available')),
    checkAvailability: vi.fn().mockResolvedValue({
      available: false,
      reason: 'Keytar not available - cannot store credentials in system keychain',
    }),
  });

const createUnavailableStore = (id: string) =>
  createMockStore(id, CredentialStoreType.keychain, {
    checkAvailability: vi.fn().mockResolvedValue({
      available: false,
      reason: 'Store is offline',
    }),
  });

const createErrorStore = (id: string, errorMessage: string) =>
  createMockStore(id, CredentialStoreType.memory, {
    set: vi.fn().mockRejectedValue(new Error(errorMessage)),
  });

// Registry factory function that takes specific store configurations
const createMockRegistry = (stores: any[] = []) => {
  const storeMap = new Map(stores.map((store) => [store.id, store]));

  return {
    get: vi.fn((storeId: string) => storeMap.get(storeId) || null),
    getAll: vi.fn(() => stores),
  };
};

// Mock app with dynamic registry injection
let currentRegistry: any = null;

vi.mock('../../../index', async (importOriginal) => {
  const { createManagementHono } = (await importOriginal()) as any;

  return {
    default: {
      request: vi.fn(async (url: string, options: any) => {
        if (!currentRegistry) {
          throw new Error('No registry configured for test');
        }

        const mockConfig = { port: 3002, serverOptions: {} };
        const app = createManagementHono(mockConfig, currentRegistry, null);
        return app.request(url, options);
      }),
    },
  };
});

// Helper function to setup test with specific stores
const setupTestWithStores = (stores: any[]) => {
  currentRegistry = createMockRegistry(stores);
};

describe('Credential Stores - CRUD Operations', () => {
  let tenantId: string;
  let projectId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    currentRegistry = null; // Clear registry between tests
    tenantId = await createTestTenantWithOrg();
    projectId = 'default';
    await createTestProject(dbClient, tenantId, projectId);
  });

  describe('GET /stores', () => {
    it('should return all available stores when all are functional', async () => {
      // Arrange: Create specific stores for this test
      const stores = [
        createMockStore('keychain-default', CredentialStoreType.keychain),
        createMockStore('memory-default', CredentialStoreType.memory),
        createMockStore('nango-default', CredentialStoreType.nango),
      ];
      setupTestWithStores(stores);

      // Act
      const response = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credential-stores`,
        { method: 'GET' }
      );

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        data: [
          {
            id: 'keychain-default',
            type: CredentialStoreType.keychain,
            available: true,
            reason: null,
          },
          {
            id: 'memory-default',
            type: CredentialStoreType.memory,
            available: true,
            reason: null,
          },
          {
            id: 'nango-default',
            type: CredentialStoreType.nango,
            available: true,
            reason: null,
          },
        ],
      });
    });

    it('should show non-functional stores with reasons', async () => {
      // Arrange: Create specific stores including a non-functional one
      const stores = [
        createNonFunctionalKeychainStore(),
        createMockStore('memory-default', CredentialStoreType.memory),
      ];
      setupTestWithStores(stores);

      // Act
      const response = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credential-stores`,
        { method: 'GET' }
      );

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        data: [
          {
            id: 'keychain-default',
            type: CredentialStoreType.keychain,
            available: false,
            reason: 'Keytar not available - cannot store credentials in system keychain',
          },
          {
            id: 'memory-default',
            type: CredentialStoreType.memory,
            available: true,
            reason: null,
          },
        ],
      });
    });

    it('should handle minimal store configuration', async () => {
      // Arrange: Only memory store
      const stores = [createMockStore('memory-default', CredentialStoreType.memory)];
      setupTestWithStores(stores);

      // Act
      const response = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credential-stores`,
        { method: 'GET' }
      );

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        data: [
          {
            id: 'memory-default',
            type: CredentialStoreType.memory,
            available: true,
            reason: null,
          },
        ],
      });
    });
  });

  describe('POST /stores/:storeId/credentials', () => {
    const storeId = 'test-store';

    it('should successfully create a credential in the store', async () => {
      // Arrange: Create a working store
      const stores = [createMockStore('test-store', CredentialStoreType.memory)];
      setupTestWithStores(stores);

      const requestBody = {
        key: 'test-key',
        value: 'test-value',
      };

      // Act
      const response = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credential-stores/${storeId}/credentials`,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      // Assert
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.data).toEqual({
        key: 'test-key',
        storeId: 'test-store',
        createdAt: expect.any(String),
      });
      // Verify createdAt is a valid ISO string
      expect(new Date(data.data.createdAt)).toBeInstanceOf(Date);

      // Verify the store's set method was called with correct parameters
      expect(stores[0].set).toHaveBeenCalledWith('test-key', 'test-value', {});
    });

    it('should return 404 when credential store is not found', async () => {
      // Arrange: Empty store registry
      setupTestWithStores([]);

      const requestBody = {
        key: 'test-key',
        value: 'test-value',
      };

      // Act
      const response = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credential-stores/${storeId}/credentials`,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      // Assert
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error.message).toBe("Credential store 'test-store' not found");
    });

    it('should return 500 when credential store is not available', async () => {
      // Arrange: Create an unavailable store
      const stores = [createUnavailableStore('unavailable-store')];
      setupTestWithStores(stores);

      const requestBody = {
        key: 'test-key',
        value: 'test-value',
      };

      // Act
      const response = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credential-stores/unavailable-store/credentials`,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      // Assert
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error.message).toContain(
        "Credential store 'unavailable-store' is not available: Store is offline"
      );
    });

    it('should handle store.set() errors gracefully', async () => {
      // Arrange: Create a store that throws errors on set
      const stores = [createErrorStore('error-store', 'Storage failed')];
      setupTestWithStores(stores);

      const requestBody = {
        key: 'test-key',
        value: 'test-value',
      };

      // Act
      const response = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credential-stores/error-store/credentials`,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      // Assert
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error.message).toBe('Failed to store credential: Storage failed');
    });

    it('should validate request body schema', async () => {
      // Arrange: Create a working store
      const stores = [createMockStore('test-store', CredentialStoreType.memory)];
      setupTestWithStores(stores);

      const invalidBody = {
        key: 'test-key',
        // missing value
      };

      // Act
      const response = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credential-stores/${storeId}/credentials`,
        {
          method: 'POST',
          body: JSON.stringify(invalidBody),
        }
      );

      // Assert
      expect(response.status).toBe(400);
    });

    it('should handle keychain store type', async () => {
      // Arrange: Create a keychain store
      const stores = [createMockStore('keychain-store', CredentialStoreType.keychain)];
      setupTestWithStores(stores);

      const requestBody = {
        key: 'test-key',
        value: 'test-value',
      };

      // Act
      const response = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credential-stores/keychain-store/credentials`,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      // Assert
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.data).toEqual({
        key: 'test-key',
        storeId: 'keychain-store',
        createdAt: expect.any(String),
      });
    });

    it('should handle nango store type', async () => {
      // Arrange: Create a nango store
      const stores = [createMockStore('nango-store', CredentialStoreType.nango)];
      setupTestWithStores(stores);

      const requestBody = {
        key: 'test-key',
        value: 'test-value',
      };

      // Act
      const response = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credential-stores/nango-store/credentials`,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      // Assert
      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.data).toEqual({
        key: 'test-key',
        storeId: 'nango-store',
        createdAt: expect.any(String),
      });
    });
  });
});
