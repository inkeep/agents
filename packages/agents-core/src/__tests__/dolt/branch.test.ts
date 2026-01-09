import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  doltActiveBranch,
  doltBranch,
  doltCheckout,
  doltDeleteBranch,
  doltGetBranchNamespace,
  doltListBranches,
  doltRenameBranch,
} from '../../dolt/branch';
import { testManageDbClient } from '../setup';
import { getSqlString } from './test-utils';

describe('Branch Module', () => {
  let db: AgentsManageDatabaseClient;

  beforeEach(() => {
    db = testManageDbClient;
    vi.clearAllMocks();
  });

  describe('doltBranch', () => {
    it('should create a new branch without start point', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltBranch(mockDb)({ name: 'new-branch' });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_BRANCH');
      expect(sqlString).toContain('new-branch');
    });

    it('should create a new branch with start point', async () => {
      // Use a valid dolt base32 hash (0-9 and a-v only, 32 chars)
      const mockCommitHash = 'a1b2c3d4e5a6b890123456789012345v';
      const mockExecute = vi
        .fn()
        // First call: dolt_branches query (to check if startPoint is a branch)
        .mockResolvedValueOnce({ rows: [{ name: 'main', hash: mockCommitHash }] })
        // Second call: DOLT_LOG query to get HEAD commit hash for the branch
        .mockResolvedValueOnce({ rows: [{ commit_hash: mockCommitHash }] })
        // Third call: DOLT_BRANCH with resolved hash
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltBranch(mockDb)({ name: 'new-branch', startPoint: 'main' });

      expect(mockExecute).toHaveBeenCalledTimes(3);
      // Use getSqlString helper with callIndex=2 for the third call (DOLT_BRANCH)
      const sqlString = getSqlString(mockExecute, 2);
      expect(sqlString).toContain('DOLT_BRANCH');
      expect(sqlString).toContain('new-branch');
      expect(sqlString).toContain(mockCommitHash);
    });

    it('should create a branch from a commit hash', async () => {
      // Use a valid dolt base32 hash (0-9 and a-v only, 32 chars)
      // When startPoint is already a valid hash, doltHashOf returns it directly
      const commitHash = 'a1b2c3d4e5a6b890123456789012345v';
      const mockExecute = vi
        .fn()
        // Only call: DOLT_BRANCH (hash is returned directly from doltHashOf without DB query)
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltBranch(mockDb)({ name: 'branch-from-commit', startPoint: commitHash });

      // Only 1 call since doltHashOf returns hash directly when it matches base32 pattern
      expect(mockExecute).toHaveBeenCalledTimes(1);
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_BRANCH');
      expect(sqlString).toContain('branch-from-commit');
      expect(sqlString).toContain(commitHash);
    });
  });

  describe('doltDeleteBranch', () => {
    it('should delete a branch with soft delete (default)', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltDeleteBranch(mockDb)({ name: 'old-branch' });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_BRANCH');
      expect(sqlString).toContain('-d');
      expect(sqlString).toContain('old-branch');
    });

    it('should delete a branch with force delete', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltDeleteBranch(mockDb)({ name: 'old-branch', force: true });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_BRANCH');
      expect(sqlString).toContain('-D');
      expect(sqlString).toContain('old-branch');
    });

    it('should delete a branch without force when force is false', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltDeleteBranch(mockDb)({ name: 'old-branch', force: false });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_BRANCH');
      expect(sqlString).toContain('-d');
      expect(sqlString).toContain('old-branch');
    });
  });

  describe('doltRenameBranch', () => {
    it('should rename a branch', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltRenameBranch(mockDb)({ oldName: 'old-name', newName: 'new-name' });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_BRANCH');
      expect(sqlString).toContain('-m');
      expect(sqlString).toContain('old-name');
      expect(sqlString).toContain('new-name');
    });
  });

  describe('doltListBranches', () => {
    it('should return list of branches', async () => {
      const expectedBranches = [
        {
          name: 'main',
          hash: 'a1b2c3d4e5f6789012345678901234ab',
          latest_commit_date: new Date('2024-01-01'),
        },
        {
          name: 'feature-branch',
          hash: 'b2c3d4e5f6789012345678901234abcd',
          latest_commit_date: new Date('2024-01-02'),
        },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: expectedBranches });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltListBranches(mockDb)();

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('dolt_branches');
      expect(result).toEqual(expectedBranches);
    });

    it('should return empty array when no branches exist', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltListBranches(mockDb)();

      expect(result).toEqual([]);
    });
  });

  describe('doltCheckout', () => {
    it('should checkout existing branch', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltCheckout(mockDb)({ branch: 'main' });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_CHECKOUT');
      expect(sqlString).toContain('main');
    });

    it('should create and checkout new branch', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltCheckout(mockDb)({ branch: 'new-branch', create: true });

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_CHECKOUT');
      expect(sqlString).toContain('-b');
      expect(sqlString).toContain('new-branch');
    });

    it('should checkout without create when create is false', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await doltCheckout(mockDb)({ branch: 'main', create: false });

      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('DOLT_CHECKOUT');
      expect(sqlString).toContain('main');
      expect(sqlString).not.toContain('-b');
    });
  });

  describe('doltActiveBranch', () => {
    it('should return the currently active branch name', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [{ branch: 'main' }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltActiveBranch(mockDb)();

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('ACTIVE_BRANCH');
      expect(result).toBe('main');
    });

    it('should handle detached HEAD state', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [{ branch: null }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await doltActiveBranch(mockDb)();

      expect(result).toBeNull();
    });
  });

  describe('doltGetBranchNamespace', () => {
    it('should generate branch namespace from scopes', () => {
      const scopes = {
        tenantId: 'tenant-123',
        projectId: 'project-456',
        branchName: 'feature-x',
      };

      const namespace = doltGetBranchNamespace(scopes)();

      expect(namespace).toBe('tenant-123_project-456_feature-x');
    });

    it('should handle different scope values', () => {
      const scopes = {
        tenantId: 'acme-corp',
        projectId: 'website',
        branchName: 'bugfix/login-issue',
      };

      const namespace = doltGetBranchNamespace(scopes)();

      expect(namespace).toBe('acme-corp_website_bugfix/login-issue');
    });

    it('should handle empty strings in scopes', () => {
      const scopes = {
        tenantId: '',
        projectId: '',
        branchName: '',
      };

      const namespace = doltGetBranchNamespace(scopes)();

      expect(namespace).toBe('__');
    });
  });
});
