import { existsSync } from 'node:fs';
import * as p from '@clack/prompts';
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
    agentsManageApiUrl: 'http://localhost:3002',
    sources: {
      tenantId: 'config',
      agentsManageApiUrl: 'config',
    },
  }),
}));
vi.mock('../../api.js', () => ({
  ManagementApiClient: {
    create: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('@clack/prompts');

// Store the actual spinner mock instance
let spinnerInstance: any;

// Mock tsx-loader module
vi.mock('../../utils/tsx-loader.js', () => ({
  importWithTypeScriptSupport: vi.fn(),
}));

describe('Push Command - TypeScript Loading', () => {
  let mockExit: Mock;
  let mockImportWithTypeScriptSupport: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset spinner instance
    spinnerInstance = {
      start: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      message: vi.fn().mockReturnThis(),
    };
    vi.mocked(p.spinner).mockReturnValue(spinnerInstance);
    vi.mocked(p.isCancel).mockReturnValue(false);
    vi.mocked(p.cancel).mockImplementation(() => {});

    // Reset validateConfiguration mock
    const { validateConfiguration } = await import('../../utils/config.js');
    (validateConfiguration as Mock).mockResolvedValue({
      tenantId: 'test-tenant',
      agentsManageApiUrl: 'http://localhost:3002',
      agentsRunApiUrl: 'http://localhost:3001',
      sources: {},
    });

    // Environment setup

    // Mock file exists
    (existsSync as Mock).mockReturnValue(true);

    // Mock process.exit
    mockExit = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(mockExit as any);

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());

    // Get the mocked tsx-loader import function
    const tsxLoader = await import('../../utils/tsx-loader.js');
    mockImportWithTypeScriptSupport = tsxLoader.importWithTypeScriptSupport as Mock;
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
      getStats: vi.fn().mockReturnValue({ agentCount: 1, tenantId: 'test-tenant' }),
      getAgents: vi.fn().mockReturnValue([]),
    };

    // Mock config module
    const mockConfig = {
      tenantId: 'test-tenant',
      agentsManageApiUrl: 'http://localhost:3002',
    };

    mockImportWithTypeScriptSupport
      .mockResolvedValueOnce({ default: mockProject })
      .mockResolvedValueOnce({ default: mockConfig });

    await pushCommand({ project: '/test/path' });

    // Verify TypeScript loader was used
    expect(mockImportWithTypeScriptSupport).toHaveBeenCalledWith(
      expect.stringContaining('/test/path/index.ts')
    );

    // Verify spinner was created and used correctly
    expect(spinnerInstance).toBeDefined();
    expect(spinnerInstance.start).toHaveBeenCalled();
    expect(spinnerInstance.stop).toHaveBeenCalled();
  });

  it.skip('should handle TypeScript import errors gracefully', async () => {
    // Mock import returning empty module (no project export)
    mockImportWithTypeScriptSupport.mockResolvedValue({});

    await pushCommand({});

    // Verify error handling - it should fail because no project export found
    expect(spinnerInstance.stop).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'Error:',
      'No project export found in index.ts. Expected an export with __type = "project"'
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it.skip('should work with JavaScript files without tsx loader', async () => {
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
      getStats: vi.fn().mockReturnValue({ agentCount: 1, tenantId: 'test-tenant' }),
      getAgents: vi.fn().mockReturnValue([]),
    };

    // Mock config module
    const mockConfig = {
      tenantId: 'test-tenant',
      agentsManageApiUrl: 'http://localhost:3002',
    };

    mockImportWithTypeScriptSupport
      .mockResolvedValueOnce({ default: mockProject })
      .mockResolvedValueOnce({ default: mockConfig });

    await pushCommand({ project: '/test/path' });

    // Verify loader was called for index.ts file
    expect(mockImportWithTypeScriptSupport).toHaveBeenCalledWith(
      expect.stringContaining('/test/path/index.ts')
    );

    // Verify success
    expect(spinnerInstance.stop).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
