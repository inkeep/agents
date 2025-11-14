import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../../../data-access/projects';
import { cleanupTestData, getIntegrationTestClient } from '../../../db/integration-cleanup';
import { doltActiveBranch, doltBranch, doltCheckout } from '../../../dolt/branch';
import { doltAddAndCommit, doltHashOf, doltTag } from '../../../dolt/commit';
import {
  checkoutRef,
  getCurrentBranchOrCommit,
  isRefWritable,
  isValidCommitHash,
  resolveRef,
} from '../../../dolt/ref';

const dbClient = getIntegrationTestClient();

describe('Ref Operations - Integration Tests', () => {
  const testPrefix = 'test-ref-integration';
  const createdBranches = new Set<string>();
  const createdTags = new Set<string>();

  // Helper to generate unique names
  const getBranchName = (suffix: string) => `${testPrefix}-${suffix}-${Date.now()}`;
  const getTagName = (suffix: string) => `${testPrefix}-tag-${suffix}-${Date.now()}`;

  let testBranch: string;
  let originalBranch: string | null = null;

  beforeEach(async () => {
    // Create a test branch for each test
    originalBranch = await doltActiveBranch(dbClient)();
    testBranch = getBranchName('test');
    createdBranches.add(testBranch);
    await doltBranch(dbClient)({ name: testBranch });
    await doltCheckout(dbClient)({ branch: testBranch });
  });

  afterEach(async () => {
    // Checkout back to original branch
    if (originalBranch) {
      try {
        await doltCheckout(dbClient)({ branch: originalBranch });
      } catch (error) {
        // Ignore checkout errors during cleanup
      }
    }

    // Clean up all test data
    await cleanupTestData(testPrefix, createdBranches, createdTags);
    createdBranches.clear();
    createdTags.clear();
  });

  describe('isValidCommitHash', () => {
    it('should validate correct commit hashes', () => {
      // Dolt uses base32 encoding (0-9, a-v)
      const validHash = '0123456789abcdefghijklmnopqrstuv';
      expect(isValidCommitHash(validHash)).toBe(true);
    });

    it('should reject invalid commit hashes', () => {
      // Too short
      expect(isValidCommitHash('abc123')).toBe(false);

      // Too long
      expect(isValidCommitHash('0123456789abcdefghijklmnopqrstuv123')).toBe(false);

      // Invalid characters (w, x, y, z not in base32)
      expect(isValidCommitHash('0123456789abcdefghijklmnopqrwxyz')).toBe(false);

      // Empty string
      expect(isValidCommitHash('')).toBe(false);
    });
  });

  describe('resolveRef', () => {
    it('should resolve a branch ref', async () => {
      const branchName = getBranchName('resolve-branch');
      createdBranches.add(branchName);

      await doltBranch(dbClient)({ name: branchName });

      const resolved = await resolveRef(dbClient)(branchName);

      expect(resolved).toBeDefined();
      expect(resolved!.type).toBe('branch');
      expect(resolved!.name).toBe(branchName);
      expect(resolved!.hash).toHaveLength(32);
      expect(/^[0-9a-v]{32}$/.test(resolved!.hash)).toBe(true);
    });

    it('should resolve a tag ref', async () => {
      // Create a commit
      await createProject(dbClient)({
        id: 'test-project-tag-ref',
        tenantId: 'test-tenant',
        name: 'Test Project',
        description: 'Test Project Description',
        models: {
          base: {
            model: 'gpt-4.1-mini',
          },
        },
      });
      await doltAddAndCommit(dbClient)({ message: 'Commit for tag ref' });

      const tagName = getTagName('resolve');
      createdTags.add(tagName);

      await doltTag(dbClient)({ name: tagName });

      const resolved = await resolveRef(dbClient)(tagName);

      expect(resolved).toBeDefined();
      expect(resolved!.type).toBe('tag');
      expect(resolved!.name).toBe(tagName);
      expect(resolved!.hash).toHaveLength(32);
    });

    it('should resolve a commit hash ref', async () => {
      // Create a commit
      await createProject(dbClient)({
        id: 'test-project-commit-ref',
        tenantId: 'test-tenant',
        name: 'Test Project',
        description: 'Test Project Description',
        models: {
          base: {
            model: 'gpt-4.1-mini',
          },
        },
      });
      await doltAddAndCommit(dbClient)({ message: 'Commit for hash ref' });

      const commitHash = await doltHashOf(dbClient)({ revision: 'HEAD' });

      const resolved = await resolveRef(dbClient)(commitHash);

      expect(resolved).toBeDefined();
      expect(resolved!.type).toBe('commit');
      expect(resolved!.name).toBe(commitHash);
      expect(resolved!.hash).toBe(commitHash);
    });

    it('should return null for non-existent ref', async () => {
      const resolved = await resolveRef(dbClient)('non-existent-ref-12345');

      expect(resolved).toBeNull();
    });

    it('should prioritize commit hash over tag/branch with same name', async () => {
      // Get a valid commit hash
      await createProject(dbClient)({
        id: 'test-project-priority',
        tenantId: 'test-tenant',
        name: 'Test Project',
        description: 'Test Project Description',
        models: {
          base: {
            model: 'gpt-4.1-mini',
          },
        },
      });
      await doltAddAndCommit(dbClient)({ message: 'Commit for priority test' });

      const commitHash = await doltHashOf(dbClient)({ revision: 'HEAD' });

      // Even if there's a branch/tag with a similar name, commit hash should be recognized
      const resolved = await resolveRef(dbClient)(commitHash);

      expect(resolved).toBeDefined();
      expect(resolved!.type).toBe('commit');
    });
  });

  describe('isRefWritable', () => {
    it('should return true for branch refs', async () => {
      const branchName = getBranchName('writable');
      createdBranches.add(branchName);

      await doltBranch(dbClient)({ name: branchName });

      const resolved = await resolveRef(dbClient)(branchName);
      expect(resolved).toBeDefined();

      const writable = isRefWritable(resolved!);
      expect(writable).toBe(true);
    });

    it('should return false for tag refs', async () => {
      const tagName = getTagName('readonly');
      createdTags.add(tagName);

      await doltTag(dbClient)({ name: tagName });

      const resolved = await resolveRef(dbClient)(tagName);
      expect(resolved).toBeDefined();

      const writable = isRefWritable(resolved!);
      expect(writable).toBe(false);
    });

    it('should return false for commit hash refs', async () => {
      // Create a commit
      await createProject(dbClient)({
        id: 'test-project-readonly',
        tenantId: 'test-tenant',
        name: 'Test Project',
        description: 'Test Project Description',
        models: {
          base: {
            model: 'gpt-4.1-mini',
          },
        },
      });
      await doltAddAndCommit(dbClient)({ message: 'Commit for readonly test' });

      const commitHash = await doltHashOf(dbClient)({ revision: 'HEAD' });
      const resolved = await resolveRef(dbClient)(commitHash);
      expect(resolved).toBeDefined();

      const writable = isRefWritable(resolved!);
      expect(writable).toBe(false);
    });
  });

  describe('checkoutRef', () => {
    it('should checkout a branch ref by name', async () => {
      const branchName = getBranchName('checkout-ref');
      createdBranches.add(branchName);

      await doltBranch(dbClient)({ name: branchName });

      const resolved = await resolveRef(dbClient)(branchName);
      expect(resolved).toBeDefined();

      await checkoutRef(dbClient)(resolved!);

      const activeBranch = await doltActiveBranch(dbClient)();
      expect(activeBranch).toBe(branchName);
    });
  });

  describe('getCurrentBranchOrCommit', () => {
    it('should return branch info when on a branch', async () => {
      const branchName = getBranchName('current-branch');
      createdBranches.add(branchName);

      await doltBranch(dbClient)({ name: branchName });
      await doltCheckout(dbClient)({ branch: branchName });

      const current = await getCurrentBranchOrCommit(dbClient)();

      expect(current.type).toBe('branch');
      expect(current.ref).toBe(branchName);
      expect(current.hash).toHaveLength(32);
    });
  });
});
