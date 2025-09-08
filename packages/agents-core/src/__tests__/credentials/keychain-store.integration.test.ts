import { beforeEach, describe, expect, it } from 'vitest';

import { createKeyChainStore, type KeyChainStore } from '../../credential-stores/keychain-store';

/**
 * Integration tests for KeyChainStore
 * These tests interact with the actual system keychain
 *
 * IMPORTANT: These tests are skipped in CI environments to avoid keychain access issues
 * Run locally with: pnpm test keychain-store.integration
 */

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

// Check if keytar is available at module level
let keytarAvailable = false;
try {
  await import('keytar');
  keytarAvailable = true;
} catch {
  console.warn('Keytar not available, integration tests will be skipped');
}

const shouldSkip = isCI || !keytarAvailable;

describe.skipIf(shouldSkip)('KeyChainStore Integration', () => {
  let store: KeyChainStore;
  const testServicePrefix = 'inkeep-test-' + Date.now(); // Unique prefix to avoid conflicts

  beforeEach(async () => {
    store = createKeyChainStore('integration-test', {
      servicePrefix: testServicePrefix,
    });

    // Clean up any existing test credentials
    await store.clearAll();
  });

  describe('Real Keychain Operations', () => {
    it('should store and retrieve credentials from system keychain', async () => {
      const key = 'TEST_INTEGRATION_KEY';
      const value = 'test_integration_value_' + Date.now();

      // Store credential
      await store.set(key, value);

      // Retrieve credential
      const retrieved = await store.get(key);
      expect(retrieved).toBe(value);

      // Verify existence
      expect(await store.has(key)).toBe(true);

      // Clean up
      await store.delete(key);
    });

    it('should handle multiple credentials', async () => {
      const credentials = [
        { key: 'API_KEY', value: 'api_secret_123' },
        { key: 'DB_PASSWORD', value: 'db_pass_456' },
        { key: 'TOKEN', value: 'token_789' },
      ];

      // Store multiple credentials
      for (const cred of credentials) {
        await store.set(cred.key, cred.value);
      }

      // Retrieve and verify all
      for (const cred of credentials) {
        const retrieved = await store.get(cred.key);
        expect(retrieved).toBe(cred.value);
      }

      // Find all credentials
      const allCreds = await store.findAllCredentials();
      expect(allCreds).toHaveLength(3);
      expect(allCreds.map((c) => c.account).sort()).toEqual(credentials.map((c) => c.key).sort());

      // Clean up
      await store.clearAll();
    });

    it('should update existing credentials', async () => {
      const key = 'UPDATABLE_KEY';
      const initialValue = 'initial_value';
      const updatedValue = 'updated_value';

      // Store initial value
      await store.set(key, initialValue);
      expect(await store.get(key)).toBe(initialValue);

      // Update value
      await store.set(key, updatedValue);
      expect(await store.get(key)).toBe(updatedValue);

      // Clean up
      await store.delete(key);
    });

    it('should delete credentials properly', async () => {
      const key = 'TO_DELETE';
      const value = 'deletable_value';

      // Store credential
      await store.set(key, value);
      expect(await store.has(key)).toBe(true);

      // Delete credential
      const deleted = await store.delete(key);
      expect(deleted).toBe(true);

      // Verify deletion
      expect(await store.has(key)).toBe(false);
      expect(await store.get(key)).toBeNull();

      // Deleting again should return false
      const deletedAgain = await store.delete(key);
      expect(deletedAgain).toBe(false);
    });

    it('should handle special characters in keys and values', async () => {
      const specialCases = [
        { key: 'KEY_WITH_SPACES', value: 'value with spaces' },
        { key: 'KEY-WITH-DASHES', value: 'value-with-dashes' },
        { key: 'KEY.WITH.DOTS', value: 'value.with.dots' },
        { key: 'KEY_WITH_UNICODE_🔑', value: 'value with emoji 🔒' },
        { key: 'KEY_WITH_JSON', value: JSON.stringify({ nested: { data: 'test' } }) },
      ];

      for (const testCase of specialCases) {
        await store.set(testCase.key, testCase.value);
        const retrieved = await store.get(testCase.key);
        expect(retrieved).toBe(testCase.value);
      }

      // Clean up
      await store.clearAll();
    });

    it('should handle large values', async () => {
      const key = 'LARGE_VALUE_KEY';
      // Create a large value (100KB of text)
      const largeValue = 'x'.repeat(100 * 1024);

      await store.set(key, largeValue);
      const retrieved = await store.get(key);
      expect(retrieved).toBe(largeValue);

      // Clean up
      await store.delete(key);
    });
  });

  describe('Service Isolation', () => {
    it('should isolate credentials between different store IDs', async () => {
      const store1 = createKeyChainStore('store1', { servicePrefix: testServicePrefix });
      const store2 = createKeyChainStore('store2', { servicePrefix: testServicePrefix });

      const key = 'SHARED_KEY';
      const value1 = 'value_for_store1';
      const value2 = 'value_for_store2';

      // Set same key in both stores with different values
      await store1.set(key, value1);
      await store2.set(key, value2);

      // Each store should retrieve its own value
      expect(await store1.get(key)).toBe(value1);
      expect(await store2.get(key)).toBe(value2);

      // Clean up
      await store1.clearAll();
      await store2.clearAll();
    });

    it('should not see credentials from other service prefixes', async () => {
      const otherStore = createKeyChainStore('other', {
        servicePrefix: 'completely-different-app',
      });

      const key = 'ISOLATED_KEY';
      await otherStore.set(key, 'other_value');

      // Current store should not see the other store's credential
      expect(await store.get(key)).toBeNull();
      expect(await store.has(key)).toBe(false);

      // Clean up
      await otherStore.clearAll();
    });
  });

  describe('clearAll Operation', () => {
    it('should clear only credentials for current service', async () => {
      // Set up credentials
      const keys = ['KEY1', 'KEY2', 'KEY3'];
      for (const key of keys) {
        await store.set(key, `value_${key}`);
      }

      // Verify all exist
      for (const key of keys) {
        expect(await store.has(key)).toBe(true);
      }

      // Clear all
      const deletedCount = await store.clearAll();
      expect(deletedCount).toBe(keys.length);

      // Verify all are gone
      for (const key of keys) {
        expect(await store.has(key)).toBe(false);
      }
    });
  });

  describe('Error Recovery', () => {
    it('should handle non-existent keys gracefully', async () => {
      expect(await store.get('NON_EXISTENT_KEY')).toBeNull();
      expect(await store.has('NON_EXISTENT_KEY')).toBe(false);
      expect(await store.delete('NON_EXISTENT_KEY')).toBe(false);
    });

    it('should handle empty keys and values', async () => {
      // Empty value might be rejected by keytar (requires non-empty password)
      try {
        await store.set('EMPTY_VALUE', '');
        expect(await store.get('EMPTY_VALUE')).toBe('');
        await store.delete('EMPTY_VALUE');
      } catch (error) {
        // Keytar requires non-empty passwords, which is expected
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Password is required');
      }

      // Empty key might be rejected by keytar, test the behavior
      try {
        await store.set('', 'value_for_empty_key');
        const result = await store.get('');
        expect(result).toBe('value_for_empty_key');
        await store.delete('');
      } catch (error) {
        // Some systems might reject empty keys, which is fine
        expect(error).toBeInstanceOf(Error);
      }
    });
  });
});
