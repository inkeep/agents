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

        process.env.INKEEP_AGENTS_MANAGE_API_URL = 'http://localhost:9090';
        process.env.INKEEP_AGENTS_RUN_API_URL = 'http://localhost:9091';

        const config = await validateConfiguration(undefined, undefined, undefined, undefined);

        expect(config.tenantId).toBe('env-tenant');
        expect(config.agentsManageApiUrl).toBe('http://localhost:9090');
        expect(config.agentsRunApiUrl).toBe('http://localhost:9091');
        expect(config.sources.agentsManageApiUrl).toBe(
          'environment variable (INKEEP_AGENTS_MANAGE_API_URL)'
        );
        expect(config.sources.agentsRunApiUrl).toBe(
          'environment variable (INKEEP_AGENTS_RUN_API_URL)'
        );
      });

      it('should allow command-line flags to override environment variables', async () => {
        process.env.INKEEP_AGENTS_MANAGE_API_URL = 'http://localhost:9090';
        process.env.INKEEP_AGENTS_RUN_API_URL = 'http://localhost:9091';

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
      it('should reject --config-file-path with --tenant-id', async () => {
        await expect(
          validateConfiguration('test-tenant', undefined, undefined, '/path/to/config.js')
        ).rejects.toThrow('Invalid configuration combination');
      });

      it('should reject --tenant-id without both API URLs', async () => {
        await expect(
          validateConfiguration('test-tenant', undefined, undefined, undefined)
        ).rejects.toThrow('--tenant-id requires --agents-manage-api-url and --agents-run-api-url');
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

      it('should correctly identify environment variable sources', async () => {
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

        process.env.INKEEP_AGENTS_MANAGE_API_URL = 'http://env-management';
        process.env.INKEEP_AGENTS_RUN_API_URL = 'http://env-execution';

        const config = await validateConfiguration(undefined, undefined, undefined, undefined);

        expect(config.sources.agentsManageApiUrl).toBe(
          'environment variable (INKEEP_AGENTS_MANAGE_API_URL)'
        );
        expect(config.sources.agentsRunApiUrl).toBe(
          'environment variable (INKEEP_AGENTS_RUN_API_URL)'
        );
      });

      it('should correctly identify mixed sources with env and flag', async () => {
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

        process.env.INKEEP_AGENTS_MANAGE_API_URL = 'http://env-management';
        process.env.INKEEP_AGENTS_RUN_API_URL = 'http://env-execution';

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
        expect(config.sources.agentsRunApiUrl).toBe(
          'environment variable (INKEEP_AGENTS_RUN_API_URL)'
        );
      });
    });
  });
});
