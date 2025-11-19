import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '../../db/client';
import {
  checkoutRef,
  getCurrentBranchOrCommit,
  isRefWritable,
  isValidCommitHash,
  resolveRef,
} from '../../dolt/ref';
import { testDbClient } from '../setup';
import { getSqlString } from './test-utils';

describe('Ref Module', () => {
  let db: DatabaseClient;

  beforeEach(() => {
    db = testDbClient;
    vi.clearAllMocks();
  });

  describe('isValidCommitHash', () => {
    it('should return true for valid 32-character hex string', () => {
      const validHash = 'a1b2c3d4e5f6789012345678901234ab';
      expect(isValidCommitHash(validHash)).toBe(true);
    });

    it('should return true for lowercase hex string', () => {
      const validHash = 'abcdef0123456789abcdef0123456789';
      expect(isValidCommitHash(validHash)).toBe(true);
    });

    it('should return false for uppercase hex string', () => {
      const invalidHash = 'ABCDEF0123456789ABCDEF0123456789';
      expect(isValidCommitHash(invalidHash)).toBe(false);
    });

    it('should return false for string that is too short', () => {
      const invalidHash = 'a1b2c3d4e5f678901234567890123';
      expect(isValidCommitHash(invalidHash)).toBe(false);
    });

    it('should return false for string that is too long', () => {
      const invalidHash = 'a1b2c3d4e5f6789012345678901234abcd';
      expect(isValidCommitHash(invalidHash)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidCommitHash('')).toBe(false);
    });
  });

  describe('resolveRef', () => {
    it('should resolve a valid commit hash as commit type', async () => {
      const commitHash = 'a1b2c3d4e5f6789012345678901234ab';

      const mockExecute = vi.fn();
      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await resolveRef(mockDb)(commitHash);

      expect(result).toEqual({
        type: 'commit',
        name: commitHash,
        hash: commitHash,
      });
    });

    it('should resolve a tag name', async () => {
      const tagName = 'v1.0.0';
      const tagHash = 'a1b2c3d4e5f6789012345678901234ab';

      const mockExecute = vi.fn().mockResolvedValueOnce({
        rows: [{ tag_name: tagName, tag_hash: tagHash }],
      });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await resolveRef(mockDb)(tagName);

      expect(result).toEqual({
        type: 'tag',
        name: tagName,
        hash: tagHash,
      });
    });

    it('should resolve a branch name', async () => {
      const branchName = 'feature-branch';
      const branchHash = 'b2c3d4e5f6789012345678901234abcd';

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // tags query
        .mockResolvedValueOnce({ rows: [{ name: branchName, hash: branchHash }] }); // branches query

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await resolveRef(mockDb)(branchName);

      expect(result).toEqual({
        type: 'branch',
        name: branchName,
        hash: branchHash,
      });
    });

    it('should return null for non-existent ref', async () => {
      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // tags query
        .mockResolvedValueOnce({ rows: [] }); // branches query

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await resolveRef(mockDb)('non-existent-ref');

      expect(result).toBeNull();
    });

    it('should prioritize tag over branch with same name', async () => {
      const refName = 'release';
      const tagHash = 'a1b2c3d4e5f6789012345678901234ab';
      const branchHash = 'b2c3d4e5f6789012345678901234abcd';

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ tag_name: refName, tag_hash: tagHash }] }) // tags query
        .mockResolvedValueOnce({ rows: [{ name: refName, hash: branchHash }] }); // branches query

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await resolveRef(mockDb)(refName);

      expect(result).toEqual({
        type: 'tag',
        name: refName,
        hash: tagHash,
      });
    });
  });

  describe('isRefWritable', () => {
    it('should return true for branch ref', () => {
      const branchRef = {
        type: 'branch' as const,
        name: 'main',
        hash: 'a1b2c3d4e5f6789012345678901234ab',
      };

      expect(isRefWritable(branchRef)).toBe(true);
    });

    it('should return false for tag ref', () => {
      const tagRef = {
        type: 'tag' as const,
        name: 'v1.0.0',
        hash: 'a1b2c3d4e5f6789012345678901234ab',
      };

      expect(isRefWritable(tagRef)).toBe(false);
    });

    it('should return false for commit ref', () => {
      const commitRef = {
        type: 'commit' as const,
        name: 'a1b2c3d4e5f6789012345678901234ab',
        hash: 'a1b2c3d4e5f6789012345678901234ab',
      };

      expect(isRefWritable(commitRef)).toBe(false);
    });
  });

  describe('checkoutRef', () => {
    it('should checkout branch by name', async () => {
      const branchRef = {
        type: 'branch' as const,
        name: 'feature-branch',
        hash: 'a1b2c3d4e5f6789012345678901234ab',
      };

      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await checkoutRef(mockDb)(branchRef);

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_CHECKOUT');
      expect(sqlString).toContain('feature-branch');
    });

    it('should checkout tag by hash', async () => {
      const tagRef = {
        type: 'tag' as const,
        name: 'v1.0.0',
        hash: 'a1b2c3d4e5f6789012345678901234ab',
      };

      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await checkoutRef(mockDb)(tagRef);

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_CHECKOUT');
      expect(sqlString).toContain('a1b2c3d4e5f6789012345678901234ab');
    });

    it('should checkout commit by hash', async () => {
      const commitRef = {
        type: 'commit' as const,
        name: 'a1b2c3d4e5f6789012345678901234ab',
        hash: 'a1b2c3d4e5f6789012345678901234ab',
      };

      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await checkoutRef(mockDb)(commitRef);

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_CHECKOUT');
      expect(sqlString).toContain('a1b2c3d4e5f6789012345678901234ab');
    });
  });

  describe('getCurrentBranchOrCommit', () => {
    it('should return current branch when on a branch', async () => {
      const branchName = 'main';
      const branchHash = 'a1b2c3d4e5f6789012345678901234ab';

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ branch: branchName }] }) // ACTIVE_BRANCH query
        .mockResolvedValueOnce({ rows: [{ hash: branchHash }] }); // DOLT_HASHOF query

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await getCurrentBranchOrCommit(mockDb)();

      expect(result).toEqual({
        ref: branchName,
        hash: branchHash,
        type: 'branch',
      });
    });

    it('should return commit hash when in detached HEAD state', async () => {
      const commitHash = 'a1b2c3d4e5f6789012345678901234ab';

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ branch: null }] }) // ACTIVE_BRANCH query (null = detached HEAD)
        .mockResolvedValueOnce({ rows: [{ hash: commitHash }] }); // DOLT_HASHOF query

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await getCurrentBranchOrCommit(mockDb)();

      expect(result).toEqual({
        ref: commitHash,
        hash: commitHash,
        type: 'commit',
      });
    });

    it('should handle empty branch name as detached HEAD', async () => {
      const commitHash = 'a1b2c3d4e5f6789012345678901234ab';

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ branch: '' }] }) // ACTIVE_BRANCH query (empty string)
        .mockResolvedValueOnce({ rows: [{ hash: commitHash }] }); // DOLT_HASHOF query

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await getCurrentBranchOrCommit(mockDb)();

      expect(result).toEqual({
        ref: commitHash,
        hash: commitHash,
        type: 'commit',
      });
    });
  });
});
