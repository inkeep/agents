import * as p from '@clack/prompts';
import { findUp } from 'find-up';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AddOptions,
  addCommand,
  addMcpTemplate,
  defaultAnthropicModelConfigurations,
  defaultGoogleModelConfigurations,
  defaultOpenaiModelConfigurations,
  findAppDirectory,
} from '../../commands/add';
import { cloneTemplate, getAvailableTemplates } from '../../utils/templates';

// Mock external dependencies
vi.mock('fs-extra');
vi.mock('@clack/prompts');
vi.mock('../../utils/templates');
vi.mock('find-up', () => ({
  findUp: vi.fn(),
  findUpSync: vi.fn(),
}));

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
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    // Setup mocks
    mockSpinner = {
      start: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      message: vi.fn().mockReturnThis(),
    };
    vi.mocked(p.spinner).mockReturnValue(mockSpinner);
    vi.mocked(p.isCancel).mockReturnValue(false);
    vi.mocked(p.cancel).mockImplementation(() => {});

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
      const mockProjectTemplates = ['weather', 'chatbot', 'data-analysis'];
      const mockMcpTemplates = ['zendesk'];
      vi.mocked(getAvailableTemplates)
        .mockResolvedValueOnce(mockProjectTemplates)
        .mockResolvedValueOnce(mockMcpTemplates);

      const options: AddOptions = { list: false };

      await expect(addCommand(options)).rejects.toThrow('process.exit called');

      expect(getAvailableTemplates).toHaveBeenCalledWith('template-projects', undefined);
      expect(getAvailableTemplates).toHaveBeenCalledWith('template-mcps', undefined);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Available project templates:')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('weather'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('chatbot'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('data-analysis'));
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('should handle errors when fetching available templates', async () => {
      vi.mocked(getAvailableTemplates).mockRejectedValue(new Error('Network error'));

      const options: AddOptions = { list: false };

      await expect(addCommand(options)).rejects.toThrow('Network error');
      expect(getAvailableTemplates).toHaveBeenCalledWith('template-projects', undefined);
    });
  });

  describe('Template validation', () => {
    it('should exit with error when template is not found', async () => {
      const mockProjectTemplates = ['weather', 'chatbot'];
      const mockMcpTemplates = ['zendesk'];
      vi.mocked(getAvailableTemplates)
        .mockResolvedValueOnce(mockProjectTemplates)
        .mockResolvedValueOnce(mockMcpTemplates);

      const options: AddOptions = {
        project: 'non-existent-template',
        list: false,
      };

      await expect(addCommand(options)).rejects.toThrow('process.exit called');

      expect(getAvailableTemplates).toHaveBeenCalledWith('template-projects', undefined);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Project template "non-existent-template" not found'
      );
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
        project: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(getAvailableTemplates).toHaveBeenCalledWith('template-projects', undefined);
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
        project: 'weather',
        list: false,
      };

      await addCommand(options);

      const expectedPath = `${process.cwd()}/weather`;
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents/agents-cookbook/template-projects/weather',
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

    it('should create template in specified target path', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false as any);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);

      const options: AddOptions = {
        project: 'weather',
        targetPath: './projects',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents/agents-cookbook/template-projects/weather',
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
    });

    it('should prevent overwriting existing template directory', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true as any);

      const options: AddOptions = {
        project: 'weather',
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
        project: 'weather',
        targetPath: './new-projects',
        list: false,
      };

      await addCommand(options);

      expect(fs.mkdir).toHaveBeenCalledWith('./new-projects', { recursive: true });
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents/agents-cookbook/template-projects/weather',
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
        project: 'weather',
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
        project: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(p.spinner).toHaveBeenCalled();
      expect(mockSpinner.start).toHaveBeenCalled();
      const expectedPath = `${process.cwd()}/weather`;
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents/agents-cookbook/template-projects/weather',
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

    it('should handle cloning errors', async () => {
      vi.mocked(cloneTemplate).mockRejectedValue(new Error('Git clone failed'));

      const options: AddOptions = {
        project: 'weather',
        list: false,
      };

      await expect(addCommand(options)).rejects.toThrow('Git clone failed');

      expect(p.spinner).toHaveBeenCalled();
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
        project: 'chatbot',
        targetPath: './my-agents',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents/agents-cookbook/template-projects/chatbot',
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
        project: 'weather',
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
        project: 'weather',
        targetPath: './existing-dir',
        list: false,
      };

      await expect(addCommand(options)).rejects.toThrow('Network timeout');

      // Should have started the process but failed during cloning
      expect(p.spinner).toHaveBeenCalled();
      expect(mockSpinner.start).toHaveBeenCalled();
      expect(mockSpinner.stop).not.toHaveBeenCalled();
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
        project: 'my-complex-template',
        list: false,
      };

      await addCommand(options);

      const expectedPath = `${process.cwd()}/my-complex-template`;
      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents/agents-cookbook/template-projects/my-complex-template',
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
        project: 'my-complex-template',
        targetPath: './deep/nested/path',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(
        'https://github.com/inkeep/agents/agents-cookbook/template-projects/my-complex-template',
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
        project: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(expect.any(String), expect.any(String), [
        {
          filePath: 'index.ts',
          replacements: {
            models: defaultAnthropicModelConfigurations,
          },
        },
      ]);
    });

    it('should use OpenAI models when OPENAI_API_KEY is set', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';

      const options: AddOptions = {
        project: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(expect.any(String), expect.any(String), [
        {
          filePath: 'index.ts',
          replacements: {
            models: defaultOpenaiModelConfigurations,
          },
        },
      ]);
    });

    it('should use Google models when GOOGLE_GENERATIVE_AI_API_KEY is set', async () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-google-key';

      const options: AddOptions = {
        project: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(expect.any(String), expect.any(String), [
        {
          filePath: 'index.ts',
          replacements: {
            models: defaultGoogleModelConfigurations,
          },
        },
      ]);
    });

    it('should prioritize Anthropic over OpenAI when both keys are set', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
      process.env.OPENAI_API_KEY = 'test-openai-key';

      const options: AddOptions = {
        project: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(expect.any(String), expect.any(String), [
        {
          filePath: 'index.ts',
          replacements: {
            models: defaultAnthropicModelConfigurations,
          },
        },
      ]);
    });

    it('should prioritize OpenAI over Google when both keys are set', async () => {
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-google-key';

      const options: AddOptions = {
        project: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(cloneTemplate).toHaveBeenCalledWith(expect.any(String), expect.any(String), [
        {
          filePath: 'index.ts',
          replacements: {
            models: defaultOpenaiModelConfigurations,
          },
        },
      ]);
    });

    it('should log error when no API keys are set', async () => {
      const options: AddOptions = {
        project: 'weather',
        list: false,
      };

      await addCommand(options);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ No AI provider key found in environment variables. Please set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY'
      );
      expect(cloneTemplate).toHaveBeenCalledWith(expect.any(String), expect.any(String), [
        {
          filePath: 'index.ts',
          replacements: {
            models: {},
          },
        },
      ]);
    });
  });

  describe('MCP template functionality', () => {
    beforeEach(() => {
      vi.mocked(cloneTemplate).mockResolvedValue(undefined);
    });

    describe('Template listing with MCP templates', () => {
      it('should list both project and MCP templates when no template is provided', async () => {
        const mockProjectTemplates = ['weather', 'chatbot'];
        const mockMcpTemplates = ['zendesk', 'slack'];
        vi.mocked(getAvailableTemplates)
          .mockResolvedValueOnce(mockProjectTemplates)
          .mockResolvedValueOnce(mockMcpTemplates);

        const options: AddOptions = { list: false };

        await expect(addCommand(options)).rejects.toThrow('process.exit called');

        expect(getAvailableTemplates).toHaveBeenCalledWith('template-projects', undefined);
        expect(getAvailableTemplates).toHaveBeenCalledWith('template-mcps', undefined);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Available project templates:')
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('weather'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('chatbot'));
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Available MCP templates:')
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('zendesk'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('slack'));
        expect(processExitSpy).toHaveBeenCalledWith(0);
      });
    });

    describe('MCP template validation', () => {
      it('should exit with error when MCP template is not found', async () => {
        const mockProjectTemplates = ['weather'];
        const mockMcpTemplates = ['zendesk'];
        vi.mocked(getAvailableTemplates)
          .mockResolvedValueOnce(mockProjectTemplates)
          .mockResolvedValueOnce(mockMcpTemplates);

        const options: AddOptions = {
          mcp: 'non-existent-mcp',
          list: false,
        };

        await expect(addCommand(options)).rejects.toThrow('process.exit called');

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '❌ MCP template "non-existent-mcp" not found'
        );
        expect(processExitSpy).toHaveBeenCalledWith(1);
      });

      it('should proceed when MCP template exists', async () => {
        const mockProjectTemplates = ['weather'];
        const mockMcpTemplates = ['zendesk'];
        vi.mocked(getAvailableTemplates)
          .mockResolvedValueOnce(mockProjectTemplates)
          .mockResolvedValueOnce(mockMcpTemplates);
        vi.mocked(findUp).mockResolvedValue('/test/path/apps/mcp/app');

        const options: AddOptions = {
          mcp: 'zendesk',
          list: false,
        };

        await addCommand(options);

        expect(getAvailableTemplates).toHaveBeenCalledWith('template-mcps', undefined);
        expect(cloneTemplate).toHaveBeenCalled();
        expect(processExitSpy).not.toHaveBeenCalled();
      });
    });

    describe('MCP template target path handling', () => {
      beforeEach(() => {
        const mockProjectTemplates = ['weather'];
        const mockMcpTemplates = ['zendesk'];
        vi.mocked(getAvailableTemplates)
          .mockResolvedValueOnce(mockProjectTemplates)
          .mockResolvedValueOnce(mockMcpTemplates);
      });

      it('should find and use apps/mcp/app directory when no target path specified', async () => {
        vi.mocked(findUp).mockResolvedValue('/project/root/apps/mcp/app');

        const options: AddOptions = {
          mcp: 'zendesk',
          list: false,
        };

        await addCommand(options);

        expect(vi.mocked(findUp)).toHaveBeenCalledWith('apps/mcp/app', { type: 'directory' });
        expect(cloneTemplate).toHaveBeenCalledWith(
          'https://github.com/inkeep/agents/agents-cookbook/template-mcps/zendesk',
          '/project/root/apps/mcp/app/zendesk'
        );
        expect(mockSpinner.stop).toHaveBeenCalledWith(
          'MCP template "zendesk" added to /project/root/apps/mcp/app/zendesk'
        );
      });

      it('should use current directory when apps/mcp/app is not found and user confirms', async () => {
        vi.mocked(findUp).mockResolvedValue(undefined);
        vi.mocked(p.confirm).mockResolvedValue(true);
        const originalCwd = process.cwd();

        const options: AddOptions = {
          mcp: 'zendesk',
          list: false,
        };

        await addCommand(options);

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('No app directory found')
        );
        expect(p.confirm).toHaveBeenCalledWith({
          message: `Do you want to add to ${originalCwd} instead?`,
        });
        expect(cloneTemplate).toHaveBeenCalledWith(
          'https://github.com/inkeep/agents/agents-cookbook/template-mcps/zendesk',
          `${originalCwd}/zendesk`
        );
      });

      it('should exit when apps/mcp/app is not found and user declines', async () => {
        vi.mocked(findUp).mockResolvedValue(undefined);
        vi.mocked(p.confirm).mockResolvedValue(false);

        const options: AddOptions = {
          mcp: 'zendesk',
          list: false,
        };

        await expect(addCommand(options)).rejects.toThrow('process.exit called');

        expect(processExitSpy).toHaveBeenCalledWith(0);
        expect(cloneTemplate).not.toHaveBeenCalled();
      });

      it('should use specified target path when provided', async () => {
        const options: AddOptions = {
          mcp: 'zendesk',
          targetPath: './custom-mcp-path',
          list: false,
        };

        await addCommand(options);

        expect(vi.mocked(findUp)).not.toHaveBeenCalled();
        expect(cloneTemplate).toHaveBeenCalledWith(
          'https://github.com/inkeep/agents/agents-cookbook/template-mcps/zendesk',
          './custom-mcp-path'
        );
        expect(mockSpinner.stop).toHaveBeenCalledWith(
          'MCP template "zendesk" added to ./custom-mcp-path'
        );
      });
    });

    describe('MCP template cloning', () => {
      beforeEach(() => {
        const mockProjectTemplates = ['weather'];
        const mockMcpTemplates = ['zendesk', 'slack'];
        vi.mocked(getAvailableTemplates)
          .mockResolvedValueOnce(mockProjectTemplates)
          .mockResolvedValueOnce(mockMcpTemplates);
      });

      it('should clone MCP template successfully', async () => {
        vi.mocked(findUp).mockResolvedValue('/project/apps/mcp/app');

        const options: AddOptions = {
          mcp: 'zendesk',
          list: false,
        };

        await addCommand(options);

        expect(p.spinner).toHaveBeenCalled();
        expect(mockSpinner.start).toHaveBeenCalled();
        expect(cloneTemplate).toHaveBeenCalledWith(
          'https://github.com/inkeep/agents/agents-cookbook/template-mcps/zendesk',
          '/project/apps/mcp/app/zendesk'
        );
        expect(mockSpinner.stop).toHaveBeenCalledWith(
          'MCP template "zendesk" added to /project/apps/mcp/app/zendesk'
        );
      });

      it('should construct correct GitHub URL for MCP template', async () => {
        vi.mocked(findUp).mockResolvedValue('/project/apps/mcp/app');

        const options: AddOptions = {
          mcp: 'slack',
          list: false,
        };

        await addCommand(options);

        expect(cloneTemplate).toHaveBeenCalledWith(
          'https://github.com/inkeep/agents/agents-cookbook/template-mcps/slack',
          '/project/apps/mcp/app/slack'
        );
      });

      it('should handle MCP template cloning errors', async () => {
        vi.mocked(findUp).mockResolvedValue('/project/apps/mcp/app');
        vi.mocked(cloneTemplate).mockRejectedValue(new Error('Git clone failed'));

        const options: AddOptions = {
          mcp: 'zendesk',
          list: false,
        };

        await expect(addCommand(options)).rejects.toThrow('Git clone failed');

        expect(cloneTemplate).toHaveBeenCalled();
        expect(mockSpinner.stop).not.toHaveBeenCalled();
      });

      it('should not include model configuration replacements for MCP templates', async () => {
        process.env.ANTHROPIC_API_KEY = 'test-key';
        vi.mocked(findUp).mockResolvedValue('/project/apps/mcp/app');

        const options: AddOptions = {
          mcp: 'zendesk',
          list: false,
        };

        await addCommand(options);

        expect(cloneTemplate).toHaveBeenCalledWith(
          'https://github.com/inkeep/agents/agents-cookbook/template-mcps/zendesk',
          '/project/apps/mcp/app/zendesk'
        );
      });
    });

    describe('Both project and MCP templates together', () => {
      beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = 'test-key';
        const mockProjectTemplates = ['weather'];
        const mockMcpTemplates = ['zendesk'];
        vi.mocked(getAvailableTemplates)
          .mockResolvedValueOnce(mockProjectTemplates)
          .mockResolvedValueOnce(mockMcpTemplates);
        vi.mocked(fs.pathExists).mockResolvedValue(false as any);
      });

      it('should add both project and MCP templates when both are specified', async () => {
        vi.mocked(findUp).mockResolvedValue('/project/apps/mcp/app');

        const options: AddOptions = {
          project: 'weather',
          mcp: 'zendesk',
          targetPath: './projects',
          list: false,
        };

        await addCommand(options);

        expect(cloneTemplate).toHaveBeenCalledTimes(2);
        expect(cloneTemplate).toHaveBeenCalledWith(
          'https://github.com/inkeep/agents/agents-cookbook/template-projects/weather',
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
        expect(cloneTemplate).toHaveBeenCalledWith(
          'https://github.com/inkeep/agents/agents-cookbook/template-mcps/zendesk',
          './projects'
        );
      });
    });

    describe('findAppDirectory function', () => {
      it('should return the apps/mcp/app directory path when found', async () => {
        vi.mocked(findUp).mockResolvedValue('/project/root/apps/mcp/app');

        const result = await findAppDirectory();

        expect(result).toBe('/project/root/apps/mcp/app');
        expect(vi.mocked(findUp)).toHaveBeenCalledWith('apps/mcp/app', { type: 'directory' });
      });

      it('should prompt and return current directory when not found and user confirms', async () => {
        vi.mocked(findUp).mockResolvedValue(undefined);
        vi.mocked(p.confirm).mockResolvedValue(true);
        const originalCwd = process.cwd();

        const result = await findAppDirectory();

        expect(result).toBe(originalCwd);
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('No app directory found')
        );
        expect(p.confirm).toHaveBeenCalledWith({
          message: `Do you want to add to ${originalCwd} instead?`,
        });
      });

      it('should exit when not found and user declines', async () => {
        vi.mocked(findUp).mockResolvedValue(undefined);
        vi.mocked(p.confirm).mockResolvedValue(false);

        await expect(findAppDirectory()).rejects.toThrow('process.exit called');

        expect(processExitSpy).toHaveBeenCalledWith(0);
      });
    });

    describe('addMcpTemplate function', () => {
      let mockMcpSpinner: any;

      beforeEach(() => {
        mockMcpSpinner = {
          start: vi.fn().mockReturnThis(),
          succeed: vi.fn().mockReturnThis(),
          stop: vi.fn().mockReturnThis(),
        };
        const mockMcpTemplates = ['zendesk'];
        vi.mocked(getAvailableTemplates).mockResolvedValue(mockMcpTemplates);
      });

      it('should add MCP template with custom target path', async () => {
        await addMcpTemplate('zendesk', './custom-path', mockMcpSpinner, undefined);

        expect(cloneTemplate).toHaveBeenCalledWith(
          'https://github.com/inkeep/agents/agents-cookbook/template-mcps/zendesk',
          './custom-path'
        );
        expect(mockMcpSpinner.stop).toHaveBeenCalledWith(
          'MCP template "zendesk" added to ./custom-path'
        );
      });

      it('should use findAppDirectory when no target path provided', async () => {
        vi.mocked(findUp).mockResolvedValue('/found/path/apps/mcp/app');

        await addMcpTemplate('zendesk', undefined, mockMcpSpinner, undefined);

        expect(vi.mocked(findUp)).toHaveBeenCalledWith('apps/mcp/app', { type: 'directory' });
        expect(cloneTemplate).toHaveBeenCalledWith(
          'https://github.com/inkeep/agents/agents-cookbook/template-mcps/zendesk',
          '/found/path/apps/mcp/app/zendesk'
        );
      });
    });
  });
});
