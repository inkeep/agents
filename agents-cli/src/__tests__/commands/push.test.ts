import { existsSync } from 'node:fs';
import * as core from '@inkeep/agents-core';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { pushCommand } from '../../commands/push';

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
    create: vi.fn().mockResolvedValue({}),
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

describe('Push Command - Project Validation', () => {
  let mockDbClient: any;
  let mockGetProject: Mock;
  let mockCreateProject: Mock;
  let mockExit: Mock;
  let mockLog: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

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

    vi.doMock('/test/path/graph.js', () => ({
      default: mockGraph,
    }));

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

    vi.doMock('/test/path/graph.js', () => ({
      default: mockGraph,
    }));

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

    vi.doMock('/test/path/graph.js', () => ({
      default: mockGraph,
    }));

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

    vi.doMock('/test/path/graph.js', () => ({
      default: mockGraph,
    }));

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

    vi.doMock('/test/path/graph.js', () => ({
      default: mockGraph,
    }));

    process.env.TSX_RUNNING = '1';

    await pushCommand('/test/path/graph.js', {});

    // Verify default database URL was used
    expect(core.createDatabaseClient).toHaveBeenCalledWith({
      url: expect.stringContaining('local.db'),
    });
  });
});
