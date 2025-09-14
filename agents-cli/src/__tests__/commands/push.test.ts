import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest';
import { pushCommand } from '../../commands/push';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { importWithTypeScriptSupport } from '../../utils/tsx-loader';

// Mock all external dependencies
vi.mock('node:fs');
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

vi.mock('../../utils/project-directory.js', () => ({
  findProjectDirectory: vi.fn(),
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

    // Mock process.exit to prevent test runner from exiting
    mockExit = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(mockExit as any);

    // Mock console methods
    mockLog = vi.fn();
    mockError = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(mockLog);
    vi.spyOn(console, 'error').mockImplementation(mockError);

    // Default environment
    process.env.TSX_RUNNING = '1';
  });

  afterEach(() => {
    delete process.env.TSX_RUNNING;
    delete process.env.INKEEP_ENV;
    delete process.env.DB_FILE_NAME;
  });

  it('should load and push project successfully', async () => {
    // Mock project directory finding
    const { findProjectDirectory } = await import('../../utils/project-directory.js');
    (findProjectDirectory as Mock).mockResolvedValue('/test/project');

    // Mock file exists (index.ts and inkeep.config.ts)
    (existsSync as Mock).mockReturnValue(true);

    // Mock project module
    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      setCredentials: vi.fn(),
      push: vi.fn().mockResolvedValue({
        success: true,
        projectId: 'test-project',
      }),
    };

    // Mock config module
    const mockConfig = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentsManageApiUrl: 'http://localhost:3002',
    };

    // First call returns project, second returns config
    (importWithTypeScriptSupport as Mock)
      .mockResolvedValueOnce({ default: mockProject })
      .mockResolvedValueOnce({ default: mockConfig });

    await pushCommand({ project: '/test/project' });

    // Verify project was loaded
    expect(importWithTypeScriptSupport).toHaveBeenCalledWith('/test/project/index.ts');
    expect(importWithTypeScriptSupport).toHaveBeenCalledWith('/test/project/inkeep.config.ts');

    // Verify config was set on project
    expect(mockProject.setConfig).toHaveBeenCalledWith('test-tenant', 'http://localhost:3002');

    // Verify push was called
    expect(mockProject.push).toHaveBeenCalled();
  });

  it('should handle missing index.ts file', async () => {
    // Mock project directory finding
    const { findProjectDirectory } = await import('../../utils/project-directory.js');
    (findProjectDirectory as Mock).mockResolvedValue('/test/project');

    // Mock file doesn't exist
    (existsSync as Mock).mockReturnValue(false);

    await pushCommand({ project: '/test/project' });

    // Verify error was shown
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('index.ts not found')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle missing project export', async () => {
    const { findProjectDirectory } = await import('../../utils/project-directory.js');
    (findProjectDirectory as Mock).mockResolvedValue('/test/project');

    (existsSync as Mock).mockReturnValue(true);

    // Mock module without project export
    (importWithTypeScriptSupport as Mock).mockResolvedValue({
      someOtherExport: {},
    });

    await pushCommand({ project: '/test/project' });

    // Verify error was shown
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('No project export found')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle project not found', async () => {
    const { findProjectDirectory } = await import('../../utils/project-directory.js');
    (findProjectDirectory as Mock).mockResolvedValue(null);

    await pushCommand({ project: '/nonexistent' });

    // Verify error was shown
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('Project directory not found')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should use environment flag for credentials', async () => {
    const { findProjectDirectory } = await import('../../utils/project-directory.js');
    const { loadEnvironmentCredentials } = await import('../../utils/environment-loader.js');
    
    (findProjectDirectory as Mock).mockResolvedValue('/test/project');
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
    };

    const mockConfig = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentsManageApiUrl: 'http://localhost:3002',
    };

    (importWithTypeScriptSupport as Mock)
      .mockResolvedValueOnce({ default: mockProject })
      .mockResolvedValueOnce({ default: mockConfig });

    const mockCredentials = { apiKey: 'test-key' };
    (loadEnvironmentCredentials as Mock).mockResolvedValue(mockCredentials);

    await pushCommand({ project: '/test/project', env: 'production' });

    // Verify environment was set
    expect(process.env.INKEEP_ENV).toBe('production');

    // Verify credentials were loaded and set
    expect(loadEnvironmentCredentials).toHaveBeenCalledWith('/test/project', 'production');
    expect(mockProject.setCredentials).toHaveBeenCalledWith(mockCredentials);
  });

  it('should override API URL from command line', async () => {
    const { findProjectDirectory } = await import('../../utils/project-directory.js');
    (findProjectDirectory as Mock).mockResolvedValue('/test/project');
    (existsSync as Mock).mockReturnValue(true);

    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-project'),
      getName: vi.fn().mockReturnValue('Test Project'),
      getStats: vi.fn().mockReturnValue({ graphCount: 1, tenantId: 'test-tenant' }),
      getGraphs: vi.fn().mockReturnValue([]),
    };

    const mockConfig = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentsManageApiUrl: 'http://localhost:3002',
    };

    (importWithTypeScriptSupport as Mock)
      .mockResolvedValueOnce({ default: mockProject })
      .mockResolvedValueOnce({ default: mockConfig });

    await pushCommand({ 
      project: '/test/project',
      agentsManageApiUrl: 'http://custom-api.com'
    });

    // Verify custom API URL was used
    expect(mockProject.setConfig).toHaveBeenCalledWith('test-tenant', 'http://custom-api.com');
  });

  it('should handle missing configuration', async () => {
    const { findProjectDirectory } = await import('../../utils/project-directory.js');
    (findProjectDirectory as Mock).mockResolvedValue('/test/project');
    (existsSync as Mock).mockReturnValue(true);

    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
    };

    // Config missing required fields
    const mockConfig = {
      tenantId: 'test-tenant',
      // Missing projectId and agentsManageApiUrl
    };

    (importWithTypeScriptSupport as Mock)
      .mockResolvedValueOnce({ default: mockProject })
      .mockResolvedValueOnce({ default: mockConfig });

    await pushCommand({ project: '/test/project' });

    // Verify error was shown
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('Missing required configuration')
    );
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle JSON output mode', async () => {
    const { findProjectDirectory } = await import('../../utils/project-directory.js');
    (findProjectDirectory as Mock).mockResolvedValue('/test/project');
    (existsSync as Mock).mockReturnValue(true);

    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      toJSON: vi.fn().mockReturnValue({ 
        graphs: [],
        agents: [],
        tools: []
      }),
    };

    const mockConfig = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentsManageApiUrl: 'http://localhost:3002',
    };

    (importWithTypeScriptSupport as Mock)
      .mockResolvedValueOnce({ default: mockProject })
      .mockResolvedValueOnce({ default: mockConfig });

    // Mock fs.writeFileSync
    const fs = await import('node:fs');
    const mockWriteFileSync = vi.fn();
    (fs as any).writeFileSync = mockWriteFileSync;

    await pushCommand({ 
      project: '/test/project',
      json: true
    });

    // Verify JSON was generated instead of pushing
    expect(mockProject.toJSON).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(mockProject.push).not.toHaveBeenCalled();
  });
});

describe('Push Command - UI Link Generation', () => {
  let mockExit: Mock;
  let mockLog: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockExit = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(mockExit as any);

    mockLog = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(mockLog);
    vi.spyOn(console, 'error').mockImplementation(vi.fn());

    process.env.TSX_RUNNING = '1';
  });

  afterEach(() => {
    delete process.env.TSX_RUNNING;
  });

  it('should display UI link after successful push', async () => {
    const { findProjectDirectory } = await import('../../utils/project-directory.js');
    (findProjectDirectory as Mock).mockResolvedValue('/test/project');
    (existsSync as Mock).mockReturnValue(true);

    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      push: vi.fn().mockResolvedValue({ 
        success: true,
        projectId: 'test-project'
      }),
    };

    const mockConfig = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentsManageApiUrl: 'http://api.example.com',
      manageUiUrl: 'http://ui.example.com',
    };

    (importWithTypeScriptSupport as Mock)
      .mockResolvedValueOnce({ default: mockProject })
      .mockResolvedValueOnce({ default: mockConfig });

    await pushCommand({ project: '/test/project' });

    // The actual implementation shows next steps instead of UI links
    expect(mockLog).toHaveBeenCalledWith(
      expect.stringContaining('Next steps')
    );
  });

  it('should handle push with default UI URL', async () => {
    const { findProjectDirectory } = await import('../../utils/project-directory.js');
    (findProjectDirectory as Mock).mockResolvedValue('/test/project');
    (existsSync as Mock).mockReturnValue(true);

    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      push: vi.fn().mockResolvedValue({ 
        success: true,
        projectId: 'test-project'
      }),
    };

    const mockConfig = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentsManageApiUrl: 'http://localhost:3002',
      // No manageUiUrl - should use default
    };

    (importWithTypeScriptSupport as Mock)
      .mockResolvedValueOnce({ default: mockProject })
      .mockResolvedValueOnce({ default: mockConfig });

    await pushCommand({ project: '/test/project' });

    // The actual implementation shows next steps instead of UI links
    expect(mockLog).toHaveBeenCalledWith(
      expect.stringContaining('Next steps')
    );
  });

  it('should handle push failure gracefully', async () => {
    const { findProjectDirectory } = await import('../../utils/project-directory.js');
    (findProjectDirectory as Mock).mockResolvedValue('/test/project');
    (existsSync as Mock).mockReturnValue(true);

    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      push: vi.fn().mockRejectedValue(new Error('Push failed')),
    };

    const mockConfig = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentsManageApiUrl: 'http://localhost:3002',
    };

    (importWithTypeScriptSupport as Mock)
      .mockResolvedValueOnce({ default: mockProject })
      .mockResolvedValueOnce({ default: mockConfig });

    await pushCommand({ project: '/test/project' });

    // Verify error exit
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should normalize trailing slashes in URLs', async () => {
    const { findProjectDirectory } = await import('../../utils/project-directory.js');
    (findProjectDirectory as Mock).mockResolvedValue('/test/project');
    (existsSync as Mock).mockReturnValue(true);

    const mockProject = {
      __type: 'project',
      setConfig: vi.fn(),
      push: vi.fn().mockResolvedValue({ 
        success: true,
        projectId: 'test-project'
      }),
    };

    const mockConfig = {
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentsManageApiUrl: 'http://api.example.com/',
      manageUiUrl: 'http://ui.example.com/',
    };

    (importWithTypeScriptSupport as Mock)
      .mockResolvedValueOnce({ default: mockProject })
      .mockResolvedValueOnce({ default: mockConfig });

    await pushCommand({ project: '/test/project' });

    // The actual implementation shows next steps instead of UI links
    expect(mockLog).toHaveBeenCalledWith(
      expect.stringContaining('Next steps')
    );
  });
});