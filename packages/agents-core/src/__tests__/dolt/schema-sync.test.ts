import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  areBranchesSchemaCompatible,
  ensureSchemaSync,
  formatSchemaDiffSummary,
  getActiveBranch,
  getSchemaDiff,
  hasSchemaDifferences,
  hasUncommittedChanges,
  SCHEMA_SOURCE_BRANCH,
  type SchemaDiff,
  syncSchemaFromMain,
} from '../../dolt/schema-sync';
import { testManageDbClient } from '../setup';
import { getSqlString } from './test-utils';

describe('Schema Sync Module', () => {
  let db: AgentsManageDatabaseClient;

  beforeEach(() => {
    db = testManageDbClient;
    vi.clearAllMocks();
  });

  describe('getActiveBranch', () => {
    it('should return the currently active branch', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [{ branch: 'feature-branch' }] });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await getActiveBranch(mockDb)();

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('active_branch()');
      expect(result).toBe('feature-branch');
    });
  });

  describe('getSchemaDiff', () => {
    it('should return schema differences between target branch and main', async () => {
      const mockDiffs = [
        {
          from_table_name: 'public.agent',
          to_table_name: 'public.agent',
          from_create_statement: 'CREATE TABLE agent (id varchar)',
          to_create_statement: 'CREATE TABLE agent (id varchar, name varchar)',
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: mockDiffs });
      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await getSchemaDiff(mockDb)('feature-branch');

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('dolt_schema_diff');
      expect(sqlString).toContain('feature-branch');
      expect(sqlString).toContain(SCHEMA_SOURCE_BRANCH);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        fromTableName: 'public.agent',
        toTableName: 'public.agent',
        fromCreateStatement: 'CREATE TABLE agent (id varchar)',
        toCreateStatement: 'CREATE TABLE agent (id varchar, name varchar)',
      });
    });

    it('should return empty array when no differences exist', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await getSchemaDiff(mockDb)('feature-branch');

      expect(result).toEqual([]);
    });
  });

  describe('hasSchemaDifferences', () => {
    it('should return true when schema differences exist', async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        rows: [
          {
            from_table_name: 'public.agent',
            to_table_name: 'public.agent',
            from_create_statement: 'CREATE TABLE ...',
            to_create_statement: 'CREATE TABLE ...',
          },
        ],
      });
      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await hasSchemaDifferences(mockDb)('feature-branch');

      expect(result).toBe(true);
    });

    it('should return false when no schema differences exist', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await hasSchemaDifferences(mockDb)('feature-branch');

      expect(result).toBe(false);
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return true when there are uncommitted changes', async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        rows: [{ table_name: 'agent', staged: false, status: 'modified' }],
      });
      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await hasUncommittedChanges(mockDb)();

      expect(result).toBe(true);
    });

    it('should return false when there are no uncommitted changes', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await hasUncommittedChanges(mockDb)();

      expect(result).toBe(false);
    });
  });

  describe('syncSchemaFromMain', () => {
    it('should not sync when already on schema source branch', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [{ branch: SCHEMA_SOURCE_BRANCH }] });
      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await syncSchemaFromMain(mockDb)();

      expect(result.synced).toBe(true);
      expect(result.hadDifferences).toBe(false);
      expect(result.error).toContain('already on schema source branch');
    });

    it('should not sync when no schema differences exist', async () => {
      const mockExecute = vi
        .fn()
        // First call: active_branch()
        .mockResolvedValueOnce({ rows: [{ branch: 'feature-branch' }] })
        // Second call: pg_try_advisory_lock
        .mockResolvedValueOnce({ rows: [{ acquired: true }] })
        // Third call: dolt_schema_diff (re-check after lock)
        .mockResolvedValueOnce({ rows: [] })
        // Fourth call: pg_advisory_unlock
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await syncSchemaFromMain(mockDb)();

      expect(result.synced).toBe(false);
      expect(result.hadDifferences).toBe(false);
    });

    it('should return error when uncommitted changes exist and autoCommitPending is false', async () => {
      const mockExecute = vi
        .fn()
        // active_branch()
        .mockResolvedValueOnce({ rows: [{ branch: 'feature-branch' }] })
        // pg_try_advisory_lock
        .mockResolvedValueOnce({ rows: [{ acquired: true }] })
        // dolt_schema_diff (re-check after lock) - has differences
        .mockResolvedValueOnce({
          rows: [
            {
              from_table_name: 'public.agent',
              to_table_name: 'public.agent',
              from_create_statement: 'CREATE TABLE ...',
              to_create_statement: 'CREATE TABLE ... modified',
            },
          ],
        })
        // dolt_status - has uncommitted changes
        .mockResolvedValueOnce({
          rows: [{ table_name: 'agent', staged: false, status: 'modified' }],
        })
        // pg_advisory_unlock
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await syncSchemaFromMain(mockDb)({ autoCommitPending: false });

      expect(result.synced).toBe(false);
      expect(result.hadDifferences).toBe(true);
      expect(result.error).toContain('uncommitted changes exist');
    });

    it('should sync schema successfully when differences exist', async () => {
      const mockExecute = vi
        .fn()
        // active_branch()
        .mockResolvedValueOnce({ rows: [{ branch: 'feature-branch' }] })
        // pg_try_advisory_lock
        .mockResolvedValueOnce({ rows: [{ acquired: true }] })
        // dolt_schema_diff (re-check after lock) - has differences
        .mockResolvedValueOnce({
          rows: [
            {
              from_table_name: 'public.agent',
              to_table_name: 'public.agent',
              from_create_statement: 'CREATE TABLE ...',
              to_create_statement: 'CREATE TABLE ... modified',
            },
          ],
        })
        // dolt_status - no uncommitted changes
        .mockResolvedValueOnce({ rows: [] })
        // dolt_checkout for merge (from doltMerge)
        .mockResolvedValueOnce({ rows: [] })
        // HASHOF('HEAD') for merge
        .mockResolvedValueOnce({ rows: [{ hash: 'abc123' }] })
        // DOLT_MERGE
        .mockResolvedValueOnce({ rows: [{ conflicts: 0 }] })
        // dolt_log for commit hash
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'def456' }] })
        // pg_advisory_unlock
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await syncSchemaFromMain(mockDb)();

      expect(result.synced).toBe(true);
      expect(result.hadDifferences).toBe(true);
      expect(result.mergeCommitHash).toBe('def456');
    });

    it('should abort merge and return error when conflicts occur', async () => {
      const mockExecute = vi
        .fn()
        // active_branch()
        .mockResolvedValueOnce({ rows: [{ branch: 'feature-branch' }] })
        // pg_try_advisory_lock
        .mockResolvedValueOnce({ rows: [{ acquired: true }] })
        // dolt_schema_diff (re-check after lock) - has differences
        .mockResolvedValueOnce({
          rows: [
            {
              from_table_name: 'public.agent',
              to_table_name: 'public.agent',
              from_create_statement: 'CREATE TABLE ...',
              to_create_statement: 'CREATE TABLE ... modified',
            },
          ],
        })
        // dolt_status - no uncommitted changes
        .mockResolvedValueOnce({ rows: [] })
        // dolt_checkout for merge
        .mockResolvedValueOnce({ rows: [] })
        // HASHOF('HEAD')
        .mockResolvedValueOnce({ rows: [{ hash: 'abc123' }] })
        // DOLT_MERGE - has conflicts
        .mockResolvedValueOnce({ rows: [{ conflicts: 2 }] })
        // DOLT_MERGE --abort
        .mockResolvedValueOnce({ rows: [] })
        // pg_advisory_unlock
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await syncSchemaFromMain(mockDb)();

      expect(result.synced).toBe(false);
      expect(result.hadDifferences).toBe(true);
      expect(result.error).toContain('conflicts');
    });

    it('should skip sync when lock is not acquired (another request is syncing)', async () => {
      const mockExecute = vi
        .fn()
        // active_branch()
        .mockResolvedValueOnce({ rows: [{ branch: 'feature-branch' }] })
        // pg_try_advisory_lock - lock not acquired
        .mockResolvedValueOnce({ rows: [{ acquired: false }] });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await syncSchemaFromMain(mockDb)();

      expect(result.synced).toBe(false);
      expect(result.hadDifferences).toBe(true);
      expect(result.skippedDueToLock).toBe(true);
    });
  });

  describe('ensureSchemaSync', () => {
    it('should return no differences when on schema source branch', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [{ branch: SCHEMA_SOURCE_BRANCH }] });
      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await ensureSchemaSync(mockDb)();

      expect(result.synced).toBe(false);
      expect(result.hadDifferences).toBe(false);
    });

    it('should return differences info without syncing when autoSync is false', async () => {
      const mockExecute = vi
        .fn()
        // active_branch()
        .mockResolvedValueOnce({ rows: [{ branch: 'feature-branch' }] })
        // dolt_schema_diff
        .mockResolvedValueOnce({
          rows: [
            {
              from_table_name: 'public.agent',
              to_table_name: 'public.agent',
              from_create_statement: 'CREATE TABLE ...',
              to_create_statement: 'CREATE TABLE ... modified',
            },
          ],
        });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await ensureSchemaSync(mockDb)({ autoSync: false });

      expect(result.synced).toBe(false);
      expect(result.hadDifferences).toBe(true);
      expect(result.differences).toHaveLength(1);
      expect(result.error).toContain('schema difference');
    });

    it('should sync schema when autoSync is true and differences exist', async () => {
      const mockExecute = vi
        .fn()
        // active_branch() for ensureSchemaSync
        .mockResolvedValueOnce({ rows: [{ branch: 'feature-branch' }] })
        // dolt_schema_diff for ensureSchemaSync
        .mockResolvedValueOnce({
          rows: [
            {
              from_table_name: 'public.agent',
              to_table_name: 'public.agent',
              from_create_statement: 'CREATE TABLE ...',
              to_create_statement: 'CREATE TABLE ... modified',
            },
          ],
        })
        // active_branch() for syncSchemaFromMain
        .mockResolvedValueOnce({ rows: [{ branch: 'feature-branch' }] })
        // pg_try_advisory_lock
        .mockResolvedValueOnce({ rows: [{ acquired: true }] })
        // dolt_schema_diff for syncSchemaFromMain (re-check after lock)
        .mockResolvedValueOnce({
          rows: [
            {
              from_table_name: 'public.agent',
              to_table_name: 'public.agent',
              from_create_statement: 'CREATE TABLE ...',
              to_create_statement: 'CREATE TABLE ... modified',
            },
          ],
        })
        // dolt_status
        .mockResolvedValueOnce({ rows: [] })
        // dolt_checkout
        .mockResolvedValueOnce({ rows: [] })
        // HASHOF
        .mockResolvedValueOnce({ rows: [{ hash: 'abc' }] })
        // DOLT_MERGE
        .mockResolvedValueOnce({ rows: [{ conflicts: 0 }] })
        // dolt_log
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'merged123' }] })
        // pg_advisory_unlock
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await ensureSchemaSync(mockDb)({ autoSync: true });

      expect(result.synced).toBe(true);
      expect(result.hadDifferences).toBe(true);
      expect(result.mergeCommitHash).toBe('merged123');
    });
  });

  describe('formatSchemaDiffSummary', () => {
    it('should return "No schema differences" when array is empty', () => {
      const result = formatSchemaDiffSummary([]);

      expect(result).toBe('No schema differences');
    });

    it('should format single modified table', () => {
      const diffs: SchemaDiff[] = [
        {
          fromTableName: 'public.agent',
          toTableName: 'public.agent',
          fromCreateStatement: 'CREATE TABLE ...',
          toCreateStatement: 'CREATE TABLE ... modified',
        },
      ];

      const result = formatSchemaDiffSummary(diffs);

      expect(result).toContain('1 table(s) with schema differences');
      expect(result).toContain('public.agent (modified)');
    });

    it('should identify added tables', () => {
      const diffs: SchemaDiff[] = [
        {
          fromTableName: '',
          toTableName: 'public.new_table',
          fromCreateStatement: '',
          toCreateStatement: 'CREATE TABLE new_table ...',
        },
      ];

      const result = formatSchemaDiffSummary(diffs);

      expect(result).toContain('public.new_table (added)');
    });

    it('should identify removed tables', () => {
      const diffs: SchemaDiff[] = [
        {
          fromTableName: 'public.old_table',
          toTableName: '',
          fromCreateStatement: 'CREATE TABLE old_table ...',
          toCreateStatement: '',
        },
      ];

      const result = formatSchemaDiffSummary(diffs);

      expect(result).toContain('public.old_table (removed)');
    });

    it('should format multiple tables', () => {
      const diffs: SchemaDiff[] = [
        {
          fromTableName: 'public.agent',
          toTableName: 'public.agent',
          fromCreateStatement: 'CREATE TABLE ...',
          toCreateStatement: 'CREATE TABLE ... modified',
        },
        {
          fromTableName: '',
          toTableName: 'public.new_table',
          fromCreateStatement: '',
          toCreateStatement: 'CREATE TABLE ...',
        },
      ];

      const result = formatSchemaDiffSummary(diffs);

      expect(result).toContain('2 table(s) with schema differences');
      expect(result).toContain('public.agent (modified)');
      expect(result).toContain('public.new_table (added)');
    });
  });

  describe('areBranchesSchemaCompatible', () => {
    it('should return compatible when both branches have no differences from main', async () => {
      const mockExecute = vi
        .fn()
        // dolt_schema_diff for branchA
        .mockResolvedValueOnce({ rows: [] })
        // dolt_schema_diff for branchB
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await areBranchesSchemaCompatible(mockDb)('branch-a', 'branch-b');

      expect(result.compatible).toBe(true);
      expect(result.branchADifferences).toEqual([]);
      expect(result.branchBDifferences).toEqual([]);
    });

    it('should return incompatible when branchA has differences', async () => {
      const mockExecute = vi
        .fn()
        // dolt_schema_diff for branchA - has differences
        .mockResolvedValueOnce({
          rows: [
            {
              from_table_name: 'public.agent',
              to_table_name: 'public.agent',
              from_create_statement: 'CREATE TABLE ...',
              to_create_statement: 'CREATE TABLE ... modified',
            },
          ],
        })
        // dolt_schema_diff for branchB - no differences
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await areBranchesSchemaCompatible(mockDb)('branch-a', 'branch-b');

      expect(result.compatible).toBe(false);
      expect(result.branchADifferences).toHaveLength(1);
      expect(result.branchBDifferences).toEqual([]);
    });

    it('should return incompatible when both branches have differences', async () => {
      const schemaDiff = {
        from_table_name: 'public.agent',
        to_table_name: 'public.agent',
        from_create_statement: 'CREATE TABLE ...',
        to_create_statement: 'CREATE TABLE ... modified',
      };

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce({ rows: [schemaDiff] })
        .mockResolvedValueOnce({ rows: [schemaDiff] });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await areBranchesSchemaCompatible(mockDb)('branch-a', 'branch-b');

      expect(result.compatible).toBe(false);
      expect(result.branchADifferences).toHaveLength(1);
      expect(result.branchBDifferences).toHaveLength(1);
    });
  });
});
