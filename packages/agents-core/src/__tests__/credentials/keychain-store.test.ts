import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialStoreType } from '../../types/index.js';

// Mock functions that will be used by MockEntry
const mockGetPassword = vi.fn();
const mockSetPassword = vi.fn();
const mockDeletePassword = vi.fn();

class MockEntry {
  service: string;
  account: string;

  constructor(service: string, account: string) {
    this.service = service;
    this.account = account;
  }

  getPassword() {
    return mockGetPassword();
  }

  setPassword(password: string) {
    return mockSetPassword(password);
  }

  deletePassword() {
    return mockDeletePassword();
  }
}

// Setup mock before any imports
vi.doMock('@napi-rs/keyring', () => ({
  Entry: MockEntry,
}));

// Import after mocking
const { KeyChainStore } = await import('../../credential-stores/keychain-store.js');

describe('KeyChainStore', () => {
  let store: InstanceType<typeof KeyChainStore>;

  beforeEach(async () => {
    // Reset all mocks
    mockGetPassword.mockReset();
    mockSetPassword.mockReset();
    mockDeletePassword.mockReset();

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

      // Mock successful set operation
      mockSetPassword.mockReturnValueOnce(undefined);
      mockGetPassword.mockReturnValueOnce('[]'); // key index

      await store.set(key, value);

      // Verify setPassword was called on Entry instances
      expect(mockSetPassword).toHaveBeenCalled();

      // Mock successful get operation
      mockGetPassword.mockReturnValueOnce(value);

      const retrieved = await store.get(key);
      expect(retrieved).toBe(value);
    });

    it('should return null for non-existent keys', async () => {
      mockGetPassword.mockReturnValueOnce(null);

      const result = await store.get('NON_EXISTENT');
      expect(result).toBeNull();
    });

    it('should check if credentials exist', async () => {
      mockGetPassword.mockReturnValueOnce('exists');
      expect(await store.has('EXISTS')).toBe(true);

      mockGetPassword.mockReturnValueOnce(null);
      expect(await store.has('DOES_NOT_EXIST')).toBe(false);
    });

    it('should delete credentials', async () => {
      // Mock key index retrieval and update
      mockGetPassword.mockReturnValueOnce('["TO_DELETE"]'); // key index
      mockSetPassword.mockReturnValueOnce(undefined); // update index
      mockDeletePassword.mockReturnValueOnce(undefined);

      const deleted = await store.delete('TO_DELETE');
      expect(mockDeletePassword).toHaveBeenCalled();
      expect(deleted).toBe(true);
    });

    it('should return true even when deleting non-existent key', async () => {
      // Mock key index retrieval
      mockGetPassword.mockReturnValueOnce('[]'); // empty key index
      mockDeletePassword.mockReturnValueOnce(undefined);

      const deleted = await store.delete('NON_EXISTENT');
      expect(deleted).toBe(true);
    });
  });

  describe('Service Isolation', () => {
    it('should use custom service prefix', async () => {
      const customStore = new KeyChainStore('custom-id', 'my-app');
      await new Promise((resolve) => setTimeout(resolve, 50));

      mockGetPassword.mockReturnValueOnce('value');

      const result = await customStore.get('KEY');
      expect(result).toBe('value');
      expect(mockGetPassword).toHaveBeenCalled();
    });
  });

  describe('Find and Clear Operations', () => {
    it('should find all credentials for the service', async () => {
      // Mock the key index containing two keys
      mockGetPassword
        .mockReturnValueOnce('["KEY1","KEY2"]') // key index
        .mockReturnValueOnce('value1') // KEY1 value
        .mockReturnValueOnce('value2'); // KEY2 value

      const credentials = await store.findAllCredentials();
      expect(credentials).toEqual([
        { account: 'KEY1', password: 'value1' },
        { account: 'KEY2', password: 'value2' },
      ]);
    });

    it('should clear all credentials', async () => {
      // Mock findAllCredentials: key index + values
      mockGetPassword
        .mockReturnValueOnce('["KEY1","KEY2"]') // key index for findAllCredentials
        .mockReturnValueOnce('value1') // KEY1 value
        .mockReturnValueOnce('value2') // KEY2 value
        .mockReturnValueOnce('["KEY1","KEY2"]') // key index for delete KEY1
        .mockReturnValueOnce('["KEY2"]') // key index for delete KEY2
        .mockReturnValueOnce(null); // key index doesn't exist after final delete

      mockSetPassword
        .mockReturnValueOnce(undefined) // update index after KEY1 delete
        .mockReturnValueOnce(undefined); // update index after KEY2 delete

      mockDeletePassword
        .mockReturnValueOnce(undefined) // delete KEY1
        .mockReturnValueOnce(undefined) // delete KEY2
        .mockReturnValueOnce(undefined); // delete key index

      const deletedCount = await store.clearAll();
      expect(deletedCount).toBe(2);
      expect(mockDeletePassword).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors when getting credentials', async () => {
      mockGetPassword.mockImplementationOnce(() => {
        throw new Error('Keychain error');
      });

      const result = await store.get('ERROR_KEY');
      expect(result).toBeNull();
    });

    it('should throw error when setting credentials fails', async () => {
      mockSetPassword.mockImplementationOnce(() => {
        throw new Error('Keychain error');
      });

      await expect(store.set('ERROR_KEY', 'value')).rejects.toThrow(
        'Failed to store credential in keychain: Keychain error'
      );
    });

    it('should handle errors when deleting credentials', async () => {
      mockDeletePassword.mockImplementationOnce(() => {
        throw new Error('Keychain error');
      });

      const result = await store.delete('ERROR_KEY');
      expect(result).toBe(false);
    });

    it('should handle errors when finding credentials', async () => {
      mockGetPassword.mockImplementationOnce(() => {
        throw new Error('Keychain error');
      });

      const result = await store.findAllCredentials();
      expect(result).toEqual([]);
    });
  });
});

describe('KeyChainStore without @napi-rs/keyring', () => {
  it('should handle unavailable keyring gracefully', async () => {
    // Reset module cache to simulate keyring not being available
    vi.resetModules();
    vi.doMock('@napi-rs/keyring', () => {
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

    // Setting should throw when keyring is not available
    await expect(store.set('KEY', 'value')).rejects.toThrow(
      'Keyring not available - cannot store credentials in system keychain'
    );
  });
});
