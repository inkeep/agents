import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as p from '@clack/prompts';

// Create a mock exec function before importing
const mockExecAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });

// Mock all external dependencies
vi.mock('fs-extra');
vi.mock('child_process');
vi.mock('@clack/prompts');
vi.mock('util', () => ({
  promisify: vi.fn(() => mockExecAsync),
}));

// Import after mocking
const { createAgents } = await import('../../commands/create');

const mockFs = fs as any;
const mockPrompts = p as any;

describe('create command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset the shared mock function
    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });
    
    // Mock fs operations
    mockFs.pathExists = vi.fn().mockResolvedValue(false);
    mockFs.ensureDir = vi.fn().mockResolvedValue(undefined);
    mockFs.emptyDir = vi.fn().mockResolvedValue(undefined);
    mockFs.writeJson = vi.fn().mockResolvedValue(undefined);
    mockFs.writeFile = vi.fn().mockResolvedValue(undefined);
    
    // Mock process.chdir (avoid the unsupported workers issue)
    vi.spyOn(process, 'chdir').mockImplementation(() => {});
    
    // Mock prompt functions
    mockPrompts.intro = vi.fn();
    mockPrompts.spinner = vi.fn().mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    });
    mockPrompts.note = vi.fn();
    mockPrompts.cancel = vi.fn();
    mockPrompts.isCancel = vi.fn().mockReturnValue(false);
    mockPrompts.text = vi.fn();
    mockPrompts.confirm = vi.fn();
    mockPrompts.select = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createAgents', () => {
    it('should create a project with all provided arguments', async () => {
      const args = {
        dirName: 'test-project',
        tenantId: 'test-tenant',
        projectId: 'test-project-id',
        openAiKey: 'sk-test-openai',
        anthropicKey: 'sk-ant-test',
        manageApiPort: '4000',
        runApiPort: '4001',
      };

      await createAgents(args);

      // Verify directory creation
      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.resolve(process.cwd(), 'test-project'));
      expect(mockFs.ensureDir).toHaveBeenCalledWith('src/test-project-id');
      expect(mockFs.ensureDir).toHaveBeenCalledWith('apps/manage-api/src');
      expect(mockFs.ensureDir).toHaveBeenCalledWith('apps/run-api/src');
      expect(mockFs.ensureDir).toHaveBeenCalledWith('apps/shared');

      // Verify package.json creation
      expect(mockFs.writeJson).toHaveBeenCalledWith(
        'package.json',
        expect.objectContaining({
          name: 'test-project',
          version: '0.1.0',
          packageManager: 'npm@10.0.0',
          workspaces: ['apps/*'],
        }),
        { spaces: 2 }
      );

      // Verify environment files are created with correct ports
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('MANAGE_API_PORT=4000')
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('RUN_API_PORT=4001')
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('NEXT_PUBLIC_INKEEP_AGENTS_MANAGE_API_URL=http://localhost:4000')
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('NEXT_PUBLIC_INKEEP_AGENTS_RUN_API_URL=http://localhost:4001')
      );

      // Verify API keys are set
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('ANTHROPIC_API_KEY=sk-ant-test')
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('OPENAI_API_KEY=sk-test-openai')
      );
    });

    it('should prompt for missing required fields', async () => {
      mockPrompts.text
        .mockResolvedValueOnce('prompted-project') // dirName
        .mockResolvedValueOnce('prompted-tenant') // tenantId
        .mockResolvedValueOnce('prompted-project-id'); // projectId
      
      mockPrompts.select.mockResolvedValueOnce('both'); // provider choice
      
      mockPrompts.text
        .mockResolvedValueOnce('sk-ant-prompted') // anthropicKey
        .mockResolvedValueOnce('sk-prompted'); // openAiKey

      await createAgents({});

      expect(mockPrompts.text).toHaveBeenCalledTimes(5);
      expect(mockPrompts.select).toHaveBeenCalledTimes(1);
      expect(mockPrompts.text).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'What do you want to name your agents directory?',
        })
      );
      expect(mockPrompts.text).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Enter your tenant ID :',
        })
      );
      expect(mockPrompts.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Which AI provider(s) would you like to use?',
        })
      );
    });

    it('should handle existing directory with overwrite confirmation', async () => {
      mockFs.pathExists.mockResolvedValueOnce(true);
      mockPrompts.confirm.mockResolvedValueOnce(true);
      mockPrompts.select.mockResolvedValueOnce('both');
      mockPrompts.text
        .mockResolvedValueOnce('sk-ant-test')
        .mockResolvedValueOnce('sk-test');

      await createAgents({
        dirName: 'existing-project',
        tenantId: 'test-tenant',
        projectId: 'test-project',
      });

      expect(mockPrompts.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Directory existing-project already exists'),
        })
      );
      expect(mockFs.emptyDir).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'existing-project')
      );
    });

    it('should cancel if user declines to overwrite existing directory', async () => {
      mockFs.pathExists.mockResolvedValueOnce(true);
      mockPrompts.confirm.mockResolvedValueOnce(false);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });
      mockPrompts.select.mockResolvedValueOnce('both');
      mockPrompts.text
        .mockResolvedValueOnce('sk-ant-test')
        .mockResolvedValueOnce('sk-test');

      await expect(
        createAgents({
          dirName: 'existing-project',
          tenantId: 'test-tenant',
          projectId: 'test-project',
        })
      ).rejects.toThrow('Process exit');

      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should use default ports when not provided', async () => {
      mockPrompts.select.mockResolvedValueOnce('both');
      mockPrompts.text
        .mockResolvedValueOnce('sk-ant-test')
        .mockResolvedValueOnce('sk-test');
        
      await createAgents({
        dirName: 'test-project',
        tenantId: 'test-tenant',
        projectId: 'test-project',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('MANAGE_API_PORT=3002')
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('RUN_API_PORT=3003')
      );
    });

    it('should create proper workspace structure', async () => {
      mockPrompts.select.mockResolvedValueOnce('both');
      mockPrompts.text
        .mockResolvedValueOnce('sk-ant-test')
        .mockResolvedValueOnce('sk-test');
        
      await createAgents({
        dirName: 'test-project',
        tenantId: 'test-tenant',
        projectId: 'test-project',
      });

      // Check workspace packages
      expect(mockFs.writeJson).toHaveBeenCalledWith(
        'apps/manage-api/package.json',
        expect.objectContaining({
          name: '@test-project/manage-api',
          dependencies: expect.objectContaining({
            '@inkeep/agents-manage-api': '^0.1.1',
            '@inkeep/agents-core': '^0.1.0',
            '@hono/node-server': '^1.14.3',
          }),
        }),
        { spaces: 2 }
      );

      expect(mockFs.writeJson).toHaveBeenCalledWith(
        'apps/run-api/package.json',
        expect.objectContaining({
          name: '@test-project/run-api',
          dependencies: expect.objectContaining({
            '@inkeep/agents-run-api': '^0.1.1',
            '@inkeep/agents-core': '^0.1.0',
            '@hono/node-server': '^1.14.3',
          }),
        }),
        { spaces: 2 }
      );
    });

    it('should create configuration files', async () => {
      mockPrompts.select.mockResolvedValueOnce('both');
      mockPrompts.text
        .mockResolvedValueOnce('sk-ant-test')
        .mockResolvedValueOnce('sk-test');
        
      await createAgents({
        dirName: 'test-project',
        tenantId: 'test-tenant',
        projectId: 'test-project-id',
      });

      // Check turbo.json
      expect(mockFs.writeJson).toHaveBeenCalledWith(
        'turbo.json',
        expect.objectContaining({
          $schema: 'https://turbo.build/schema.json',
          ui: 'tui',
        }),
        { spaces: 2 }
      );

      // Check biome.json
      expect(mockFs.writeJson).toHaveBeenCalledWith(
        'biome.json',
        expect.objectContaining({
          linter: expect.objectContaining({
            enabled: true,
          }),
        }),
        { spaces: 2 }
      );

      // Check drizzle config
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'drizzle.config.ts',
        expect.stringContaining("schema: 'node_modules/@inkeep/agents-core/dist/db/schema.js'")
      );
    });

    it('should create service files with correct configuration', async () => {
      const args = {
        dirName: 'test-project',
        tenantId: 'test-tenant',
        projectId: 'test-project-id',
        manageApiPort: '5000',
        runApiPort: '5001',
      };

      await createAgents(args);

      // Check management API
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'apps/manage-api/src/index.ts',
        expect.stringContaining('createManagementApp')
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'apps/manage-api/src/index.ts',
        expect.stringContaining('process.env.MANAGE_API_PORT')
      );

      // Check run API
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'apps/run-api/src/index.ts',
        expect.stringContaining('createExecutionApp')
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'apps/run-api/src/index.ts',
        expect.stringContaining('process.env.RUN_API_PORT')
      );

      // Check agent graph
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'src/test-project-id/hello.graph.ts',
        expect.stringContaining("import { agent, agentGraph } from '@inkeep/agents-sdk'")
      );

      // Check inkeep config
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'src/test-project-id/inkeep.config.ts',
        expect.stringContaining('tenantId: "test-tenant"')
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'src/test-project-id/inkeep.config.ts',
        expect.stringContaining('projectId: "test-project-id"')
      );
    });

    it('should create README with correct port references', async () => {
      await createAgents({
        dirName: 'test-project',
        tenantId: 'test-tenant',
        projectId: 'test-project-id',
        manageApiPort: '6000',
        runApiPort: '6001',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'README.md',
        expect.stringContaining('http://localhost:6000')
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        'README.md',
        expect.stringContaining('http://localhost:6001')
      );
    });

    it('should run npm install and database setup', async () => {
      mockPrompts.select.mockResolvedValueOnce('both');
      mockPrompts.text
        .mockResolvedValueOnce('sk-ant-test')
        .mockResolvedValueOnce('sk-test');
        
      await createAgents({
        dirName: 'test-project',
        tenantId: 'test-tenant',
        projectId: 'test-project',
      });

      expect(mockExecAsync).toHaveBeenCalledWith('npm install');
      expect(mockExecAsync).toHaveBeenCalledWith('npx drizzle-kit push');
    });

    it('should handle installation errors gracefully', async () => {
      mockPrompts.select.mockResolvedValueOnce('both');
      mockPrompts.text
        .mockResolvedValueOnce('sk-ant-test')
        .mockResolvedValueOnce('sk-test');
      
      // Mock exec to fail on the 'npm install' call
      mockExecAsync.mockRejectedValueOnce(new Error('npm install failed'));
      
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      await expect(
        createAgents({
          dirName: 'test-project',
          tenantId: 'test-tenant',
          projectId: 'test-project',
        })
      ).rejects.toThrow('Process exit');

      expect(mockPrompts.cancel).toHaveBeenCalledWith(
        expect.stringContaining('npm install failed')
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should cancel on user prompt cancellation', async () => {
      mockPrompts.text.mockResolvedValueOnce('test-project');
      mockPrompts.isCancel.mockReturnValueOnce(true);
      
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit');
      });

      await expect(createAgents({})).rejects.toThrow('Process exit');

      expect(mockPrompts.cancel).toHaveBeenCalledWith('Operation cancelled');
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should prompt for only Anthropic key when anthropic provider is selected', async () => {
      mockPrompts.text
        .mockResolvedValueOnce('test-project') // dirName
        .mockResolvedValueOnce('test-tenant') // tenantId
        .mockResolvedValueOnce('test-project-id'); // projectId
      
      mockPrompts.select.mockResolvedValueOnce('anthropic'); // provider choice
      
      mockPrompts.text
        .mockResolvedValueOnce('sk-ant-test'); // anthropicKey only

      await createAgents({});

      expect(mockPrompts.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Which AI provider(s) would you like to use?',
        })
      );
      expect(mockPrompts.text).toHaveBeenCalledTimes(4); // No OpenAI key prompt
    });

    it('should prompt for only OpenAI key when openai provider is selected', async () => {
      mockPrompts.text
        .mockResolvedValueOnce('test-project') // dirName
        .mockResolvedValueOnce('test-tenant') // tenantId
        .mockResolvedValueOnce('test-project-id'); // projectId
      
      mockPrompts.select.mockResolvedValueOnce('openai'); // provider choice
      
      mockPrompts.text
        .mockResolvedValueOnce('sk-test'); // openAiKey only

      await createAgents({});

      expect(mockPrompts.select).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Which AI provider(s) would you like to use?',
        })
      );
      expect(mockPrompts.text).toHaveBeenCalledTimes(4); // No Anthropic key prompt
    });

    it('should prompt for missing keys when some are provided via CLI', async () => {
      mockPrompts.text
        .mockResolvedValueOnce('sk-test'); // openAiKey (missing)

      await createAgents({
        dirName: 'test-project',
        tenantId: 'test-tenant',
        projectId: 'test-project-id',
        anthropicKey: 'sk-ant-provided', // provided via CLI
      });

      expect(mockPrompts.text).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Enter your OpenAI API key (optional):',
        })
      );
      expect(mockPrompts.select).not.toHaveBeenCalled(); // No provider selection when keys are partially provided
    });

    it('should not prompt for provider selection when both keys are provided', async () => {
      await createAgents({
        dirName: 'test-project',
        tenantId: 'test-tenant',
        projectId: 'test-project-id',
        anthropicKey: 'sk-ant-provided',
        openAiKey: 'sk-provided',
      });

      expect(mockPrompts.select).not.toHaveBeenCalled();
      expect(mockPrompts.text).not.toHaveBeenCalled();
    });
  });
});