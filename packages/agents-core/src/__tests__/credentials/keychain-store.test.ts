import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialStoreType } from '../../types/index.js';

// Mock the keytar module
const mockKeytar = {
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn(),
};

// Setup mock before any imports
vi.doMock('keytar', () => ({
  default: mockKeytar,
}));

// Import after mocking
const { KeyChainStore } = await import('../../credential-stores/keychain-store.js');

describe('KeyChainStore', () => {
  let store: InstanceType<typeof KeyChainStore>;
  let keytarMock: typeof mockKeytar;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Get the mocked keytar functions
    keytarMock = mockKeytar;

    // Create a new store instance
    store = new KeyChainStore('test-store');

    // Wait for initialization to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe('Basic Functionality', () => {
    it('should have correct id and type', () => {
      expect(store.id).toBe('test-store');
      expect(store.type).toBe(CredentialStoreType.keychain);
    });

    it('should store and retrieve credentials', async () => {
      const key = 'TEST_KEY';
      const value = 'test_value';

      // Mock successful operations
      keytarMock.setPassword.mockResolvedValueOnce(undefined);
      keytarMock.getPassword.mockResolvedValueOnce(value);

      await store.set(key, value);
      expect(keytarMock.setPassword).toHaveBeenCalledWith(
        'inkeep-agent-framework-test-store',
        key,
        value
      );

      const retrieved = await store.get(key);
      expect(keytarMock.getPassword).toHaveBeenCalledWith('inkeep-agent-framework-test-store', key);
      expect(retrieved).toBe(value);
    });

    it('should return null for non-existent keys', async () => {
      keytarMock.getPassword.mockResolvedValueOnce(null);

      const result = await store.get('NON_EXISTENT');
      expect(result).toBeNull();
    });

    it('should check if credentials exist', async () => {
      keytarMock.getPassword.mockResolvedValueOnce('exists');
      expect(await store.has('EXISTS')).toBe(true);

      keytarMock.getPassword.mockResolvedValueOnce(null);
      expect(await store.has('DOES_NOT_EXIST')).toBe(false);
    });

    it('should delete credentials', async () => {
      keytarMock.deletePassword.mockResolvedValueOnce(true);

      const deleted = await store.delete('TO_DELETE');
      expect(keytarMock.deletePassword).toHaveBeenCalledWith(
        'inkeep-agent-framework-test-store',
        'TO_DELETE'
      );
      expect(deleted).toBe(true);
    });

    it('should return false when deleting non-existent key', async () => {
      keytarMock.deletePassword.mockResolvedValueOnce(false);

      const deleted = await store.delete('NON_EXISTENT');
      expect(deleted).toBe(false);
    });
  });

  describe('Service Isolation', () => {
    it('should use custom service prefix', async () => {
      const customStore = new KeyChainStore('custom-id', 'my-app');
      await new Promise((resolve) => setTimeout(resolve, 50));

      keytarMock.getPassword.mockResolvedValueOnce('value');

      await customStore.get('KEY');
      expect(keytarMock.getPassword).toHaveBeenCalledWith('my-app-custom-id', 'KEY');
    });
  });

  describe('Find and Clear Operations', () => {
    it('should find all credentials for the service', async () => {
      const mockCredentials = [
        { account: 'KEY1', password: 'value1' },
        { account: 'KEY2', password: 'value2' },
      ];

      keytarMock.findCredentials.mockResolvedValueOnce(mockCredentials);

      const credentials = await store.findAllCredentials();
      expect(keytarMock.findCredentials).toHaveBeenCalledWith('inkeep-agent-framework-test-store');
      expect(credentials).toEqual(mockCredentials);
    });

    it('should clear all credentials', async () => {
      const mockCredentials = [
        { account: 'KEY1', password: 'value1' },
        { account: 'KEY2', password: 'value2' },
      ];

      keytarMock.findCredentials.mockResolvedValueOnce(mockCredentials);
      keytarMock.deletePassword.mockResolvedValue(true);

      const deletedCount = await store.clearAll();
      expect(deletedCount).toBe(2);
      expect(keytarMock.deletePassword).toHaveBeenCalledTimes(2);
      expect(keytarMock.deletePassword).toHaveBeenCalledWith(
        'inkeep-agent-framework-test-store',
        'KEY1'
      );
      expect(keytarMock.deletePassword).toHaveBeenCalledWith(
        'inkeep-agent-framework-test-store',
        'KEY2'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle errors when getting credentials', async () => {
      keytarMock.getPassword.mockRejectedValueOnce(new Error('Keychain error'));

      const result = await store.get('ERROR_KEY');
      expect(result).toBeNull();
    });

    it('should throw error when setting credentials fails', async () => {
      keytarMock.setPassword.mockRejectedValueOnce(new Error('Keychain error'));

      await expect(store.set('ERROR_KEY', 'value')).rejects.toThrow(
        'Failed to store credential in keychain: Keychain error'
      );
    });

    it('should handle errors when deleting credentials', async () => {
      keytarMock.deletePassword.mockRejectedValueOnce(new Error('Keychain error'));

      const result = await store.delete('ERROR_KEY');
      expect(result).toBe(false);
    });

    it('should handle errors when finding credentials', async () => {
      keytarMock.findCredentials.mockRejectedValueOnce(new Error('Keychain error'));

      const result = await store.findAllCredentials();
      expect(result).toEqual([]);
    });
  });
});

describe('KeyChainStore without keytar', () => {
  it('should handle unavailable keytar gracefully', async () => {
    // Reset module cache to simulate keytar not being available
    vi.resetModules();
    vi.doMock('keytar', () => {
      throw new Error('Module not found');
    });

    const { KeyChainStore: KeyChainStoreClass } = await import(
      '../../credential-stores/keychain-store.js'
    );
    const store = new KeyChainStoreClass('test-store');

    // Wait for initialization attempt to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should return null/false for all operations
    expect(await store.get('KEY')).toBeNull();
    expect(await store.has('KEY')).toBe(false);
    expect(await store.delete('KEY')).toBe(false);
    expect(await store.findAllCredentials()).toEqual([]);

    // Setting should throw when keytar is not available
    await expect(store.set('KEY', 'value')).rejects.toThrow(
      'Keytar not available - cannot store credentials in system keychain'
    );
  });
});
