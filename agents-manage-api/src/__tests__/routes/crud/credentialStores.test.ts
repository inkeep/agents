import { CredentialStoreType } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureTestProject } from '../../utils/testProject';
import { makeRequest } from '../../utils/testRequest';
import { createTestTenantId } from '../../utils/testTenant';

// Mock the app import with credential stores in context
vi.mock('../../../index', async (importOriginal) => {
  const { createManagementHono } = (await importOriginal()) as any;

  const mockKeychainStore = {
    id: 'keychain-default',
    type: CredentialStoreType.keychain,
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn().mockResolvedValue(false), // Test key doesn't exist
    checkAvailability: vi.fn().mockResolvedValue({ available: true }),
  };

  const mockNonFunctionalKeychainStore = {
    id: 'keychain-default',
    type: CredentialStoreType.keychain,
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn().mockRejectedValue(new Error('keytar not available')),
    checkAvailability: vi.fn().mockResolvedValue({ 
      available: false, 
      reason: 'Keytar not available - cannot store credentials in system keychain' 
    }),
  };

  const mockMemoryStore = {
    id: 'memory-default',
    type: CredentialStoreType.memory,
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn().mockResolvedValue(false),
    checkAvailability: vi.fn().mockResolvedValue({ available: true }),
  };

  const mockNangoStore = {
    id: 'nango-default',
    type: CredentialStoreType.nango,
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn().mockResolvedValue(false),
    checkAvailability: vi.fn().mockResolvedValue({ available: true }),
  };

  // Additional stores for SET tests
  const mockTestStore = {
    id: 'test-store',
    type: CredentialStoreType.memory,
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    checkAvailability: vi.fn().mockResolvedValue({ available: true }),
  };

  const mockUnavailableStore = {
    id: 'unavailable-store',
    type: CredentialStoreType.keychain,
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    checkAvailability: vi.fn().mockResolvedValue({ 
      available: false, 
      reason: 'Store is offline' 
    }),
  };

  const mockKeychainTestStore = {
    id: 'keychain-store',
    type: CredentialStoreType.keychain,
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    checkAvailability: vi.fn().mockResolvedValue({ available: true }),
  };

  const mockNangoTestStore = {
    id: 'nango-store',
    type: CredentialStoreType.nango,
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    checkAvailability: vi.fn().mockResolvedValue({ available: true }),
  };

  // Create a dynamic registry that responds to test scenarios
  const dynamicRegistry = {
    get: vi.fn((storeId: string) => {
      const statusScenario = globalThis.credentialStoreTestScenario;
      const setScenario = globalThis.credentialStoreSetTestScenario;
      
      // Handle set test scenarios first (they take precedence when set)
      if (setScenario) {
        if (setScenario === 'store-not-found') {
          return null;
        } else if (setScenario === 'store-unavailable' && storeId === 'unavailable-store') {
          return mockUnavailableStore;
        } else if (setScenario === 'set-error' && storeId === 'test-store') {
          const errorStore = { ...mockTestStore };
          errorStore.set.mockRejectedValue(new Error('Storage failed'));
          return errorStore;
        } else if (setScenario === 'keychain-store' && storeId === 'keychain-store') {
          return mockKeychainTestStore;
        } else if (setScenario === 'nango-store' && storeId === 'nango-store') {
          return mockNangoTestStore;
        } else if (setScenario === 'default' && storeId === 'test-store') {
          return mockTestStore;
        }
      }
      
      // Handle status test scenarios
      if (statusScenario) {
        switch (statusScenario) {
          case 'all-available':
            if (storeId === 'keychain-default') return mockKeychainStore;
            if (storeId === 'memory-default') return mockMemoryStore;
            if (storeId === 'nango-default') return mockNangoStore;
            break;
          case 'keychain-non-functional':
            if (storeId === 'keychain-default') return mockNonFunctionalKeychainStore;
            if (storeId === 'memory-default') return mockMemoryStore;
            break;
          case 'memory-only':
            if (storeId === 'memory-default') return mockMemoryStore;
            break;
        }
      }

      return undefined;
    }),
    getAll: vi.fn(() => {
      const statusScenario = globalThis.credentialStoreTestScenario;
      
      // Status tests take precedence - return specific stores for status scenarios
      if (statusScenario) {
        switch (statusScenario) {
          case 'all-available':
            return [mockKeychainStore, mockMemoryStore, mockNangoStore];
          case 'keychain-non-functional':
            return [mockNonFunctionalKeychainStore, mockMemoryStore];
          case 'memory-only':
            return [mockMemoryStore];
        }
      }
      
      // For set tests or no scenario, return empty array (set tests don't use getAll)
      return [];
    }),
  };

  const mockConfig = { port: 3002, serverOptions: {} };
  const app = createManagementHono(mockConfig, dynamicRegistry);

  return { default: app };
});

// Make scenarios available globally for test access
declare global {
  var credentialStoreTestScenario: 'all-available' | 'keychain-non-functional' | 'memory-only' | undefined;
  var credentialStoreSetTestScenario: 'default' | 'store-not-found' | 'store-unavailable' | 'set-error' | 'keychain-store' | 'nango-store' | undefined;
}

describe('Credential Stores - CRUD Operations', () => {
  let tenantId: string;
  let projectId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear global test scenarios
    globalThis.credentialStoreTestScenario = undefined;
    globalThis.credentialStoreSetTestScenario = undefined;
    tenantId = createTestTenantId();
    projectId = 'default';
    await ensureTestProject(tenantId, projectId);
  });

  describe('GET /stores/status', () => {
    it('should return all available stores when all are functional', async () => {
      globalThis.credentialStoreTestScenario = 'all-available';

      const response = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credentials/stores/status`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        stores: [
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
      globalThis.credentialStoreTestScenario = 'keychain-non-functional';

      const response = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credentials/stores/status`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        stores: [
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
      globalThis.credentialStoreTestScenario = 'memory-only';

      const response = await makeRequest(
        `/tenants/${tenantId}/projects/${projectId}/credentials/stores/status`,
        {
          method: 'GET',
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        stores: [
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

  describe('POST /stores/:storeId/set', () => {
    const storeId = 'test-store';

    it('should successfully set a credential in the store', async () => {
      globalThis.credentialStoreSetTestScenario = 'default';
      
      const requestBody = {
        key: 'test-key',
        value: 'test-value',
      };

      const response = await makeRequest(`tenants/${tenantId}/projects/${projectId}/credentials/stores/${storeId}/set`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        success: true,
        message: `Credential 'test-key' successfully stored in memory store 'test-store'`,
      });
    });

    it('should return 404 when credential store is not found', async () => {
      globalThis.credentialStoreSetTestScenario = 'store-not-found';

      const requestBody = {
        key: 'test-key',
        value: 'test-value',
      };

      const response = await makeRequest(`tenants/${tenantId}/projects/${projectId}/credentials/stores/${storeId}/set`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error.message).toBe("Credential store 'test-store' not found");
    });

    it('should return 500 when credential store is not available', async () => {
      globalThis.credentialStoreSetTestScenario = 'store-unavailable';

      const requestBody = {
        key: 'test-key',
        value: 'test-value',
      };

      const response = await makeRequest(`tenants/${tenantId}/projects/${projectId}/credentials/stores/unavailable-store/set`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error.message).toContain("Credential store 'unavailable-store' is not available: Store is offline");
    });

    it('should handle store.set() errors gracefully', async () => {
      globalThis.credentialStoreSetTestScenario = 'set-error';

      const requestBody = {
        key: 'test-key',
        value: 'test-value',
      };

      const response = await makeRequest(`tenants/${tenantId}/projects/${projectId}/credentials/stores/${storeId}/set`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error.message).toBe('Failed to store credential: Storage failed');
    });

    it('should validate request body schema', async () => {
      globalThis.credentialStoreSetTestScenario = 'default';
      
      const invalidBody = {
        key: 'test-key',
        // missing value
      };

      const response = await makeRequest(`tenants/${tenantId}/projects/${projectId}/credentials/stores/${storeId}/set`, {
        method: 'POST',
        body: JSON.stringify(invalidBody),
      });
      
      expect(response.status).toBe(400);
    });

    it('should handle keychain store type', async () => {
      globalThis.credentialStoreSetTestScenario = 'keychain-store';

      const requestBody = {
        key: 'test-key',
        value: 'test-value',
      };

      const response = await makeRequest(`tenants/${tenantId}/projects/${projectId}/credentials/stores/keychain-store/set`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toContain("keychain store 'keychain-store'");
    });

    it('should handle nango store type', async () => {
      globalThis.credentialStoreSetTestScenario = 'nango-store';

      const requestBody = {
        key: 'test-key',
        value: 'test-value',
      };

      const response = await makeRequest(`tenants/${tenantId}/projects/${projectId}/credentials/stores/nango-store/set`, {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toContain("nango store 'nango-store'");
    });
  });
});
