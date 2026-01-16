import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import type { ResolvedRef } from '../../validation/dolt-schemas';

vi.mock('../../dolt/branches-api', () => ({
  checkoutBranch: vi.fn(),
}));

import { checkoutBranch } from '../../dolt/branches-api';
import {
  getCurrentRefScope,
  getRefScopedDb,
  isInRefScope,
  NestedRefScopeError,
  withRef,
} from '../../dolt/ref-scope';

describe('Ref Scope Module', () => {
  let mockPool: Pool;
  let mockConnection: PoolClient;
  const mockedCheckoutBranch = checkoutBranch as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset environment for non-test mode
    process.env.ENVIRONMENT = 'development';

    mockConnection = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    } as unknown as PoolClient;

    mockPool = {
      connect: vi.fn().mockResolvedValue(mockConnection),
    } as unknown as Pool;
  });

  describe('withRef', () => {
    describe('branch checkout', () => {
      it('should checkout branch and execute callback', async () => {
        const resolvedRef: ResolvedRef = {
          type: 'branch',
          name: 'tenant_project_main',
          hash: 'abc123',
        };

        const checkoutBranchFn = vi.fn().mockResolvedValue({
          branchName: resolvedRef.name,
          hash: resolvedRef.hash,
          schemaSync: { performed: false, hadDifferences: false },
        });
        mockedCheckoutBranch.mockReturnValue(checkoutBranchFn);

        const callback = vi.fn().mockResolvedValue('result');

        const result = await withRef(mockPool, resolvedRef, callback);

        expect(result).toBe('result');
        expect(mockPool.connect).toHaveBeenCalled();
        expect(mockedCheckoutBranch).toHaveBeenCalled();
        expect(checkoutBranchFn).toHaveBeenCalledWith({
          branchName: resolvedRef.name,
          syncSchema: false,
        });
        expect(mockConnection.release).toHaveBeenCalled();
      });

      it('should checkout main and release connection in finally block', async () => {
        const resolvedRef: ResolvedRef = {
          type: 'branch',
          name: 'tenant_project_main',
          hash: 'abc123',
        };

        const checkoutBranchFn = vi.fn().mockResolvedValue({
          branchName: resolvedRef.name,
          hash: resolvedRef.hash,
          schemaSync: { performed: false, hadDifferences: false },
        });
        mockedCheckoutBranch.mockReturnValue(checkoutBranchFn);

        await withRef(mockPool, resolvedRef, async () => 'result');

        expect(mockConnection.query).toHaveBeenCalledWith(`SELECT DOLT_CHECKOUT('main')`);
        expect(mockConnection.release).toHaveBeenCalled();
      });

      it('should cleanup even if callback throws', async () => {
        const resolvedRef: ResolvedRef = {
          type: 'branch',
          name: 'tenant_project_main',
          hash: 'abc123',
        };

        const checkoutBranchFn = vi.fn().mockResolvedValue({
          branchName: resolvedRef.name,
          hash: resolvedRef.hash,
          schemaSync: { performed: false, hadDifferences: false },
        });
        mockedCheckoutBranch.mockReturnValue(checkoutBranchFn);

        const error = new Error('Callback error');

        await expect(
          withRef(mockPool, resolvedRef, async () => {
            throw error;
          })
        ).rejects.toThrow('Callback error');

        expect(mockConnection.query).toHaveBeenCalledWith(`SELECT DOLT_CHECKOUT('main')`);
        expect(mockConnection.release).toHaveBeenCalled();
      });
    });

    describe('tag/commit checkout', () => {
      it('should create temp branch for tag ref', async () => {
        const resolvedRef: ResolvedRef = {
          type: 'tag',
          name: 'v1.0.0',
          hash: 'abc123def456',
        };

        const callback = vi.fn().mockResolvedValue('result');

        await withRef(mockPool, resolvedRef, callback);

        // Should create temp branch from hash
        expect(mockConnection.query).toHaveBeenCalledWith(
          `SELECT DOLT_CHECKOUT('-b', $1, $2)`,
          expect.arrayContaining([expect.stringMatching(/^temp_tag_\d+_/), 'abc123def456'])
        );
      });

      it('should create temp branch for commit ref', async () => {
        const resolvedRef: ResolvedRef = {
          type: 'commit',
          name: 'abc123def456',
          hash: 'abc123def456',
        };

        const callback = vi.fn().mockResolvedValue('result');

        await withRef(mockPool, resolvedRef, callback);

        // Should create temp branch from hash
        expect(mockConnection.query).toHaveBeenCalledWith(
          `SELECT DOLT_CHECKOUT('-b', $1, $2)`,
          expect.arrayContaining([expect.stringMatching(/^temp_commit_\d+_/), 'abc123def456'])
        );
      });

      it('should delete temp branch in cleanup', async () => {
        const resolvedRef: ResolvedRef = {
          type: 'tag',
          name: 'v1.0.0',
          hash: 'abc123def456',
        };

        await withRef(mockPool, resolvedRef, async () => 'result');

        // Should delete temp branch
        expect(mockConnection.query).toHaveBeenCalledWith(
          `SELECT DOLT_BRANCH('-D', $1)`,
          expect.arrayContaining([expect.stringMatching(/^temp_tag_\d+_/)])
        );
      });

      it('should delete temp branch even if callback throws', async () => {
        const resolvedRef: ResolvedRef = {
          type: 'commit',
          name: 'abc123def456',
          hash: 'abc123def456',
        };

        await expect(
          withRef(mockPool, resolvedRef, async () => {
            throw new Error('Callback error');
          })
        ).rejects.toThrow('Callback error');

        // Should still delete temp branch
        expect(mockConnection.query).toHaveBeenCalledWith(
          `SELECT DOLT_BRANCH('-D', $1)`,
          expect.arrayContaining([expect.stringMatching(/^temp_commit_\d+_/)])
        );
      });
    });

    describe('nested calls', () => {
      it('should reuse existing scope if same ref and allowReuse is true', async () => {
        const resolvedRef: ResolvedRef = {
          type: 'branch',
          name: 'tenant_project_main',
          hash: 'abc123',
        };

        const checkoutBranchFn = vi.fn().mockResolvedValue({
          branchName: resolvedRef.name,
          hash: resolvedRef.hash,
          schemaSync: { performed: false, hadDifferences: false },
        });
        mockedCheckoutBranch.mockReturnValue(checkoutBranchFn);

        let innerCallCount = 0;

        await withRef(mockPool, resolvedRef, async (outerDb) => {
          // Nested call with same ref - should reuse
          await withRef(mockPool, resolvedRef, async (innerDb) => {
            innerCallCount++;
            expect(innerDb).toBe(outerDb); // Same db instance
            return 'inner';
          });
          return 'outer';
        });

        expect(innerCallCount).toBe(1);
        // Should only connect once (outer call)
        expect(mockPool.connect).toHaveBeenCalledTimes(1);
      });

      it('should throw NestedRefScopeError for different refs', async () => {
        const outerRef: ResolvedRef = {
          type: 'branch',
          name: 'tenant_project_main',
          hash: 'abc123',
        };

        const innerRef: ResolvedRef = {
          type: 'branch',
          name: 'tenant_project_feature',
          hash: 'def456',
        };

        const checkoutBranchFn = vi.fn().mockResolvedValue({
          branchName: outerRef.name,
          hash: outerRef.hash,
          schemaSync: { performed: false, hadDifferences: false },
        });
        mockedCheckoutBranch.mockReturnValue(checkoutBranchFn);

        await expect(
          withRef(mockPool, outerRef, async () => {
            // Nested call with different ref - should throw
            return withRef(mockPool, innerRef, async () => 'inner');
          })
        ).rejects.toThrow(NestedRefScopeError);
      });

    });

    describe('test environment', () => {
      it('should skip branch checkout in test environment', async () => {
        process.env.ENVIRONMENT = 'test';

        const resolvedRef: ResolvedRef = {
          type: 'branch',
          name: 'tenant_project_main',
          hash: 'abc123',
        };

        const callback = vi.fn().mockResolvedValue('result');

        const result = await withRef(mockPool, resolvedRef, callback);

        expect(result).toBe('result');
        expect(mockPool.connect).toHaveBeenCalled();
        // Should NOT call checkoutBranch in test mode
        expect(mockedCheckoutBranch).not.toHaveBeenCalled();
        // Should NOT call DOLT_CHECKOUT in test mode
        expect(mockConnection.query).not.toHaveBeenCalledWith(
          expect.stringContaining('DOLT_CHECKOUT')
        );
        expect(mockConnection.release).toHaveBeenCalled();
      });
    });
  });

  describe('isInRefScope', () => {
    it('should return false when not in scope', () => {
      expect(isInRefScope()).toBe(false);
    });

    it('should return true when inside withRef', async () => {
      const resolvedRef: ResolvedRef = {
        type: 'branch',
        name: 'tenant_project_main',
        hash: 'abc123',
      };

      const checkoutBranchFn = vi.fn().mockResolvedValue({
        branchName: resolvedRef.name,
        hash: resolvedRef.hash,
        schemaSync: { performed: false, hadDifferences: false },
      });
      mockedCheckoutBranch.mockReturnValue(checkoutBranchFn);

      await withRef(mockPool, resolvedRef, async () => {
        expect(isInRefScope()).toBe(true);
        return 'result';
      });

      // Should be false again after withRef completes
      expect(isInRefScope()).toBe(false);
    });
  });

  describe('getCurrentRefScope', () => {
    it('should return undefined when not in scope', () => {
      expect(getCurrentRefScope()).toBeUndefined();
    });

    it('should return scope context when inside withRef', async () => {
      const resolvedRef: ResolvedRef = {
        type: 'branch',
        name: 'tenant_project_main',
        hash: 'abc123',
      };

      const checkoutBranchFn = vi.fn().mockResolvedValue({
        branchName: resolvedRef.name,
        hash: resolvedRef.hash,
        schemaSync: { performed: false, hadDifferences: false },
      });
      mockedCheckoutBranch.mockReturnValue(checkoutBranchFn);

      await withRef(mockPool, resolvedRef, async () => {
        const scope = getCurrentRefScope();
        expect(scope).toBeDefined();
        expect(scope?.ref).toBe(resolvedRef.name);
        expect(scope?.db).toBeDefined();
        expect(scope?.connectionId).toBeDefined();
        return 'result';
      });
    });
  });

  describe('getRefScopedDb', () => {
    it('should throw when not in scope', () => {
      expect(() => getRefScopedDb()).toThrow('Not inside a withRef scope');
    });

    it('should return db when inside withRef', async () => {
      const resolvedRef: ResolvedRef = {
        type: 'branch',
        name: 'tenant_project_main',
        hash: 'abc123',
      };

      const checkoutBranchFn = vi.fn().mockResolvedValue({
        branchName: resolvedRef.name,
        hash: resolvedRef.hash,
        schemaSync: { performed: false, hadDifferences: false },
      });
      mockedCheckoutBranch.mockReturnValue(checkoutBranchFn);

      await withRef(mockPool, resolvedRef, async (db) => {
        const scopedDb = getRefScopedDb();
        expect(scopedDb).toBe(db);
        return 'result';
      });
    });
  });
});
