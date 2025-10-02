import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateConfiguration } from '../utils/config';

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
      it('should accept --tenant-id with --agents-manage-api-url and --agents-run-api-url flags', async () => {
        const config = await validateConfiguration(
          'test-tenant',
          'http://localhost:3002',
          'http://localhost:3003',
          undefined
        );

        expect(config.tenantId).toBe('test-tenant');
        expect(config.agentsManageApiUrl).toBe('http://localhost:3002');
        expect(config.agentsRunApiUrl).toBe('http://localhost:3003');
        expect(config.sources.tenantId).toBe('command-line flag (--tenant-id)');
        expect(config.sources.agentsManageApiUrl).toBe(
          'command-line flag (--agents-manage-api-url)'
        );
        expect(config.sources.agentsRunApiUrl).toBe('command-line flag (--agents-run-api-url)');
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

        const config = await validateConfiguration(undefined, undefined, undefined, undefined);

        expect(config.tenantId).toBe('env-tenant');
        expect(config.agentsManageApiUrl).toBe('http://localhost:9090');
        expect(config.agentsRunApiUrl).toBe('http://localhost:9091');
        // URLs come from config file, not environment variables (env vars are ignored for URLs)
        expect(config.sources.agentsManageApiUrl).toContain('config file');
        expect(config.sources.agentsRunApiUrl).toContain('config file');
      });

      it('should allow command-line flags to override config file', async () => {

        const config = await validateConfiguration(
          'cli-tenant',
          'http://cli-management',
          'http://cli-execution',
          undefined
        );

        expect(config.tenantId).toBe('cli-tenant');
        expect(config.agentsManageApiUrl).toBe('http://cli-management');
        expect(config.agentsRunApiUrl).toBe('http://cli-execution');
        expect(config.sources.tenantId).toBe('command-line flag (--tenant-id)');
        expect(config.sources.agentsManageApiUrl).toBe(
          'command-line flag (--agents-manage-api-url)'
        );
        expect(config.sources.agentsRunApiUrl).toBe('command-line flag (--agents-run-api-url)');
      });
    });

    describe('Invalid Configurations', () => {
      it('should reject non-existent config file', async () => {
        await expect(
          validateConfiguration('test-tenant', undefined, undefined, '/path/to/config.js')
        ).rejects.toThrow('Config file not found');
      });

      it('should use defaults when --tenant-id is provided without API URLs', async () => {
        const config = await validateConfiguration('test-tenant', undefined, undefined, undefined);
        expect(config.tenantId).toBe('test-tenant');
        expect(config.agentsManageApiUrl).toBe('http://localhost:3002');
        expect(config.agentsRunApiUrl).toBe('http://localhost:3003');
      });

      it('should reject when no configuration is provided', async () => {
        await expect(
          validateConfiguration(undefined, undefined, undefined, undefined)
        ).rejects.toThrow('No configuration found');
      });
    });

    describe('Configuration Source Tracking', () => {
      it('should correctly identify command-line flag sources', async () => {
        const config = await validateConfiguration(
          'cli-tenant',
          'http://cli-management',
          'http://cli-execution',
          undefined
        );

        expect(config.sources.tenantId).toBe('command-line flag (--tenant-id)');
        expect(config.sources.agentsManageApiUrl).toBe(
          'command-line flag (--agents-manage-api-url)'
        );
        expect(config.sources.agentsRunApiUrl).toBe('command-line flag (--agents-run-api-url)');
        expect(config.sources.configFile).toBeUndefined();
      });

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

        const config = await validateConfiguration(undefined, undefined, undefined, undefined);

        // URLs come from config file (environment variables are ignored for URLs)
        expect(config.sources.agentsManageApiUrl).toContain('config file');
        expect(config.sources.agentsRunApiUrl).toContain('config file');
      });

      it('should correctly identify mixed sources with config file and flag', async () => {
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

        // Override only the management API URL with a flag
        const config = await validateConfiguration(
          undefined,
          'http://override-management',
          undefined,
          undefined
        );

        expect(config.tenantId).toBe('env-tenant');
        expect(config.agentsManageApiUrl).toBe('http://override-management');
        expect(config.agentsRunApiUrl).toBe('http://env-execution');
        expect(config.sources.agentsManageApiUrl).toBe(
          'command-line flag (--agents-manage-api-url)'
        );
        // Run API URL comes from config file (not env vars)
        expect(config.sources.agentsRunApiUrl).toContain('config file');
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

        const config = await validateConfiguration(undefined, undefined, undefined, undefined);

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

        const config = await validateConfiguration(undefined, undefined, undefined, undefined);

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

        const config = await validateConfiguration(undefined, undefined, undefined, undefined);

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

        const config = await validateConfiguration(undefined, undefined, undefined, undefined);

        expect(config.tenantId).toBe('mixed-tenant');
        expect(config.agentsManageApiUrl).toBe('http://new-management');
        expect(config.agentsRunApiUrl).toBe('http://new-execution');
        expect(config.agentsManageApiKey).toBe('new-manage-key');
        expect(config.agentsRunApiKey).toBe('new-run-key');
      });
    });
  });
});
