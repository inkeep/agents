import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTestData, getIntegrationTestClient } from '../../../db/integration-cleanup';
// import * as schema from '../../../db/schema';
import {
  doltActiveBranch,
  doltBranch,
  doltCheckout,
  doltDeleteBranch,
  doltGetBranchNamespace,
  doltListBranches,
  doltRenameBranch,
} from '../../../dolt/branch';

// import { createBranch, listBranchesForAgent } from '../../../dolt/branches-api';
// import { doltAddAndCommit } from '../../../dolt/commit';

const dbClient = getIntegrationTestClient();

describe('Branch Operations - Integration Tests', () => {
  const testPrefix = 'test-branch-integration';
  const createdBranches = new Set<string>();

  // Helper to generate unique branch names
  const getBranchName = (suffix: string) => `${testPrefix}-${suffix}-${Date.now()}`;

  afterEach(async () => {
    // Clean up all test branches
    await cleanupTestData(testPrefix, createdBranches);
    createdBranches.clear();
  });

  describe('doltBranch', () => {
    it('should create a new branch without start point', async () => {
      const branchName = getBranchName('simple');
      createdBranches.add(branchName);

      await doltBranch(dbClient)({ name: branchName });

      // Verify branch was created
      const branches = await doltListBranches(dbClient)();
      const created = branches.find((b) => b.name === branchName);

      expect(created).toBeDefined();
      expect(created!.name).toBe(branchName);
      expect(created!.hash).toBeDefined();
      expect(created!.hash).toHaveLength(32);
    });

    it('should create a new branch from a start point', async () => {
      const baseBranch = getBranchName('base');
      const derivedBranch = getBranchName('derived');
      createdBranches.add(baseBranch);
      createdBranches.add(derivedBranch);

      // Create base branch
      await doltBranch(dbClient)({ name: baseBranch });

      // Get base branch hash
      const branches = await doltListBranches(dbClient)();
      const base = branches.find((b) => b.name === baseBranch);
      const baseHash = base!.hash;

      // Create derived branch from base
      await doltBranch(dbClient)({ name: derivedBranch, startPoint: baseBranch });

      // Verify derived branch has same hash as base
      const updatedBranches = await doltListBranches(dbClient)();
      const derived = updatedBranches.find((b) => b.name === derivedBranch);

      expect(derived).toBeDefined();
      expect(derived!.hash).toBe(baseHash);
    });

    it('should fail when creating a branch that already exists', async () => {
      const branchName = getBranchName('duplicate');
      createdBranches.add(branchName);

      await doltBranch(dbClient)({ name: branchName });

      // Try to create the same branch again
      await expect(doltBranch(dbClient)({ name: branchName })).rejects.toThrow();
    });
  });

  describe('doltDeleteBranch', () => {
    it('should delete a branch with force flag', async () => {
      const branchName = getBranchName('to-delete');
      createdBranches.add(branchName);

      // Create branch
      await doltBranch(dbClient)({ name: branchName });

      // Verify it exists
      let branches = await doltListBranches(dbClient)();
      expect(branches.find((b) => b.name === branchName)).toBeDefined();

      // Delete it
      await doltDeleteBranch(dbClient)({ name: branchName, force: true });
      createdBranches.delete(branchName); // Already deleted

      // Verify it's gone
      branches = await doltListBranches(dbClient)();
      expect(branches.find((b) => b.name === branchName)).toBeUndefined();
    });

    it('should fail when deleting non-existent branch', async () => {
      const branchName = getBranchName('non-existent');

      await expect(doltDeleteBranch(dbClient)({ name: branchName, force: true })).rejects.toThrow();
    });
  });

  describe('doltRenameBranch', () => {
    it('should rename a branch', async () => {
      const oldName = getBranchName('old');
      const newName = getBranchName('new');
      createdBranches.add(oldName);

      // Create branch
      await doltBranch(dbClient)({ name: oldName });

      // Get original hash
      let branches = await doltListBranches(dbClient)();
      const originalHash = branches.find((b) => b.name === oldName)!.hash;

      // Rename it
      await doltRenameBranch(dbClient)({ oldName, newName });
      createdBranches.delete(oldName);
      createdBranches.add(newName);

      // Verify old name is gone and new name exists with same hash
      branches = await doltListBranches(dbClient)();
      expect(branches.find((b) => b.name === oldName)).toBeUndefined();

      const renamed = branches.find((b) => b.name === newName);
      expect(renamed).toBeDefined();
      expect(renamed!.hash).toBe(originalHash);
    });
  });

  describe('doltListBranches', () => {
    it('should list all branches', async () => {
      const branch1 = getBranchName('list1');
      const branch2 = getBranchName('list2');
      createdBranches.add(branch1);
      createdBranches.add(branch2);

      await doltBranch(dbClient)({ name: branch1 });
      await doltBranch(dbClient)({ name: branch2 });

      const branches = await doltListBranches(dbClient)();

      expect(branches.find((b) => b.name === branch1)).toBeDefined();
      expect(branches.find((b) => b.name === branch2)).toBeDefined();

      // Verify structure
      branches.forEach((branch) => {
        expect(branch).toHaveProperty('name');
        expect(branch).toHaveProperty('hash');
        expect(branch).toHaveProperty('latest_commit_date');
        expect(branch.hash).toHaveLength(32);
      });
    });
  });

  describe('doltCheckout', () => {
    it('should checkout an existing branch', async () => {
      const branchName = getBranchName('checkout');
      createdBranches.add(branchName);

      // Create branch
      await doltBranch(dbClient)({ name: branchName });

      // Get current branch
      const beforeCheckout = await doltActiveBranch(dbClient)();

      // Checkout the new branch
      await doltCheckout(dbClient)({ branch: branchName });

      // Verify we're on the new branch
      const afterCheckout = await doltActiveBranch(dbClient)();
      expect(afterCheckout).toBe(branchName);

      // Checkout back to original branch
      if (beforeCheckout) {
        await doltCheckout(dbClient)({ branch: beforeCheckout });
      }
    });

    it('should create and checkout a new branch', async () => {
      const branchName = getBranchName('checkout-create');
      createdBranches.add(branchName);

      // Create and checkout in one operation
      await doltCheckout(dbClient)({ branch: branchName, create: true });

      // Verify we're on the new branch
      const activeBranch = await doltActiveBranch(dbClient)();
      expect(activeBranch).toBe(branchName);

      // Verify branch exists in list
      const branches = await doltListBranches(dbClient)();
      expect(branches.find((b) => b.name === branchName)).toBeDefined();

      // Checkout main to clean up
      await doltCheckout(dbClient)({ branch: 'main' });
    });
  });

  describe('doltActiveBranch', () => {
    it('should return the current active branch', async () => {
      const activeBranch = await doltActiveBranch(dbClient)();

      expect(activeBranch).toBeDefined();
      expect(typeof activeBranch).toBe('string');
      expect(activeBranch.length).toBeGreaterThan(0);
    });
  });

  describe('doltGetBranchNamespace', () => {
    it('should generate correct namespaced branch name', () => {
      const namespace = doltGetBranchNamespace({
        tenantId: 'tenant1',
        projectId: 'project1',
        branchName: 'feature-x',
      })();

      expect(namespace).toBe('tenant1_project1_feature-x');
    });

    it('should handle branch names with special characters', () => {
      const namespace = doltGetBranchNamespace({
        tenantId: 'tenant1',
        projectId: 'project1',
        branchName: 'feature/branch-name',
      })();

      expect(namespace).toBe('tenant1_project1_feature/branch-name');
    });
  });

  // describe('listBranchesForAgent', () => {
  //   const testTenantId = `test-tenant-${Date.now()}`;
  //   const testProjectId = `test-project-${Date.now()}`;
  //   const testAgentId = `test-agent-${Date.now()}`;
  //   const testAgentId2 = `test-agent-2-${Date.now()}`;

  //   beforeEach(async () => {
  //     await doltBranch(dbClient)({ name: `${testTenantId}_main` });

  //     // Create project and agent on main branch
  //     await dbClient
  //       .insert(schema.projects)
  //       .values({
  //         tenantId: testTenantId,
  //         id: testProjectId,
  //         name: 'Test Project',
  //         description: 'Project for testing',
  //       })
  //       .onConflictDoNothing();

  //     await dbClient
  //       .insert(schema.agents)
  //       .values({
  //         tenantId: testTenantId,
  //         projectId: testProjectId,
  //         id: testAgentId,
  //         name: 'Test Agent',
  //         description: 'Agent for testing',
  //       })
  //       .onConflictDoNothing();

  //     // Commit initial data
  //     await doltAddAndCommit(dbClient)({
  //       message: 'Initial commit with project and agent',
  //     });
  //   });

  //   it('should find agent on main branch', async () => {
  //     const branches = await listBranchesForAgent(dbClient)({
  //       tenantId: testTenantId,
  //       projectId: testProjectId,
  //       agentId: testAgentId,
  //     });

  //     expect(branches.length).toBeGreaterThan(0);
  //     const mainBranch = branches.find((b) => b.baseName === 'main');
  //     expect(mainBranch).toBeDefined();
  //   });

  //   it('should find agent on multiple branches', async () => {
  //     // Create branch1 and add agent to it
  //     const branch1Name = getBranchName('agent-branch1');
  //     createdBranches.add(branch1Name);
  //     await createBranch(dbClient)({
  //       tenantId: testTenantId,
  //       projectId: testProjectId,
  //       name: branch1Name,
  //     });
  //     createdBranches.add(branch1Name);

  //     const branch1FullName = doltGetBranchNamespace({
  //       tenantId: testTenantId,
  //       projectId: testProjectId,
  //       branchName: branch1Name,
  //     })();

  //     await doltCheckout(dbClient)({ branch: branch1FullName });
  //     await dbClient
  //       .insert(schema.agents)
  //       .values({
  //         tenantId: testTenantId,
  //         projectId: testProjectId,
  //         id: testAgentId,
  //         name: 'Test Agent',
  //         description: 'Agent for testing',
  //       })
  //       .onConflictDoNothing();

  //     await doltAddAndCommit(dbClient)({
  //       message: 'Add agent to branch1',
  //     });

  //     // Create branch2 and add agent to it
  //     const branch2Name = getBranchName('agent-branch2');
  //     createdBranches.add(branch2Name);
  //     await createBranch(dbClient)({
  //       tenantId: testTenantId,
  //       projectId: testProjectId,
  //       name: branch2Name,
  //     });

  //     const branch2FullName = doltGetBranchNamespace({
  //       tenantId: testTenantId,
  //       projectId: testProjectId,
  //       branchName: branch2Name,
  //     })();

  //     await doltCheckout(dbClient)({ branch: branch2FullName });
  //     await dbClient
  //       .insert(schema.agents)
  //       .values({
  //         tenantId: testTenantId,
  //         projectId: testProjectId,
  //         id: testAgentId,
  //         name: 'Test Agent',
  //         description: 'Agent for testing',
  //       })
  //       .onConflictDoNothing();

  //     await doltAddAndCommit(dbClient)({
  //       message: 'Add agent to branch2',
  //     });

  //     // Create branch3 without the agent
  //     const branch3Name = getBranchName('agent-branch3');
  //     createdBranches.add(branch3Name);
  //     await createBranch(dbClient)({
  //       tenantId: testTenantId,
  //       projectId: testProjectId,
  //       name: branch3Name,
  //     });

  //     // Checkout back to main
  //     const mainBranchName = `${testTenantId}_main`;
  //     await doltCheckout(dbClient)({ branch: mainBranchName });

  //     // Test listBranchesForAgent
  //     const branches = await listBranchesForAgent(dbClient)({
  //       tenantId: testTenantId,
  //       projectId: testProjectId,
  //       agentId: testAgentId,
  //     });

  //     // Should find agent on main, branch1, and branch2, but not branch3
  //     const branchNames = branches.map((b) => b.baseName);
  //     expect(branchNames).toContain('main');
  //     expect(branchNames).toContain(branch1Name);
  //     expect(branchNames).toContain(branch2Name);
  //     expect(branchNames).not.toContain(branch3Name);
  //   });

  //   it('should not find agent that does not exist', async () => {
  //     const nonExistentAgentId = `non-existent-${Date.now()}`;
  //     const branches = await listBranchesForAgent(dbClient)({
  //       tenantId: testTenantId,
  //       projectId: testProjectId,
  //       agentId: nonExistentAgentId,
  //     });

  //     expect(branches.length).toBe(0);
  //   });

  //   it('should only return branches for the specific agent', async () => {
  //     // Create branch with a different agent
  //     const branchName = getBranchName('other-agent-branch');
  //     createdBranches.add(branchName);
  //     await createBranch(dbClient)({
  //       tenantId: testTenantId,
  //       projectId: testProjectId,
  //       name: branchName,
  //     });

  //     const branchFullName = doltGetBranchNamespace({
  //       tenantId: testTenantId,
  //       projectId: testProjectId,
  //       branchName: branchName,
  //     })();

  //     await doltCheckout(dbClient)({ branch: branchFullName });
  //     await dbClient
  //       .insert(schema.agents)
  //       .values({
  //         tenantId: testTenantId,
  //         projectId: testProjectId,
  //         id: testAgentId2,
  //         name: 'Different Agent',
  //         description: 'Different agent for testing',
  //       })
  //       .onConflictDoNothing();

  //     await doltAddAndCommit(dbClient)({
  //       message: 'Add different agent to branch',
  //     });

  //     // Checkout back to main
  //     const mainBranchName = `${testTenantId}_main`;
  //     await doltCheckout(dbClient)({ branch: mainBranchName });

  //     // Test listBranchesForAgent for testAgentId
  //     const branches = await listBranchesForAgent(dbClient)({
  //       tenantId: testTenantId,
  //       projectId: testProjectId,
  //       agentId: testAgentId,
  //     });

  //     // Should not include the branch with the different agent
  //     const branchNames = branches.map((b) => b.baseName);
  //     expect(branchNames).not.toContain(branchName);
  //     expect(branchNames).toContain('main');
  //   });
  // });
});
