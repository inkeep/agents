import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '../../db/client';
import { doltDiff, doltDiffSummary } from '../../dolt/diff';
import { testDbClient } from '../setup';
import { getSqlString } from './test-utils';

describe('Diff Module', () => {
  let db: DatabaseClient;

  beforeEach(() => {
    db = testDbClient;
    vi.clearAllMocks();
  });

  describe('doltDiff', () => {
    it('should return diff between two commits for a table', async () => {
      const expectedDiff = [
        {
          to_id: '1',
          to_name: 'John Updated',
          from_id: '1',
          from_name: 'John',
          diff_type: 'modified',
        },
        {
          to_id: '2',
          to_name: 'Jane',
          from_id: null,
          from_name: null,
          diff_type: 'added',
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedDiff });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltDiff(mockDb)({
        fromRevision: 'main',
        toRevision: 'feature-branch',
        tableName: 'users',
      });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_DIFF');
      expect(sqlString).toContain('main');
      expect(sqlString).toContain('feature-branch');
      expect(sqlString).toContain('users');
      expect(result).toEqual(expectedDiff);
    });

    it('should handle diff with commit hashes', async () => {
      const fromHash = 'a1b2c3d4e5f6789012345678901234ab';
      const toHash = 'b2c3d4e5f6789012345678901234abcd';

      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltDiff(mockDb)({
        fromRevision: fromHash,
        toRevision: toHash,
        tableName: 'users',
      });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_DIFF');
      expect(sqlString).toContain(fromHash);
      expect(sqlString).toContain(toHash);
      expect(sqlString).toContain('users');
    });

    it('should handle diff with HEAD and working set', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltDiff(mockDb)({
        fromRevision: 'HEAD',
        toRevision: 'WORKING',
        tableName: 'users',
      });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_DIFF');
      expect(sqlString).toContain('HEAD');
      expect(sqlString).toContain('WORKING');
    });

    it('should return empty array when no differences', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltDiff(mockDb)({
        fromRevision: 'main',
        toRevision: 'main',
        tableName: 'users',
      });

      expect(result).toEqual([]);
    });

    it('should handle different table names', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltDiff(mockDb)({
        fromRevision: 'main',
        toRevision: 'feature',
        tableName: 'complex_table_name_123',
      });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('complex_table_name_123');
    });
  });

  describe('doltDiffSummary', () => {
    it('should return diff summary for all tables', async () => {
      const expectedSummary = [
        {
          table_name: 'users',
          diff_type: 'modified',
          data_change: true,
          schema_change: false,
        },
        {
          table_name: 'posts',
          diff_type: 'added',
          data_change: true,
          schema_change: true,
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedSummary });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltDiffSummary(mockDb)({
        fromRevision: 'main',
        toRevision: 'feature-branch',
      });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_DIFF_SUMMARY');
      expect(sqlString).toContain('main');
      expect(sqlString).toContain('feature-branch');
      expect(result).toEqual(expectedSummary);
    });

    it('should return diff summary for specific table', async () => {
      const expectedSummary = [
        {
          table_name: 'users',
          diff_type: 'modified',
          data_change: true,
          schema_change: false,
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedSummary });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltDiffSummary(mockDb)({
        fromRevision: 'main',
        toRevision: 'feature-branch',
        tableName: 'users',
      });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_DIFF_SUMMARY');
      expect(sqlString).toContain('main');
      expect(sqlString).toContain('feature-branch');
      expect(sqlString).toContain('users');
      expect(result).toEqual(expectedSummary);
    });

    it('should handle diff summary with commit hashes', async () => {
      const fromHash = 'a1b2c3d4e5f6789012345678901234ab';
      const toHash = 'b2c3d4e5f6789012345678901234abcd';

      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltDiffSummary(mockDb)({
        fromRevision: fromHash,
        toRevision: toHash,
      });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_DIFF_SUMMARY');
      expect(sqlString).toContain(fromHash);
      expect(sqlString).toContain(toHash);
    });

    it('should return empty array when no differences', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltDiffSummary(mockDb)({
        fromRevision: 'main',
        toRevision: 'main',
      });

      expect(result).toEqual([]);
    });

    it('should identify schema changes only', async () => {
      const expectedSummary = [
        {
          table_name: 'users',
          diff_type: 'modified',
          data_change: false,
          schema_change: true,
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedSummary });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltDiffSummary(mockDb)({
        fromRevision: 'main',
        toRevision: 'feature-branch',
        tableName: 'users',
      });

      expect(result).toEqual(expectedSummary);
      expect(result[0].schema_change).toBe(true);
      expect(result[0].data_change).toBe(false);
    });

    it('should identify data changes only', async () => {
      const expectedSummary = [
        {
          table_name: 'posts',
          diff_type: 'modified',
          data_change: true,
          schema_change: false,
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedSummary });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltDiffSummary(mockDb)({
        fromRevision: 'v1.0.0',
        toRevision: 'v1.1.0',
        tableName: 'posts',
      });

      expect(result).toEqual(expectedSummary);
      expect(result[0].schema_change).toBe(false);
      expect(result[0].data_change).toBe(true);
    });

    it('should identify both schema and data changes', async () => {
      const expectedSummary = [
        {
          table_name: 'comments',
          diff_type: 'modified',
          data_change: true,
          schema_change: true,
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedSummary });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltDiffSummary(mockDb)({
        fromRevision: 'v1.0.0',
        toRevision: 'v2.0.0',
        tableName: 'comments',
      });

      expect(result).toEqual(expectedSummary);
      expect(result[0].schema_change).toBe(true);
      expect(result[0].data_change).toBe(true);
    });

    it('should identify added tables', async () => {
      const expectedSummary = [
        {
          table_name: 'new_table',
          diff_type: 'added',
          data_change: true,
          schema_change: true,
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedSummary });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltDiffSummary(mockDb)({
        fromRevision: 'main',
        toRevision: 'feature',
      });

      expect(result[0].diff_type).toBe('added');
    });

    it('should identify removed tables', async () => {
      const expectedSummary = [
        {
          table_name: 'old_table',
          diff_type: 'removed',
          data_change: true,
          schema_change: true,
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedSummary });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltDiffSummary(mockDb)({
        fromRevision: 'feature',
        toRevision: 'main',
      });

      expect(result[0].diff_type).toBe('removed');
    });
  });
});
