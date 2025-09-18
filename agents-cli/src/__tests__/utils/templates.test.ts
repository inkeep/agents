import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import fs from 'fs-extra';
import degit from 'degit';
import { cloneTemplate, getAvailableTemplates } from '../../utils/templates';

// Mock external dependencies
vi.mock('fs-extra');
vi.mock('degit');

// Mock global fetch
global.fetch = vi.fn();

describe('Template Utils', () => {
  let consoleLogSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('cloneTemplate', () => {
    let mockEmitter: any;

    beforeEach(() => {
      mockEmitter = {
        clone: vi.fn(),
      };
      vi.mocked(degit).mockReturnValue(mockEmitter);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    });

    it('should clone template successfully with HTTPS URL', async () => {
      mockEmitter.clone.mockResolvedValue(undefined);

      await cloneTemplate(
        'https://github.com/inkeep/agents-cookbook/templates/weather',
        './target-path'
      );

      expect(fs.mkdir).toHaveBeenCalledWith('./target-path', { recursive: true });
      expect(degit).toHaveBeenCalledWith('inkeep/agents-cookbook/templates/weather');
      expect(mockEmitter.clone).toHaveBeenCalledWith('./target-path');
    });

    it('should handle GitHub URL transformation correctly', async () => {
      mockEmitter.clone.mockResolvedValue(undefined);

      await cloneTemplate(
        'https://github.com/user/repo/path/to/template',
        './my-template'
      );

      expect(degit).toHaveBeenCalledWith('user/repo/path/to/template');
      expect(mockEmitter.clone).toHaveBeenCalledWith('./my-template');
    });

    it('should create target directory recursively', async () => {
      mockEmitter.clone.mockResolvedValue(undefined);

      await cloneTemplate(
        'https://github.com/inkeep/agents-cookbook/templates/weather',
        './deep/nested/path'
      );

      expect(fs.mkdir).toHaveBeenCalledWith('./deep/nested/path', { recursive: true });
    });

    it('should exit on degit clone failure', async () => {
      mockEmitter.clone.mockRejectedValue(new Error('Repository not found'));

      await expect(
        cloneTemplate(
          'https://github.com/inkeep/agents-cookbook/templates/nonexistent',
          './target'
        )
      ).rejects.toThrow('process.exit called');

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle fs.mkdir failures', async () => {
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Permission denied'));

      await expect(
        cloneTemplate(
          'https://github.com/inkeep/agents-cookbook/templates/weather',
          './restricted-path'
        )
      ).rejects.toThrow('Permission denied');

      expect(mockEmitter.clone).not.toHaveBeenCalled();
    });

    it('should handle malformed URLs gracefully', async () => {
      mockEmitter.clone.mockResolvedValue(undefined);

      await cloneTemplate('not-a-github-url', './target');

      expect(degit).toHaveBeenCalledWith('not-a-github-url');
    });

    it('should handle empty template path', async () => {
      mockEmitter.clone.mockResolvedValue(undefined);

      await cloneTemplate('https://github.com/', './target');

      expect(degit).toHaveBeenCalledWith('');
    });

    it('should handle various degit error types', async () => {
      const errorTypes = [
        new Error('ENOTFOUND'),
        new Error('404 - Not Found'),
        new Error('Rate limit exceeded'),
        new Error('Network timeout'),
      ];

      for (const error of errorTypes) {
        mockEmitter.clone.mockRejectedValueOnce(error);

        await expect(
          cloneTemplate(
            'https://github.com/inkeep/agents-cookbook/templates/test',
            './target'
          )
        ).rejects.toThrow('process.exit called');

        expect(processExitSpy).toHaveBeenCalledWith(1);

        // Reset the spy for the next iteration
        processExitSpy.mockClear();
      }
    });
  });

  describe('getAvailableTemplates', () => {
    beforeEach(() => {
      vi.mocked(fetch).mockClear();
    });

    it('should fetch and return available templates', async () => {
      const mockResponse = [
        { name: 'weather', type: 'dir' },
        { name: 'chatbot', type: 'dir' },
        { name: 'README.md', type: 'file' },
        { name: 'data-analysis', type: 'dir' },
      ];

      vi.mocked(fetch).mockResolvedValue({
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const templates = await getAvailableTemplates();

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/inkeep/agents-cookbook/contents/templates'
      );
      expect(templates).toEqual(['weather', 'chatbot', 'data-analysis']);
    });

    it('should filter out non-directory items', async () => {
      const mockResponse = [
        { name: 'template1', type: 'dir' },
        { name: 'README.md', type: 'file' },
        { name: 'template2', type: 'dir' },
        { name: '.gitignore', type: 'file' },
      ];

      vi.mocked(fetch).mockResolvedValue({
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const templates = await getAvailableTemplates();

      expect(templates).toEqual(['template1', 'template2']);
    });

    it('should handle network errors', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      await expect(getAvailableTemplates()).rejects.toThrow('Network error');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete workflow from template fetch to clone', async () => {
      // Mock getAvailableTemplates
      const mockResponse = [
        { name: 'weather', type: 'dir' },
        { name: 'chatbot', type: 'dir' },
      ];

      vi.mocked(fetch).mockResolvedValue({
        json: () => Promise.resolve(mockResponse),
      } as Response);

      // Mock cloneTemplate
      const mockEmitter = { clone: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(degit).mockReturnValue(mockEmitter as any);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      // Test complete workflow
      const templates = await getAvailableTemplates();
      expect(templates).toContain('weather');

      await cloneTemplate(
        'https://github.com/inkeep/agents-cookbook/templates/weather',
        './weather-project'
      );

      expect(mockEmitter.clone).toHaveBeenCalledWith('./weather-project');
    });

    it('should handle concurrent template operations', async () => {
      const mockEmitter = { clone: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(degit).mockReturnValue(mockEmitter as any);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const clonePromises = [
        cloneTemplate('https://github.com/inkeep/agents-cookbook/templates/weather', './weather1'),
        cloneTemplate('https://github.com/inkeep/agents-cookbook/templates/chatbot', './chatbot1'),
        cloneTemplate('https://github.com/inkeep/agents-cookbook/templates/weather', './weather2'),
      ];

      await Promise.all(clonePromises);

      expect(mockEmitter.clone).toHaveBeenCalledTimes(3);
      expect(fs.mkdir).toHaveBeenCalledTimes(3);
    });
  });
});