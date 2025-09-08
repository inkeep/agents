import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateConfiguration } from '../utils/config.js';

// Save original env and cwd
const originalEnv = process.env;

// Mock the file system to prevent finding actual config files
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}));

// Mock process.cwd to avoid loading the actual config file
vi.mock('node:process', () => ({
  cwd: () => '/tmp/test-cli',
}));

describe('Configuration Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.INKEEP_API_URL;
    delete process.env.INKEEP_MANAGEMENT_API_URL;
    delete process.env.INKEEP_EXECUTION_API_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('validateConfiguration', () => {
    describe('Valid Configurations', () => {
      it('should accept --tenant-id with --management-api-url and --execution-api-url flags', async () => {
        const config = await validateConfiguration(
          'test-tenant',
          'http://localhost:3002',
          'http://localhost:3003',
          undefined
        );

        expect(config.tenantId).toBe('test-tenant');
        expect(config.managementApiUrl).toBe('http://localhost:3002');
        expect(config.executionApiUrl).toBe('http://localhost:3003');
        expect(config.sources.tenantId).toBe('command-line flag (--tenant-id)');
        expect(config.sources.managementApiUrl).toBe('command-line flag (--management-api-url)');
        expect(config.sources.executionApiUrl).toBe('command-line flag (--execution-api-url)');
      });

      it('should use environment variables when no flags provided', async () => {
        process.env.INKEEP_MANAGEMENT_API_URL = 'http://localhost:9090';
        process.env.INKEEP_EXECUTION_API_URL = 'http://localhost:9091';

        const config = await validateConfiguration(undefined, undefined, undefined, undefined);

        expect(config.tenantId).toBe('env-tenant');
        expect(config.managementApiUrl).toBe('http://localhost:9090');
        expect(config.executionApiUrl).toBe('http://localhost:9091');
        expect(config.sources.managementApiUrl).toBe(
          'environment variable (INKEEP_MANAGEMENT_API_URL)'
        );
        expect(config.sources.executionApiUrl).toBe(
          'environment variable (INKEEP_EXECUTION_API_URL)'
        );
      });

      it('should allow command-line flags to override environment variables', async () => {
        process.env.INKEEP_MANAGEMENT_API_URL = 'http://localhost:9090';
        process.env.INKEEP_EXECUTION_API_URL = 'http://localhost:9091';

        const config = await validateConfiguration(
          'cli-tenant',
          'http://cli-management',
          'http://cli-execution',
          undefined
        );

        expect(config.tenantId).toBe('cli-tenant');
        expect(config.managementApiUrl).toBe('http://cli-management');
        expect(config.executionApiUrl).toBe('http://cli-execution');
        expect(config.sources.tenantId).toBe('command-line flag (--tenant-id)');
        expect(config.sources.managementApiUrl).toBe('command-line flag (--management-api-url)');
        expect(config.sources.executionApiUrl).toBe('command-line flag (--execution-api-url)');
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
        ).rejects.toThrow('--tenant-id requires --management-api-url and --execution-api-url');
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
        expect(config.sources.managementApiUrl).toBe('command-line flag (--management-api-url)');
        expect(config.sources.executionApiUrl).toBe('command-line flag (--execution-api-url)');
        expect(config.sources.configFile).toBeUndefined();
      });

      it('should correctly identify environment variable sources', async () => {
        process.env.INKEEP_MANAGEMENT_API_URL = 'http://env-management';
        process.env.INKEEP_EXECUTION_API_URL = 'http://env-execution';

        const config = await validateConfiguration(undefined, undefined, undefined, undefined);

        expect(config.sources.managementApiUrl).toBe(
          'environment variable (INKEEP_MANAGEMENT_API_URL)'
        );
        expect(config.sources.executionApiUrl).toBe(
          'environment variable (INKEEP_EXECUTION_API_URL)'
        );
      });

      it('should correctly identify mixed sources with env and flag', async () => {
        process.env.INKEEP_MANAGEMENT_API_URL = 'http://env-management';
        process.env.INKEEP_EXECUTION_API_URL = 'http://env-execution';

        // Override only the management API URL with a flag
        const config = await validateConfiguration(
          undefined,
          'http://override-management',
          undefined,
          undefined
        );

        expect(config.tenantId).toBe('env-tenant');
        expect(config.managementApiUrl).toBe('http://override-management');
        expect(config.executionApiUrl).toBe('http://env-execution');
        expect(config.sources.managementApiUrl).toBe('command-line flag (--management-api-url)');
        expect(config.sources.executionApiUrl).toBe(
          'environment variable (INKEEP_EXECUTION_API_URL)'
        );
      });
    });
  });
});
