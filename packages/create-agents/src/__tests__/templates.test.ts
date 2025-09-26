import path from 'node:path';
import fs from 'fs-extra';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ContentReplacement,
  cloneTemplate,
  replaceContentInFiles,
  replaceObjectProperties,
} from '../templates';

// Mock dependencies
vi.mock('fs-extra');
vi.mock('degit', () => ({
  default: vi.fn(() => ({
    clone: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('Template Content Replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default fs-extra mocks
    vi.mocked(fs.pathExists).mockResolvedValue(true as any);
    vi.mocked(fs.readFile).mockResolvedValue('' as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
  });

  describe('replaceObjectProperties', () => {
    it('should replace a simple object property', async () => {
      const content = `export const myProject = project({
  id: 'test-project',
  models: {
    base: {
      model: 'gpt-4o-mini',
    },
  },
});`;

      const replacement = {
        base: {
          model: 'anthropic/claude-3-5-haiku-20241022',
        },
        summarizer: {
          model: 'anthropic/claude-3-5-haiku-20241022',
        },
      };

      const result = await replaceObjectProperties(content, { models: replacement });

      expect(result).toContain("'model': 'anthropic/claude-3-5-haiku-20241022'");
      expect(result).toContain("'summarizer'");
      expect(result).not.toContain('gpt-4o-mini');
    });

    it('should handle nested objects correctly', async () => {
      const content = `export const config = {
  models: {
    base: {
      model: 'old-model',
      temperature: 0.5,
    },
    structured: {
      model: 'old-structured',
    }
  },
  other: 'value'
};`;

      const replacement = {
        base: {
          model: 'new-model',
          temperature: 0.8,
        },
        structured: {
          model: 'new-structured',
        },
      };

      const result = await replaceObjectProperties(content, { models: replacement });

      expect(result).toContain("'model': 'new-model'");
      expect(result).toContain("'model': 'new-structured'");
      expect(result).toContain("'temperature': 0.8");
      expect(result).toContain("other: 'value'");
      expect(result).not.toContain('old-model');
    });

    it('should preserve code structure and formatting', async () => {
      const content = `const project = {
  id: 'test',
  models: {
    base: { model: 'old' }
  },
  description: 'test project'
};`;

      const replacement = { base: { model: 'new' } };

      const result = await replaceObjectProperties(content, { models: replacement });

      expect(result).toContain("id: 'test'");
      expect(result).toContain("description: 'test project'");
      expect(result).toContain("'model': 'new'");
    });

    it('should handle multiple property replacements', async () => {
      const content = `export const config = {
  models: { base: { model: 'old1' } },
  tools: { search: { enabled: false } },
  data: 'keep this'
};`;

      const replacements = {
        models: { base: { model: 'new1' } },
        tools: { search: { enabled: true }, newTool: { type: 'api' } },
      };

      const result = await replaceObjectProperties(content, replacements);

      expect(result).toContain("'model': 'new1'");
      expect(result).toContain("'enabled': true");
      expect(result).toContain("'newTool'");
      expect(result).toContain("data: 'keep this'");
    });
  });

  describe('replaceContentInFiles', () => {
    it('should process multiple files with replacements', async () => {
      const replacements: ContentReplacement[] = [
        {
          filePath: 'index.ts',
          replacements: {
            models: { base: { model: 'new-model' } },
          },
        },
        {
          filePath: 'config.ts',
          replacements: {
            settings: { debug: true },
          },
        },
      ];

      const indexContent = `export const project = { models: { base: { model: 'old' } } };`;
      const configContent = `export const config = { settings: { debug: false } };`;

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(indexContent as any)
        .mockResolvedValueOnce(configContent as any);

      await replaceContentInFiles('/target/path', replacements);

      expect(fs.readFile).toHaveBeenCalledTimes(2);
      expect(fs.readFile).toHaveBeenCalledWith(path.join('/target/path', 'index.ts'), 'utf-8');
      expect(fs.readFile).toHaveBeenCalledWith(path.join('/target/path', 'config.ts'), 'utf-8');

      expect(fs.writeFile).toHaveBeenCalledTimes(2);
      // Verify the content contains the replacements
      const writeCalls = vi.mocked(fs.writeFile).mock.calls;
      expect(writeCalls[0][1]).toContain("'model': 'new-model'");
      expect(writeCalls[1][1]).toContain("'debug': true");
    });

    it('should warn and skip non-existent files', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(fs.pathExists).mockResolvedValue(false as any);

      const replacements: ContentReplacement[] = [
        {
          filePath: 'non-existent.ts',
          replacements: { test: 'value' },
        },
      ];

      await replaceContentInFiles('/target/path', replacements);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('non-existent.ts'));
      expect(fs.readFile).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('cloneTemplate with replacements', () => {
    it('should clone template and apply replacements', async () => {
      const degit = await import('degit');
      const mockEmitter = { clone: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(degit.default).mockReturnValue(mockEmitter as any);

      const replacements: ContentReplacement[] = [
        {
          filePath: 'index.ts',
          replacements: {
            models: { base: { model: 'new-model' } },
          },
        },
      ];

      const fileContent = `export const project = { models: { base: { model: 'old' } } };`;
      vi.mocked(fs.readFile).mockResolvedValue(fileContent as any);

      await cloneTemplate('https://github.com/test/repo', '/target/path', replacements);

      expect(mockEmitter.clone).toHaveBeenCalledWith('/target/path');
      expect(fs.readFile).toHaveBeenCalledWith(path.join('/target/path', 'index.ts'), 'utf-8');
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join('/target/path', 'index.ts'),
        expect.stringContaining("'model': 'new-model'"),
        'utf-8'
      );
    });

    it('should clone template without replacements when none provided', async () => {
      const degit = await import('degit');
      const mockEmitter = { clone: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(degit.default).mockReturnValue(mockEmitter as any);

      await cloneTemplate('https://github.com/test/repo', '/target/path');

      expect(mockEmitter.clone).toHaveBeenCalledWith('/target/path');
      expect(fs.readFile).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should handle clone errors gracefully', async () => {
      const degit = await import('degit');
      const mockEmitter = { clone: vi.fn().mockRejectedValue(new Error('Clone failed')) };
      vi.mocked(degit.default).mockReturnValue(mockEmitter as any);

      const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(cloneTemplate('https://github.com/test/repo', '/target/path')).rejects.toThrow(
        'process.exit called'
      );

      expect(processExitSpy).toHaveBeenCalledWith(1);
      processExitSpy.mockRestore();
    });
  });

  describe('Integration tests', () => {
    it('should handle real-world TypeScript project structure', async () => {
      const projectContent = `import { project } from '@inkeep/agents-sdk';
import { weatherGraph } from './graphs/weather-graph';

export const myProject = project({
  id: 'weather-project',
  name: 'Weather Project',
  description: 'Weather project template',
  graphs: () => [weatherGraph],
  models: {
    base: {
      model: 'gpt-4o-mini',
    },
    structuredOutput: {
      model: 'gpt-4o-mini',
    },
    summarizer: {
      model: 'gpt-4o-mini',
    }
  },
});`;

      const newModels = {
        base: {
          model: 'anthropic/claude-3-5-haiku-20241022',
        },
        structuredOutput: {
          model: 'anthropic/claude-3-5-haiku-20241022',
        },
        summarizer: {
          model: 'anthropic/claude-3-5-haiku-20241022',
        },
      };

      const result = await replaceObjectProperties(projectContent, { models: newModels });

      // Should preserve imports and structure
      expect(result).toContain("import { project } from '@inkeep/agents-sdk'");
      expect(result).toContain("import { weatherGraph } from './graphs/weather-graph'");
      expect(result).toContain("id: 'weather-project'");
      expect(result).toContain("name: 'Weather Project'");
      expect(result).toContain('graphs: () => [weatherGraph]');

      // Should replace all model configurations
      expect(result).toContain('anthropic/claude-3-5-haiku-20241022');
      expect(result).not.toContain('gpt-4o-mini');

      // Should maintain proper structure
      expect(result).toContain("'base': {");
      expect(result).toContain("'structuredOutput': {");
      expect(result).toContain("'summarizer': {");
    });

    it('should handle edge cases in TypeScript syntax', async () => {
      const content = `export const config = {
  models: {
    base: { model: "double-quotes" },
    other: { 
      model: 'single-quotes',
      nested: { value: true }
    },
  },
  // Comment here
  data: 'preserve me'
};`;

      const replacement = {
        base: { model: 'new-base' },
        other: { model: 'new-other', nested: { value: false } },
      };

      const result = await replaceObjectProperties(content, { models: replacement });

      expect(result).toContain("'model': 'new-base'");
      expect(result).toContain("'model': 'new-other'");
      expect(result).toContain("'value': false");
      expect(result).toContain('// Comment here');
      expect(result).toContain("data: 'preserve me'");
    });

    it('should inject models property when it does not exist', async () => {
      const content = `export const myProject = project({
  id: 'test-project',
  name: 'Test Project',
  description: 'A test project without models',
  graphs: () => [],
});`;

      const replacement = {
        base: { model: 'anthropic/claude-3-5-haiku-20241022' },
        structuredOutput: { model: 'anthropic/claude-3-5-haiku-20241022' },
      };

      const result = await replaceObjectProperties(content, { models: replacement });

      expect(result).toContain('models:');
      expect(result).toContain("'base': {");
      expect(result).toContain("'model': 'anthropic/claude-3-5-haiku-20241022'");
      expect(result).toContain("'structuredOutput': {");
      expect(result).toContain("id: 'test-project'");
      expect(result).toContain('graphs: () => []');
    });
  });
});
