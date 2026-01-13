import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  doltConflicts,
  doltMerge,
  doltMergeStatus,
  doltResolveConflicts,
  doltSchemaConflicts,
  doltTableConflicts,
} from '../../dolt/merge';
import { testManageDbClient } from '../setup';
import { getSqlString } from './test-utils';

describe('Merge Module', () => {
  let db: AgentsManageDatabaseClient;

  beforeEach(() => {
    db = testManageDbClient;
    vi.clearAllMocks();
  });

  describe('doltMerge', () => {
    it('should successfully merge without conflicts', async () => {
      const fromBranch = 'feature-branch';
      const toBranch = 'main';
      const headHash = 'a1b2c3d4e5f6789012345678901234ab';

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // DOLT_CHECKOUT
        .mockResolvedValueOnce({ rows: [{ hash: headHash }] }) // HASHOF('HEAD')
        .mockResolvedValueOnce({ rows: [{ conflicts: 0, fast_forward: 0, hash: headHash, message: '' }] }); // DOLT_MERGE

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltMerge(mockDb)({
        fromBranch,
        toBranch,
      });

      expect(result).toEqual({
        status: 'success',
        from: fromBranch,
        to: toBranch,
        toHead: headHash,
        hasConflicts: false,
      });
    });

    it('should detect conflicts during merge', async () => {
      const fromBranch = 'feature-branch';
      const toBranch = 'main';
      const headHash = 'a1b2c3d4e5f6789012345678901234ab';

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // DOLT_CHECKOUT
        .mockResolvedValueOnce({ rows: [{ hash: headHash }] }) // HASHOF('HEAD')
        .mockResolvedValueOnce({ rows: [{ conflicts: 5, fast_forward: 0, hash: headHash, message: '' }] }); // DOLT_MERGE

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltMerge(mockDb)({
        fromBranch,
        toBranch,
      });

      expect(result).toEqual({
        status: 'conflicts',
        from: fromBranch,
        to: toBranch,
        toHead: headHash,
        hasConflicts: true,
      });
    });

    it('should merge with custom message', async () => {
      const fromBranch = 'feature';
      const toBranch = 'main';
      const headHash = 'a1b2c3d4e5f6789012345678901234ab';

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ hash: headHash }] })
        .mockResolvedValueOnce({ rows: [{ conflicts: 0, fast_forward: 0, hash: headHash, message: '' }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltMerge(mockDb)({
        fromBranch,
        toBranch,
        message: 'Merge feature into main',
      });

      expect(mockExecute).toHaveBeenCalled();
      const mergeCallIndex = 2;
      const sqlString = getSqlString(mockExecute, mergeCallIndex);
      expect(sqlString).toContain('DOLT_MERGE');
      expect(sqlString).toContain('-m');
      expect(sqlString).toContain('Merge feature into main');
    });

    it('should merge with no-fast-forward option', async () => {
      const fromBranch = 'feature';
      const toBranch = 'main';
      const headHash = 'a1b2c3d4e5f6789012345678901234ab';

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ hash: headHash }] })
        .mockResolvedValueOnce({ rows: [{ conflicts: 0, fast_forward: 0, hash: headHash, message: '' }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltMerge(mockDb)({
        fromBranch,
        toBranch,
        noFastForward: true,
      });

      expect(mockExecute).toHaveBeenCalled();
      const mergeCallIndex = 2;
      const sqlString = getSqlString(mockExecute, mergeCallIndex);
      expect(sqlString).toContain('--no-ff');
    });

    it('should escape single quotes in merge message', async () => {
      const fromBranch = 'feature';
      const toBranch = 'main';
      const headHash = 'a1b2c3d4e5f6789012345678901234ab';

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ hash: headHash }] })
        .mockResolvedValueOnce({ rows: [{ conflicts: 0, fast_forward: 0, hash: headHash, message: '' }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltMerge(mockDb)({
        fromBranch,
        toBranch,
        message: "Merge John's feature",
      });

      expect(mockExecute).toHaveBeenCalled();
      const mergeCallIndex = 2;
      const sqlString = getSqlString(mockExecute, mergeCallIndex);
      expect(sqlString).toContain("Merge John''s feature");
    });

    it('should checkout target branch before merging', async () => {
      const fromBranch = 'feature';
      const toBranch = 'develop';
      const headHash = 'a1b2c3d4e5f6789012345678901234ab';

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ hash: headHash }] })
        .mockResolvedValueOnce({ rows: [{ conflicts: 0, fast_forward: 0, hash: headHash, message: '' }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltMerge(mockDb)({
        fromBranch,
        toBranch,
      });

      expect(mockExecute).toHaveBeenCalled();
      const checkoutCallIndex = 0;
      const sqlString = getSqlString(mockExecute, checkoutCallIndex);
      expect(sqlString).toContain('DOLT_CHECKOUT');
      expect(sqlString).toContain('develop');
    });

    it('should not enable commit with conflicts', async () => {
      const fromBranch = 'feature';
      const toBranch = 'main';
      const headHash = 'a1b2c3d4e5f6789012345678901234ab';

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ hash: headHash }] })
        .mockResolvedValueOnce({ rows: [{ conflicts: 0, fast_forward: 0, hash: headHash, message: '' }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltMerge(mockDb)({
        fromBranch,
        toBranch,
      });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute, 0) + getSqlString(mockExecute, 1) + getSqlString(mockExecute, 2);
      expect(sqlString).not.toContain('dolt_allow_commit_conflicts');
    });
  });

  describe('doltMergeStatus', () => {
    it('should return not merging when no merge in progress', async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        rows: [{ is_merging: false }],
      });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltMergeStatus(mockDb)();

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_MERGE_STATUS');
      expect(result).toEqual({ isMerging: false });
    });

    it('should return merge status when merge in progress', async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        rows: [
          {
            is_merging: true,
            source: 'feature-branch',
            target: 'main',
            unmerged_tables: 'users,posts',
          },
        ],
      });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltMergeStatus(mockDb)();

      expect(result).toEqual({
        isMerging: true,
        source: 'feature-branch',
        target: 'main',
        unmergedTables: ['users', 'posts'],
      });
    });

    it('should handle empty result', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltMergeStatus(mockDb)();

      expect(result).toEqual({ isMerging: false });
    });

    it('should handle null unmerged tables', async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        rows: [
          {
            is_merging: true,
            source: 'feature',
            target: 'main',
            unmerged_tables: null,
          },
        ],
      });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltMergeStatus(mockDb)();

      expect(result).toEqual({
        isMerging: true,
        source: 'feature',
        target: 'main',
        unmergedTables: [],
      });
    });
  });

  describe('doltConflicts', () => {
    it('should return list of tables with conflicts', async () => {
      const expectedConflicts = [
        { table: 'users', numConflicts: 3 },
        { table: 'posts', numConflicts: 1 },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedConflicts });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltConflicts(mockDb)();

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('dolt_conflicts');
      expect(result).toEqual(expectedConflicts);
    });

    it('should return empty array when no conflicts', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltConflicts(mockDb)();

      expect(result).toEqual([]);
    });
  });

  describe('doltTableConflicts', () => {
    it('should return conflicts for specific table', async () => {
      const expectedConflicts = [
        {
          base_id: '1',
          base_name: 'John',
          our_id: '1',
          our_name: 'John Updated',
          their_id: '1',
          their_name: 'John Modified',
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedConflicts });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltTableConflicts(mockDb)({ tableName: 'users' });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('dolt_conflicts_users');
      expect(result).toEqual(expectedConflicts);
    });

    it('should handle table with no conflicts', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltTableConflicts(mockDb)({ tableName: 'posts' });

      expect(result).toEqual([]);
    });

    it('should query correct table-specific conflicts table', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltTableConflicts(mockDb)({ tableName: 'complex_table_name' });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('dolt_conflicts_complex_table_name');
    });
  });

  describe('doltSchemaConflicts', () => {
    it('should return schema conflicts', async () => {
      const expectedConflicts = [
        {
          table_name: 'users',
          base_schema: 'CREATE TABLE users (id INT)',
          our_schema: 'CREATE TABLE users (id INT, name VARCHAR(100))',
          their_schema: 'CREATE TABLE users (id INT, email VARCHAR(100))',
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedConflicts });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltSchemaConflicts(mockDb)();

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('dolt_schema_conflicts');
      expect(result).toEqual(expectedConflicts);
    });

    it('should return empty array when no schema conflicts', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltSchemaConflicts(mockDb)();

      expect(result).toEqual([]);
    });
  });

  describe('doltResolveConflicts', () => {
    it('should resolve conflicts with "ours" strategy', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltResolveConflicts(mockDb)({
        tableName: 'users',
        strategy: 'ours',
      });

      expect(mockExecute).toHaveBeenCalled();
      const resolveCallIndex = 1;
      const sqlString = getSqlString(mockExecute, resolveCallIndex);
      expect(sqlString).toContain('DOLT_CONFLICTS_RESOLVE');
      expect(sqlString).toContain('--ours');
      expect(sqlString).toContain('users');
    });

    it('should resolve conflicts with "theirs" strategy', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltResolveConflicts(mockDb)({
        tableName: 'posts',
        strategy: 'theirs',
      });

      expect(mockExecute).toHaveBeenCalled();
      const resolveCallIndex = 1;
      const sqlString = getSqlString(mockExecute, resolveCallIndex);
      expect(sqlString).toContain('DOLT_CONFLICTS_RESOLVE');
      expect(sqlString).toContain('--theirs');
      expect(sqlString).toContain('posts');
    });

    it('should enable commit with conflicts before resolving', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltResolveConflicts(mockDb)({
        tableName: 'users',
        strategy: 'ours',
      });

      expect(mockExecute).toHaveBeenCalled();
      const setCallIndex = 0;
      const sqlString = getSqlString(mockExecute, setCallIndex);
      expect(sqlString).toContain('dolt_allow_commit_conflicts');
    });

    it('should handle different table names', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltResolveConflicts(mockDb)({
        tableName: 'complex_table_name_123',
        strategy: 'ours',
      });

      expect(mockExecute).toHaveBeenCalled();
      const resolveCallIndex = 1;
      const sqlString = getSqlString(mockExecute, resolveCallIndex);
      expect(sqlString).toContain('complex_table_name_123');
    });
  });
});
