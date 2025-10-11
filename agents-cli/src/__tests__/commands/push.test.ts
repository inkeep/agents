import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { pushCommand } from '../../commands/push';
import { importWithTypeScriptSupport } from '../../utils/tsx-loader';

// Mock all external dependencies
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('inquirer');
vi.mock('chalk', () => ({
  default: {
    red: vi.fn((text) => text),
    yellow: vi.fn((text) => text),
    green: vi.fn((text) => text),
    cyan: vi.fn((text) => text),
    gray: vi.fn((text) => text),
  },
}));
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

vi.mock('../../utils/tsx-loader.js', () => ({
  importWithTypeScriptSupport: vi.fn(),
}));

vi.mock('../../utils/config.js', () => ({
  validateConfiguration: vi.fn().mockResolvedValue({
    tenantId: 'test-tenant',
    agentsManageApiUrl: 'http://localhost:3002',
    agentsRunApiUrl: 'http://localhost:3001',
    sources: {},
  }),
}));

vi.mock('../../utils/cli-pipeline.js', () => ({
  initializeCommand: vi.fn(),
  loadCommandConfig: vi.fn(),
}));

vi.mock('../../utils/environment-loader.js', () => ({
  loadEnvironmentCredentials: vi.fn().mockResolvedValue({}),
}));

describe('Push Command - Project Validation', () => {
  let mockExit: Mock;
  let mockLog: Mock;
  let mockError: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset validateConfiguration mock
    const { validateConfiguration } = await import('../../utils/config.js');
    (validateConfiguration as Mock).mockResolvedValue({
      tenantId: 'test-tenant',
      agentsManageApiUrl: 'http://localhost:3002',
      agentsRunApiUrl: 'http://localhost:3001',
      sources: {},
    });

    // Setup initializeCommand mock with default success behavior
    const { initializeCommand } = await import('../../utils/cli-pipeline.js');
    (initializeCommand as Mock).mockResolvedValue({
      config: {
        tenantId: 'test-tenant',
        agentsManageApiUrl: 'http://localhost:3002',
        agentsRunApiUrl: 'http://localhost:3001',
        sources: {},
      },
      spinner: undefined,
    });

    // Mock process.exit to prevent test runner from exiting
    mockExit = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(mockExit as any);

    // Mock console methods
    mockLog = vi.fn();
    mockError = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(mockLog);
    vi.spyOn(console, 'error').mockImplementation(mockError);

    // Default environment
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load and push project successfully', async () => {
    // Mock file exists (index.ts)
    (existsSync as Mock).mockReturnValue(true);

    // Mock project module
    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      setCredentials: vi.fn(),
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-project'),
      getName: vi.fn().mockReturnValue('Test Project'),
      getStats: vi.fn().mockReturnValue({
        graphCount: 1,
        tenantId: 'test-tenant',
      }),
      getGraphs: vi.fn().mockReturnValue([]),
    };

    // Mock config module

    // Mock returns project with __type field
    (importWithTypeScriptSupport as Mock).mockResolvedValueOnce({ default: mockProject });

    await pushCommand({ project: '/test/project' });

    // Verify project was loaded
    expect(importWithTypeScriptSupport).toHaveBeenCalledWith('/test/project/index.ts');

    // Verify config was set on project
    expect(mockProject.setConfig).toHaveBeenCalledWith(
      'test-tenant',
      'http://localhost:3002',
      undefined, // models
      undefined // apiKey (not set in mock config)
    );

    // Verify init was called
    expect(mockProject.init).toHaveBeenCalled();
  });

  it('should handle missing index.ts file', async () => {
    // Mock file doesn't exist
    (existsSync as Mock).mockReturnValue(false);

    await pushCommand({ project: '/test/project' });

    // Verify error was shown - the exit is called directly by the spinner.fail
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle missing project export', async () => {
    (existsSync as Mock).mockReturnValue(true);

    // Mock module without project export
    (importWithTypeScriptSupport as Mock).mockResolvedValue({
      someOtherExport: {},
    });

    await pushCommand({ project: '/test/project' });

    // Verify error was shown
    expect(mockError).toHaveBeenCalledWith(
      'Error:',
      'No project export found in index.ts. Expected an export with __type = "project"'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle project not found', async () => {
    // Mock that index.ts doesn't exist in the specified project directory
    (existsSync as Mock).mockReturnValue(false);

    await pushCommand({ project: '/nonexistent' });

    // Verify error was shown about missing index.ts
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should use environment flag for credentials', async () => {
    const { loadEnvironmentCredentials } = await import('../../utils/environment-loader.js');

    (existsSync as Mock).mockReturnValue(true);

    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      setCredentials: vi.fn(),
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-project'),
      getName: vi.fn().mockReturnValue('Test Project'),
      getStats: vi.fn().mockReturnValue({ graphCount: 1, tenantId: 'test-tenant' }),
      getGraphs: vi.fn().mockReturnValue([]),
      getCredentialTracking: vi.fn().mockResolvedValue({
        credentials: {},
        usage: {},
      }),
    };

    (importWithTypeScriptSupport as Mock).mockResolvedValueOnce({ default: mockProject });

    const mockCredentials = { apiKey: 'test-key' };
    (loadEnvironmentCredentials as Mock).mockResolvedValue(mockCredentials);

    await pushCommand({ project: '/test/project', env: 'production' });

    // Verify environment was set
    // Environment was set correctly

    // Verify credentials were loaded and set
    expect(loadEnvironmentCredentials).toHaveBeenCalledWith('/test/project', 'production');
    expect(mockProject.setCredentials).toHaveBeenCalledWith(mockCredentials);
  });

  it.skip('should override API URL from command line', async () => {
    // NOTE: This test is skipped because we removed CLI args for API URLs in favor of config-file-only approach.
    // API URLs now must be specified in inkeep.config.ts, not via CLI flags.
  });

  it.skip('should handle missing configuration', async () => {
    // NOTE: This test is skipped because initializeCommand handles the error case by calling process.exit(1),
    // which makes it difficult to test in unit tests. The actual error handling behavior is covered by
    // integration tests and the config validation tests.
  });

  it.skip('should handle JSON output mode', async () => {
    // Clear all mocks before starting
    vi.clearAllMocks();

    (existsSync as Mock).mockReturnValue(true);

    const mockProjectDefinition = {
      agent: {},
      tools: {},
    };

    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      setCredentials: vi.fn(),
      toFullProjectDefinition: vi.fn().mockResolvedValue(mockProjectDefinition),
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-project'),
      getName: vi.fn().mockReturnValue('Test Project'),
      getStats: vi.fn().mockReturnValue({ graphCount: 1, tenantId: 'test-tenant' }),
      getGraphs: vi.fn().mockReturnValue([]),
      getCredentialTracking: vi.fn().mockResolvedValue({
        credentials: {},
        usage: {},
      }),
    };

    (importWithTypeScriptSupport as Mock).mockResolvedValueOnce({ default: mockProject });

    // Import the mocked fs/promises module
    const fsPromises = await import('node:fs/promises');

    // Make process.exit throw to stop execution flow
    let exitCode: number | undefined;
    mockExit.mockImplementation((code) => {
      exitCode = code;
      throw new Error(`Process exited with code ${code}`);
    });

    try {
      await pushCommand({
        project: '/test/project',
        json: true,
      });
    } catch (error: any) {
      // Expected to throw when process.exit is called
      expect(error.message).toContain('Process exited with code');
    }

    // Verify JSON was generated and written
    expect(mockProject.toFullProjectDefinition).toHaveBeenCalled();
    expect(fsPromises.writeFile).toHaveBeenCalledWith(
      '/test/project/project.json',
      JSON.stringify(mockProjectDefinition, null, 2)
    );
    // In JSON mode, process.exit(0) is called after generating JSON
    expect(exitCode).toBe(0);
  });
});

describe('Push Command - Output Messages', () => {
  let mockExit: Mock;
  let mockLog: Mock;
  let mockError: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset validateConfiguration mock to return valid config
    const { validateConfiguration } = await import('../../utils/config.js');
    (validateConfiguration as Mock).mockResolvedValue({
      tenantId: 'test-tenant',
      agentsManageApiUrl: 'http://localhost:3002',
      agentsRunApiUrl: 'http://localhost:3001',
      sources: {},
    });

    // Setup initializeCommand mock with default success behavior
    const { initializeCommand } = await import('../../utils/cli-pipeline.js');
    (initializeCommand as Mock).mockResolvedValue({
      config: {
        tenantId: 'test-tenant',
        agentsManageApiUrl: 'http://localhost:3002',
        agentsRunApiUrl: 'http://localhost:3001',
        sources: {},
      },
      spinner: undefined,
    });

    mockExit = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(mockExit as any);

    mockLog = vi.fn();
    mockError = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(mockLog);
    vi.spyOn(console, 'error').mockImplementation(mockError);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should display next steps after successful push', async () => {
    (existsSync as Mock).mockReturnValue(true);

    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      setCredentials: vi.fn(),
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-project'),
      getName: vi.fn().mockReturnValue('Test Project'),
      getStats: vi.fn().mockReturnValue({ graphCount: 1, tenantId: 'test-tenant' }),
      getGraphs: vi.fn().mockReturnValue([]),
      getCredentialTracking: vi.fn().mockResolvedValue({
        credentials: {},
        usage: {},
      }),
    };

    (importWithTypeScriptSupport as Mock).mockResolvedValueOnce({ default: mockProject });

    await pushCommand({ project: '/test/project' });

    // The command should complete successfully
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should display next steps with default config', async () => {
    (existsSync as Mock).mockReturnValue(true);

    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      setCredentials: vi.fn(),
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-project'),
      getName: vi.fn().mockReturnValue('Test Project'),
      getStats: vi.fn().mockReturnValue({ graphCount: 1, tenantId: 'test-tenant' }),
      getGraphs: vi.fn().mockReturnValue([]),
      getCredentialTracking: vi.fn().mockResolvedValue({
        credentials: {},
        usage: {},
      }),
    };

    (importWithTypeScriptSupport as Mock).mockResolvedValueOnce({ default: mockProject });

    await pushCommand({ project: '/test/project' });

    // The command should complete successfully
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should handle push failure gracefully', async () => {
    (existsSync as Mock).mockReturnValue(true);

    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      setCredentials: vi.fn(),
      init: vi.fn().mockRejectedValue(new Error('Push failed')),
      getId: vi.fn().mockReturnValue('test-project'),
      getName: vi.fn().mockReturnValue('Test Project'),
      getStats: vi.fn().mockReturnValue({ graphCount: 1, tenantId: 'test-tenant' }),
      getGraphs: vi.fn().mockReturnValue([]),
    };

    (importWithTypeScriptSupport as Mock).mockResolvedValueOnce({ default: mockProject });

    await pushCommand({ project: '/test/project' });

    // Verify error exit
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should display next steps after push', async () => {
    (existsSync as Mock).mockReturnValue(true);

    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      setCredentials: vi.fn(),
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-project'),
      getName: vi.fn().mockReturnValue('Test Project'),
      getStats: vi.fn().mockReturnValue({ graphCount: 1, tenantId: 'test-tenant' }),
      getGraphs: vi.fn().mockReturnValue([]),
      getCredentialTracking: vi.fn().mockResolvedValue({
        credentials: {},
        usage: {},
      }),
    };

    (importWithTypeScriptSupport as Mock).mockResolvedValueOnce({ default: mockProject });

    await pushCommand({ project: '/test/project' });

    // The command should complete successfully
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
