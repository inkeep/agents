import { describe, expect, it } from 'vitest';
import { getCredentialStoreLookupKeyFromRetrievalParams } from '../../utils/credential-store-utils.js';

describe('getCredentialStoreLookupKeyFromRetrievalParams', () => {
  describe('key-based lookup', () => {
    it('should return the key when retrievalParams has a key property', () => {
      const retrievalParams = {
        key: 'MEMORY_API_KEY',
        other: 'ignored',
      };

      const result = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'memory',
      });

      expect(result).toBe('MEMORY_API_KEY');
    });

    it('should prioritize key over store-specific logic', () => {
      const retrievalParams = {
        key: 'EXPLICIT_KEY',
        connectionId: 'conn-123',
        providerConfigKey: 'slack-workspace',
      };

      const result = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'nango',
      });

      // Should use explicit key, not nango JSON format
      expect(result).toBe('EXPLICIT_KEY');
    });

    it('should handle key with complex string values', () => {
      const retrievalParams = {
        key: 'complex:key/with-special_characters.123',
      };

      const result = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'vault',
      });

      expect(result).toBe('complex:key/with-special_characters.123');
    });
  });

  describe('nango store type', () => {
    it('should generate JSON lookup key for nango store type', () => {
      const retrievalParams = {
        connectionId: 'slack-connection-123',
        providerConfigKey: 'slack-main-workspace',
        provider: 'slack',
        authMode: 'OAUTH2',
      };

      const result = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'nango',
      });

      const expectedLookupKey = JSON.stringify({
        connectionId: 'slack-connection-123',
        providerConfigKey: 'slack-main-workspace',
      });

      expect(result).toBe(expectedLookupKey);
    });

    it('should generate JSON key with only required fields for nango', () => {
      const retrievalParams = {
        connectionId: 'intercom-conn',
        providerConfigKey: 'intercom-workspace',
        provider: 'intercom',
        authMode: 'API_KEY',
        extraField: 'ignored',
        metadata: { ignored: 'too' },
      };

      const result = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'nango',
      });

      const expectedLookupKey = JSON.stringify({
        connectionId: 'intercom-conn',
        providerConfigKey: 'intercom-workspace',
      });

      expect(result).toBe(expectedLookupKey);
    });

    it('should handle missing connectionId or providerConfigKey for nango', () => {
      const retrievalParamsNoConnection = {
        providerConfigKey: 'slack-workspace',
        provider: 'slack',
      };

      const result1 = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams: retrievalParamsNoConnection,
        credentialStoreType: 'nango',
      });

      const retrievalParamsNoProvider = {
        connectionId: 'slack-connection',
        provider: 'slack',
      };

      const result2 = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams: retrievalParamsNoProvider,
        credentialStoreType: 'nango',
      });

      // Should still generate JSON, but with undefined values
      expect(result1).toBe(
        JSON.stringify({
          connectionId: undefined,
          providerConfigKey: 'slack-workspace',
        })
      );

      expect(result2).toBe(
        JSON.stringify({
          connectionId: 'slack-connection',
          providerConfigKey: undefined,
        })
      );
    });
  });

  describe('unknown store types', () => {
    it('should return null for unknown store types without key', () => {
      const retrievalParams = {
        someField: 'someValue',
        anotherField: 123,
      };

      const result = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'unknown-store',
      });

      expect(result).toBeNull();
    });

    it('should return null for memory store type without key', () => {
      const retrievalParams = {
        source: 'environment',
        variable: 'API_KEY',
      };

      const result = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'memory',
      });

      expect(result).toBeNull();
    });

    it('should return null for vault store type without key', () => {
      const retrievalParams = {
        path: 'secret/api-keys',
        field: 'slack-key',
      };

      const result = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'vault',
      });

      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty retrievalParams', () => {
      const result = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams: {},
        credentialStoreType: 'memory',
      });

      expect(result).toBeNull();
    });

    it('should handle null/undefined values in retrievalParams', () => {
      const retrievalParams = {
        key: null,
        connectionId: 'valid-id',
        providerConfigKey: undefined,
      };

      const result = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'nango',
      });

      // key is falsy, so should use nango logic
      const expectedLookupKey = JSON.stringify({
        connectionId: 'valid-id',
        providerConfigKey: undefined,
      });

      expect(result).toBe(expectedLookupKey);
    });

    it('should handle non-string key values', () => {
      const retrievalParams = {
        key: 123, // number instead of string
      };

      const result = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'memory',
      });

      expect(result).toBe(123); // Type cast, not conversion
    });

    it('should handle boolean key values', () => {
      const retrievalParams = {
        key: true,
      };

      const result = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'vault',
      });

      expect(result).toBe(true); // Type cast, not conversion
    });

    it('should handle empty string key', () => {
      const retrievalParams = {
        key: '',
        connectionId: 'fallback-id',
        providerConfigKey: 'fallback-key',
      };

      const result = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'nango',
      });

      // Empty string is falsy, should use nango logic
      const expectedLookupKey = JSON.stringify({
        connectionId: 'fallback-id',
        providerConfigKey: 'fallback-key',
      });

      expect(result).toBe(expectedLookupKey);
    });
  });

  describe('type safety and consistency', () => {
    it('should handle case sensitivity in store types', () => {
      const retrievalParams = {
        connectionId: 'test-id',
        providerConfigKey: 'test-key',
      };

      // Test exact match (should work)
      const result1 = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'nango',
      });

      // Test case mismatch (should not match)
      const result2 = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'NANGO',
      });

      expect(result1).toBe(
        JSON.stringify({
          connectionId: 'test-id',
          providerConfigKey: 'test-key',
        })
      );

      expect(result2).toBeNull(); // Case sensitive, should not match
    });

    it('should produce consistent JSON formatting for nango', () => {
      const retrievalParams = {
        connectionId: 'test-connection',
        providerConfigKey: 'test-provider',
      };

      const result1 = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'nango',
      });

      const result2 = getCredentialStoreLookupKeyFromRetrievalParams({
        retrievalParams,
        credentialStoreType: 'nango',
      });

      // Should produce identical strings
      expect(result1).toBe(result2);

      // Should be valid JSON
      expect(() => JSON.parse(result1!)).not.toThrow();

      // Should have expected structure
      const parsed = JSON.parse(result1!);
      expect(parsed).toEqual({
        connectionId: 'test-connection',
        providerConfigKey: 'test-provider',
      });
    });
  });
});
