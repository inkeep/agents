import { CredentialStoreType } from '@inkeep/agents-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mcpTool } from '../../builderFunctions';
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

const createMockTool = (id: string, overrides = {}) =>
  mcpTool({
    id,
    name: `Test Tool ${id}`,
    description: `Test tool for ${id}`,
    serverUrl: `https://api.example.com/${id}`,
    transport: { type: 'streamable_http' },
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

      expect(() => helper.getEnvrionmentCredential('any-key')).toThrow(/Environment.*not found/);
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

      const { getEnvironmentCredential: getEnvrionmentCredential } = createEnvironmentSettings({
        test,
      });

      // Set environment to match the registered environment name
      process.env.INKEEP_ENV = 'test';

      // Test actual environment setting resolution
      const apiKey = getEnvrionmentCredential('api-key');
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

      const { getEnvironmentCredential: getEnvrionmentCredential } = createEnvironmentSettings({
        development,
        production,
      });

      // Test environment-specific environment setting resolution
      process.env.INKEEP_ENV = 'production';
      const sharedCredential = getEnvrionmentCredential('shared');
      expect(sharedCredential.type).toBe(CredentialStoreType.nango); // Should use prod version

      process.env.INKEEP_ENV = 'development';
      const devSharedCredential = getEnvrionmentCredential('shared');
      expect(devSharedCredential.type).toBe(CredentialStoreType.memory); // Should use dev version
    });

    it('should handle empty environments gracefully', () => {
      const empty = registerEnvironmentSettings({ credentials: {} });
      const { getEnvironmentCredential: getEnvrionmentCredential } = createEnvironmentSettings({
        empty,
      });

      // Set environment to match the registered environment name
      process.env.INKEEP_ENV = 'empty';

      expect(() => getEnvrionmentCredential('anything' as never)).toThrow(/Credential.*not found/);
    });

    it('should throw errors for missing environment settings', () => {
      const test = registerEnvironmentSettings({
        credentials: {
          'existing-environment-setting': createMockCredential('existing-environment-setting'),
        },
      });

      const { getEnvironmentCredential: getEnvrionmentCredential } = createEnvironmentSettings({
        test,
      });

      // Set environment to match the registered environment name
      process.env.INKEEP_ENV = 'test';

      // Test valid credential works
      const result = getEnvrionmentCredential('existing-environment-setting');
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

      const { getEnvironmentCredential: getEnvrionmentCredential } = createEnvironmentSettings({
        local,
        staging,
      });

      // Test that environment names are correctly inferred from environment settings
      process.env.INKEEP_ENV = 'local';
      const localResult = getEnvrionmentCredential('shared-key');
      expect(localResult.id).toBe('local-shared-key');

      process.env.INKEEP_ENV = 'staging';
      const stagingResult = getEnvrionmentCredential('shared-key');
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

      const { getEnvironmentCredential: getEnvrionmentCredential } = createEnvironmentSettings({
        test,
      });

      // Set environment to match the registered environment name
      process.env.INKEEP_ENV = 'test';

      // Simulate multiple synchronous access
      const results = Array.from({ length: 3 }, () => getEnvrionmentCredential('concurrent-test'));

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

      const { getEnvironmentCredential: getEnvrionmentCredential } = createEnvironmentSettings({
        test,
      });

      // Set environment to match the registered environment name
      process.env.INKEEP_ENV = 'test';

      const memoryResult = getEnvrionmentCredential('memory1');
      const oauthResult = getEnvrionmentCredential('oauth1');

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

      const { getEnvironmentCredential: getEnvrionmentCredential } = createEnvironmentSettings({
        production,
      });

      // Should error clearly when INKEEP_ENV doesn't match any environment
      process.env.INKEEP_ENV = 'test';
      expect(() => getEnvrionmentCredential('prod-key')).toThrow(/Environment 'test' not found/);
    });
  });

  describe('MCP Server Environment Settings System', () => {
    it('should provide type-safe helpers for single environment with mcpServers', () => {
      const test = registerEnvironmentSettings({
        credentials: {
          'api-key': createMockCredential('api-key'),
        },
        mcpServers: {
          'search-tool': createMockTool('search-tool'),
          'fetch-tool': createMockTool('fetch-tool', {
            serverUrl: 'https://api.dev.example.com/fetch',
            activeTools: ['fetch', 'get'],
          }),
        },
      });

      const { getEnvironmentMcp } = createEnvironmentSettings({ test });

      // Set environment to match the registered environment name
      process.env.INKEEP_ENV = 'test';

      // Test actual tool resolution
      const searchTool = getEnvironmentMcp('search-tool');
      expect(searchTool.getId()).toBe('search-tool');
      expect(searchTool.getName()).toBe('Test Tool search-tool');
      expect(searchTool.getServerUrl()).toBe('https://api.example.com/search-tool');

      const fetchTool = getEnvironmentMcp('fetch-tool');
      expect(fetchTool.getId()).toBe('fetch-tool');
      expect(fetchTool.getName()).toBe('Test Tool fetch-tool');
      expect(fetchTool.getServerUrl()).toBe('https://api.dev.example.com/fetch');
      expect(fetchTool.getActiveTools()).toEqual(['fetch', 'get']);
    });

    it('should compute intersection for multiple environments with mcpServers', () => {
      const development = registerEnvironmentSettings({
        credentials: {
          'dev-only': createMockCredential('dev-only'),
          shared: createMockCredential('shared'),
        },
        mcpServers: {
          'dev-tool': createMockTool('dev-tool', {
            serverUrl: 'https://dev-api.example.com/tool',
          }),
          'shared-tool': createMockTool('shared-tool', {
            serverUrl: 'https://dev-api.example.com/shared',
          }),
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
        mcpServers: {
          'prod-tool': createMockTool('prod-tool', {
            serverUrl: 'https://prod-api.example.com/tool',
          }),
          'shared-tool': createMockTool('shared-tool', {
            serverUrl: 'https://prod-api.example.com/shared',
            activeTools: ['prod-search', 'prod-fetch'],
          }),
        },
      });

      const { getEnvironmentMcp } = createEnvironmentSettings({
        development,
        production,
      });

      // Test environment-specific tool resolution
      process.env.INKEEP_ENV = 'production';
      const prodSharedTool = getEnvironmentMcp('shared-tool');
      expect(prodSharedTool.getServerUrl()).toBe('https://prod-api.example.com/shared');
      expect(prodSharedTool.getActiveTools()).toEqual(['prod-search', 'prod-fetch']);

      process.env.INKEEP_ENV = 'development';
      const devSharedTool = getEnvironmentMcp('shared-tool');
      expect(devSharedTool.getServerUrl()).toBe('https://dev-api.example.com/shared');
      expect(devSharedTool.getActiveTools()).toBeUndefined();
    });

    it('should handle environments with no mcpServers gracefully', () => {
      const empty = registerEnvironmentSettings({
        credentials: {},
        mcpServers: {},
      });
      const { getEnvironmentMcp } = createEnvironmentSettings({
        empty,
      });

      // Set environment to match the registered environment name
      process.env.INKEEP_ENV = 'empty';

      expect(() => getEnvironmentMcp('anything' as never)).toThrow(/MCP Server.*not found/);
    });

    it('should throw errors for missing mcpServer configurations', () => {
      const test = registerEnvironmentSettings({
        credentials: {
          'existing-credential': createMockCredential('existing-credential'),
        },
        mcpServers: {
          'existing-tool': createMockTool('existing-tool'),
        },
      });

      const { getEnvironmentMcp } = createEnvironmentSettings({ test });

      // Set environment to match the registered environment name
      process.env.INKEEP_ENV = 'test';

      // Test valid tool works
      const result = getEnvironmentMcp('existing-tool');
      expect(result.getId()).toBe('existing-tool');
      expect(result.getName()).toBe('Test Tool existing-tool');
    });

    it('should automatically infer environment names from object keys for mcpServers', () => {
      const local = registerEnvironmentSettings({
        credentials: {},
        mcpServers: {
          'shared-tool': createMockTool('shared-tool', {
            serverUrl: 'https://local-api.example.com/shared',
          }),
        },
      });

      const staging = registerEnvironmentSettings({
        credentials: {},
        mcpServers: {
          'shared-tool': createMockTool('shared-tool', {
            serverUrl: 'https://staging-api.example.com/shared',
          }),
        },
      });

      const { getEnvironmentMcp } = createEnvironmentSettings({
        local,
        staging,
      });

      // Test that environment names are correctly inferred from mcpServer settings
      process.env.INKEEP_ENV = 'local';
      const localResult = getEnvironmentMcp('shared-tool');
      expect(localResult.getServerUrl()).toBe('https://local-api.example.com/shared');

      process.env.INKEEP_ENV = 'staging';
      const stagingResult = getEnvironmentMcp('shared-tool');
      expect(stagingResult.getServerUrl()).toBe('https://staging-api.example.com/shared');
    });

    it('should work with different mcpServer configurations', () => {
      const test = registerEnvironmentSettings({
        credentials: {},
        mcpServers: {
          'http-tool': createMockTool('http-tool', {
            transport: { type: 'streamable_http' },
            activeTools: ['search', 'fetch'],
          }),
          'sse-tool': createMockTool('sse-tool', {
            transport: { type: 'sse' },
            activeTools: ['stream', 'listen'],
          }),
        },
      });

      const { getEnvironmentMcp } = createEnvironmentSettings({ test });

      // Set environment to match the registered environment name
      process.env.INKEEP_ENV = 'test';

      const httpResult = getEnvironmentMcp('http-tool');
      const sseResult = getEnvironmentMcp('sse-tool');

      expect(httpResult.config.transport).toEqual({ type: 'streamable_http' });
      expect(httpResult.getActiveTools()).toEqual(['search', 'fetch']);

      expect(sseResult.config.transport).toEqual({ type: 'sse' });
      expect(sseResult.getActiveTools()).toEqual(['stream', 'listen']);
    });

    it("should error when INKEEP_ENV doesn't match any environment for mcpServers", () => {
      const production = registerEnvironmentSettings({
        credentials: {},
        mcpServers: {
          'prod-tool': createMockTool('prod-tool'),
        },
      });

      const { getEnvironmentMcp } = createEnvironmentSettings({
        production,
      });

      // Should error clearly when INKEEP_ENV doesn't match any environment
      process.env.INKEEP_ENV = 'test';
      expect(() => getEnvironmentMcp('prod-tool')).toThrow(/Environment 'test' not found/);
    });
  });
});
