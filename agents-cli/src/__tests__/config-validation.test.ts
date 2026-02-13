import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maskSensitiveConfig, validateConfiguration } from '../utils/config';
import { LOCAL_REMOTE } from '../utils/profiles';

// Save original env and cwd
const originalEnv = process.env;

// Mock the tsx-loader to prevent loading actual files
vi.mock('../utils/tsx-loader.js', () => ({
  importWithTypeScriptSupport: vi.fn(() =>
    Promise.resolve({
      default: {
        tenantId: 'config-tenant',
        agentsApiUrl: 'http://config-api',
      },
    })
  ),
}));

// Mock the file system to control when config files are found
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
  };
});

// Mock the logger from agents-core using vi.hoisted() to avoid initialization issues
const { mockLoggerFunctions } = vi.hoisted(() => {
  return {
    mockLoggerFunctions: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  };
});

vi.mock('@inkeep/agents-core', async () => {
  const actual = await vi.importActual('@inkeep/agents-core');
  return {
    ...actual,
    getLogger: vi.fn(() => mockLoggerFunctions),
  };
});

// Mock credentials to prevent CLI login credentials from interfering with tests
vi.mock('../utils/credentials', () => ({
  loadCredentials: vi.fn(() => Promise.resolve(null)),
}));

describe('maskSensitiveConfig', () => {
  it('should mask API keys showing only last 4 characters', () => {
    const config = {
      tenantId: 'test-tenant',
      agentsApiKey: 'secret-manage-key-12345',
    };

    const masked = maskSensitiveConfig(config);

    expect(masked.tenantId).toBe('test-tenant');
    expect(masked.agentsApiKey).toBe('***2345');
  });

  it('should handle undefined config', () => {
    const masked = maskSensitiveConfig(undefined);
    expect(masked).toBeUndefined();
  });

  it('should handle null config', () => {
    const masked = maskSensitiveConfig(null);
    expect(masked).toBeNull();
  });

  it('should handle config without API keys', () => {
    const config = {
      tenantId: 'test-tenant',
      agentsApiUrl: LOCAL_REMOTE.api,
    };

    const masked = maskSensitiveConfig(config);

    expect(masked.tenantId).toBe('test-tenant');
    expect(masked.agentsApiUrl).toBe(LOCAL_REMOTE.api);
    expect(masked.agentsApiKey).toBeUndefined();
  });

  it('should not mutate the original config object', () => {
    const config = {
      tenantId: 'test-tenant',
      agentsApiKey: 'secret-key-12345',
    };

    const masked = maskSensitiveConfig(config);

    // Original should be unchanged
    expect(config.agentsApiKey).toBe('secret-key-12345');
    // Masked should be different
    expect(masked.agentsApiKey).toBe('***2345');
  });
});

describe('Configuration Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.INKEEP_AGENTS_API_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('validateConfiguration', () => {
    describe('Valid Configurations', () => {
      it('should load config from file', async () => {
        // Mock existsSync to return true for config file
        const { existsSync } = await import('node:fs');
        (existsSync as any).mockImplementation((path: string) => {
          return path.includes('inkeep.config');
        });

        // Mock the tsx-loader to return a config
        const { importWithTypeScriptSupport } = await import('../utils/tsx-loader.js');
        (importWithTypeScriptSupport as any).mockResolvedValue({
          default: {
            tenantId: 'test-tenant',
            agentsApiUrl: LOCAL_REMOTE.api,
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('test-tenant');
        expect(config.agentsApiUrl).toBe(LOCAL_REMOTE.api);
        expect(config.sources.tenantId).toContain('config file');
        expect(config.sources.agentsApiUrl).toContain('config file');
      });

      it('should use environment variables when no flags provided', async () => {
        // Mock existsSync to return true for config file
        const { existsSync } = await import('node:fs');
        (existsSync as any).mockImplementation((path: string) => {
          return path.includes('inkeep.config');
        });

        // Mock the tsx-loader to return a config with tenant ID
        const { importWithTypeScriptSupport } = await import('../utils/tsx-loader.js');
        (importWithTypeScriptSupport as any).mockResolvedValue({
          default: {
            tenantId: 'env-tenant',
            agentsApiUrl: 'http://localhost:9090',
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('env-tenant');
        expect(config.agentsApiUrl).toBe('http://localhost:9090');
        // URLs come from config file, not environment variables (env vars are ignored for URLs)
        expect(config.sources.agentsApiUrl).toContain('config file');
      });

      it('should use defaults for missing URLs in config file', async () => {
        // Mock existsSync to return true for config file
        const { existsSync } = await import('node:fs');
        (existsSync as any).mockImplementation((path: string) => {
          return path.includes('inkeep.config');
        });

        // Mock the tsx-loader to return a config with tenant ID and default URLs
        const { importWithTypeScriptSupport } = await import('../utils/tsx-loader.js');
        (importWithTypeScriptSupport as any).mockResolvedValue({
          default: {
            tenantId: 'test-tenant',
            // URLs will be populated from defaults by loadConfig
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('test-tenant');
        // Default values should be applied by loadConfig
        expect(config.agentsApiUrl).toBe(LOCAL_REMOTE.api);
      });
    });

    describe('Invalid Configurations', () => {
      it('should reject non-existent config file', async () => {
        await expect(validateConfiguration('/path/to/config.js')).rejects.toThrow(
          'Config file not found'
        );
      });

      it('should reject when no configuration is provided', async () => {
        await expect(validateConfiguration(undefined)).rejects.toThrow('No configuration found');
      });
    });

    describe('Configuration Source Tracking', () => {
      it('should correctly identify config file sources', async () => {
        // Mock existsSync to return true for config file
        const { existsSync } = await import('node:fs');
        (existsSync as any).mockImplementation((path: string) => {
          return path.includes('inkeep.config');
        });

        // Mock the tsx-loader to return a config with tenant ID
        const { importWithTypeScriptSupport } = await import('../utils/tsx-loader.js');
        (importWithTypeScriptSupport as any).mockResolvedValue({
          default: {
            tenantId: 'env-tenant',
            agentsApiUrl: 'http://env-api',
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('env-tenant');
        expect(config.agentsApiUrl).toBe('http://env-api');
        // All config comes from config file
        expect(config.sources.tenantId).toContain('config file');
        expect(config.sources.agentsApiUrl).toContain('config file');
        expect(config.sources.configFile).toBeDefined();
      });
    });

    describe('Nested Config Format', () => {
      it('should handle nested config format with API keys', async () => {
        const { existsSync } = await import('node:fs');
        (existsSync as any).mockImplementation((path: string) => {
          return path.includes('inkeep.config');
        });

        const { importWithTypeScriptSupport } = await import('../utils/tsx-loader.js');
        (importWithTypeScriptSupport as any).mockResolvedValue({
          default: {
            tenantId: 'nested-tenant',
            agentsApi: {
              url: 'http://nested-api',
              apiKey: 'manage-key-123',
            },
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('nested-tenant');
        expect(config.agentsApiUrl).toBe('http://nested-api');
        expect(config.agentsApiKey).toBe('manage-key-123');
      });

      it('should handle nested config format without API keys', async () => {
        const { existsSync } = await import('node:fs');
        (existsSync as any).mockImplementation((path: string) => {
          return path.includes('inkeep.config');
        });

        const { importWithTypeScriptSupport } = await import('../utils/tsx-loader.js');
        (importWithTypeScriptSupport as any).mockResolvedValue({
          default: {
            tenantId: 'nested-tenant-no-keys',
            agentsApi: {
              url: 'http://nested-api-no-key',
            },
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('nested-tenant-no-keys');
        expect(config.agentsApiUrl).toBe('http://nested-api-no-key');
        expect(config.agentsApiKey).toBeUndefined();
      });

      it('should handle backward compatibility with flat config format', async () => {
        const { existsSync } = await import('node:fs');
        (existsSync as any).mockImplementation((path: string) => {
          return path.includes('inkeep.config');
        });

        const { importWithTypeScriptSupport } = await import('../utils/tsx-loader.js');
        (importWithTypeScriptSupport as any).mockResolvedValue({
          default: {
            tenantId: 'flat-tenant',
            agentsApiUrl: 'http://flat-api',
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('flat-tenant');
        expect(config.agentsApiUrl).toBe('http://flat-api');
        expect(config.agentsApiKey).toBeUndefined();
      });

      it('should prioritize nested format when both formats are present', async () => {
        const { existsSync } = await import('node:fs');
        (existsSync as any).mockImplementation((path: string) => {
          return path.includes('inkeep.config');
        });

        const { importWithTypeScriptSupport } = await import('../utils/tsx-loader.js');
        (importWithTypeScriptSupport as any).mockResolvedValue({
          default: {
            tenantId: 'mixed-tenant',
            // Old flat format (should be ignored)
            agentsApiUrl: 'http://old-api',
            // New nested format (should take priority)
            agentsApi: {
              url: 'http://new-api',
              apiKey: 'new-manage-key',
            },
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('mixed-tenant');
        expect(config.agentsApiUrl).toBe('http://new-api');
        expect(config.agentsApiKey).toBe('new-manage-key');
      });
    });

    describe('Sensitive Data Masking in Logs', () => {
      it('should mask API keys in logged config values', async () => {
        const { existsSync } = await import('node:fs');
        (existsSync as any).mockImplementation((path: string) => {
          return path.includes('inkeep.config');
        });

        const { importWithTypeScriptSupport } = await import('../utils/tsx-loader.js');
        (importWithTypeScriptSupport as any).mockResolvedValue({
          default: {
            tenantId: 'test-tenant',
            agentsApi: {
              url: LOCAL_REMOTE.api,
              apiKey: 'secret-manage-key-12345',
            },
          },
        });

        const config = await validateConfiguration(undefined);

        // Verify the actual config has the real keys
        expect(config.agentsApiKey).toBe('secret-manage-key-12345');

        // Verify the logger was called with masked keys
        expect(mockLoggerFunctions.info).toHaveBeenCalled();
        const logCalls = mockLoggerFunctions.info.mock.calls;

        // Find the log call with config
        const configLogCall = logCalls.find(
          (call: any) => call[0]?.config?.agentsApiKey || call[0]?.mergedConfig?.agentsApiKey
        );

        expect(configLogCall).toBeDefined();
        if (!configLogCall) throw new Error('Config log call not found');

        const loggedConfig = configLogCall[0].config || configLogCall[0].mergedConfig;

        // Check that keys are masked (showing only last 4 chars)
        expect(loggedConfig.agentsApiKey).toBe('***2345');
      });

      it('should handle missing API keys gracefully', async () => {
        const { existsSync } = await import('node:fs');
        (existsSync as any).mockImplementation((path: string) => {
          return path.includes('inkeep.config');
        });

        const { importWithTypeScriptSupport } = await import('../utils/tsx-loader.js');
        (importWithTypeScriptSupport as any).mockResolvedValue({
          default: {
            tenantId: 'test-tenant',
            agentsApi: {
              url: LOCAL_REMOTE.api,
              // No API key
            },
          },
        });

        const config = await validateConfiguration(undefined);

        // Verify keys are undefined
        expect(config.agentsApiKey).toBeUndefined();

        // Verify no errors when logging undefined keys
        expect(mockLoggerFunctions.info).toHaveBeenCalled();
      });
    });
  });
});
