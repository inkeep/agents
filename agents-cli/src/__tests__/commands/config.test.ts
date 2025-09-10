import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configGetCommand, configListCommand, configSetCommand } from '../../commands/config';

// Mock fs functions
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

describe('Config Command', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('configGetCommand', () => {
    it('should display all config when no key is provided', async () => {
      const mockConfig = `import { defineConfig } from '@inkeep/agents-cli';

export default defineConfig({
    tenantId: 'test-tenant-123',
    apiUrl: 'https://api.example.com',
});`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockConfig);

      await configGetCommand();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Current configuration'));
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tenant ID'),
        'test-tenant-123'
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('API URL'),
        'https://api.example.com'
      );
    });

    it('should display specific config value when key is provided', async () => {
      const mockConfig = `import { defineConfig } from '@inkeep/agents-cli';

export default defineConfig({
    tenantId: 'test-tenant-123',
    apiUrl: 'https://api.example.com',
});`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockConfig);

      await configGetCommand('tenantId');

      expect(consoleLogSpy).toHaveBeenCalledWith('test-tenant-123');
    });

    it('should error when config file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await expect(configGetCommand()).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('No configuration file found')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should error for unknown configuration key', async () => {
      const mockConfig = `import { defineConfig } from '@inkeep/agents-cli';

export default defineConfig({
    tenantId: 'test-tenant-123',
});`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockConfig);

      await expect(configGetCommand('unknownKey')).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown configuration key: unknownKey')
      );
    });
  });

  describe('configSetCommand', () => {
    it('should update tenantId in existing config file', async () => {
      const originalConfig = `import { defineConfig } from '@inkeep/agents-cli';

export default defineConfig({
    tenantId: 'old-tenant',
    apiUrl: 'http://localhost:3002',
});`;

      const expectedConfig = `import { defineConfig } from '@inkeep/agents-cli';

export default defineConfig({
    tenantId: 'new-tenant-456',
    apiUrl: 'http://localhost:3002',
});`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(originalConfig);

      await configSetCommand('tenantId', 'new-tenant-456');

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('inkeep.config.ts'),
        expectedConfig
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.any(String), // The checkmark
        expect.stringContaining('Updated tenantId'),
        expect.stringContaining('new-tenant-456')
      );
    });

    it('should update apiUrl in existing config file', async () => {
      const originalConfig = `import { defineConfig } from '@inkeep/agents-cli';

export default defineConfig({
    tenantId: 'test-tenant',
    apiUrl: 'http://localhost:3002',
});`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(originalConfig);

      await configSetCommand('apiUrl', 'https://api.example.com');

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('inkeep.config.ts'),
        expect.stringContaining("apiUrl: 'https://api.example.com'")
      );
    });

    it('should create new config file if it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await configSetCommand('tenantId', 'new-tenant');

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('inkeep.config.ts'),
        expect.stringContaining("tenantId: 'new-tenant'")
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.any(String), // The checkmark
        expect.stringContaining('Created config file and set tenantId to'),
        expect.any(String) // The value
      );
    });

    it('should validate apiUrl format', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await expect(configSetCommand('apiUrl', 'not-a-url')).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid URL format'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should reject invalid configuration keys', async () => {
      await expect(configSetCommand('invalidKey', 'value')).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid configuration key: invalidKey')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Available keys: tenantId, apiUrl')
      );
    });

    it('should add missing tenantId to config', async () => {
      const originalConfig = `import { defineConfig } from '@inkeep/agents-cli';

export default defineConfig({
    apiUrl: 'http://localhost:3002',
});`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(originalConfig);

      await configSetCommand('tenantId', 'new-tenant');

      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('inkeep.config.ts'),
        expect.stringContaining("tenantId: 'new-tenant'")
      );
    });
  });

  describe('configListCommand', () => {
    it('should call configGetCommand without a key', async () => {
      const mockConfig = `import { defineConfig } from '@inkeep/agents-cli';

export default defineConfig({
    tenantId: 'test-tenant',
    apiUrl: 'http://localhost:3002',
});`;

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockConfig);

      await configListCommand();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Current configuration'));
    });
  });
});
