import { existsSync } from 'node:fs';
import * as core from '@inkeep/agents-core';
import inquirer from 'inquirer';
import { beforeEach, describe, expect, it, type Mock, vi, afterEach } from 'vitest';
import { pushCommand } from '../../commands/push';
import { importWithTypeScriptSupport } from '../../utils/tsx-loader';

// Mock all external dependencies
vi.mock('node:fs');
vi.mock('@inkeep/agents-core');
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
vi.mock('../../api.js', () => ({
  ManagementApiClient: {
    create: vi.fn(),
  },
}));
vi.mock('../../utils/config.js', () => ({
  validateConfiguration: vi.fn().mockResolvedValue({
    tenantId: 'test-tenant',
    projectId: 'test-project',
    managementApiUrl: 'http://localhost:3002',
    sources: {
      tenantId: 'config',
      projectId: 'config',
      managementApiUrl: 'config',
    },
  }),
}));

vi.mock('../../utils/tsx-loader.js', () => ({
  importWithTypeScriptSupport: vi.fn(),
}));

describe('Push Command - Project Validation', () => {
  let mockDbClient: any;
  let mockGetProject: Mock;
  let mockCreateProject: Mock;
  let mockExit: Mock;
  let mockLog: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Ensure tsx-loader is not mocked for these tests
    (importWithTypeScriptSupport as Mock).mockReset();

    // Setup database client mock
    mockDbClient = {};
    mockGetProject = vi.fn();
    mockCreateProject = vi.fn();

    (core.createDatabaseClient as Mock).mockReturnValue(mockDbClient);
    (core.getProject as Mock).mockReturnValue(mockGetProject);
    (core.createProject as Mock).mockReturnValue(mockCreateProject);

    // Mock process.exit to prevent test runner from exiting
    mockExit = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(mockExit as any);

    // Mock console methods
    mockLog = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(mockLog);
    vi.spyOn(console, 'error').mockImplementation(vi.fn());

    // Mock file existence check for graph file
    (existsSync as Mock).mockReturnValue(true);

    // Mock configuration validation
    const { validateConfiguration } = await import('../../utils/config.js');
    (validateConfiguration as Mock).mockResolvedValue({
      tenantId: 'test-tenant',
      projectId: 'test-project',
      managementApiUrl: 'http://localhost:3002',
      executionApiUrl: 'http://localhost:3001',
      manageUiUrl: 'http://localhost:3000',
      sources: {
        tenantId: 'config',
        projectId: 'config',
        managementApiUrl: 'config',
        executionApiUrl: 'config',
      },
    });

    // Mock ManagementApiClient
    const { ManagementApiClient } = await import('../../api.js');
    const mockApi = {
      pushGraph: vi.fn().mockResolvedValue({
        id: 'test-graph-id',
        name: 'Test Graph',
        agents: [],
        tools: [],
        relations: [],
      }),
    };
    (ManagementApiClient.create as Mock).mockResolvedValue(mockApi);

    // Default environment
    process.env.DB_FILE_NAME = 'test.db';
  });

  it('should validate project exists before pushing graph', async () => {
    // Mock project exists
    mockGetProject.mockResolvedValue({
      id: 'test-project',
      name: 'Test Project',
      tenantId: 'test-tenant',
    });

    // Mock graph file import
    const mockGraph = {
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-graph'),
      getName: vi.fn().mockReturnValue('Test Graph'),
      getAgents: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockReturnValue({
        agentCount: 1,
        toolCount: 0,
        relationCount: 0,
      }),
      getDefaultAgent: vi.fn().mockReturnValue(null),
      setConfig: vi.fn(),
    };

    // Mock the tsx-loader to return our graph
    (importWithTypeScriptSupport as Mock).mockResolvedValue({
      graph: mockGraph,
    });

    // Run in TypeScript mode (skip tsx spawn)
    process.env.TSX_RUNNING = '1';

    await pushCommand('/test/path/graph.js', {});

    // Verify project validation was called
    expect(mockGetProject).toHaveBeenCalledWith({
      scopes: { tenantId: 'test-tenant', projectId: 'test-project' },
    });
  });

  it('should prompt to create project when it does not exist', async () => {
    // Mock project doesn't exist
    mockGetProject.mockResolvedValue(null);

    // Mock user confirms project creation
    (inquirer.prompt as unknown as Mock)
      .mockResolvedValueOnce({ shouldCreate: true })
      .mockResolvedValueOnce({
        projectName: 'New Project',
        projectDescription: 'Test description',
      });

    // Mock project creation success
    mockCreateProject.mockResolvedValue({
      id: 'test-project',
      name: 'New Project',
      description: 'Test description',
      tenantId: 'test-tenant',
    });

    // Mock graph file import
    const mockGraph = {
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-graph'),
      getName: vi.fn().mockReturnValue('Test Graph'),
      getAgents: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockReturnValue({
        agentCount: 1,
        toolCount: 0,
        relationCount: 0,
      }),
      getDefaultAgent: vi.fn().mockReturnValue(null),
      setConfig: vi.fn(),
    };

    // Mock the tsx-loader to return our graph
    (importWithTypeScriptSupport as Mock).mockResolvedValue({
      graph: mockGraph,
    });

    process.env.TSX_RUNNING = '1';

    await pushCommand('/test/path/graph.js', {});

    // Verify project creation was prompted
    expect(inquirer.prompt).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'confirm',
          name: 'shouldCreate',
          message: expect.stringContaining('does not exist'),
        }),
      ])
    );

    // Verify project was created
    expect(mockCreateProject).toHaveBeenCalledWith({
      id: 'test-project',
      tenantId: 'test-tenant',
      name: 'New Project',
      description: 'Test description',
    });
  });

  it('should exit if user declines to create missing project', async () => {
    // Mock project doesn't exist
    mockGetProject.mockResolvedValue(null);

    // Mock user declines project creation
    (inquirer.prompt as unknown as Mock).mockResolvedValueOnce({ shouldCreate: false });

    // Mock graph file import (needed to prevent errors)
    const mockGraph = {
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-graph'),
      getName: vi.fn().mockReturnValue('Test Graph'),
      getAgents: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockReturnValue({
        agentCount: 1,
        toolCount: 0,
        relationCount: 0,
      }),
      getDefaultAgent: vi.fn().mockReturnValue(null),
      setConfig: vi.fn(),
    };

    // Mock the tsx-loader to return our graph
    (importWithTypeScriptSupport as Mock).mockResolvedValue({
      graph: mockGraph,
    });

    process.env.TSX_RUNNING = '1';

    await pushCommand('/test/path/graph.js', {});

    // Verify push was cancelled
    expect(mockExit).toHaveBeenCalledWith(0);
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Push cancelled'));

    // Verify project was not created
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('should handle project creation errors gracefully', async () => {
    // Mock project doesn't exist
    mockGetProject.mockResolvedValue(null);

    // Mock user confirms project creation
    (inquirer.prompt as unknown as Mock)
      .mockResolvedValueOnce({ shouldCreate: true })
      .mockResolvedValueOnce({
        projectName: 'New Project',
        projectDescription: '',
      });

    // Mock project creation failure
    mockCreateProject.mockRejectedValue(new Error('Database error'));

    // Mock graph file import
    const mockGraph = {
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-graph'),
      getName: vi.fn().mockReturnValue('Test Graph'),
      getAgents: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockReturnValue({
        agentCount: 1,
        toolCount: 0,
        relationCount: 0,
      }),
      getDefaultAgent: vi.fn().mockReturnValue(null),
      setConfig: vi.fn(),
    };

    // Mock the tsx-loader to return our graph
    (importWithTypeScriptSupport as Mock).mockResolvedValue({
      graph: mockGraph,
    });

    process.env.TSX_RUNNING = '1';

    await pushCommand('/test/path/graph.js', {});

    // Verify error handling
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error'), 'Database error');
  });

  it('should use DB_FILE_NAME environment variable for database location', async () => {
    process.env.DB_FILE_NAME = 'custom-location.db';

    mockGetProject.mockResolvedValue({
      id: 'test-project',
      name: 'Test Project',
      tenantId: 'test-tenant',
    });

    const mockGraph = {
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-graph'),
      getName: vi.fn().mockReturnValue('Test Graph'),
      getAgents: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockReturnValue({
        agentCount: 1,
        toolCount: 0,
        relationCount: 0,
      }),
      getDefaultAgent: vi.fn().mockReturnValue(null),
      setConfig: vi.fn(),
    };

    // Mock the tsx-loader to return our graph
    (importWithTypeScriptSupport as Mock).mockResolvedValue({
      graph: mockGraph,
    });

    process.env.TSX_RUNNING = '1';

    await pushCommand('/test/path/graph.js', {});

    // Verify correct database URL was used
    expect(core.createDatabaseClient).toHaveBeenCalledWith({
      url: expect.stringContaining('custom-location.db'),
    });
  });

  it('should default to local.db when DB_FILE_NAME is not set', async () => {
    delete process.env.DB_FILE_NAME;

    mockGetProject.mockResolvedValue({
      id: 'test-project',
      name: 'Test Project',
      tenantId: 'test-tenant',
    });

    const mockGraph = {
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-graph'),
      getName: vi.fn().mockReturnValue('Test Graph'),
      getAgents: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockReturnValue({
        agentCount: 1,
        toolCount: 0,
        relationCount: 0,
      }),
      getDefaultAgent: vi.fn().mockReturnValue(null),
      setConfig: vi.fn(),
    };

    // Mock the tsx-loader to return our graph
    (importWithTypeScriptSupport as Mock).mockResolvedValue({
      graph: mockGraph,
    });

    process.env.TSX_RUNNING = '1';

    await pushCommand('/test/path/graph.js', {});

    // Verify default database URL was used
    expect(core.createDatabaseClient).toHaveBeenCalledWith({
      url: expect.stringContaining('local.db'),
    });
  });
});

describe('Push Command - UI Link Generation', () => {
  let mockDbClient: any;
  let mockGetProject: Mock;
  let mockCreateProject: Mock;
  let mockExit: Mock;
  let mockLog: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Reset the tsx-loader mock
    (importWithTypeScriptSupport as Mock).mockReset();

    // Reset environment
    delete process.env.DB_FILE_NAME;
    delete process.env.TSX_RUNNING;

    // Mock database client
    mockDbClient = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([{ id: 'test-project', name: 'Test Project', tenantId: 'test-tenant' }]),
      insertInto: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue({ id: 'test-id' }),
      onConflict: vi.fn().mockReturnThis(),
      doUpdate: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    };

    // Mock core functions - ensure project exists to bypass creation prompts
    mockGetProject = vi.fn().mockResolvedValue({ id: 'test-project', name: 'Test Project', tenantId: 'test-tenant' });
    mockCreateProject = vi.fn().mockResolvedValue({ id: 'test-project', name: 'Test Project', tenantId: 'test-tenant' });

    (core.createDatabaseClient as Mock).mockReturnValue(mockDbClient);
    (core.getProject as Mock).mockReturnValue(mockGetProject);
    (core.createProject as Mock).mockReturnValue(mockCreateProject);

    // Mock existsSync to return true for all files (graph file and database file)
    (existsSync as Mock).mockReturnValue(true);

    // Mock process.exit to throw an error instead of actually exiting
    mockExit = vi.fn((code) => {
      throw new Error(`Process exited with code ${code}`);
    });
    process.exit = mockExit as any;

    // Mock console methods
    mockLog = vi.fn();
    console.log = mockLog;
    const mockError = vi.fn();
    console.error = mockError;
    console.debug = vi.fn();
    
    // Mock ManagementApiClient with default successful push
    const { ManagementApiClient } = await import('../../api.js');
    const mockApi = {
      pushGraph: vi.fn().mockResolvedValue({
        id: 'test-graph-id',
        name: 'Test Graph',
        agents: [],
        tools: [],
        relations: [],
      }),
    };
    (ManagementApiClient.create as Mock).mockResolvedValue(mockApi);
    
    // Mock inquirer to prevent prompts
    (inquirer.prompt as unknown as Mock).mockResolvedValue({ shouldCreate: false });
  });

  it('should display UI link with custom manageUiUrl', async () => {
    // Mock validation to include manageUiUrl
    const { validateConfiguration } = await import('../../utils/config.js');
    (validateConfiguration as Mock).mockResolvedValue({
      tenantId: 'test-tenant',
      projectId: 'test-project',
      managementApiUrl: 'http://localhost:3002',
      manageUiUrl: 'https://app.example.com',
      sources: {
        tenantId: 'config',
        projectId: 'config',
        managementApiUrl: 'config',
      },
    });

    // Mock graph with required methods and id
    const mockGraph = {
      id: 'test-graph-id',  // Add graph ID
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-graph-id'),
      getName: vi.fn().mockReturnValue('Test Graph'),
      getAgents: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockReturnValue({
        agentCount: 2,
        toolCount: 1,
        relationCount: 1,
      }),
      getDefaultAgent: vi.fn().mockReturnValue(null),
      setConfig: vi.fn(),
    };

    // Mock the tsx-loader to return our graph
    const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader.js');
    (importWithTypeScriptSupport as Mock).mockResolvedValue({
      graph: mockGraph,
    });

    process.env.TSX_RUNNING = '1';

    try {
      await pushCommand('/test/path/graph.js', {});
      // Should not reach here since process.exit is called
      expect.fail('Should have exited');
    } catch (error: any) {
      // Just verify it exited - we'll check the logs regardless
      expect(error.message).toMatch(/Process exited with code/);
    }

    // Verify the UI link is displayed with correct URL
    expect(mockLog).toHaveBeenCalledWith(
      expect.stringContaining('View graph in UI:')
    );
    expect(mockLog).toHaveBeenCalledWith(
      expect.stringContaining('https://app.example.com/test-tenant/projects/test-project/graphs/test-graph-id')
    );
  });

  it('should display UI link with default URL when manageUiUrl is not provided', async () => {
    // Mock validation without manageUiUrl
    const { validateConfiguration } = await import('../../utils/config.js');
    (validateConfiguration as Mock).mockResolvedValue({
      tenantId: 'test-tenant',
      projectId: 'test-project',
      managementApiUrl: 'http://localhost:3002',
      manageUiUrl: undefined,
      sources: {
        tenantId: 'config',
        projectId: 'config',
        managementApiUrl: 'config',
      },
    });

    // Mock graph with required methods and id
    const mockGraph = {
      id: 'test-graph-id',
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-graph-id'),
      getName: vi.fn().mockReturnValue('Test Graph'),
      getAgents: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockReturnValue({
        agentCount: 2,
        toolCount: 1,
        relationCount: 1,
      }),
      getDefaultAgent: vi.fn().mockReturnValue(null),
      setConfig: vi.fn(),
    };

    // Mock the tsx-loader to return our graph
    const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader.js');
    (importWithTypeScriptSupport as Mock).mockResolvedValue({
      graph: mockGraph,
    });

    process.env.TSX_RUNNING = '1';

    try {
      await pushCommand('/test/path/graph.js', {});
      expect.fail('Should have exited');
    } catch (error: any) {
      expect(error.message).toMatch(/Process exited with code/);
    }

    // Verify the UI link is displayed with default URL
    expect(mockLog).toHaveBeenCalledWith(
      expect.stringContaining('View graph in UI:')
    );
    expect(mockLog).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:3000/test-tenant/projects/test-project/graphs/test-graph-id')
    );
  });

  it('should handle invalid manageUiUrl gracefully', async () => {
    // Mock validation with invalid manageUiUrl
    const { validateConfiguration } = await import('../../utils/config.js');
    (validateConfiguration as Mock).mockResolvedValue({
      tenantId: 'test-tenant',
      projectId: 'test-project',
      managementApiUrl: 'http://localhost:3002',
      manageUiUrl: 'not-a-valid-url',
      sources: {
        tenantId: 'config',
        projectId: 'config',
        managementApiUrl: 'config',
      },
    });

    // Mock graph with required methods and id
    const mockGraph = {
      id: 'test-graph-id',
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-graph-id'),
      getName: vi.fn().mockReturnValue('Test Graph'),
      getAgents: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockReturnValue({
        agentCount: 2,
        toolCount: 1,
        relationCount: 1,
      }),
      getDefaultAgent: vi.fn().mockReturnValue(null),
      setConfig: vi.fn(),
    };

    // Mock the tsx-loader to return our graph
    const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader.js');
    (importWithTypeScriptSupport as Mock).mockResolvedValue({
      graph: mockGraph,
    });

    process.env.TSX_RUNNING = '1';

    try {
      await pushCommand('/test/path/graph.js', {});
      expect.fail('Should have exited');
    } catch (error: any) {
      expect(error.message).toMatch(/Process exited with code/);
    }
    
    // The UI link line should not be displayed
    const viewGraphCalls = mockLog.mock.calls.filter((call: any[]) => 
      call.some((arg: any) => typeof arg === 'string' && arg.includes('View graph in UI'))
    );
    expect(viewGraphCalls.length).toBe(0);
    
    // Debug log should have been called
    expect(console.debug).toHaveBeenCalledWith('Could not generate UI link:', expect.any(Error));
  });

  it('should normalize trailing slashes in manageUiUrl', async () => {
    // Mock validation with manageUiUrl having trailing slashes
    const { validateConfiguration } = await import('../../utils/config.js');
    (validateConfiguration as Mock).mockResolvedValue({
      tenantId: 'test-tenant',
      projectId: 'test-project',
      managementApiUrl: 'http://localhost:3002',
      manageUiUrl: 'https://app.example.com///',
      sources: {
        tenantId: 'config',
        projectId: 'config',
        managementApiUrl: 'config',
      },
    });

    // Mock graph with required methods and id
    const mockGraph = {
      id: 'test-graph-id',
      init: vi.fn().mockResolvedValue(undefined),
      getId: vi.fn().mockReturnValue('test-graph-id'),
      getName: vi.fn().mockReturnValue('Test Graph'),
      getAgents: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockReturnValue({
        agentCount: 2,
        toolCount: 1,
        relationCount: 1,
      }),
      getDefaultAgent: vi.fn().mockReturnValue(null),
      setConfig: vi.fn(),
    };

    // Mock the tsx-loader to return our graph
    const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader.js');
    (importWithTypeScriptSupport as Mock).mockResolvedValue({
      graph: mockGraph,
    });

    process.env.TSX_RUNNING = '1';

    try {
      await pushCommand('/test/path/graph.js', {});
      expect.fail('Should have exited');
    } catch (error: any) {
      expect(error.message).toMatch(/Process exited with code/);
    }

    // Verify the UI link is displayed with normalized URL (no trailing slashes)
    expect(mockLog).toHaveBeenCalledWith(
      expect.stringContaining('View graph in UI:')
    );
    expect(mockLog).toHaveBeenCalledWith(
      expect.stringContaining('https://app.example.com/test-tenant/projects/test-project/graphs/test-graph-id')
    );
    // Ensure no double slashes after the domain
    const urlCalls = mockLog.mock.calls.filter((call: any[]) => 
      call.some((arg: any) => typeof arg === 'string' && arg.includes('https://app.example.com'))
    );
    urlCalls.forEach((call: any[]) => {
      call.forEach((arg: any) => {
        if (typeof arg === 'string' && arg.includes('https://app.example.com')) {
          expect(arg).not.toContain('https://app.example.com//');
        }
      });
    });
  });
});
