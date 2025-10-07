import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maskSensitiveConfig, validateConfiguration } from '../utils/config';

// Save original env and cwd
const originalEnv = process.env;

// Mock the tsx-loader to prevent loading actual files
vi.mock('../utils/tsx-loader.js', () => ({
  importWithTypeScriptSupport: vi.fn(() =>
    Promise.resolve({
      default: {
        tenantId: 'config-tenant',
        agentsManageApiUrl: 'http://config-management',
        agentsRunApiUrl: 'http://config-execution',
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

describe('maskSensitiveConfig', () => {
  it('should mask API keys showing only last 4 characters', () => {
    const config = {
      tenantId: 'test-tenant',
      agentsManageApiKey: 'secret-manage-key-12345',
      agentsRunApiKey: 'secret-run-key-67890',
    };

    const masked = maskSensitiveConfig(config);

    expect(masked.tenantId).toBe('test-tenant');
    expect(masked.agentsManageApiKey).toBe('***2345');
    expect(masked.agentsRunApiKey).toBe('***7890');
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
      agentsManageApiUrl: 'http://localhost:3002',
    };

    const masked = maskSensitiveConfig(config);

    expect(masked.tenantId).toBe('test-tenant');
    expect(masked.agentsManageApiUrl).toBe('http://localhost:3002');
    expect(masked.agentsManageApiKey).toBeUndefined();
    expect(masked.agentsRunApiKey).toBeUndefined();
  });

  it('should not mutate the original config object', () => {
    const config = {
      tenantId: 'test-tenant',
      agentsManageApiKey: 'secret-key-12345',
    };

    const masked = maskSensitiveConfig(config);

    // Original should be unchanged
    expect(config.agentsManageApiKey).toBe('secret-key-12345');
    // Masked should be different
    expect(masked.agentsManageApiKey).toBe('***2345');
  });
});

describe('Configuration Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.INKEEP_AGENTS_MANAGE_API_URL;
    delete process.env.INKEEP_AGENTS_RUN_API_URL;
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
            agentsManageApiUrl: 'http://localhost:3002',
            agentsRunApiUrl: 'http://localhost:3003',
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('test-tenant');
        expect(config.agentsManageApiUrl).toBe('http://localhost:3002');
        expect(config.agentsRunApiUrl).toBe('http://localhost:3003');
        expect(config.sources.tenantId).toContain('config file');
        expect(config.sources.agentsManageApiUrl).toContain('config file');
        expect(config.sources.agentsRunApiUrl).toContain('config file');
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
            agentsManageApiUrl: 'http://localhost:9090',
            agentsRunApiUrl: 'http://localhost:9091',
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('env-tenant');
        expect(config.agentsManageApiUrl).toBe('http://localhost:9090');
        expect(config.agentsRunApiUrl).toBe('http://localhost:9091');
        // URLs come from config file, not environment variables (env vars are ignored for URLs)
        expect(config.sources.agentsManageApiUrl).toContain('config file');
        expect(config.sources.agentsRunApiUrl).toContain('config file');
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
        expect(config.agentsManageApiUrl).toBe('http://localhost:3002');
        expect(config.agentsRunApiUrl).toBe('http://localhost:3003');
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
            agentsManageApiUrl: 'http://env-management',
            agentsRunApiUrl: 'http://env-execution',
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('env-tenant');
        expect(config.agentsManageApiUrl).toBe('http://env-management');
        expect(config.agentsRunApiUrl).toBe('http://env-execution');
        // All config comes from config file
        expect(config.sources.tenantId).toContain('config file');
        expect(config.sources.agentsManageApiUrl).toContain('config file');
        expect(config.sources.agentsRunApiUrl).toContain('config file');
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
            agentsManageApi: {
              url: 'http://nested-management',
              apiKey: 'manage-key-123',
            },
            agentsRunApi: {
              url: 'http://nested-execution',
              apiKey: 'run-key-456',
            },
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('nested-tenant');
        expect(config.agentsManageApiUrl).toBe('http://nested-management');
        expect(config.agentsRunApiUrl).toBe('http://nested-execution');
        expect(config.agentsManageApiKey).toBe('manage-key-123');
        expect(config.agentsRunApiKey).toBe('run-key-456');
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
            agentsManageApi: {
              url: 'http://nested-management-no-key',
            },
            agentsRunApi: {
              url: 'http://nested-execution-no-key',
            },
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('nested-tenant-no-keys');
        expect(config.agentsManageApiUrl).toBe('http://nested-management-no-key');
        expect(config.agentsRunApiUrl).toBe('http://nested-execution-no-key');
        expect(config.agentsManageApiKey).toBeUndefined();
        expect(config.agentsRunApiKey).toBeUndefined();
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
            agentsManageApiUrl: 'http://flat-management',
            agentsRunApiUrl: 'http://flat-execution',
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('flat-tenant');
        expect(config.agentsManageApiUrl).toBe('http://flat-management');
        expect(config.agentsRunApiUrl).toBe('http://flat-execution');
        expect(config.agentsManageApiKey).toBeUndefined();
        expect(config.agentsRunApiKey).toBeUndefined();
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
            agentsManageApiUrl: 'http://old-management',
            agentsRunApiUrl: 'http://old-execution',
            // New nested format (should take priority)
            agentsManageApi: {
              url: 'http://new-management',
              apiKey: 'new-manage-key',
            },
            agentsRunApi: {
              url: 'http://new-execution',
              apiKey: 'new-run-key',
            },
          },
        });

        const config = await validateConfiguration(undefined);

        expect(config.tenantId).toBe('mixed-tenant');
        expect(config.agentsManageApiUrl).toBe('http://new-management');
        expect(config.agentsRunApiUrl).toBe('http://new-execution');
        expect(config.agentsManageApiKey).toBe('new-manage-key');
        expect(config.agentsRunApiKey).toBe('new-run-key');
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
            agentsManageApi: {
              url: 'http://localhost:3002',
              apiKey: 'secret-manage-key-12345',
            },
            agentsRunApi: {
              url: 'http://localhost:3003',
              apiKey: 'secret-run-key-67890',
            },
          },
        });

        const config = await validateConfiguration(undefined);

        // Verify the actual config has the real keys
        expect(config.agentsManageApiKey).toBe('secret-manage-key-12345');
        expect(config.agentsRunApiKey).toBe('secret-run-key-67890');

        // Verify the logger was called with masked keys
        expect(mockLoggerFunctions.info).toHaveBeenCalled();
        const logCalls = mockLoggerFunctions.info.mock.calls;

        // Find the log call with config
        const configLogCall = logCalls.find(
          (call: any) =>
            call[0]?.config?.agentsManageApiKey || call[0]?.mergedConfig?.agentsManageApiKey
        );

        expect(configLogCall).toBeDefined();
        if (!configLogCall) throw new Error('Config log call not found');

        const loggedConfig = configLogCall[0].config || configLogCall[0].mergedConfig;

        // Check that keys are masked (showing only last 4 chars)
        expect(loggedConfig.agentsManageApiKey).toBe('***2345');
        expect(loggedConfig.agentsRunApiKey).toBe('***7890');
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
            agentsManageApi: {
              url: 'http://localhost:3002',
              // No API key
            },
            agentsRunApi: {
              url: 'http://localhost:3003',
              // No API key
            },
          },
        });

        const config = await validateConfiguration(undefined);

        // Verify keys are undefined
        expect(config.agentsManageApiKey).toBeUndefined();
        expect(config.agentsRunApiKey).toBeUndefined();

        // Verify no errors when logging undefined keys
        expect(mockLoggerFunctions.info).toHaveBeenCalled();
      });
    });
  });
});
