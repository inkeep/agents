import fs from 'fs-extra';
import ora from 'ora';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AddOptions, addCommand, defaultAnthropicModelConfigurations, defaultGoogleModelConfigurations, defaultOpenaiModelConfigurations } from '../../commands/add';
import { cloneTemplate, getAvailableTemplates } from '../../utils/templates';

// Mock external dependencies
vi.mock('fs-extra');
vi.mock('ora');
vi.mock('../../utils/templates');

describe('Add Command', () => {
  let mockSpinner: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };

    // Clear API keys by default
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    // Setup mocks
    mockSpinner = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
    };
    vi.mocked(ora).mockImplementation((_message) => mockSpinner);

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('Template listing (no template specified)', () => {
    it('should list available templates when no template is provided', async () => {
      const mockTemplates = ['weather', 'chatbot', 'data-analysis'];
      vi.mocked(getAvailableTemplates).mockResolvedValue(mockTemplates);

      const options: AddOptions = { list: false };

      await expect(addCommand(options)).rejects.toThrow('process.exit called');

      expect(getAvailableTemplates).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Available templates:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('weather'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('chatbot'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('data-analysis'));
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should handle errors when fetching available templates', async () => {
      vi.mocked(getAvailableTemplates).mockRejectedValue(new Error('Network error'));

      const options: AddOptions = { list: false };

      await expect(addCommand(options)).rejects.toThrow('Network error');
      expect(getAvailableTemplates).toHaveBeenCalled();
    });
  });

  describe('Template validation', () => {
    it('should exit with error when template is not found', async () => {
      const mockTemplates = ['weather', 'chatbot'];
      vi.mocked(getAvailableTemplates).mockResolvedValue(mockTemplates);

      const options: AddOptions = {
        template: 'non-existent-template',
        list: false,
      };

      await expect(addCommand(options)).rejects.toThrow('process.exit called');

      expect(getAvailableTemplates).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Template "non-existent-template" not found');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should proceed when template exists', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const mockTemplates = ['weather', 'chatbot'];
      vi.mocked(getAvailableTemplates).mockResolvedValue(mockTemplates);
      vi.mocked(fs.pathExists).mockResolvedValue(false as any);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(cloneTemplate).mockResolvedValue(undefined);

      const options: AddOptions = {
        template: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(getAvailableTemplates).toHaveBeenCalled();
      expect(cloneTemplate).toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('Target path handling', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const mockTemplates = ['weather'];
      vi.mocked(getAvailableTemplates).mockResolvedValue(mockTemplates);
      vi.mocked(cloneTemplate).mockResolvedValue(undefined);
    });

    it('should create template in current directory when no target path specified', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false as any);

      const options: AddOptions = {
        template: 'weather',
        list: false,
      };

      await addCommand(options);

      const expectedPath = `${process.cwd()}/weather`;
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents-cookbook/template-projects/weather',
        expectedPath,
        [
          {
            filePath: 'index.ts',
            replacements: {
              models: defaultAnthropicModelConfigurations,
            },
          },
        ]
      );
      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        `Template "weather" added to ${expectedPath}`
      );
    });

    it('should create template in specified target path', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false as any);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);

      const options: AddOptions = {
        template: 'weather',
        targetPath: './projects',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents-cookbook/template-projects/weather',
        './projects/weather',
        [
          {
            filePath: 'index.ts',
            replacements: {
              models: defaultAnthropicModelConfigurations,
            },
          },
        ]
      );
      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        'Template "weather" added to ./projects/weather'
      );
    });

    it('should prevent overwriting existing template directory', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true as any);

      const options: AddOptions = {
        template: 'weather',
        targetPath: './projects',
        list: false,
      };

      await expect(addCommand(options)).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Directory "./projects/weather" already exists'
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(cloneTemplate).not.toHaveBeenCalled();
    });

    it('should create base directory if it does not exist', async () => {
      vi.mocked(fs.pathExists)
        .mockResolvedValueOnce(false as any) // Template directory doesn't exist
        .mockResolvedValueOnce(false as any); // Base directory doesn't exist
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);

      const options: AddOptions = {
        template: 'weather',
        targetPath: './new-projects',
        list: false,
      };

      await addCommand(options);

      expect(fs.mkdir).toHaveBeenCalledWith('./new-projects', { recursive: true });
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents-cookbook/template-projects/weather',
        './new-projects/weather',
        [
          {
            filePath: 'index.ts',
            replacements: {
              models: defaultAnthropicModelConfigurations,
            },
          },
        ]
      );
    });

    it('should handle errors when creating base directory', async () => {
      vi.mocked(fs.pathExists)
        .mockResolvedValueOnce(false as any) // Template directory doesn't exist
        .mockResolvedValueOnce(false as any); // Base directory doesn't exist
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Permission denied'));

      const options: AddOptions = {
        template: 'weather',
        targetPath: './restricted',
        list: false,
      };

      await expect(addCommand(options)).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '❌ Failed to create target directory "./restricted": Permission denied'
        )
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Template cloning', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const mockTemplates = ['weather'];
      vi.mocked(getAvailableTemplates).mockResolvedValue(mockTemplates);
      vi.mocked(fs.pathExists).mockResolvedValue(false as any);
    });

    it('should clone template successfully', async () => {
      vi.mocked(cloneTemplate).mockResolvedValue(undefined);

      const options: AddOptions = {
        template: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(ora).toHaveBeenCalledWith('Adding template...');
      expect(mockSpinner.start).toHaveBeenCalled();
      const expectedPath = `${process.cwd()}/weather`;
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents-cookbook/template-projects/weather',
        expectedPath,
        [
          {
            filePath: 'index.ts',
            replacements: {
              models: defaultAnthropicModelConfigurations,
            },
          },
        ]
      );
      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        `Template "weather" added to ${expectedPath}`
      );
    });

    it('should handle cloning errors', async () => {
      vi.mocked(cloneTemplate).mockRejectedValue(new Error('Git clone failed'));

      const options: AddOptions = {
        template: 'weather',
        list: false,
      };

      await expect(addCommand(options)).rejects.toThrow('Git clone failed');

      expect(ora).toHaveBeenCalledWith('Adding template...');
      expect(mockSpinner.start).toHaveBeenCalled();
      expect(cloneTemplate).toHaveBeenCalled();
    });

    it('should construct correct GitHub URL for template', async () => {
      const mockTemplates = ['chatbot'];
      vi.mocked(getAvailableTemplates).mockResolvedValue(mockTemplates);
      vi.mocked(fs.pathExists)
        .mockResolvedValueOnce(false as any) // Template directory doesn't exist
        .mockResolvedValueOnce(false as any); // Base directory doesn't exist
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(cloneTemplate).mockResolvedValue(undefined);

      const options: AddOptions = {
        template: 'chatbot',
        targetPath: './my-agents',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents-cookbook/template-projects/chatbot',
        './my-agents/chatbot',
        [
          {
            filePath: 'index.ts',
            replacements: {
              models: defaultAnthropicModelConfigurations,
            },
          },
        ]
      );
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle fs.pathExists errors gracefully', async () => {
      const mockTemplates = ['weather'];
      vi.mocked(getAvailableTemplates).mockResolvedValue(mockTemplates);
      vi.mocked(fs.pathExists).mockRejectedValue(new Error('Filesystem error'));

      const options: AddOptions = {
        template: 'weather',
        list: false,
      };

      await expect(addCommand(options)).rejects.toThrow('Filesystem error');
    });

    it('should handle mixed success and failure scenarios', async () => {
      const mockTemplates = ['weather'];
      vi.mocked(getAvailableTemplates).mockResolvedValue(mockTemplates);
      vi.mocked(fs.pathExists)
        .mockResolvedValueOnce(false as any) // Template directory check passes
        .mockResolvedValueOnce(true as any); // Base directory exists
      vi.mocked(cloneTemplate).mockRejectedValue(new Error('Network timeout'));

      const options: AddOptions = {
        template: 'weather',
        targetPath: './existing-dir',
        list: false,
      };

      await expect(addCommand(options)).rejects.toThrow('Network timeout');

      // Should have started the process but failed during cloning
      expect(ora).toHaveBeenCalledWith('Adding template...');
      expect(mockSpinner.start).toHaveBeenCalled();
      expect(mockSpinner.succeed).not.toHaveBeenCalled();
    });
  });

  describe('Template path construction', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const mockTemplates = ['my-complex-template'];
      vi.mocked(getAvailableTemplates).mockResolvedValue(mockTemplates);
      vi.mocked(fs.pathExists).mockResolvedValue(false as any);
      vi.mocked(cloneTemplate).mockResolvedValue(undefined);
    });

    it('should handle template names with hyphens', async () => {
      const options: AddOptions = {
        template: 'my-complex-template',
        list: false,
      };

      await addCommand(options);

      const expectedPath = `${process.cwd()}/my-complex-template`;
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents-cookbook/template-projects/my-complex-template',
        expectedPath,
        [
          {
            filePath: 'index.ts',
            replacements: {
              models: defaultAnthropicModelConfigurations,
            },
          },
        ]
      );
    });

    it('should handle deep target paths', async () => {
      vi.mocked(fs.pathExists)
        .mockResolvedValueOnce(false as any) // Template directory doesn't exist
        .mockResolvedValueOnce(false as any); // Base directory doesn't exist
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);

      const options: AddOptions = {
        template: 'my-complex-template',
        targetPath: './deep/nested/path',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents-cookbook/template-projects/my-complex-template',
        './deep/nested/path/my-complex-template',
        [
          {
            filePath: 'index.ts',
            replacements: {
              models: defaultAnthropicModelConfigurations,
            },
          },
        ]
      );
    });
  });

  describe('Model configuration based on API keys', () => {
    beforeEach(() => {
      const mockTemplates = ['weather'];
      vi.mocked(getAvailableTemplates).mockResolvedValue(mockTemplates);
      vi.mocked(fs.pathExists).mockResolvedValue(false as any);
      vi.mocked(cloneTemplate).mockResolvedValue(undefined);
    });

    it('should use Anthropic models when ANTHROPIC_API_KEY is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      const options: AddOptions = {
        template: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        [
          {
            filePath: 'index.ts',
            replacements: {
              models: defaultAnthropicModelConfigurations,
            },
          },
        ]
      );
    });

    it('should use OpenAI models when OPENAI_API_KEY is set', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';

      const options: AddOptions = {
        template: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        [
          {
            filePath: 'index.ts',
            replacements: {
              models: defaultOpenaiModelConfigurations,
            },
          },
        ]
      );
    });

    it('should use Google models when GOOGLE_API_KEY is set', async () => {
      process.env.GOOGLE_API_KEY = 'test-google-key';

      const options: AddOptions = {
        template: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        [
          {
            filePath: 'index.ts',
            replacements: {
              models: defaultGoogleModelConfigurations,
            },
          },
        ]
      );
    });

    it('should prioritize Anthropic over OpenAI when both keys are set', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
      process.env.OPENAI_API_KEY = 'test-openai-key';

      const options: AddOptions = {
        template: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        [
          {
            filePath: 'index.ts',
            replacements: {
              models: defaultAnthropicModelConfigurations,
            },
          },
        ]
      );
    });

    it('should prioritize OpenAI over Google when both keys are set', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.GOOGLE_API_KEY = 'test-google-key';

      const options: AddOptions = {
        template: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        [
          {
            filePath: 'index.ts',
            replacements: {
              models: defaultOpenaiModelConfigurations,
            },
          },
        ]
      );
    });

    it('should log error when no API keys are set', async () => {
      const options: AddOptions = {
        template: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ No AI provider key found in environment variables. Please set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY'
      );
      expect(cloneTemplate).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        [
          {
            filePath: 'index.ts',
            replacements: {
              models: {},
            },
          },
        ]
      );
    });
  });
});
