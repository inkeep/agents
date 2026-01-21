import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialStoreType } from '../../types/index.js';

// Mock Entry class instance methods
class MockEntry {
  constructor(
    public service: string,
    public account: string
  ) {}

  getPassword = vi.fn();
  setPassword = vi.fn();
  deletePassword = vi.fn();
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
    vi.clearAllMocks();

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
      MockEntry.prototype.setPassword.mockReturnValueOnce(undefined);
      MockEntry.prototype.getPassword.mockReturnValueOnce('[]'); // key index

      await store.set(key, value);

      // Verify setPassword was called on Entry instances
      expect(MockEntry.prototype.setPassword).toHaveBeenCalled();

      // Mock successful get operation
      MockEntry.prototype.getPassword.mockReturnValueOnce(value);

      const retrieved = await store.get(key);
      expect(retrieved).toBe(value);
    });

    it('should return null for non-existent keys', async () => {
      MockEntry.prototype.getPassword.mockReturnValueOnce(null);

      const result = await store.get('NON_EXISTENT');
      expect(result).toBeNull();
    });

    it('should check if credentials exist', async () => {
      MockEntry.prototype.getPassword.mockReturnValueOnce('exists');
      expect(await store.has('EXISTS')).toBe(true);

      MockEntry.prototype.getPassword.mockReturnValueOnce(null);
      expect(await store.has('DOES_NOT_EXIST')).toBe(false);
    });

    it('should delete credentials', async () => {
      // Mock key index retrieval and update
      MockEntry.prototype.getPassword.mockReturnValueOnce('["TO_DELETE"]'); // key index
      MockEntry.prototype.setPassword.mockReturnValueOnce(undefined); // update index
      MockEntry.prototype.deletePassword.mockReturnValueOnce(undefined);

      const deleted = await store.delete('TO_DELETE');
      expect(MockEntry.prototype.deletePassword).toHaveBeenCalled();
      expect(deleted).toBe(true);
    });

    it('should return true even when deleting non-existent key', async () => {
      // Mock key index retrieval
      MockEntry.prototype.getPassword.mockReturnValueOnce('[]'); // empty key index
      MockEntry.prototype.deletePassword.mockReturnValueOnce(undefined);

      const deleted = await store.delete('NON_EXISTENT');
      expect(deleted).toBe(true);
    });
  });

  describe('Service Isolation', () => {
    it('should use custom service prefix', async () => {
      const customStore = new KeyChainStore('custom-id', 'my-app');
      await new Promise((resolve) => setTimeout(resolve, 50));

      MockEntry.prototype.getPassword.mockReturnValueOnce('value');

      const result = await customStore.get('KEY');
      expect(result).toBe('value');
      expect(MockEntry.prototype.getPassword).toHaveBeenCalled();
    });
  });

  describe('Find and Clear Operations', () => {
    it('should find all credentials for the service', async () => {
      // Mock the key index containing two keys
      MockEntry.prototype.getPassword
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
      MockEntry.prototype.getPassword
        .mockReturnValueOnce('["KEY1","KEY2"]') // key index for findAllCredentials
        .mockReturnValueOnce('value1') // KEY1 value
        .mockReturnValueOnce('value2') // KEY2 value
        .mockReturnValueOnce('["KEY1","KEY2"]') // key index for delete KEY1
        .mockReturnValueOnce('["KEY2"]') // key index for delete KEY2
        .mockReturnValueOnce(null); // key index doesn't exist after final delete

      MockEntry.prototype.setPassword
        .mockReturnValueOnce(undefined) // update index after KEY1 delete
        .mockReturnValueOnce(undefined); // update index after KEY2 delete

      MockEntry.prototype.deletePassword
        .mockReturnValueOnce(undefined) // delete KEY1
        .mockReturnValueOnce(undefined) // delete KEY2
        .mockReturnValueOnce(undefined); // delete key index

      const deletedCount = await store.clearAll();
      expect(deletedCount).toBe(2);
      expect(MockEntry.prototype.deletePassword).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors when getting credentials', async () => {
      MockEntry.prototype.getPassword.mockImplementationOnce(() => {
        throw new Error('Keychain error');
      });

      const result = await store.get('ERROR_KEY');
      expect(result).toBeNull();
    });

    it('should throw error when setting credentials fails', async () => {
      MockEntry.prototype.setPassword.mockImplementationOnce(() => {
        throw new Error('Keychain error');
      });

      await expect(store.set('ERROR_KEY', 'value')).rejects.toThrow(
        'Failed to store credential in keychain: Keychain error'
      );
    });

    it('should handle errors when deleting credentials', async () => {
      MockEntry.prototype.deletePassword.mockImplementationOnce(() => {
        throw new Error('Keychain error');
      });

      const result = await store.delete('ERROR_KEY');
      expect(result).toBe(false);
    });

    it('should handle errors when finding credentials', async () => {
      MockEntry.prototype.getPassword.mockImplementationOnce(() => {
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
