import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  checkSchemaCompatibility,
  getCurrentSchemaVersion,
  getMinViableSchemaVersion,
  getSchemaVersionForRef,
  setMinViableSchemaVersion,
} from '../../dolt/schema-version';
import { testManageDbClient } from '../setup';
import { getSqlString } from './test-utils';

describe('Schema Version Module', () => {
  let db: AgentsManageDatabaseClient;

  beforeEach(() => {
    db = testManageDbClient;
    vi.clearAllMocks();
  });

  describe('getCurrentSchemaVersion', () => {
    it('should return the number of applied migrations', async () => {
      const mockMigrations = [
        { hash: 'migration1', created_at: '2024-01-01' },
        { hash: 'migration2', created_at: '2024-01-02' },
        { hash: 'migration3', created_at: '2024-01-03' },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: mockMigrations });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const version = await getCurrentSchemaVersion(mockDb)();

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('__drizzle_migrations');
      expect(version).toBe(3);
    });

    it('should return 0 when no migrations applied', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const version = await getCurrentSchemaVersion(mockDb)();

      expect(version).toBe(0);
    });

    it('should handle error and return 0', async () => {
      const mockExecute = vi.fn().mockRejectedValue(new Error('Table does not exist'));

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const version = await getCurrentSchemaVersion(mockDb)();

      expect(version).toBe(0);
    });

    it('should count migrations correctly', async () => {
      const mockMigrations = [
        { hash: 'migration1', created_at: '2024-01-01' },
        { hash: 'migration2', created_at: '2024-01-02' },
        { hash: 'migration3', created_at: '2024-01-03' },
        { hash: 'migration4', created_at: '2024-01-04' },
        { hash: 'migration5', created_at: '2024-01-05' },
      ];

      const mockExecute = vi.fn().mockResolvedValue({ rows: mockMigrations });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const version = await getCurrentSchemaVersion(mockDb)();

      expect(version).toBe(5);
    });
  });

  describe('getMinViableSchemaVersion', () => {
    it('should return configured minimum viable schema version', async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        rows: [{ value: '3' }],
      });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const version = await getMinViableSchemaVersion(mockDb)();

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('dolt_config');
      expect(sqlString).toContain('min_viable_schema_version');
      expect(version).toBe(3);
    });

    it('should return 0 when not configured', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const version = await getMinViableSchemaVersion(mockDb)();

      expect(version).toBe(0);
    });

    it('should handle error and return 0', async () => {
      const mockExecute = vi.fn().mockRejectedValue(new Error('Config error'));

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const version = await getMinViableSchemaVersion(mockDb)();

      expect(version).toBe(0);
    });

    it('should parse version string to number', async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        rows: [{ value: '42' }],
      });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const version = await getMinViableSchemaVersion(mockDb)();

      expect(version).toBe(42);
    });
  });

  describe('setMinViableSchemaVersion', () => {
    it('should set minimum viable schema version', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await setMinViableSchemaVersion(mockDb)(5);

      expect(mockExecute).toHaveBeenCalled();
      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('dolt_config');
      expect(sqlString).toContain('min_viable_schema_version');
    });

    it('should update existing configuration', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await setMinViableSchemaVersion(mockDb)(10);

      const sqlString = getSqlString(mockExecute);
      expect(sqlString).toContain('ON CONFLICT');
      expect(sqlString).toContain('DO UPDATE');
    });

    it('should handle zero version', async () => {
      const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await setMinViableSchemaVersion(mockDb)(0);

      expect(mockExecute).toHaveBeenCalled();
    });
  });

  describe('checkSchemaCompatibility', () => {
    it('should return compatible when ref version meets minimum', async () => {
      const resolvedRef = {
        type: 'branch' as const,
        name: 'feature',
        hash: 'a1b2c3d4e5f67890123456789012345v',
      };

      const mockExecute = vi
        .fn()
        // getCurrentBranchOrCommit (on branch 'main')
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] }) // ACTIVE_BRANCH
        .mockResolvedValueOnce({ rows: [{ name: 'main' }] }) // doltListBranches
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'mainHash1234567890123456789v' }] }) // DOLT_LOG
        // checkoutRef (feature)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (feature) - version 5
        .mockResolvedValueOnce({
          rows: [{ hash: 'm1' }, { hash: 'm2' }, { hash: 'm3' }, { hash: 'm4' }, { hash: 'm5' }],
        })
        // checkoutRef (back to main)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (main) - version 5
        .mockResolvedValueOnce({
          rows: [{ hash: 'm1' }, { hash: 'm2' }, { hash: 'm3' }, { hash: 'm4' }, { hash: 'm5' }],
        })
        // getMinViableSchemaVersion - version 3
        .mockResolvedValueOnce({ rows: [{ value: '3' }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await checkSchemaCompatibility(mockDb)(resolvedRef);

      expect(result).toEqual({
        isCompatible: true,
        currentVersion: 5,
        requiredVersion: 3,
      });
    });

    it('should return incompatible when ref version is below minimum', async () => {
      const resolvedRef = {
        type: 'branch' as const,
        name: 'old-feature',
        hash: 'b2c3d4e5f67890123456789012345abv',
      };

      const mockExecute = vi
        .fn()
        // getCurrentBranchOrCommit (on branch 'main')
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] }) // ACTIVE_BRANCH
        .mockResolvedValueOnce({ rows: [{ name: 'main' }] }) // doltListBranches
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'mainHash1234567890123456789v' }] }) // DOLT_LOG
        // checkoutRef (old-feature)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (old-feature) - version 2
        .mockResolvedValueOnce({ rows: [{ hash: 'm1' }, { hash: 'm2' }] })
        // checkoutRef (back to main)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (main) - version 5
        .mockResolvedValueOnce({
          rows: [{ hash: 'm1' }, { hash: 'm2' }, { hash: 'm3' }, { hash: 'm4' }, { hash: 'm5' }],
        })
        // getMinViableSchemaVersion - version 3
        .mockResolvedValueOnce({ rows: [{ value: '3' }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await checkSchemaCompatibility(mockDb)(resolvedRef);

      expect(result).toEqual({
        isCompatible: false,
        currentVersion: 2,
        requiredVersion: 3,
        errorMessage: 'Schema version 2 is below minimum viable version 3',
      });
    });

    it('should handle checkout errors and restore original ref', async () => {
      const resolvedRef = {
        type: 'branch' as const,
        name: 'feature',
        hash: 'a1b2c3d4e5f67890123456789012345v',
      };

      const mockExecute = vi
        .fn()
        // getCurrentBranchOrCommit (on branch 'main')
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] }) // ACTIVE_BRANCH
        .mockResolvedValueOnce({ rows: [{ name: 'main' }] }) // doltListBranches
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'mainHash1234567890123456789v' }] }) // DOLT_LOG
        // checkoutRef (feature) - fails
        .mockRejectedValueOnce(new Error('Checkout failed'))
        // checkoutRef (back to main)
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await checkSchemaCompatibility(mockDb)(resolvedRef);

      expect(result).toEqual({
        isCompatible: false,
        errorMessage: 'Failed to check schema compatibility: Checkout failed',
      });

      // Verify we tried to restore original ref
      expect(mockExecute).toHaveBeenCalledTimes(5);
      const lastCall = getSqlString(mockExecute, 4);
      expect(lastCall).toContain('DOLT_CHECKOUT');
    });

    it('should work with tag refs', async () => {
      const resolvedRef = {
        type: 'tag' as const,
        name: 'v1.0.0',
        hash: 'c3d4e5f67890123456789012345abcdv',
      };

      const mockExecute = vi
        .fn()
        // getCurrentBranchOrCommit (on branch 'main')
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] }) // ACTIVE_BRANCH
        .mockResolvedValueOnce({ rows: [{ name: 'main' }] }) // doltListBranches
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'mainHash1234567890123456789v' }] }) // DOLT_LOG
        // checkoutRef (tag)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (tag)
        .mockResolvedValueOnce({ rows: [{ hash: 'm1' }, { hash: 'm2' }, { hash: 'm3' }] })
        // checkoutRef (back to main)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (main)
        .mockResolvedValueOnce({
          rows: [{ hash: 'm1' }, { hash: 'm2' }, { hash: 'm3' }, { hash: 'm4' }, { hash: 'm5' }],
        })
        // getMinViableSchemaVersion
        .mockResolvedValueOnce({ rows: [{ value: '2' }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await checkSchemaCompatibility(mockDb)(resolvedRef);

      expect(result.isCompatible).toBe(true);
    });

    it('should work with commit refs', async () => {
      const resolvedRef = {
        type: 'commit' as const,
        name: 'd4e5f67890123456789012345abcde01',
        hash: 'd4e5f67890123456789012345abcde01',
      };

      const mockExecute = vi
        .fn()
        // getCurrentBranchOrCommit (on branch 'main')
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] }) // ACTIVE_BRANCH
        .mockResolvedValueOnce({ rows: [{ name: 'main' }] }) // doltListBranches
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'mainHash1234567890123456789v' }] }) // DOLT_LOG
        // checkoutRef (commit)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (commit)
        .mockResolvedValueOnce({ rows: [{ hash: 'm1' }, { hash: 'm2' }] })
        // checkoutRef (back to main)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (main)
        .mockResolvedValueOnce({ rows: [{ hash: 'm1' }, { hash: 'm2' }] })
        // getMinViableSchemaVersion
        .mockResolvedValueOnce({ rows: [{ value: '1' }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await checkSchemaCompatibility(mockDb)(resolvedRef);

      expect(result.isCompatible).toBe(true);
    });

    it('should handle detached HEAD state', async () => {
      const resolvedRef = {
        type: 'branch' as const,
        name: 'feature',
        hash: 'a1b2c3d4e5f67890123456789012345v',
      };

      const mockExecute = vi
        .fn()
        // getCurrentBranchOrCommit - detached HEAD (2 calls, not 3)
        .mockResolvedValueOnce({ rows: [{ branch: null }] }) // ACTIVE_BRANCH returns null
        .mockResolvedValueOnce({ rows: [{ hash: 'detachedHash123456789012345v' }] }) // Direct DOLT_HASHOF('HEAD')
        // checkoutRef (feature)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (feature)
        .mockResolvedValueOnce({ rows: [{ hash: 'm1' }, { hash: 'm2' }] })
        // checkoutRef (back to detached hash)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (original)
        .mockResolvedValueOnce({ rows: [{ hash: 'm1' }, { hash: 'm2' }] })
        // getMinViableSchemaVersion
        .mockResolvedValueOnce({ rows: [{ value: '1' }] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const result = await checkSchemaCompatibility(mockDb)(resolvedRef);

      expect(result.isCompatible).toBe(true);
    });
  });

  describe('getSchemaVersionForRef', () => {
    it('should return schema version for a specific ref', async () => {
      const resolvedRef = {
        type: 'branch' as const,
        name: 'feature',
        hash: 'a1b2c3d4e5f67890123456789012345v',
      };

      const mockExecute = vi
        .fn()
        // getCurrentBranchOrCommit (on branch 'main')
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] }) // ACTIVE_BRANCH
        .mockResolvedValueOnce({ rows: [{ name: 'main' }] }) // doltListBranches
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'mainHash1234567890123456789v' }] }) // DOLT_LOG
        // checkoutRef (feature)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (feature)
        .mockResolvedValueOnce({ rows: [{ hash: 'm1' }, { hash: 'm2' }, { hash: 'm3' }] })
        // checkoutRef (back to main)
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const version = await getSchemaVersionForRef(mockDb)(resolvedRef);

      expect(version).toBe(3);
    });

    it('should restore original ref after getting version', async () => {
      const resolvedRef = {
        type: 'tag' as const,
        name: 'v1.0.0',
        hash: 'b2c3d4e5f67890123456789012345abv',
      };

      const mockExecute = vi
        .fn()
        // getCurrentBranchOrCommit (on branch 'develop')
        .mockResolvedValueOnce({ rows: [{ branch: 'develop' }] }) // ACTIVE_BRANCH
        .mockResolvedValueOnce({ rows: [{ name: 'develop' }] }) // doltListBranches
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'developHash12345678901234567v' }] }) // DOLT_LOG
        // checkoutRef (tag)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (tag)
        .mockResolvedValueOnce({ rows: [{ hash: 'm1' }] })
        // checkoutRef (back to develop)
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      await getSchemaVersionForRef(mockDb)(resolvedRef);

      // Last checkout should be back to develop
      const lastCall = getSqlString(mockExecute, 5);
      expect(lastCall).toContain('DOLT_CHECKOUT');
      expect(lastCall).toContain('develop');
    });

    it('should handle errors and restore original ref', async () => {
      const resolvedRef = {
        type: 'branch' as const,
        name: 'feature',
        hash: 'a1b2c3d4e5f67890123456789012345v',
      };

      const mockExecute = vi
        .fn()
        // getCurrentBranchOrCommit (on branch 'main')
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] }) // ACTIVE_BRANCH
        .mockResolvedValueOnce({ rows: [{ name: 'main' }] }) // doltListBranches
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'mainHash1234567890123456789v' }] }) // DOLT_LOG
        // checkoutRef (feature)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (feature) - fails
        .mockRejectedValueOnce(new Error('Migration table error'))
        // checkoutRef (back to main)
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      // getAppliedMigrations catches errors and returns [], so version should be 0
      const version = await getSchemaVersionForRef(mockDb)(resolvedRef);
      expect(version).toBe(0);

      // Verify we restored original ref
      const lastCall = getSqlString(mockExecute, 5);
      expect(lastCall).toContain('DOLT_CHECKOUT');
    });

    it('should work with detached HEAD state', async () => {
      const resolvedRef = {
        type: 'commit' as const,
        name: 'c3d4e5f67890123456789012345abcdv',
        hash: 'c3d4e5f67890123456789012345abcdv',
      };

      const mockExecute = vi
        .fn()
        // getCurrentBranchOrCommit - detached HEAD (2 calls, not 3)
        .mockResolvedValueOnce({ rows: [{ branch: null }] }) // ACTIVE_BRANCH returns null
        .mockResolvedValueOnce({ rows: [{ hash: 'detachedHash123456789012345v' }] }) // Direct DOLT_HASHOF('HEAD')
        // checkoutRef (commit)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (commit)
        .mockResolvedValueOnce({ rows: [{ hash: 'm1' }, { hash: 'm2' }] })
        // checkoutRef (back to detached hash)
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const version = await getSchemaVersionForRef(mockDb)(resolvedRef);

      expect(version).toBe(2);

      // Verify we restored to detached HEAD hash
      const lastCall = getSqlString(mockExecute, 4);
      expect(lastCall).toContain('detachedHash123456789012345v');
    });

    it('should return 0 for ref with no migrations', async () => {
      const resolvedRef = {
        type: 'branch' as const,
        name: 'new-branch',
        hash: 'd4e5f67890123456789012345abcde01',
      };

      const mockExecute = vi
        .fn()
        // getCurrentBranchOrCommit (on branch 'main')
        .mockResolvedValueOnce({ rows: [{ branch: 'main' }] }) // ACTIVE_BRANCH
        .mockResolvedValueOnce({ rows: [{ name: 'main' }] }) // doltListBranches
        .mockResolvedValueOnce({ rows: [{ commit_hash: 'mainHash1234567890123456789v' }] }) // DOLT_LOG
        // checkoutRef (new-branch)
        .mockResolvedValueOnce({ rows: [] })
        // getCurrentSchemaVersion (new-branch) - no migrations
        .mockResolvedValueOnce({ rows: [] })
        // checkoutRef (back to main)
        .mockResolvedValueOnce({ rows: [] });

      const mockDb = {
        ...db,
        execute: mockExecute,
      } as any;

      const version = await getSchemaVersionForRef(mockDb)(resolvedRef);

      expect(version).toBe(0);
    });
  });
});
