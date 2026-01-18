import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  doltAdd,
  doltCommit,
  doltDeleteTag,
  doltHashOf,
  doltListTags,
  doltLog,
  doltReset,
  doltStatus,
  doltTag,
} from '../../dolt/commit';
import { testManageDbClient } from '../setup';
import { getSqlString } from './test-utils';

describe('Commit Module', () => {
  let db: AgentsManageDatabaseClient;

  beforeEach(() => {
    db = testManageDbClient;
    vi.clearAllMocks();
  });

  describe('doltAdd', () => {
    it('should stage all changes when no tables specified', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltAdd(mockDb)({});

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_ADD');
      expect(sqlString).toContain('-A');
    });

    it('should stage all changes when tables array is empty', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltAdd(mockDb)({ tables: [] });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_ADD');
      expect(sqlString).toContain('-A');
    });

    it('should stage specific table', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltAdd(mockDb)({ tables: ['users'] });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_ADD');
      expect(sqlString).toContain('users');
    });

    it('should stage multiple tables', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltAdd(mockDb)({ tables: ['users', 'posts', 'comments'] });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_ADD');
      expect(sqlString).toContain('users');
      expect(sqlString).toContain('posts');
      expect(sqlString).toContain('comments');
    });
  });

  describe('doltCommit', () => {
    it('should commit with message only', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltCommit(mockDb)({ message: 'Initial commit' });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_COMMIT');
      expect(sqlString).toContain('-a');
      expect(sqlString).toContain('-m');
      expect(sqlString).toContain('Initial commit');
      expect(result).toBe('Commit successful');
    });

    it('should commit with message and author', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const author = { name: 'John Doe', email: 'john@example.com' };
      const result = await doltCommit(mockDb)({
        message: 'Add new feature',
        author,
      });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_COMMIT');
      expect(sqlString).toContain('-a');
      expect(sqlString).toContain('-m');
      expect(sqlString).toContain('Add new feature');
      expect(sqlString).toContain('--author');
      expect(sqlString).toContain('John Doe <john@example.com>');
      expect(result).toBe('Commit successful');
    });

    it('should escape single quotes in commit message', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltCommit(mockDb)({ message: "Fix user's profile" });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain("Fix user''s profile");
    });

    it('should handle multiline commit messages', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const multilineMessage = 'Add new feature\n\nThis includes:\n- Feature A\n- Feature B';
      await doltCommit(mockDb)({ message: multilineMessage });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_COMMIT');
      expect(sqlString).toContain('Add new feature');
    });
  });

  describe('doltLog', () => {
    it('should return commit log without parameters', async () => {
      const expectedLog = [
        {
          commit_hash: 'a1b2c3d4e5f6789012345678901234ab',
          committer: 'John Doe',
          email: 'john@example.com',
          date: new Date('2024-01-01'),
          message: 'Initial commit',
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedLog });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltLog(mockDb)();

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_LOG');
      expect(result).toEqual(expectedLog);
    });

    it('should return commit log for specific revision', async () => {
      const expectedLog = [
        {
          commit_hash: 'a1b2c3d4e5f6789012345678901234ab',
          committer: 'John Doe',
          email: 'john@example.com',
          date: new Date('2024-01-01'),
          message: 'Feature commit',
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedLog });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltLog(mockDb)({ revision: 'feature-branch' });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_LOG');
      expect(sqlString).toContain('feature-branch');
      expect(result).toEqual(expectedLog);
    });

    it('should limit the number of results', async () => {
      const allCommits = [
        {
          commit_hash: 'a1b2c3d4e5f6789012345678901234ab',
          committer: 'John Doe',
          email: 'john@example.com',
          date: new Date('2024-01-03'),
          message: 'Third commit',
        },
        {
          commit_hash: 'b2c3d4e5f6789012345678901234abcd',
          committer: 'Jane Smith',
          email: 'jane@example.com',
          date: new Date('2024-01-02'),
          message: 'Second commit',
        },
        {
          commit_hash: 'c3d4e5f6789012345678901234abcdef',
          committer: 'John Doe',
          email: 'john@example.com',
          date: new Date('2024-01-01'),
          message: 'First commit',
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: allCommits });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltLog(mockDb)({ limit: 2 });

      expect(result).toHaveLength(2);
      expect(result).toEqual(allCommits.slice(0, 2));
    });

    it('should return empty array when no commits exist', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltLog(mockDb)();

      expect(result).toEqual([]);
    });
  });

  describe('doltReset', () => {
    it('should perform soft reset by default', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltReset(mockDb)();

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_RESET');
    });

    it('should perform hard reset when specified', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltReset(mockDb)({ hard: true });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_RESET');
      expect(sqlString).toContain('--hard');
    });

    it('should reset specific table', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltReset(mockDb)({ tables: ['users'] });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_RESET');
      expect(sqlString).toContain('users');
    });

    it('should reset multiple tables', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltReset(mockDb)({ tables: ['users', 'posts'] });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_RESET');
      expect(sqlString).toContain('users');
      expect(sqlString).toContain('posts');
    });
  });

  describe('doltStatus', () => {
    it('should return status of working changes', async () => {
      const expectedStatus = [
        { table_name: 'users', staged: true, status: 'modified' },
        { table_name: 'posts', staged: false, status: 'new table' },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedStatus });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltStatus(mockDb)();

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('dolt_status');
      expect(result).toEqual(expectedStatus);
    });

    it('should return empty array when no changes', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltStatus(mockDb)();

      expect(result).toEqual([]);
    });
  });

  describe('doltHashOf', () => {
    it('should return hash of a branch', async () => {
      // Valid Dolt base32 hash (0-9, a-v)
      const expectedHash = 'a1b2c3d4e5f67890123456789012345v';

      const mockExecute = vi
        .fn()
        // Call 1: doltListBranches - returns branch list including 'main'
        .mockResolvedValueOnce({ rows: [{ name: 'main' }] })
        // Call 2: DOLT_LOG to get commit hash for branch
        .mockResolvedValueOnce({ rows: [{ commit_hash: expectedHash }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltHashOf(mockDb)({ revision: 'main' });

      expect(mockExecute).toHaveBeenCalledTimes(2);
      // First call checks branches
      const branchSql = getSqlString(mockExecute, 0);
      expect(branchSql).toContain('dolt_branches');
      // Second call gets commit hash from DOLT_LOG
      const logSql = getSqlString(mockExecute, 1);
      expect(logSql).toContain('DOLT_LOG');
      expect(logSql).toContain('main');
      expect(result).toBe(expectedHash);
    });

    it('should return hash of HEAD', async () => {
      // Valid Dolt base32 hash (0-9, a-v)
      const expectedHash = 'b2c3d4e5f67890123456789012345abv';

      const mockExecute = vi
        .fn()
        // Call 1: doltListBranches - HEAD is not a branch name
        .mockResolvedValueOnce({ rows: [{ name: 'main' }] })
        // Call 2: doltListTags - HEAD is not a tag name
        .mockResolvedValueOnce({ rows: [] })
        // Call 3: DOLT_HASHOF for HEAD
        .mockResolvedValueOnce({ rows: [{ hash: expectedHash }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltHashOf(mockDb)({ revision: 'HEAD' });

      expect(mockExecute).toHaveBeenCalledTimes(3);
      // Third call uses DOLT_HASHOF
      const hashOfSql = getSqlString(mockExecute, 2);
      expect(hashOfSql).toContain('DOLT_HASHOF');
      expect(hashOfSql).toContain('HEAD');
      expect(result).toBe(expectedHash);
    });

    it('should return hash directly if already a valid commit hash', async () => {
      // Valid Dolt base32 hash (0-9, a-v) - 32 chars
      const commitHash = 'c3d4e5f67890123456789012345abcdv';

      const mockExecute = vi.fn();

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltHashOf(mockDb)({ revision: commitHash });

      // No DB calls should be made when the revision is already a valid hash
      expect(mockExecute).not.toHaveBeenCalled();
      expect(result).toBe(commitHash);
    });

    it('should return hash from tag', async () => {
      const tagHash = 'd4e5f678901234567890123456789abc';
      // This hash intentionally contains 'x' which is NOT valid base32
      // so it won't be treated as a commit hash

      const mockExecute = vi
        .fn()
        // Call 1: doltListBranches - 'v1.0.0' is not a branch
        .mockResolvedValueOnce({ rows: [{ name: 'main' }] })
        // Call 2: doltListTags - returns matching tag
        .mockResolvedValueOnce({ rows: [{ tag_name: 'v1.0.0', tag_hash: tagHash }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltHashOf(mockDb)({ revision: 'v1.0.0' });

      expect(mockExecute).toHaveBeenCalledTimes(2);
      expect(result).toBe(tagHash);
    });
  });

  describe('doltTag', () => {
    it('should create a tag with name only', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltTag(mockDb)({ name: 'v1.0.0' });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_TAG');
      expect(sqlString).toContain('v1.0.0');
    });

    it('should create a tag with message', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltTag(mockDb)({ name: 'v1.0.0', message: 'Release version 1.0.0' });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_TAG');
      expect(sqlString).toContain('v1.0.0');
      expect(sqlString).toContain('Release version 1.0.0');
    });

    it('should create a tag at specific revision', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltTag(mockDb)({ name: 'v1.0.0', revision: 'main' });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_TAG');
      expect(sqlString).toContain('v1.0.0');
      expect(sqlString).toContain('main');
    });

    it('should escape single quotes in tag message', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltTag(mockDb)({ name: 'v1.0.0', message: "John's release" });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain("John''s release");
    });
  });

  describe('doltDeleteTag', () => {
    it('should delete a tag', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltDeleteTag(mockDb)({ name: 'v1.0.0' });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_TAG');
      expect(sqlString).toContain('-d');
      expect(sqlString).toContain('v1.0.0');
    });
  });

  describe('doltListTags', () => {
    it('should return list of tags', async () => {
      const expectedTags = [
        {
          tag_name: 'v1.0.0',
          tag_hash: 'a1b2c3d4e5f6789012345678901234ab',
          tagger: 'John Doe',
          date: new Date('2024-01-01'),
          message: 'Release 1.0.0',
        },
        {
          tag_name: 'v0.9.0',
          tag_hash: 'b2c3d4e5f6789012345678901234abcd',
          tagger: 'Jane Smith',
          date: new Date('2023-12-01'),
          message: 'Beta release',
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedTags });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltListTags(mockDb)();

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('dolt_tags');
      expect(result).toEqual(expectedTags);
    });

    it('should return empty array when no tags exist', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltListTags(mockDb)();

      expect(result).toEqual([]);
    });
  });
});
