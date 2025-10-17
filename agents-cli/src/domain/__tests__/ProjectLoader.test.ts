import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectLoader } from '../ProjectLoader';
import { ProjectNotFoundError, InvalidProjectError } from '../errors';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

// Mock the modules
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

// Mock tsx-loader module
vi.mock('../../utils/tsx-loader', () => ({
  importWithTypeScriptSupport: vi.fn(),
}));

describe('ProjectLoader', () => {
  let projectLoader: ProjectLoader;

  beforeEach(async () => {
    vi.clearAllMocks();
    projectLoader = new ProjectLoader();

    // Setup default mocks
    vi.mocked(existsSync).mockReturnValue(true);
  });

  describe('load', () => {
    it('should load project from current directory when no options provided', async () => {
      const mockProject = { __type: 'project', id: 'test-project' };
      const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader');
      vi.mocked(importWithTypeScriptSupport).mockResolvedValue({ testProject: mockProject });

      const result = await projectLoader.load();

      expect(result).toEqual(mockProject);
      expect(vi.mocked(existsSync)).toHaveBeenCalled();
    });

    it('should load project from specified project path', async () => {
      const mockProject = { __type: 'project', id: 'test-project' };
      const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader');
      vi.mocked(importWithTypeScriptSupport).mockResolvedValue({ myProject: mockProject });

      const result = await projectLoader.load({ projectPath: '/custom/path' });

      expect(result).toEqual(mockProject);
    });

    it('should throw ProjectNotFoundError when index.ts does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await expect(projectLoader.load({ projectPath: '/invalid/path' })).rejects.toThrow(
        ProjectNotFoundError
      );
    });

    it('should throw InvalidProjectError when no project export found', async () => {
      const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader');
      vi.mocked(importWithTypeScriptSupport).mockResolvedValue({
        someOtherExport: { __type: 'not-a-project' },
      });

      await expect(projectLoader.load()).rejects.toThrow(InvalidProjectError);
    });

    it('should find project export among multiple exports', async () => {
      const mockProject = { __type: 'project', id: 'test-project' };
      const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader');
      vi.mocked(importWithTypeScriptSupport).mockResolvedValue({
        notAProject: { __type: 'something-else' },
        myProject: mockProject,
        anotherExport: 'some value',
      });

      const result = await projectLoader.load();

      expect(result).toEqual(mockProject);
    });

    it('should handle baseDir option', async () => {
      const mockProject = { __type: 'project', id: 'test-project' };
      const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader');
      vi.mocked(importWithTypeScriptSupport).mockResolvedValue({ project: mockProject });

      await projectLoader.load({ baseDir: '/custom/base' });

      // Verify that path resolution used the custom base
      const calls = vi.mocked(existsSync).mock.calls;
      expect(calls.some((call) => String(call[0]).includes('/custom/base'))).toBe(true);
    });
  });

  describe('getProjectDirectory', () => {
    it('should return current directory when no options provided', () => {
      const result = projectLoader.getProjectDirectory();

      expect(result).toBe(process.cwd());
    });

    it('should return resolved project path', () => {
      const projectPath = 'my-project';
      const expectedPath = path.resolve(process.cwd(), projectPath);

      const result = projectLoader.getProjectDirectory({ projectPath });

      expect(result).toBe(expectedPath);
    });

    it('should throw ProjectNotFoundError when directory does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      expect(() => projectLoader.getProjectDirectory({ projectPath: '/invalid' })).toThrow(
        ProjectNotFoundError
      );
    });
  });

  describe('error messages', () => {
    it('should provide helpful error message when project not found', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      try {
        await projectLoader.load({ projectPath: '/missing/project' });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(ProjectNotFoundError);
        expect((error as ProjectNotFoundError).projectPath).toContain('/missing/project');
      }
    });

    it('should provide helpful error message when invalid project export', async () => {
      const { importWithTypeScriptSupport } = await import('../../utils/tsx-loader');
      vi.mocked(importWithTypeScriptSupport).mockResolvedValue({ notProject: {} });

      try {
        await projectLoader.load();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidProjectError);
        expect((error as Error).message).toContain('No project export found');
      }
    });
  });
});
