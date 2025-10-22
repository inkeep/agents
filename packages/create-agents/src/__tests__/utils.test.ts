import * as p from '@clack/prompts';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneTemplate, getAvailableTemplates } from '../templates';
import { createAgents } from '../utils';

// Mock all dependencies
vi.mock('fs-extra');
vi.mock('../templates');
vi.mock('@clack/prompts');
vi.mock('child_process');
vi.mock('util');

// Setup default mocks
const mockSpinner = {
  start: vi.fn().mockReturnThis(),
  stop: vi.fn().mockReturnThis(),
  message: vi.fn().mockReturnThis(),
};

describe('createAgents - Template and Project ID Logic', () => {
  let processExitSpy: any;
  let processChdirSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock process methods
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      // Only throw for exit(0) which is expected behavior in some tests
      // Let exit(1) pass so we can see the actual error
      if (code === 0) {
        throw new Error('process.exit called');
      }
      // Don't actually exit for exit(1) in tests
      return undefined as never;
    });
    processChdirSpy = vi.spyOn(process, 'chdir').mockImplementation(() => {});

    // Setup default mocks for @clack/prompts
    vi.mocked(p.intro).mockImplementation(() => {});
    vi.mocked(p.outro).mockImplementation(() => {});
    vi.mocked(p.cancel).mockImplementation(() => {});
    vi.mocked(p.note).mockImplementation(() => {});
    vi.mocked(p.text).mockResolvedValue('test-dir');
    vi.mocked(p.password).mockResolvedValue('test-api-key');
    vi.mocked(p.select).mockResolvedValue('dual');
    vi.mocked(p.confirm).mockResolvedValue(false as any);
    vi.mocked(p.spinner).mockReturnValue(mockSpinner);
    vi.mocked(p.isCancel).mockReturnValue(false);

    // Mock fs-extra
    vi.mocked(fs.pathExists).mockResolvedValue(false as any);
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.remove).mockResolvedValue(undefined);

    // Mock templates
    vi.mocked(getAvailableTemplates).mockResolvedValue([
      'event-planner',
      'chatbot',
      'data-analysis',
    ]);
    vi.mocked(cloneTemplate).mockResolvedValue(undefined);

    // Mock util.promisify to return a mock exec function
    const mockExecAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const util = require('node:util');
    util.promisify = vi.fn(() => mockExecAsync);

    // Mock child_process.spawn
    const childProcess = require('node:child_process');
    childProcess.spawn = vi.fn(() => ({
      pid: 12345,
      stdio: ['pipe', 'pipe', 'pipe'],
      on: vi.fn(),
      kill: vi.fn(),
    }));
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    processChdirSpy.mockRestore();
  });

  describe('Default behavior (no template or customProjectId)', () => {
    it('should use activity-planner as default template and project ID', async () => {
      await createAgents({
        dirName: 'test-dir',
        openAiKey: 'test-openai-key',
        anthropicKey: 'test-anthropic-key',
      });

      // Should clone base template and weather-project template
      expect(cloneTemplate).toHaveBeenCalledTimes(2);
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/create-agents-template',
        expect.any(String)
      );
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents-cookbook/template-projects/activity-planner',
        'src/projects/activity-planner',
        expect.arrayContaining([
          expect.objectContaining({
            filePath: 'index.ts',
            replacements: expect.objectContaining({
              models: expect.any(Object),
            }),
          }),
        ])
      );

      // Should not call getAvailableTemplates since no template validation needed
      expect(getAvailableTemplates).not.toHaveBeenCalled();
    });

    it('should create project with event-planner as project ID', async () => {
      await createAgents({
        dirName: 'test-dir',
        openAiKey: 'test-openai-key',
        anthropicKey: 'test-anthropic-key',
      });

      // Check that .env file is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('ENVIRONMENT=development')
      );

      // Check that inkeep.config.ts is created in src directory
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/inkeep.config.ts',
        expect.stringContaining('tenantId: "default"')
      );
    });
  });

  describe('Template provided', () => {
    it('should use template name as project ID when template is provided', async () => {
      await createAgents({
        dirName: 'test-dir',
        template: 'chatbot',
        openAiKey: 'test-openai-key',
        anthropicKey: 'test-anthropic-key',
      });

      // Should validate template exists
      expect(getAvailableTemplates).toHaveBeenCalled();

      // Should clone base template and the specified template
      expect(cloneTemplate).toHaveBeenCalledTimes(2);
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/create-agents-template',
        expect.any(String)
      );
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents-cookbook/template-projects/chatbot',
        'src/projects/chatbot',
        expect.arrayContaining([
          expect.objectContaining({
            filePath: 'index.ts',
            replacements: expect.objectContaining({
              models: expect.any(Object),
            }),
          }),
        ])
      );

      // Check that .env file is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('ENVIRONMENT=development')
      );

      // Check that inkeep.config.ts is created in src directory (not in project subdirectory)
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/inkeep.config.ts',
        expect.stringContaining('tenantId: "default"')
      );
    });

    it('should exit with error when template does not exist', async () => {
      vi.mocked(getAvailableTemplates).mockResolvedValue(['event-planner', 'chatbot']);

      await expect(
        createAgents({
          dirName: 'test-dir',
          template: 'non-existent-template',
          openAiKey: 'test-openai-key',
        })
      ).rejects.toThrow('process.exit called');

      expect(p.cancel).toHaveBeenCalledWith(
        expect.stringContaining('Template "non-existent-template" not found')
      );
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should show available templates when invalid template is provided', async () => {
      vi.mocked(getAvailableTemplates).mockResolvedValue([
        'event-planner',
        'chatbot',
        'data-analysis',
      ]);

      await expect(
        createAgents({
          dirName: 'test-dir',
          template: 'invalid',
          openAiKey: 'test-openai-key',
        })
      ).rejects.toThrow('process.exit called');

      const cancelCall = vi.mocked(p.cancel).mock.calls[0][0];
      expect(cancelCall).toContain('event-planner');
      expect(cancelCall).toContain('chatbot');
      expect(cancelCall).toContain('data-analysis');
    });
  });

  describe('Custom Project ID provided', () => {
    it('should use custom project ID and not clone any template', async () => {
      await createAgents({
        dirName: 'test-dir',
        customProjectId: 'my-custom-project',
        openAiKey: 'test-openai-key',
        anthropicKey: 'test-anthropic-key',
      });

      // Should clone base template but NOT project template
      expect(cloneTemplate).toHaveBeenCalledTimes(1);
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/create-agents-template',
        expect.any(String)
      );

      // Should NOT validate templates
      expect(getAvailableTemplates).not.toHaveBeenCalled();

      // Should create empty project directory
      expect(fs.ensureDir).toHaveBeenCalledWith('src/projects/my-custom-project');

      // Check that .env file is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('ENVIRONMENT=development')
      );

      // Check that inkeep.config.ts is created in src directory
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/inkeep.config.ts',
        expect.stringContaining('tenantId: "default"')
      );

      // Check that custom project index.ts is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/projects/my-custom-project/index.ts',
        expect.stringContaining('id: "my-custom-project"')
      );
    });

    it('should prioritize custom project ID over template if both are provided', async () => {
      await createAgents({
        dirName: 'test-dir',
        template: 'chatbot',
        customProjectId: 'my-custom-project',
        openAiKey: 'test-openai-key',
        anthropicKey: 'test-anthropic-key',
      });

      // Should only clone base template, not project template
      expect(cloneTemplate).toHaveBeenCalledTimes(1);
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/create-agents-template',
        expect.any(String)
      );
      expect(getAvailableTemplates).not.toHaveBeenCalled();
      expect(fs.ensureDir).toHaveBeenCalledWith('src/projects/my-custom-project');

      // Check that .env file is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('ENVIRONMENT=development')
      );

      // Check that inkeep.config.ts is created in src directory
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/inkeep.config.ts',
        expect.stringContaining('tenantId: "default"')
      );

      // Check that custom project index.ts is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/projects/my-custom-project/index.ts',
        expect.stringContaining('id: "my-custom-project"')
      );
    });
  });

  describe('Edge cases and validation', () => {
    it('should handle template names with hyphens correctly', async () => {
      vi.mocked(getAvailableTemplates).mockResolvedValue([
        'my-complex-template',
        'another-template',
      ]);

      await createAgents({
        dirName: 'test-dir',
        template: 'my-complex-template',
        openAiKey: 'test-key',
        anthropicKey: 'test-key',
      });

      expect(cloneTemplate).toHaveBeenCalledTimes(2);
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents-cookbook/template-projects/my-complex-template',
        'src/projects/my-complex-template',
        expect.arrayContaining([
          expect.objectContaining({
            filePath: 'index.ts',
            replacements: expect.objectContaining({
              models: expect.any(Object),
            }),
          }),
        ])
      );
    });

    it('should handle custom project IDs with special characters', async () => {
      await createAgents({
        dirName: 'test-dir',
        customProjectId: 'my_project-123',
        openAiKey: 'test-key',
        anthropicKey: 'test-key',
      });

      expect(fs.ensureDir).toHaveBeenCalledWith('src/projects/my_project-123');

      // Check that .env file is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        '.env',
        expect.stringContaining('ENVIRONMENT=development')
      );

      // Check that inkeep.config.ts is created in src directory
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/inkeep.config.ts',
        expect.stringContaining('tenantId: "default"')
      );

      // Check that custom project index.ts is created
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/projects/my_project-123/index.ts',
        expect.stringContaining('id: "my_project-123"')
      );
    });

    it('should create correct folder structure for all scenarios', async () => {
      // Test default
      await createAgents({
        dirName: 'dir1',
        openAiKey: 'key',
        anthropicKey: 'key',
      });
      expect(fs.ensureDir).toHaveBeenCalledWith('src');

      // Reset mocks
      vi.clearAllMocks();
      setupDefaultMocks();

      // Test with template
      await createAgents({
        dirName: 'dir2',
        template: 'chatbot',
        openAiKey: 'key',
        anthropicKey: 'key',
      });
      expect(fs.ensureDir).toHaveBeenCalledWith('src');

      // Reset mocks
      vi.clearAllMocks();
      setupDefaultMocks();

      // Test with custom ID
      await createAgents({
        dirName: 'dir3',
        customProjectId: 'custom',
        openAiKey: 'key',
        anthropicKey: 'key',
      });
      expect(fs.ensureDir).toHaveBeenCalledWith('src');
      expect(fs.ensureDir).toHaveBeenCalledWith('src/projects/custom');
    });
  });

  describe('Security - Password input for API keys', () => {
    it('should use password input instead of text input for API keys', async () => {
      // Mock the select to return 'anthropic' to trigger the API key prompt
      vi.mocked(p.select).mockResolvedValueOnce('anthropic');
      vi.mocked(p.password).mockResolvedValueOnce('test-anthropic-key');

      await createAgents({
        dirName: 'test-dir',
      });

      // Verify that p.password was called for the API key
      expect(p.password).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Enter your Anthropic API key:',
          validate: expect.any(Function),
        })
      );

      // Verify that p.text was NOT called for API keys (only for directory name)
      const textCalls = vi.mocked(p.text).mock.calls;
      const apiKeyCalls = textCalls.filter(
        (call) =>
          call[0] &&
          typeof call[0] === 'object' &&
          'message' in call[0] &&
          (call[0].message.includes('API key') ||
            call[0].message.includes('Anthropic') ||
            call[0].message.includes('OpenAI') ||
            call[0].message.includes('Google'))
      );
      expect(apiKeyCalls).toHaveLength(0);
    });

    it('should use password input for OpenAI keys', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('openai');
      vi.mocked(p.password).mockResolvedValueOnce('test-openai-key');

      await createAgents({
        dirName: 'test-dir',
      });

      expect(p.password).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Enter your OpenAI API key:',
          validate: expect.any(Function),
        })
      );
    });

    it('should use password input for Google keys', async () => {
      vi.mocked(p.select).mockResolvedValueOnce('google');
      vi.mocked(p.password).mockResolvedValueOnce('test-google-key');

      await createAgents({
        dirName: 'test-dir',
      });

      expect(p.password).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Enter your Google API key:',
          validate: expect.any(Function),
        })
      );
    });
  });
});

// Helper to setup default mocks
function setupDefaultMocks() {
  vi.mocked(p.spinner).mockReturnValue(mockSpinner);
  vi.mocked(p.password).mockResolvedValue('test-api-key');
  vi.mocked(fs.pathExists).mockResolvedValue(false as any);
  vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
  vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  vi.mocked(getAvailableTemplates).mockResolvedValue(['event-planner', 'chatbot', 'data-analysis']);
  vi.mocked(cloneTemplate).mockResolvedValue(undefined);
}
