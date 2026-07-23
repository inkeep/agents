import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addRecentProject,
  getRecentProjects,
  getRecentProjectsState,
  pruneStaleProjects,
  removeRecentProject,
  validateRecentProjects,
} from '../recent-projects';

describe('recent-projects', () => {
  let stateDir: string;
  let existingDir: string;

  beforeEach(() => {
    stateDir = join(tmpdir(), `ok-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(stateDir, { recursive: true });
    existingDir = join(tmpdir(), `ok-project-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(existingDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
    rmSync(existingDir, { recursive: true, force: true });
  });

  describe('getRecentProjects', () => {
    it('returns empty array when no state file exists', () => {
      const result = getRecentProjects({ stateDir });
      expect(result).toEqual([]);
    });

    it('returns empty array for malformed JSON', () => {
      writeFileSync(join(stateDir, 'state.json'), 'not json');
      const result = getRecentProjects({ stateDir });
      expect(result).toEqual([]);
    });

    it('returns recent projects from state file', () => {
      writeFileSync(
        join(stateDir, 'state.json'),
        JSON.stringify({
          recentProjects: [
            { path: '/tmp/project-a', name: 'Project A', lastOpenedAt: '2026-01-01T00:00:00.000Z' },
          ],
        })
      );

      const result = getRecentProjects({ stateDir });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: '/tmp/project-a',
        name: 'Project A',
        lastOpenedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('addRecentProject', () => {
    it('creates state file and adds project', () => {
      addRecentProject({ path: '/tmp/my-project', name: 'My Project' }, { stateDir });

      const state = JSON.parse(readFileSync(join(stateDir, 'state.json'), 'utf-8'));
      expect(state.recentProjects).toHaveLength(1);
      expect(state.recentProjects[0].path).toBe('/tmp/my-project');
      expect(state.recentProjects[0].name).toBe('My Project');
      expect(state.recentProjects[0].lastOpenedAt).toBeDefined();
      expect(state.lastOpenedProject).toBe('/tmp/my-project');
    });

    it('moves existing project to front of list', () => {
      addRecentProject({ path: '/tmp/project-a', name: 'A' }, { stateDir });
      addRecentProject({ path: '/tmp/project-b', name: 'B' }, { stateDir });
      addRecentProject({ path: '/tmp/project-a', name: 'A' }, { stateDir });

      const state = JSON.parse(readFileSync(join(stateDir, 'state.json'), 'utf-8'));
      expect(state.recentProjects).toHaveLength(2);
      expect(state.recentProjects[0].path).toBe('/tmp/project-a');
      expect(state.recentProjects[1].path).toBe('/tmp/project-b');
    });

    it('updates lastOpenedProject', () => {
      addRecentProject({ path: '/tmp/project-a', name: 'A' }, { stateDir });
      addRecentProject({ path: '/tmp/project-b', name: 'B' }, { stateDir });

      const state = JSON.parse(readFileSync(join(stateDir, 'state.json'), 'utf-8'));
      expect(state.lastOpenedProject).toBe('/tmp/project-b');
    });

    it('creates state directory if needed', () => {
      const nestedDir = join(stateDir, 'nested', 'deep');
      addRecentProject({ path: '/tmp/p', name: 'P' }, { stateDir: nestedDir });
      expect(existsSync(join(nestedDir, 'state.json'))).toBe(true);
    });
  });

  describe('removeRecentProject', () => {
    it('removes a project and cleans up associated entries', () => {
      writeFileSync(
        join(stateDir, 'state.json'),
        JSON.stringify({
          recentProjects: [
            { path: '/tmp/project-a', name: 'A', lastOpenedAt: '2026-01-01T00:00:00.000Z' },
            { path: '/tmp/project-b', name: 'B', lastOpenedAt: '2026-01-02T00:00:00.000Z' },
          ],
          projectSessions: {
            '/tmp/project-a': { tab: 'editor' },
            '/tmp/project-b': { tab: 'preview' },
          },
          projectWindowBounds: {
            '/tmp/project-a': { x: 0, y: 0, width: 800, height: 600 },
            '/tmp/project-b': { x: 100, y: 100, width: 1024, height: 768 },
          },
          lastOpenedProject: '/tmp/project-a',
        })
      );

      const result = removeRecentProject('/tmp/project-a', { stateDir });
      expect(result).toBe(true);

      const state = JSON.parse(readFileSync(join(stateDir, 'state.json'), 'utf-8'));
      expect(state.recentProjects).toHaveLength(1);
      expect(state.recentProjects[0].path).toBe('/tmp/project-b');
      expect(state.projectSessions['/tmp/project-a']).toBeUndefined();
      expect(state.projectSessions['/tmp/project-b']).toEqual({ tab: 'preview' });
      expect(state.projectWindowBounds['/tmp/project-a']).toBeUndefined();
      expect(state.projectWindowBounds['/tmp/project-b']).toEqual({
        x: 100,
        y: 100,
        width: 1024,
        height: 768,
      });
      expect(state.lastOpenedProject).toBe('/tmp/project-b');
    });

    it('returns false when project not found', () => {
      writeFileSync(
        join(stateDir, 'state.json'),
        JSON.stringify({ recentProjects: [], projectSessions: {}, projectWindowBounds: {} })
      );

      const result = removeRecentProject('/tmp/nonexistent', { stateDir });
      expect(result).toBe(false);
    });

    it('clears lastOpenedProject when last project is removed', () => {
      writeFileSync(
        join(stateDir, 'state.json'),
        JSON.stringify({
          recentProjects: [
            { path: '/tmp/only-project', name: 'Only', lastOpenedAt: '2026-01-01T00:00:00.000Z' },
          ],
          projectSessions: {},
          projectWindowBounds: {},
          lastOpenedProject: '/tmp/only-project',
        })
      );

      removeRecentProject('/tmp/only-project', { stateDir });

      const state = JSON.parse(readFileSync(join(stateDir, 'state.json'), 'utf-8'));
      expect(state.recentProjects).toHaveLength(0);
      expect(state.lastOpenedProject).toBeUndefined();
    });
  });

  describe('validateRecentProjects', () => {
    it('returns empty array when all paths exist', () => {
      writeFileSync(
        join(stateDir, 'state.json'),
        JSON.stringify({
          recentProjects: [
            { path: existingDir, name: 'Existing', lastOpenedAt: '2026-01-01T00:00:00.000Z' },
          ],
          projectSessions: {},
          projectWindowBounds: {},
        })
      );

      const result = validateRecentProjects({ stateDir });
      expect(result).toHaveLength(0);
    });

    it('flags projects with missing paths', () => {
      writeFileSync(
        join(stateDir, 'state.json'),
        JSON.stringify({
          recentProjects: [
            { path: existingDir, name: 'Existing', lastOpenedAt: '2026-01-01T00:00:00.000Z' },
            {
              path: '/tmp/definitely-does-not-exist-xyz-123',
              name: 'Missing',
              lastOpenedAt: '2026-01-02T00:00:00.000Z',
            },
          ],
          projectSessions: {},
          projectWindowBounds: {},
        })
      );

      const result = validateRecentProjects({ stateDir });
      expect(result).toHaveLength(1);
      expect(result[0].project.path).toBe('/tmp/definitely-does-not-exist-xyz-123');
      expect(result[0].reason).toBe('path_missing');
    });

    it('returns empty array for no recent projects', () => {
      const result = validateRecentProjects({ stateDir });
      expect(result).toHaveLength(0);
    });
  });

  describe('pruneStaleProjects', () => {
    it('removes projects with missing paths and cleans up state', () => {
      const missingPath = '/tmp/definitely-does-not-exist-xyz-456';
      writeFileSync(
        join(stateDir, 'state.json'),
        JSON.stringify({
          recentProjects: [
            { path: existingDir, name: 'Valid', lastOpenedAt: '2026-01-01T00:00:00.000Z' },
            { path: missingPath, name: 'Stale', lastOpenedAt: '2026-01-02T00:00:00.000Z' },
          ],
          projectSessions: {
            [existingDir]: { tab: 'editor' },
            [missingPath]: { tab: 'preview' },
          },
          projectWindowBounds: {
            [existingDir]: { width: 800 },
            [missingPath]: { width: 1024 },
          },
          lastOpenedProject: missingPath,
        })
      );

      const pruned = pruneStaleProjects({ stateDir });
      expect(pruned).toHaveLength(1);
      expect(pruned[0].path).toBe(missingPath);

      const state = JSON.parse(readFileSync(join(stateDir, 'state.json'), 'utf-8'));
      expect(state.recentProjects).toHaveLength(1);
      expect(state.recentProjects[0].path).toBe(existingDir);
      expect(state.projectSessions[missingPath]).toBeUndefined();
      expect(state.projectSessions[existingDir]).toEqual({ tab: 'editor' });
      expect(state.projectWindowBounds[missingPath]).toBeUndefined();
      expect(state.projectWindowBounds[existingDir]).toEqual({ width: 800 });
      expect(state.lastOpenedProject).toBe(existingDir);
    });

    it('returns empty array when nothing to prune', () => {
      writeFileSync(
        join(stateDir, 'state.json'),
        JSON.stringify({
          recentProjects: [
            { path: existingDir, name: 'Valid', lastOpenedAt: '2026-01-01T00:00:00.000Z' },
          ],
          projectSessions: {},
          projectWindowBounds: {},
        })
      );

      const pruned = pruneStaleProjects({ stateDir });
      expect(pruned).toHaveLength(0);
    });

    it('handles empty state gracefully', () => {
      const pruned = pruneStaleProjects({ stateDir });
      expect(pruned).toHaveLength(0);
    });
  });

  describe('getRecentProjectsState', () => {
    it('returns full state with defaults for missing fields', () => {
      writeFileSync(
        join(stateDir, 'state.json'),
        JSON.stringify({ recentProjects: [{ path: '/a', name: 'A', lastOpenedAt: '2026-01-01' }] })
      );

      const state = getRecentProjectsState({ stateDir });
      expect(state.recentProjects).toHaveLength(1);
      expect(state.projectSessions).toEqual({});
      expect(state.projectWindowBounds).toEqual({});
      expect(state.lastOpenedProject).toBeUndefined();
    });
  });
});
