import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCredentialStore } from '../../credential-stores/memory-store.js';

describe('InMemoryCredentialStore', () => {
  let store: InMemoryCredentialStore;
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear test environment variables to ensure clean state
    delete process.env.TEST_KEY;
    delete process.env.API_KEY;
    delete process.env.OPENAI_KEY;
    delete process.env.DEFINED;
    delete process.env.EMPTY;
    delete process.env.OTHER_VAR;

    store = new InMemoryCredentialStore('test-store');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Basic Functionality', () => {
    it('should have correct id and type', () => {
      expect(store.id).toBe('test-store');
      expect(store.type).toBe('memory');
    });

    it('should store and retrieve credentials', async () => {
      await store.set('MY_KEY', 'my_value');
      expect(await store.get('MY_KEY')).toBe('my_value');
    });

    it('should return null for non-existent keys', async () => {
      expect(await store.get('NON_EXISTENT')).toBeNull();
    });

    it('should check if credentials exist in memory only', async () => {
      await store.set('EXISTS', 'value');
      expect(await store.has('EXISTS')).toBe(true);
      expect(await store.has('DOES_NOT_EXIST')).toBe(false);
    });

    it('should not check environment variables with has()', async () => {
      // Set environment variable
      process.env.ENV_CREDENTIAL = 'env_value';

      // has() should only check in-memory, not env vars
      expect(await store.has('ENV_CREDENTIAL')).toBe(false);

      // But get() should find it via fallback
      expect(await store.get('ENV_CREDENTIAL')).toBe('env_value');

      // Clean up
      delete process.env.ENV_CREDENTIAL;
    });

    it('should delete credentials', async () => {
      await store.set('TO_DELETE', 'value');
      expect(await store.has('TO_DELETE')).toBe(true);

      const deleted = await store.delete('TO_DELETE');
      expect(deleted).toBe(true);
      expect(await store.has('TO_DELETE')).toBe(false);
    });

    it('should return false when deleting non-existent key', async () => {
      const deleted = await store.delete('NON_EXISTENT');
      expect(deleted).toBe(false);
    });
  });

  describe('Environment Variable Fallback', () => {
    it('should fallback to environment variables when key not in memory', async () => {
      // Set up environment variable
      process.env.TEST_KEY = 'env_value';
      process.env.API_KEY = 'secret_api_key';

      // Should find env values via fallback
      expect(await store.get('TEST_KEY')).toBe('env_value');
      expect(await store.get('API_KEY')).toBe('secret_api_key');

      // Clean up
      delete process.env.TEST_KEY;
      delete process.env.API_KEY;
    });

    it('should cache environment variables once loaded', async () => {
      // Set up environment variable
      process.env.CACHE_TEST = 'env_value';

      // First call should load from env and cache
      expect(await store.get('CACHE_TEST')).toBe('env_value');

      // Change env value
      process.env.CACHE_TEST = 'changed_value';

      // Should still return cached value
      expect(await store.get('CACHE_TEST')).toBe('env_value');

      // Clean up
      delete process.env.CACHE_TEST;
    });

    it('should allow runtime credentials to override environment credentials', async () => {
      // Set up environment variable
      process.env.TEST_KEY = 'env_value';

      // Should initially get env value via fallback
      expect(await store.get('TEST_KEY')).toBe('env_value');

      // Override with runtime value
      await store.set('TEST_KEY', 'runtime_value');
      expect(await store.get('TEST_KEY')).toBe('runtime_value');

      // Clean up
      delete process.env.TEST_KEY;
    });

    it('should treat empty environment variable values as null', async () => {
      // Set up environment variable with empty value
      process.env.EMPTY_VAR = '';

      // Should return null (empty strings are treated as invalid credentials)
      expect(await store.get('EMPTY_VAR')).toBeNull();

      // Clean up
      delete process.env.EMPTY_VAR;
    });

    it('should return null when key exists nowhere', async () => {
      // Ensure key doesn't exist in env or memory
      delete process.env.NONEXISTENT_KEY;

      expect(await store.get('NONEXISTENT_KEY')).toBeNull();
    });

    it('should not delete environment variables', async () => {
      // Set up environment variable
      process.env.DELETE_TEST = 'env_value';

      // Load it into cache via get
      expect(await store.get('DELETE_TEST')).toBe('env_value');

      // Delete should only remove from memory, not env
      const deleted = await store.delete('DELETE_TEST');
      expect(deleted).toBe(true);

      // Should still be able to get from env again
      expect(await store.get('DELETE_TEST')).toBe('env_value');

      // Clean up
      delete process.env.DELETE_TEST;
    });
  });
});
