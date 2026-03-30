import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readProjectState, writeProjectState } from '../state';

describe('state', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `inkeep-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('readProjectState', () => {
    it('returns undefined when no state file exists', () => {
      const result = readProjectState('project-1', { stateDir: testDir });
      expect(result).toBeUndefined();
    });

    it('returns undefined when project is not in state file', () => {
      writeFileSync(
        join(testDir, 'state.json'),
        JSON.stringify({
          projects: { 'other-project': { lastPulledHash: 'abc', lastPulledAt: '2026-01-01' } },
        })
      );

      const result = readProjectState('project-1', { stateDir: testDir });
      expect(result).toBeUndefined();
    });

    it('reads stored state for a project', () => {
      writeFileSync(
        join(testDir, 'state.json'),
        JSON.stringify({
          projects: {
            'project-1': { lastPulledHash: 'hash123', lastPulledAt: '2026-01-01T00:00:00.000Z' },
          },
        })
      );

      const result = readProjectState('project-1', { stateDir: testDir });
      expect(result).toEqual({
        lastPulledHash: 'hash123',
        lastPulledAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('returns undefined for malformed JSON', () => {
      writeFileSync(join(testDir, 'state.json'), 'not json');

      const result = readProjectState('project-1', { stateDir: testDir });
      expect(result).toBeUndefined();
    });
  });

  describe('writeProjectState', () => {
    it('creates state directory and file when they do not exist', () => {
      const nestedDir = join(testDir, 'nested');
      writeProjectState('project-1', 'hash123', { stateDir: nestedDir });

      const statePath = join(nestedDir, 'state.json');
      expect(existsSync(statePath)).toBe(true);

      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      expect(state.projects['project-1'].lastPulledHash).toBe('hash123');
      expect(state.projects['project-1'].lastPulledAt).toBeDefined();
    });

    it('preserves other projects when writing', () => {
      writeProjectState('project-1', 'hash-a', { stateDir: testDir });
      writeProjectState('project-2', 'hash-b', { stateDir: testDir });

      const statePath = join(testDir, 'state.json');
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      expect(state.projects['project-1'].lastPulledHash).toBe('hash-a');
      expect(state.projects['project-2'].lastPulledHash).toBe('hash-b');
    });

    it('updates existing project hash', () => {
      writeProjectState('project-1', 'old-hash', { stateDir: testDir });
      writeProjectState('project-1', 'new-hash', { stateDir: testDir });

      const statePath = join(testDir, 'state.json');
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      expect(state.projects['project-1'].lastPulledHash).toBe('new-hash');
    });
  });
});
