import * as fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEnvironmentCredentials } from '../../utils/environment-loader';

// Mock the file system and tsx-loader
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});
vi.mock('../../utils/tsx-loader', () => ({
  importWithTypeScriptSupport: vi.fn(),
}));

const mockFs = vi.mocked(fs);

// Get the mocked function after the module is mocked
const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader');
const mockImportWithTypeScriptSupport = vi.mocked(importWithTypeScriptSupport);

describe('loadEnvironmentCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load credentials from environment file', async () => {
    // Mock file exists
    mockFs.existsSync.mockReturnValue(true);

    // Mock environment file export
    const mockCredentials = {
      'api-key-1': {
        id: 'api-key-1',
        type: 'memory',
        credentialStoreId: 'memory-default',
        retrievalParams: { key: 'API_KEY_DEV' },
      },
    };

    mockImportWithTypeScriptSupport.mockResolvedValue({
      development: {
        credentials: mockCredentials,
      },
    });

    const result = await loadEnvironmentCredentials('/test/project', 'development');

    expect(result).toEqual(mockCredentials);
    expect(mockFs.existsSync).toHaveBeenCalledWith('/test/project/environments/development.env.ts');
    expect(mockImportWithTypeScriptSupport).toHaveBeenCalledWith(
      '/test/project/environments/development.env.ts'
    );
  });

  it('should throw error if environment file does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false);

    await expect(loadEnvironmentCredentials('/test/project', 'production')).rejects.toThrow(
      'Environment file not found: /test/project/environments/production.env.ts'
    );
  });

  it('should throw error if no exports found', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockImportWithTypeScriptSupport.mockResolvedValue({});

    await expect(loadEnvironmentCredentials('/test/project', 'development')).rejects.toThrow(
      'No exports found in environment file'
    );
  });

  it('should throw error if export is invalid', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockImportWithTypeScriptSupport.mockResolvedValue({
      development: 'invalid-export',
    });

    await expect(loadEnvironmentCredentials('/test/project', 'development')).rejects.toThrow(
      'Invalid environment settings'
    );
  });

  it('should handle environment settings without credentials', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockImportWithTypeScriptSupport.mockResolvedValue({
      development: {
        // No credentials property
      },
    });

    const result = await loadEnvironmentCredentials('/test/project', 'development');
    expect(result).toEqual({});
  });
});
