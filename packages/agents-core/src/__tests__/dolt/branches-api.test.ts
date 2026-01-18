import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  checkoutBranch,
  createBranch,
  deleteBranch,
  getBranch,
  getTenantMainBranch,
  isProtectedBranchName,
  listBranches,
  MAIN_BRANCH_SUFFIX,
} from '../../dolt/branches-api';
import { testManageDbClient } from '../setup';
import { getSqlString } from './test-utils';

describe('Branches API Module', () => {
  let db: AgentsManageDatabaseClient;

  beforeEach(() => {
    db = testManageDbClient;
    vi.clearAllMocks();
  });

  describe('getTenantMainBranch', () => {
    it('should return tenant-scoped main branch name', () => {
      const result = getTenantMainBranch('tenant-123');
      expect(result).toBe('tenant-123_main');
    });
  });

  describe('isProtectedBranchName', () => {
    it('should return true for main branch', () => {
      expect(isProtectedBranchName('main')).toBe(true);
    });

    it('should return false for non-protected branches', () => {
      expect(isProtectedBranchName('feature-x')).toBe(false);
      expect(isProtectedBranchName('develop')).toBe(false);
    });
  });

  describe('checkoutBranch', () => {
    it('should checkout branch and sync schema by default', async () => {
      const mockExecute = vi
        .fn()
        // dolt_branches - verify branch exists
        .mockResolvedValueOnce({
          rows: [
            { name: 'tenant1_project1_feature-x', hash: 'abc123', latest_commit_date: new Date() },
          ],
        })
        // DOLT_CHECKOUT
        .mockResolvedValueOnce({ rows: [] })
        // active_branch() for ensureSchemaSync
        .mockResolvedValueOnce({ rows: [{ branch: 'tenant1_project1_feature-x' }] })
        // dolt_schema_diff - no differences
        .mockResolvedValueOnce({ rows: [] })
        // dolt_branches - get updated branch info
        .mockResolvedValueOnce({
          rows: [
            { name: 'tenant1_project1_feature-x', hash: 'abc123', latest_commit_date: new Date() },
          ],
        });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await checkoutBranch(mockDb)({
        branchName: 'tenant1_project1_feature-x',
      });

      expect(result.branchName).toBe('tenant1_project1_feature-x');
      expect(result.hash).toBe('abc123');
      expect(result.schemaSync.performed).toBe(false);
      expect(result.schemaSync.hadDifferences).toBe(false);
    });

    it('should checkout branch and perform schema sync when differences exist', async () => {
      const mockExecute = vi
        .fn()
        // dolt_branches - verify branch exists
        .mockResolvedValueOnce({
          rows: [
            { name: 'tenant1_project1_feature-x', hash: 'abc123', latest_commit_date: new Date() },
          ],
        })
        // DOLT_CHECKOUT
        .mockResolvedValueOnce({ rows: [] })
        // active_branch() for ensureSchemaSync
        .mockResolvedValueOnce({ rows: [{ branch: 'tenant1_project1_feature-x' }] })
        // dolt_schema_diff - has differences
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
        .mockResolvedValueOnce({ rows: [{ branch: 'tenant1_project1_feature-x' }] })
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
        // dolt_status - no uncommitted changes
        .mockResolvedValueOnce({ rows: [] })
        // DOLT_CHECKOUT for merge
        .mockResolvedValueOnce({ rows: [] })
        // HASHOF
        .mockResolvedValueOnce({ rows: [{ hash: 'before-merge' }] })
        // DOLT_MERGE
        .mockResolvedValueOnce({ rows: [{ conflicts: 0 }] })
        // dolt_log for commit hash
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'after-merge' }] })
        // pg_advisory_unlock
        .mockResolvedValueOnce({ rows: [] })
        // dolt_branches - get updated branch info
        .mockResolvedValueOnce({
          rows: [
            {
              name: 'tenant1_project1_feature-x',
              hash: 'after-merge',
              latest_commit_date: new Date(),
            },
          ],
        });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await checkoutBranch(mockDb)({
        branchName: 'tenant1_project1_feature-x',
      });

      expect(result.branchName).toBe('tenant1_project1_feature-x');
      expect(result.schemaSync.performed).toBe(true);
      expect(result.schemaSync.hadDifferences).toBe(true);
      expect(result.schemaSync.mergeCommitHash).toBe('after-merge');
    });

    it('should skip schema sync when syncSchema is false', async () => {
      const mockExecute = vi
        .fn()
        // dolt_branches - verify branch exists
        .mockResolvedValueOnce({
          rows: [
            { name: 'tenant1_project1_feature-x', hash: 'abc123', latest_commit_date: new Date() },
          ],
        })
        // DOLT_CHECKOUT
        .mockResolvedValueOnce({ rows: [] })
        // dolt_branches - get updated branch info (no schema sync calls)
        .mockResolvedValueOnce({
          rows: [
            { name: 'tenant1_project1_feature-x', hash: 'abc123', latest_commit_date: new Date() },
          ],
        });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await checkoutBranch(mockDb)({
        branchName: 'tenant1_project1_feature-x',
        syncSchema: false,
      });

      expect(result.schemaSync.performed).toBe(false);
      expect(result.schemaSync.hadDifferences).toBe(false);
      // Should only have 3 calls (list, checkout, list again) - no schema sync calls
      expect(mockExecute).toHaveBeenCalledTimes(3);
    });

    it('should throw error when branch does not exist', async () => {
      const mockExecute = vi.fn().mockResolvedValueOnce({ rows: [] });

      const mockDb = { ...db, execute: mockExecute } as any;

      await expect(
        checkoutBranch(mockDb)({
          branchName: 'tenant1_project1_non-existent',
        })
      ).rejects.toThrow("Branch 'tenant1_project1_non-existent' not found");
    });
  });

  describe('createBranch', () => {
    it('should create branch from tenant main without schema sync when source is schema source', async () => {
      const mockExecute = vi
        .fn()
        // dolt_branches - check if branch exists
        .mockResolvedValueOnce({ rows: [] })
        // dolt_schema_diff - check source branch (tenant_main vs main)
        .mockResolvedValueOnce({ rows: [] })
        // dolt_branches - for doltHashOf (to resolve tenant1_main)
        .mockResolvedValueOnce({
          rows: [
            { name: 'tenant1_main', hash: 'tenant-main-hash', latest_commit_date: new Date() },
          ],
        })
        // dolt_log - get commit hash for tenant1_main
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'tenant-main-hash' }] })
        // DOLT_BRANCH - create new branch
        .mockResolvedValueOnce({ rows: [] })
        // dolt_branches - get new branch info
        .mockResolvedValueOnce({
          rows: [
            {
              name: 'tenant1_project1_feature-x',
              hash: 'new-branch-hash',
              latest_commit_date: new Date(),
            },
          ],
        });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await createBranch(mockDb)({
        tenantId: 'tenant1',
        projectId: 'project1',
        name: 'feature-x',
      });

      expect(result.baseName).toBe('feature-x');
      expect(result.fullName).toBe('tenant1_project1_feature-x');
      expect(result.hash).toBe('new-branch-hash');
    });

    it('should sync schema on source branch before creating when differences exist', async () => {
      const mockExecute = vi
        .fn()
        // dolt_branches - check if branch exists
        .mockResolvedValueOnce({ rows: [] })
        // dolt_schema_diff - source branch has differences
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
        // DOLT_CHECKOUT - checkout source branch for sync
        .mockResolvedValueOnce({ rows: [] })
        // active_branch() for syncSchemaFromMain
        .mockResolvedValueOnce({ rows: [{ branch: 'tenant1_main' }] })
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
        // DOLT_CHECKOUT for merge
        .mockResolvedValueOnce({ rows: [] })
        // HASHOF
        .mockResolvedValueOnce({ rows: [{ hash: 'pre-merge' }] })
        // DOLT_MERGE
        .mockResolvedValueOnce({ rows: [{ conflicts: 0 }] })
        // dolt_log for getLatestCommitHash
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'post-merge' }] })
        // pg_advisory_unlock
        .mockResolvedValueOnce({ rows: [] })
        // dolt_branches for doltHashOf (checking if tenant1_main is a branch)
        .mockResolvedValueOnce({
          rows: [{ name: 'tenant1_main', hash: 'post-merge', latest_commit_date: new Date() }],
        })
        // dolt_log for doltHashOf (getting commit hash for branch)
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'post-merge' }] })
        // DOLT_BRANCH
        .mockResolvedValueOnce({ rows: [] })
        // dolt_branches - get new branch
        .mockResolvedValueOnce({
          rows: [
            {
              name: 'tenant1_project1_feature-x',
              hash: 'new-hash',
              latest_commit_date: new Date(),
            },
          ],
        });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await createBranch(mockDb)({
        tenantId: 'tenant1',
        projectId: 'project1',
        name: 'feature-x',
      });

      expect(result.baseName).toBe('feature-x');
      expect(result.fullName).toBe('tenant1_project1_feature-x');
    });

    it('should skip schema sync when syncSchemaOnSource is false', async () => {
      const mockExecute = vi
        .fn()
        // dolt_branches - check if branch exists
        .mockResolvedValueOnce({ rows: [] })
        // dolt_branches for doltHashOf
        .mockResolvedValueOnce({
          rows: [
            { name: 'tenant1_main', hash: 'tenant-main-hash', latest_commit_date: new Date() },
          ],
        })
        // dolt_log for doltHashOf
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'tenant-main-hash' }] })
        // DOLT_BRANCH
        .mockResolvedValueOnce({ rows: [] })
        // dolt_branches - get new branch
        .mockResolvedValueOnce({
          rows: [
            {
              name: 'tenant1_project1_feature-x',
              hash: 'new-hash',
              latest_commit_date: new Date(),
            },
          ],
        });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await createBranch(mockDb)({
        tenantId: 'tenant1',
        projectId: 'project1',
        name: 'feature-x',
        syncSchemaOnSource: false,
      });

      expect(result.baseName).toBe('feature-x');
      // Should not have called dolt_schema_diff at all
      const calls = mockExecute.mock.calls.map((call: any) =>
        getSqlString({ mock: { calls: [call] } })
      );
      expect(calls.some((c: string) => c.includes('dolt_schema_diff'))).toBe(false);
    });

    it('should throw error when branch already exists', async () => {
      const mockExecute = vi.fn().mockResolvedValueOnce({
        rows: [
          { name: 'tenant1_project1_feature-x', hash: 'existing', latest_commit_date: new Date() },
        ],
      });

      const mockDb = { ...db, execute: mockExecute } as any;

      await expect(
        createBranch(mockDb)({
          tenantId: 'tenant1',
          projectId: 'project1',
          name: 'feature-x',
        })
      ).rejects.toThrow("Branch 'feature-x' already exists");
    });

    it('should throw error when branch name is empty', async () => {
      const mockDb = { ...db, execute: vi.fn() } as any;

      await expect(
        createBranch(mockDb)({
          tenantId: 'tenant1',
          projectId: 'project1',
          name: '',
        })
      ).rejects.toThrow('Branch name cannot be empty');

      await expect(
        createBranch(mockDb)({
          tenantId: 'tenant1',
          projectId: 'project1',
          name: '   ',
        })
      ).rejects.toThrow('Branch name cannot be empty');
    });

    it('should create branch from another branch', async () => {
      const mockExecute = vi
        .fn()
        // dolt_branches - check if branch exists
        .mockResolvedValueOnce({ rows: [] })
        // dolt_schema_diff for source branch
        .mockResolvedValueOnce({ rows: [] })
        // dolt_branches for doltHashOf
        .mockResolvedValueOnce({
          rows: [
            {
              name: 'tenant1_project1_develop',
              hash: 'develop-hash',
              latest_commit_date: new Date(),
            },
          ],
        })
        // dolt_log for doltHashOf
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'develop-hash' }] })
        // DOLT_BRANCH
        .mockResolvedValueOnce({ rows: [] })
        // dolt_branches - get new branch
        .mockResolvedValueOnce({
          rows: [
            {
              name: 'tenant1_project1_feature-x',
              hash: 'new-hash',
              latest_commit_date: new Date(),
            },
          ],
        });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await createBranch(mockDb)({
        tenantId: 'tenant1',
        projectId: 'project1',
        name: 'feature-x',
        from: 'develop',
      });

      expect(result.baseName).toBe('feature-x');
      expect(result.fullName).toBe('tenant1_project1_feature-x');
    });
  });

  describe('deleteBranch', () => {
    it('should delete a branch', async () => {
      const mockExecute = vi
        .fn()
        // dolt_branches - check branch exists
        .mockResolvedValueOnce({
          rows: [
            { name: 'tenant1_project1_feature-x', hash: 'abc123', latest_commit_date: new Date() },
          ],
        })
        // DOLT_BRANCH -d
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = { ...db, execute: mockExecute } as any;

      await deleteBranch(mockDb)({
        tenantId: 'tenant1',
        projectId: 'project1',
        name: 'feature-x',
      });

      expect(mockExecute).toHaveBeenCalledTimes(2);
      const sqlString = getSqlString(mockExecute, 1);
      expect(sqlString).toContain('DOLT_BRANCH');
      expect(sqlString).toContain('-d');
    });

    it('should throw error when trying to delete protected branch', async () => {
      const mockDb = { ...db, execute: vi.fn() } as any;

      await expect(
        deleteBranch(mockDb)({
          tenantId: 'tenant1',
          projectId: 'project1',
          name: MAIN_BRANCH_SUFFIX,
        })
      ).rejects.toThrow("Cannot delete protected branch 'main'");
    });

    it('should throw error when branch does not exist', async () => {
      const mockExecute = vi.fn().mockResolvedValueOnce({ rows: [] });

      const mockDb = { ...db, execute: mockExecute } as any;

      await expect(
        deleteBranch(mockDb)({
          tenantId: 'tenant1',
          projectId: 'project1',
          name: 'non-existent',
        })
      ).rejects.toThrow("Branch 'non-existent' not found");
    });
  });

  describe('getBranch', () => {
    it('should return branch info when branch exists', async () => {
      const mockExecute = vi.fn().mockResolvedValueOnce({
        rows: [
          { name: 'tenant1_project1_feature-x', hash: 'abc123', latest_commit_date: new Date() },
        ],
      });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await getBranch(mockDb)({
        tenantId: 'tenant1',
        projectId: 'project1',
        name: 'feature-x',
      });

      expect(result).toEqual({
        baseName: 'feature-x',
        fullName: 'tenant1_project1_feature-x',
        hash: 'abc123',
      });
    });

    it('should return null when branch does not exist', async () => {
      const mockExecute = vi.fn().mockResolvedValueOnce({ rows: [] });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await getBranch(mockDb)({
        tenantId: 'tenant1',
        projectId: 'project1',
        name: 'non-existent',
      });

      expect(result).toBeNull();
    });
  });

  describe('listBranches', () => {
    it('should return project-scoped branches', async () => {
      const mockExecute = vi.fn().mockResolvedValueOnce({
        rows: [
          { name: 'tenant1_project1_main', hash: 'hash1', latest_commit_date: new Date() },
          { name: 'tenant1_project1_feature-x', hash: 'hash2', latest_commit_date: new Date() },
          { name: 'tenant1_project2_main', hash: 'hash3', latest_commit_date: new Date() }, // Different project
          { name: 'tenant2_project1_main', hash: 'hash4', latest_commit_date: new Date() }, // Different tenant
        ],
      });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await listBranches(mockDb)({
        tenantId: 'tenant1',
        projectId: 'project1',
      });

      expect(result).toHaveLength(2);
      expect(result[0].baseName).toBe('main');
      expect(result[0].fullName).toBe('tenant1_project1_main');
      expect(result[1].baseName).toBe('feature-x');
      expect(result[1].fullName).toBe('tenant1_project1_feature-x');
    });

    it('should return empty array when no project branches exist', async () => {
      const mockExecute = vi.fn().mockResolvedValueOnce({
        rows: [{ name: 'other_project_main', hash: 'hash1', latest_commit_date: new Date() }],
      });

      const mockDb = { ...db, execute: mockExecute } as any;

      const result = await listBranches(mockDb)({
        tenantId: 'tenant1',
        projectId: 'project1',
      });

      expect(result).toEqual([]);
    });
  });
});
