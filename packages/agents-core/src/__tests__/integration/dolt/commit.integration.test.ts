import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../../../data-access/projects';
import { cleanupTestData, getIntegrationTestClient } from '../../../db/integration-cleanup';
import { doltActiveBranch, doltBranch, doltCheckout } from '../../../dolt/branch';
import {
  doltAdd,
  doltAddAndCommit,
  doltCommit,
  doltHashOf,
  doltListTags,
  doltLog,
  doltTag,
} from '../../../dolt/commit';

const dbClient = getIntegrationTestClient();

describe('Commit Operations - Integration Tests', () => {
  const testPrefix = 'test-commit-integration';
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
    await cleanupTestData(testPrefix, createdBranches);
    createdBranches.clear();
  });

  describe('doltAdd', () => {
    it('should stage all changes', async () => {
      // Make a change (insert a test project)
      await createProject(dbClient)({
        id: 'test-project-add',
        tenantId: 'test-tenant',
        name: 'Test Project',
        description: 'Test Project Description',
        models: {
          base: {
            model: 'gpt-4.1-mini',
          },
        },
      });

      // Stage all changes
      await doltAdd(dbClient)({});

      // Commit to verify staging worked
      await doltCommit(dbClient)({ message: 'Test commit after add' });

      // Verify commit was created by checking log
      const log = await doltLog(dbClient)({ limit: 1 });
      expect(log[0].message).toBe('Test commit after add');
    });

    it('should stage specific tables', async () => {
      // Make a change
      await createProject(dbClient)({
        id: 'test-project-add-specific',
        tenantId: 'test-tenant',
        name: 'Test Project',
        description: 'Test Project Description',
        models: {
          base: {
            model: 'gpt-4.1-mini',
          },
        },
      });

      // Stage specific table
      await doltAdd(dbClient)({ tables: ['projects'] });

      // Commit to verify staging worked
      await doltCommit(dbClient)({ message: 'Test commit after selective add' });

      const log = await doltLog(dbClient)({ limit: 1 });
      expect(log[0].message).toBe('Test commit after selective add');
    });
  });

  describe('doltCommit', () => {
    it('should create a commit with a message', async () => {
      // Make a change
      await createProject(dbClient)({
        id: 'test-project-commit',
        tenantId: 'test-tenant',
        name: 'Test Project',
        description: 'Test Project Description',
        models: {
          base: {
            model: 'gpt-4.1-mini',
          },
        },
      });

      const commitMessage = 'Add test project';
      await doltCommit(dbClient)({ message: commitMessage });

      // Verify commit was created
      const log = await doltLog(dbClient)({ limit: 1 });
      expect(log[0].message).toBe(commitMessage);
      expect(log[0].commit_hash).toHaveLength(32);
    });

    it('should create a commit with author information', async () => {
      // Make a change
      await createProject(dbClient)({
        id: 'test-project-commit-author',
        tenantId: 'test-tenant',
        name: 'Test Project',
        description: 'Test Project Description',
        models: {
          base: {
            model: 'gpt-4.1-mini',
          },
        },
      });

      const author = {
        name: 'Test Author',
        email: 'test@example.com',
      };

      await doltCommit(dbClient)({
        message: 'Commit with author',
        author,
      });

      // Verify commit was created with author
      const log = await doltLog(dbClient)({ limit: 1 });
      expect(log[0].message).toBe('Commit with author');
      expect(log[0].committer).toBe('Test Author');
      expect(log[0].email).toBe('test@example.com');
    });

    it('should handle commit messages with special characters', async () => {
      // Make a change
      await createProject(dbClient)({
        id: 'test-project-commit-special',
        tenantId: 'test-tenant',
        name: 'Test Project',
        description: 'Test Project Description',
        models: {
          base: {
            model: 'gpt-4.1-mini',
          },
        },
      });

      const messageWithSpecialChars = "Add feature: user's special request";
      await doltCommit(dbClient)({ message: messageWithSpecialChars });

      const log = await doltLog(dbClient)({ limit: 1 });
      expect(log[0].message).toBe(messageWithSpecialChars);
    });
  });

  describe('doltAddAndCommit', () => {
    it('should add and commit in one operation', async () => {
      // Make a change
      await createProject(dbClient)({
        id: 'test-project-add-commit',
        tenantId: 'test-tenant',
        name: 'Test Project',
        description: 'Test Project Description',
        models: {
          base: {
            model: 'gpt-4.1-mini',
          },
        },
      });

      const message = 'Add and commit test';
      await doltAddAndCommit(dbClient)({ message });

      // Verify commit was created
      const log = await doltLog(dbClient)({ limit: 1 });
      expect(log[0].message).toBe(message);
    });
  });

  describe('doltLog', () => {
    it('should retrieve commit history', async () => {
      // Create multiple commits
      for (let i = 0; i < 3; i++) {
        await createProject(dbClient)({
          id: `test-project-log-${i}`,
          tenantId: 'test-tenant',
          name: `Test Project ${i}`,
          description: `Test Project Description ${i}`,
          models: {
            base: {
              model: 'gpt-4.1-mini',
            },
          },
        });
        await doltAddAndCommit(dbClient)({ message: `Commit ${i}` });
      }

      // Get log
      const log = await doltLog(dbClient)({});

      // Should have at least our 3 commits
      expect(log.length).toBeGreaterThanOrEqual(3);

      // Verify structure
      log.forEach((entry) => {
        expect(entry).toHaveProperty('commit_hash');
        expect(entry).toHaveProperty('committer');
        expect(entry).toHaveProperty('email');
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('message');
        expect(entry.commit_hash).toHaveLength(32);
      });
    });

    it('should limit number of log entries', async () => {
      // Get log with limit
      const log = await doltLog(dbClient)({ limit: 2 });

      expect(log.length).toBeLessThanOrEqual(2);
    });
  });

  describe('doltHashOf', () => {
    it('should get hash of HEAD', async () => {
      const hash = await doltHashOf(dbClient)({ revision: 'HEAD' });

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(32);
      expect(/^[0-9a-v]{32}$/.test(hash)).toBe(true);
    });

    it('should get hash of a branch', async () => {
      const branchHash = await doltHashOf(dbClient)({ revision: testBranch });

      expect(branchHash).toBeDefined();
      expect(branchHash).toHaveLength(32);
    });
  });

  describe('doltTag', () => {
    it('should create a tag at HEAD', async () => {
      // Make a commit
      await createProject(dbClient)({
        id: 'test-project-tag',
        tenantId: 'test-tenant',
        name: 'Test Project',
        description: 'Test Project Description',
        models: {
          base: {
            model: 'gpt-4.1-mini',
          },
        },
      });
      await doltAddAndCommit(dbClient)({ message: 'Commit for tag' });

      const tagName = getTagName('v1');
      createdTags.add(tagName);

      await doltTag(dbClient)({ name: tagName });

      // Verify tag was created
      const tags = await doltListTags(dbClient)();
      const createdTag = tags.find((t) => t.tag_name === tagName);

      expect(createdTag).toBeDefined();
      expect(createdTag!.tag_name).toBe(tagName);
      expect(createdTag!.tag_hash).toHaveLength(32);
    });

    it('should create a tag at a specific ref', async () => {
      // Make a commit
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
      await doltAddAndCommit(dbClient)({ message: 'Commit for ref tag' });

      const commitHash = await doltHashOf(dbClient)({ revision: 'HEAD' });
      const tagName = getTagName('v2');
      createdTags.add(tagName);

      await doltTag(dbClient)({ name: tagName, revision: commitHash });

      // Verify tag was created at correct ref
      const tags = await doltListTags(dbClient)();
      const createdTag = tags.find((t) => t.tag_name === tagName);

      expect(createdTag).toBeDefined();
      expect(createdTag!.tag_hash).toBe(commitHash);
    });

    it('should create a tag with a message', async () => {
      const tagName = getTagName('v3');
      const tagMessage = 'Release v3.0';
      createdTags.add(tagName);

      await doltTag(dbClient)({ name: tagName, message: tagMessage });

      const tags = await doltListTags(dbClient)();
      const createdTag = tags.find((t) => t.tag_name === tagName);

      expect(createdTag).toBeDefined();
      expect(createdTag!.message).toBe(tagMessage);
    });
  });

  describe('doltListTags', () => {
    it('should list all tags', async () => {
      // Create multiple tags
      const tag1 = getTagName('list1');
      const tag2 = getTagName('list2');
      createdTags.add(tag1);
      createdTags.add(tag2);

      await doltTag(dbClient)({ name: tag1 });
      await doltTag(dbClient)({ name: tag2 });

      const tags = await doltListTags(dbClient)();

      const foundTag1 = tags.find((t) => t.tag_name === tag1);
      const foundTag2 = tags.find((t) => t.tag_name === tag2);

      expect(foundTag1).toBeDefined();
      expect(foundTag2).toBeDefined();

      // Verify structure
      tags.forEach((tag) => {
        expect(tag).toHaveProperty('tag_name');
        expect(tag).toHaveProperty('tag_hash');
        expect(tag).toHaveProperty('tagger');
        expect(tag).toHaveProperty('email');
        expect(tag).toHaveProperty('date');
        expect(tag.tag_hash).toHaveLength(32);
      });
    });
  });
});
