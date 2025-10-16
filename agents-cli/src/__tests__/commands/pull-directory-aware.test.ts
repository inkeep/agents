import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

// Mock all external dependencies
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

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

vi.mock('prompts', () => ({
  default: vi.fn(),
}));

vi.mock('../../utils/tsx-loader.js', () => ({
  importWithTypeScriptSupport: vi.fn(),
}));

vi.mock('../../utils/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../utils/project-directory.js', () => ({
  findProjectDirectory: vi.fn(),
}));

vi.mock('../../api.js', () => ({
  ManagementApiClient: {
    create: vi.fn(),
  },
}));

vi.mock('../../commands/pull.llm-generate.js', () => ({
  generateIndexFile: vi.fn().mockResolvedValue(undefined),
  generateAgentFile: vi.fn().mockResolvedValue(undefined),
  generateToolFile: vi.fn().mockResolvedValue(undefined),
  generateDataComponentFile: vi.fn().mockResolvedValue(undefined),
  generateArtifactComponentFile: vi.fn().mockResolvedValue(undefined),
  generateEnvironmentFiles: vi.fn().mockResolvedValue(undefined),
}));

describe('Pull Command - Directory Aware', () => {
  let mockExit: Mock;
  let mockLog: Mock;
  let mockError: Mock;
  let pullProjectCommand: any;

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

    // Set ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'test-key';

    // Setup default mocks
    const { loadConfig } = await import('../../utils/config.js');
    (loadConfig as Mock).mockResolvedValue({
      tenantId: 'test-tenant',
      agentsManageApiUrl: 'http://localhost:3002',
      agentsRunApiUrl: 'http://localhost:3001',
    });

    const { findProjectDirectory } = await import('../../utils/project-directory.js');
    (findProjectDirectory as Mock).mockResolvedValue('/test/project');

    // Import the command after mocks are set up
    const pullModule = await import('../../commands/pull.js');
    pullProjectCommand = pullModule.pullProjectCommand;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('detectCurrentProject', () => {
    it('should detect project when index.ts exists with valid project export', async () => {
      const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader.js');
      const { ManagementApiClient } = await import('../../api.js');

      // Mock config file exists
      (existsSync as Mock).mockImplementation((path: string) => {
        if (path.includes('inkeep.config.ts')) return true;
        if (path.includes('index.ts')) return true;
        return false;
      });

      // Mock project with getId method
      const mockProject = {
        __type: 'project',
        getId: vi.fn().mockReturnValue('test-project-id'),
      };

      (importWithTypeScriptSupport as Mock).mockResolvedValue({
        default: mockProject,
      });

      // Mock API client
      const mockApiClient = {
        getFullProject: vi.fn().mockResolvedValue({
          name: 'Test Project',
          agents: {},
          tools: {},
          dataComponents: {},
          artifactComponents: {},
          credentialReferences: {},
        }),
      };
      (ManagementApiClient.create as Mock).mockResolvedValue(mockApiClient);

      await pullProjectCommand({});

      // Verify project was detected - check console.log for directory-aware mode message
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Will pull to current directory (directory-aware mode)')
      );

      // Verify the project ID was used
      expect(mockApiClient.getFullProject).toHaveBeenCalledWith('test-project-id');
    });

    it('should not detect project when index.ts does not exist', async () => {
      const prompts = (await import('prompts')).default as Mock;

      // Mock config file exists but no index.ts
      (existsSync as Mock).mockImplementation((path: string) => {
        if (path.includes('inkeep.config.ts')) return true;
        if (path.includes('index.ts')) return false;
        return false;
      });

      // Mock user input
      prompts.mockResolvedValue({ projectId: 'user-entered-id' });

      // Mock API to throw error (we don't care about the rest of the flow)
      const { ManagementApiClient } = await import('../../api.js');
      (ManagementApiClient.create as Mock).mockRejectedValue(new Error('Test error'));

      await pullProjectCommand({});

      // Verify prompt was shown
      expect(prompts).toHaveBeenCalledWith({
        type: 'text',
        name: 'projectId',
        message: 'Enter the project ID to pull:',
        validate: expect.any(Function),
      });
    });

    it('should not detect project when index.ts exists but has no project export', async () => {
      const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader.js');
      const prompts = (await import('prompts')).default as Mock;

      // Mock config and index.ts exist
      (existsSync as Mock).mockImplementation((path: string) => {
        if (path.includes('inkeep.config.ts')) return true;
        if (path.includes('index.ts')) return true;
        return false;
      });

      // Mock module with no project export
      (importWithTypeScriptSupport as Mock).mockResolvedValue({
        someOtherExport: {},
      });

      // Mock user input
      prompts.mockResolvedValue({ projectId: 'user-entered-id' });

      // Mock API to throw error
      const { ManagementApiClient } = await import('../../api.js');
      (ManagementApiClient.create as Mock).mockRejectedValue(new Error('Test error'));

      await pullProjectCommand({});

      // Verify prompt was shown (project not detected)
      expect(prompts).toHaveBeenCalled();
    });
  });

  describe('--project argument with directory detection', () => {
    it('should show error when --project arg is provided while in project directory', async () => {
      const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader.js');

      // Mock config and index.ts exist
      (existsSync as Mock).mockImplementation((path: string) => {
        if (path.includes('inkeep.config.ts')) return true;
        if (path.includes('index.ts')) return true;
        return false;
      });

      // Mock project with getId method
      const mockProject = {
        __type: 'project',
        getId: vi.fn().mockReturnValue('current-project-id'),
      };

      (importWithTypeScriptSupport as Mock).mockResolvedValue({
        default: mockProject,
      });

      await pullProjectCommand({ project: 'different-project-id' });

      // Verify error was shown
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('Cannot specify --project argument when in a project directory')
      );
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('Current directory project: current-project-id')
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should work normally when --project arg is provided and NOT in project directory', async () => {
      const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader.js');
      const { ManagementApiClient } = await import('../../api.js');

      // Mock config exists but no index.ts in current directory
      (existsSync as Mock).mockImplementation((path: string) => {
        if (path.includes('inkeep.config.ts')) return true;
        if (path.includes('index.ts')) return false;
        return false;
      });

      // Mock API client
      const mockApiClient = {
        getFullProject: vi.fn().mockResolvedValue({
          name: 'Test Project',
          agents: {},
          tools: {},
          dataComponents: {},
          artifactComponents: {},
          credentialReferences: {},
        }),
      };
      (ManagementApiClient.create as Mock).mockResolvedValue(mockApiClient);

      await pullProjectCommand({ project: 'some-project-id' });

      // Verify no error was shown
      expect(mockError).not.toHaveBeenCalledWith(
        expect.stringContaining('Cannot specify --project argument')
      );
    });
  });

  describe('createProjectStructure with useCurrentDirectory', () => {
    it('should use current directory when in directory-aware mode', async () => {
      const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader.js');
      const { ManagementApiClient } = await import('../../api.js');
      const { mkdirSync } = await import('node:fs');

      // Mock config and index.ts exist
      (existsSync as Mock).mockImplementation((path: string) => {
        if (path.includes('inkeep.config.ts')) return true;
        if (path.includes('index.ts')) return true;
        return false;
      });

      // Mock project
      const mockProject = {
        __type: 'project',
        getId: vi.fn().mockReturnValue('test-project-id'),
      };

      (importWithTypeScriptSupport as Mock).mockResolvedValue({
        default: mockProject,
      });

      // Mock API client
      const mockApiClient = {
        getFullProject: vi.fn().mockResolvedValue({
          name: 'Test Project',
          agents: {},
          tools: {},
          dataComponents: {},
          artifactComponents: {},
          credentialReferences: {},
        }),
      };
      (ManagementApiClient.create as Mock).mockResolvedValue(mockApiClient);

      await pullProjectCommand({});

      // Verify that directories are created without subdirectory
      const mkdirCalls = (mkdirSync as Mock).mock.calls.map((call) => call[0]);

      // Should NOT create a subdirectory with project ID
      const hasSubdirectory = mkdirCalls.some(
        (path: string) => path.includes('test-project-id') && path !== process.cwd()
      );
      expect(hasSubdirectory).toBe(false);
    });

    it('should create subdirectory when NOT in directory-aware mode', async () => {
      const { ManagementApiClient } = await import('../../api.js');
      const { mkdirSync } = await import('node:fs');
      const prompts = (await import('prompts')).default as Mock;

      // Mock config exists but no index.ts
      (existsSync as Mock).mockImplementation((path: string) => {
        if (path.includes('inkeep.config.ts')) return true;
        if (path.includes('index.ts')) return false;
        return false;
      });

      // Mock user input
      prompts.mockResolvedValue({ projectId: 'user-project-id' });

      // Mock API client
      const mockApiClient = {
        getFullProject: vi.fn().mockResolvedValue({
          name: 'Test Project',
          agents: {},
          tools: {},
          dataComponents: {},
          artifactComponents: {},
          credentialReferences: {},
        }),
      };
      (ManagementApiClient.create as Mock).mockResolvedValue(mockApiClient);

      await pullProjectCommand({});

      // Verify that a subdirectory with project ID is created
      const mkdirCalls = (mkdirSync as Mock).mock.calls.map((call) => call[0]);
      const hasSubdirectory = mkdirCalls.some((path: string) => path.includes('user-project-id'));
      expect(hasSubdirectory).toBe(true);
    });

    it('should use process.cwd() as baseDir when in directory-aware mode (regression test for PRD-5109)', async () => {
      const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader.js');
      const { ManagementApiClient } = await import('../../api.js');
      const { mkdirSync } = await import('node:fs');
      const { findProjectDirectory } = await import('../../utils/project-directory.js');

      // Simulate being in subdirectory: /test/parent/subdirectory
      const currentDir = '/test/parent/subdirectory';
      const parentDir = '/test/parent';

      // Mock process.cwd to return subdirectory
      const originalCwd = process.cwd;
      process.cwd = vi.fn().mockReturnValue(currentDir);

      // Mock findProjectDirectory to return parent (where config was found)
      (findProjectDirectory as Mock).mockResolvedValue(parentDir);

      // Mock config and index.ts exist
      (existsSync as Mock).mockImplementation((path: string) => {
        if (path.includes('inkeep.config.ts')) return true;
        if (path.includes('index.ts') && path.includes(currentDir)) return true;
        return false;
      });

      // Mock project
      const mockProject = {
        __type: 'project',
        getId: vi.fn().mockReturnValue('test-project-id'),
      };

      (importWithTypeScriptSupport as Mock).mockResolvedValue({
        default: mockProject,
      });

      // Mock API client
      const mockApiClient = {
        getFullProject: vi.fn().mockResolvedValue({
          name: 'Test Project',
          agents: { 'agent-1': { id: 'agent-1', name: 'Agent 1' } },
          tools: {},
          dataComponents: {},
          artifactComponents: {},
          credentialReferences: {},
        }),
      };
      (ManagementApiClient.create as Mock).mockResolvedValue(mockApiClient);

      await pullProjectCommand({});

      // Verify that directories are created in the CURRENT directory (subdirectory)
      // not in the parent directory where config was found
      const mkdirCalls = (mkdirSync as Mock).mock.calls.map((call) => call[0]);

      // Should have created agents directory in currentDir
      const agentsDir = mkdirCalls.find(
        (path: string) => path.includes('/agents') && path.startsWith(currentDir)
      );
      expect(agentsDir).toBeTruthy();
      expect(agentsDir).toContain(currentDir);

      // Should NOT have created agents directory in parentDir
      const wrongAgentsDir = mkdirCalls.find(
        (path: string) =>
          path.includes('/agents') && path.startsWith(parentDir) && !path.startsWith(currentDir)
      );
      expect(wrongAgentsDir).toBeUndefined();

      // Restore process.cwd
      process.cwd = originalCwd;
    });
  });
});
