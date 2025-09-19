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
      'weather-project',
      'chatbot',
      'data-analysis',
    ]);
    vi.mocked(cloneTemplate).mockResolvedValue(undefined);

    // Mock util.promisify to return a mock exec function
    const mockExecAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const util = require('util');
    util.promisify = vi.fn(() => mockExecAsync);

    // Mock child_process.spawn
    const childProcess = require('child_process');
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
    it('should use weather-project as default template and project ID', async () => {
      await createAgents({
        dirName: 'test-dir',
        openAiKey: 'test-openai-key',
        anthropicKey: 'test-anthropic-key',
      });

      // Should clone base template and weather-graph template
      expect(cloneTemplate).toHaveBeenCalledTimes(2);
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/create-agents-template',
        expect.any(String)
      );
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents-cookbook/template-projects/weather-project',
        'src/weather-project'
      );

      // Should not call getAvailableTemplates since no template validation needed
      expect(getAvailableTemplates).not.toHaveBeenCalled();
    });

    it('should create project with weather-project as project ID', async () => {
      await createAgents({
        dirName: 'test-dir',
        openAiKey: 'test-openai-key',
        anthropicKey: 'test-anthropic-key',
      });

      // Check that inkeep.config.ts is created with correct project ID
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/weather-project/inkeep.config.ts',
        expect.stringContaining('projectId: "weather-project"')
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
        'src/chatbot'
      );

      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/chatbot/inkeep.config.ts',
        expect.stringContaining('projectId: "chatbot"')
      );
    });

    it('should exit with error when template does not exist', async () => {
      vi.mocked(getAvailableTemplates).mockResolvedValue(['weather-project', 'chatbot']);

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
        'weather-project',
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
      expect(cancelCall).toContain('weather-project');
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
      expect(fs.ensureDir).toHaveBeenCalledWith('src/my-custom-project');

      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/my-custom-project/inkeep.config.ts',
        expect.stringContaining('projectId: "my-custom-project"')
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
      expect(fs.ensureDir).toHaveBeenCalledWith('src/my-custom-project');

      // Config should use custom project ID
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/my-custom-project/inkeep.config.ts',
        expect.stringContaining('projectId: "my-custom-project"')
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
        'src/my-complex-template'
      );
    });

    it('should handle custom project IDs with special characters', async () => {
      await createAgents({
        dirName: 'test-dir',
        customProjectId: 'my_project-123',
        openAiKey: 'test-key',
        anthropicKey: 'test-key',
      });

      expect(fs.ensureDir).toHaveBeenCalledWith('src/my_project-123');
      expect(fs.writeFile).toHaveBeenCalledWith(
        'src/my_project-123/inkeep.config.ts',
        expect.stringContaining('projectId: "my_project-123"')
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
      expect(fs.ensureDir).toHaveBeenCalledWith('src/custom');
    });
  });
});

// Helper to setup default mocks
function setupDefaultMocks() {
  vi.mocked(p.spinner).mockReturnValue(mockSpinner);
  vi.mocked(fs.pathExists).mockResolvedValue(false as any);
  vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
  vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  vi.mocked(getAvailableTemplates).mockResolvedValue([
    'weather-project',
    'chatbot',
    'data-analysis',
  ]);
  vi.mocked(cloneTemplate).mockResolvedValue(undefined);
}
