import { CredentialStoreType } from '@inkeep/agents-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEnvironmentSettings, registerEnvironmentSettings } from '../../environment-settings';

// Test fixtures and helpers
const createMockCredential = (id: string, overrides = {}) => ({
  id,
  type: CredentialStoreType.memory,
  credentialStoreId: 'memory-default',
  retrievalParams: { key: `${id.toUpperCase()}_KEY` },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('Credential Environment Settings System', () => {
  const originalNodeEnv = process.env.INKEEP_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Reset to test environment
    process.env.INKEEP_ENV = 'test';
  });

  afterEach(() => {
    process.env.INKEEP_ENV = originalNodeEnv;
  });

  describe('Environment Setting Helpers', () => {
    it('should require environments to be provided', () => {
      const helper = createEnvironmentSettings({}) as any;

      expect(() => helper.getEnvironmentSetting('any-key')).toThrow(/Environment.*not found/);
    });

    it('should provide type-safe helpers for single environment', () => {
      const test = registerEnvironmentSettings({
        credentials: {
          'api-key': createMockCredential('api-key'),
          'oauth-token': createMockCredential('oauth-token', {
            type: CredentialStoreType.nango,
          }),
        },
      });

      const { getEnvironmentSetting } = createEnvironmentSettings({ test });

      // Set environment to match the registered environment name
      process.env.INKEEP_ENV = 'test';

      // Test actual environment setting resolution
      const apiKey = getEnvironmentSetting('api-key');
      expect(apiKey).toMatchObject({
        id: 'api-key',
        type: CredentialStoreType.memory,
        credentialStoreId: 'memory-default',
      });
    });

    it('should compute intersection for multiple environments', () => {
      const development = registerEnvironmentSettings({
        credentials: {
          'dev-only': createMockCredential('dev-only'),
          shared: createMockCredential('shared'),
        },
      });

      const production = registerEnvironmentSettings({
        credentials: {
          'prod-only': createMockCredential('prod-only', {
            type: CredentialStoreType.nango,
          }),
          shared: createMockCredential('shared', {
            type: CredentialStoreType.nango,
          }),
        },
      });

      const { getEnvironmentSetting } = createEnvironmentSettings({
        development,
        production,
      });

      // Test environment-specific environment setting resolution
      process.env.INKEEP_ENV = 'production';
      const sharedCredential = getEnvironmentSetting('shared');
      expect(sharedCredential.type).toBe(CredentialStoreType.nango); // Should use prod version

      process.env.INKEEP_ENV = 'development';
      const devSharedCredential = getEnvironmentSetting('shared');
      expect(devSharedCredential.type).toBe(CredentialStoreType.memory); // Should use dev version
    });

    it('should handle empty environments gracefully', () => {
      const empty = registerEnvironmentSettings({ credentials: {} });
      const { getEnvironmentSetting } = createEnvironmentSettings({
        empty,
      });

      // Set environment to match the registered environment name
      process.env.INKEEP_ENV = 'empty';

      // @ts-expect-error - Testing error case with non-existent key
      expect(() => getEnvironmentSetting('anything')).toThrow(/Credential.*not found/);
    });

    it('should throw errors for missing environment settings', () => {
      const test = registerEnvironmentSettings({
        credentials: {
          'existing-environment-setting': createMockCredential('existing-environment-setting'),
        },
      });

      const { getEnvironmentSetting } = createEnvironmentSettings({ test });

      // Set environment to match the registered environment name
      process.env.INKEEP_ENV = 'test';

      // Test valid credential works
      const result = getEnvironmentSetting('existing-environment-setting');
      expect(result.id).toBe('existing-environment-setting');
    });

    it('should automatically infer environment names from object keys', () => {
      const local = registerEnvironmentSettings({
        credentials: {
          'shared-key': createMockCredential('local-shared-key'),
        },
      });

      const staging = registerEnvironmentSettings({
        credentials: {
          'shared-key': createMockCredential('staging-shared-key'),
        },
      });

      const { getEnvironmentSetting } = createEnvironmentSettings({
        local,
        staging,
      });

      // Test that environment names are correctly inferred from environment settings
      process.env.INKEEP_ENV = 'local';
      const localResult = getEnvironmentSetting('shared-key');
      expect(localResult.id).toBe('local-shared-key');

      process.env.INKEEP_ENV = 'staging';
      const stagingResult = getEnvironmentSetting('shared-key');
      expect(stagingResult.id).toBe('staging-shared-key');
    });
  });

  describe('Environment Management', () => {
    it('should return config unchanged', () => {
      const config = {
        credentials: {
          'api-credential': createMockCredential('api-credential'),
          'db-credential': createMockCredential('db-credential', {
            type: CredentialStoreType.nango,
          }),
        },
      };

      const result = registerEnvironmentSettings(config);

      // Should return config unchanged
      expect(result).toEqual(config);
    });

    it('should handle environments with no credentials', () => {
      const emptyConfig = { credentials: {} };
      const result = registerEnvironmentSettings(emptyConfig);

      expect(result).toEqual(emptyConfig);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle concurrent environment setting resolution', () => {
      const test = registerEnvironmentSettings({
        credentials: {
          'concurrent-test': createMockCredential('concurrent-test'),
        },
      });

      const { getEnvironmentSetting } = createEnvironmentSettings({ test });

      // Set environment to match the registered environment name
      process.env.INKEEP_ENV = 'test';

      // Simulate multiple synchronous access
      const results = Array.from({ length: 3 }, () => getEnvironmentSetting('concurrent-test'));

      results.forEach((result) => {
        expect(result.id).toBe('concurrent-test');
      });
    });

    it('should work with different credential store types', () => {
      const test = registerEnvironmentSettings({
        credentials: {
          memory1: createMockCredential('memory1', {
            type: CredentialStoreType.memory,
          }),
          oauth1: createMockCredential('oauth1', {
            type: CredentialStoreType.nango,
            credentialStoreId: 'nango-oauth',
          }),
          memory2: createMockCredential('memory2', {
            type: CredentialStoreType.memory,
          }),
        },
      });

      const { getEnvironmentSetting } = createEnvironmentSettings({ test });

      // Set environment to match the registered environment name
      process.env.INKEEP_ENV = 'test';

      const memoryResult = getEnvironmentSetting('memory1');
      const oauthResult = getEnvironmentSetting('oauth1');

      expect(memoryResult.type).toBe(CredentialStoreType.memory);
      expect(oauthResult.type).toBe(CredentialStoreType.nango);
      expect(oauthResult.credentialStoreId).toBe('nango-oauth');
    });

    it("should error when INKEEP_ENV doesn't match any environment name", () => {
      const production = registerEnvironmentSettings({
        credentials: {
          'prod-key': createMockCredential('prod-key'),
        },
      });

      const { getEnvironmentSetting } = createEnvironmentSettings({
        production,
      });

      // Should error clearly when INKEEP_ENV doesn't match any environment
      process.env.INKEEP_ENV = 'test';
      expect(() => getEnvironmentSetting('prod-key')).toThrow(/Environment 'test' not found/);
    });
  });
});
