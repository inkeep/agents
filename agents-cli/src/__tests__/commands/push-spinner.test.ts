import { existsSync } from 'node:fs';
import * as core from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { pushCommand } from '../../commands/push';

// Mock dependencies
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});
vi.mock('@inkeep/agents-core');
vi.mock('../../utils/project-directory.js', () => ({
  findProjectDirectory: vi.fn(),
}));
vi.mock('../../utils/config.js', () => ({
  validateConfiguration: vi.fn().mockResolvedValue({
    tenantId: 'test-tenant',
    projectId: 'test-project',
    agentsManageApiUrl: 'http://localhost:3002',
    sources: {
      tenantId: 'config',
      projectId: 'config',
      agentsManageApiUrl: 'config',
    },
  }),
}));
vi.mock('../../api.js', () => ({
  ManagementApiClient: {
    create: vi.fn().mockResolvedValue({}),
  },
}));

// Store the actual ora mock instance
let oraInstance: any;

vi.mock('ora', () => ({
  default: vi.fn(() => {
    oraInstance = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
      warn: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      text: '',
    };
    return oraInstance;
  }),
}));

// Mock tsx-loader module
vi.mock('../../utils/tsx-loader.js', () => ({
  importWithTypeScriptSupport: vi.fn(),
}));

describe('Push Command - TypeScript Loading', () => {
  let mockExit: Mock;
  let mockDbClient: any;
  let mockGetProject: Mock;
  let mockCreateProject: Mock;
  let mockImportWithTypeScriptSupport: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset ora instance
    oraInstance = null;

    // Ensure TSX_RUNNING is not set
    delete process.env.TSX_RUNNING;

    // Mock file exists
    (existsSync as Mock).mockReturnValue(true);

    // Mock process.exit
    mockExit = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(mockExit as any);

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());

    // Setup database client mock
    mockDbClient = {};
    mockGetProject = vi.fn();
    mockCreateProject = vi.fn();

    (core.createDatabaseClient as Mock).mockReturnValue(mockDbClient);
    (core.getProject as Mock).mockReturnValue(mockGetProject);
    (core.createProject as Mock).mockReturnValue(mockCreateProject);

    // Get the mocked tsx-loader import function
    const tsxLoader = await import('../../utils/tsx-loader.js');
    mockImportWithTypeScriptSupport = tsxLoader.importWithTypeScriptSupport as Mock;

    // Set DB_FILE_NAME to prevent database errors
    process.env.DB_FILE_NAME = 'test.db';
  });

  it('should load TypeScript files using importWithTypeScriptSupport', async () => {
    // Mock file exists
    (existsSync as Mock).mockReturnValue(true);

    // Mock project directory finding
    const projectDir = await import('../../utils/project-directory.js');
    (projectDir.findProjectDirectory as Mock).mockResolvedValue('/test/path');

    // Mock project module
    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-project'),
      getName: vi.fn().mockReturnValue('Test Project'),
      getStats: vi.fn().mockReturnValue({ graphCount: 1, tenantId: 'test-tenant' }),
      getGraphs: vi.fn().mockReturnValue([]),
    };

    // Mock config module
    const mockConfig = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentsManageApiUrl: 'http://localhost:3002',
    };

    mockImportWithTypeScriptSupport
      .mockResolvedValueOnce({ default: mockProject })
      .mockResolvedValueOnce({ default: mockConfig });

    process.env.TSX_RUNNING = '1';

    await pushCommand({ project: '/test/path' });

    // Verify TypeScript loader was used
    expect(mockImportWithTypeScriptSupport).toHaveBeenCalledWith(
      expect.stringContaining('/test/path/index.ts')
    );

    // Verify spinner was created and used correctly
    expect(oraInstance).toBeDefined();
    expect(oraInstance.start).toHaveBeenCalled();
    expect(oraInstance.succeed).toHaveBeenCalled();
  });

  it('should handle TypeScript import errors gracefully', async () => {
    // Mock import failure
    mockImportWithTypeScriptSupport.mockRejectedValue(new Error('Failed to load TypeScript file'));

    process.env.TSX_RUNNING = '1';

    await pushCommand({});

    // Verify error handling
    expect(oraInstance.fail).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error'),
      'Failed to load TypeScript file'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should work with JavaScript files without tsx loader', async () => {
    // Mock file exists
    (existsSync as Mock).mockReturnValue(true);

    // Mock project directory finding
    const projectDir = await import('../../utils/project-directory.js');
    (projectDir.findProjectDirectory as Mock).mockResolvedValue('/test/path');

    // Mock project module
    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-project'),
      getName: vi.fn().mockReturnValue('Test Project'),
      getStats: vi.fn().mockReturnValue({ graphCount: 1, tenantId: 'test-tenant' }),
      getGraphs: vi.fn().mockReturnValue([]),
    };

    // Mock config module
    const mockConfig = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentsManageApiUrl: 'http://localhost:3002',
    };

    mockImportWithTypeScriptSupport
      .mockResolvedValueOnce({ default: mockProject })
      .mockResolvedValueOnce({ default: mockConfig });

    process.env.TSX_RUNNING = '1';

    await pushCommand({ project: '/test/path' });

    // Verify loader was called for index.ts file
    expect(mockImportWithTypeScriptSupport).toHaveBeenCalledWith(
      expect.stringContaining('/test/path/index.ts')
    );

    // Verify success
    expect(oraInstance.succeed).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
