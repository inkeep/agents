import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTestData, getIntegrationTestClient } from '../../../db/manage/dolt-cleanup';
import { createAgentsRunDatabaseClient } from '../../../db/runtime/runtime-client';
import { doltListBranches } from '../../../dolt/branch';
import {
  createProjectMetadataAndBranch,
  deleteProjectWithBranch,
  getProjectMainBranchName,
} from '../../../data-access/manage/projectLifecycle';
import {
  createProjectMetadata,
  getProjectMetadata,
  deleteProjectMetadata,
} from '../../../data-access/runtime/projects';

const configDb = getIntegrationTestClient();
const runDb = createAgentsRunDatabaseClient();

describe('Project Lifecycle - Integration Tests', () => {
  const testPrefix = 'test-project-lifecycle';
  const createdBranches = new Set<string>();
  const createdProjects: { tenantId: string; projectId: string }[] = [];

  // Helper to generate unique test IDs
  const getTestId = (suffix: string) => `${testPrefix}-${suffix}-${Date.now()}`;

  afterEach(async () => {
    // Clean up runtime DB projects
    for (const project of createdProjects) {
      try {
        await deleteProjectMetadata(runDb)(project);
      } catch {
        // Ignore if already deleted
      }
    }
    createdProjects.length = 0;

    // Clean up Dolt branches
    await cleanupTestData(testPrefix, createdBranches);
    createdBranches.clear();
  });

  describe('getProjectMainBranchName', () => {
    it('should generate correct branch name format', () => {
      const tenantId = 'tenant-123';
      const projectId = 'project-456';

      const branchName = getProjectMainBranchName(tenantId, projectId);

      expect(branchName).toBe('tenant-123_project-456_main');
    });
  });

  describe('createProjectMetadataAndBranch', () => {
    it('should create project metadata in runtime DB and branch in Dolt', async () => {
      const tenantId = getTestId('tenant');
      const projectId = getTestId('project');
      const expectedBranchName = getProjectMainBranchName(tenantId, projectId);

      createdBranches.add(expectedBranchName);
      createdProjects.push({ tenantId, projectId });

      const result = await createProjectMetadataAndBranch(
        runDb,
        configDb
      )({
        tenantId,
        projectId,
        createdBy: 'test-user',
      });

      // Verify the return value
      expect(result.id).toBe(projectId);
      expect(result.tenantId).toBe(tenantId);
      expect(result.mainBranchName).toBe(expectedBranchName);
      expect(result.createdBy).toBe('test-user');
      expect(result.createdAt).toBeDefined();

      // Verify project metadata exists in runtime DB
      const projectMetadata = await getProjectMetadata(runDb)({ tenantId, projectId });
      expect(projectMetadata).not.toBeNull();
      expect(projectMetadata!.id).toBe(projectId);
      expect(projectMetadata!.mainBranchName).toBe(expectedBranchName);

      // Verify branch was created in Dolt
      const branches = await doltListBranches(configDb)();
      const createdBranch = branches.find((b) => b.name === expectedBranchName);
      expect(createdBranch).toBeDefined();
      expect(createdBranch!.hash).toHaveLength(32);
    });

    it('should create project without createdBy', async () => {
      const tenantId = getTestId('tenant-no-creator');
      const projectId = getTestId('project-no-creator');
      const expectedBranchName = getProjectMainBranchName(tenantId, projectId);

      createdBranches.add(expectedBranchName);
      createdProjects.push({ tenantId, projectId });

      const result = await createProjectMetadataAndBranch(
        runDb,
        configDb
      )({
        tenantId,
        projectId,
      });

      expect(result.createdBy).toBeNull();

      // Verify both exist
      const projectMetadata = await getProjectMetadata(runDb)({ tenantId, projectId });
      expect(projectMetadata).not.toBeNull();

      const branches = await doltListBranches(configDb)();
      expect(branches.find((b) => b.name === expectedBranchName)).toBeDefined();
    });

    it('should fail if project already exists in runtime DB', async () => {
      const tenantId = getTestId('tenant-dup');
      const projectId = getTestId('project-dup');
      const expectedBranchName = getProjectMainBranchName(tenantId, projectId);

      createdBranches.add(expectedBranchName);
      createdProjects.push({ tenantId, projectId });

      // Create the first project
      await createProjectMetadataAndBranch(
        runDb,
        configDb
      )({
        tenantId,
        projectId,
      });

      // Try to create duplicate - should fail
      await expect(
        createProjectMetadataAndBranch(
          runDb,
          configDb
        )({
          tenantId,
          projectId,
        })
      ).rejects.toThrow();
    });
  });

  describe('deleteProjectWithBranch', () => {
    it('should delete project metadata and branch', async () => {
      const tenantId = getTestId('tenant-delete');
      const projectId = getTestId('project-delete');
      const branchName = getProjectMainBranchName(tenantId, projectId);

      createdProjects.push({ tenantId, projectId });

      // Create the project first
      await createProjectMetadataAndBranch(
        runDb,
        configDb
      )({
        tenantId,
        projectId,
      });

      // Verify it exists
      let projectMetadata = await getProjectMetadata(runDb)({ tenantId, projectId });
      expect(projectMetadata).not.toBeNull();

      let branches = await doltListBranches(configDb)();
      expect(branches.find((b) => b.name === branchName)).toBeDefined();

      // Delete it
      const result = await deleteProjectWithBranch(
        runDb,
        configDb
      )({
        tenantId,
        projectId,
      });

      expect(result).toBe(true);

      // Verify metadata is deleted from runtime DB
      projectMetadata = await getProjectMetadata(runDb)({ tenantId, projectId });
      expect(projectMetadata).toBeNull();

      // Verify branch is deleted from Dolt
      branches = await doltListBranches(configDb)();
      expect(branches.find((b) => b.name === branchName)).toBeUndefined();

      // Remove from cleanup list since already deleted
      const index = createdProjects.findIndex(
        (p) => p.tenantId === tenantId && p.projectId === projectId
      );
      if (index > -1) {
        createdProjects.splice(index, 1);
      }
    });

    it('should return false for non-existent project', async () => {
      const tenantId = getTestId('tenant-nonexistent');
      const projectId = getTestId('project-nonexistent');

      const result = await deleteProjectWithBranch(
        runDb,
        configDb
      )({
        tenantId,
        projectId,
      });

      expect(result).toBe(false);
    });

    it('should still delete metadata even if branch does not exist', async () => {
      const tenantId = getTestId('tenant-no-branch');
      const projectId = getTestId('project-no-branch');

      createdProjects.push({ tenantId, projectId });

      // Manually create only the metadata (simulating orphaned metadata)
      await createProjectMetadata(runDb)({
        id: projectId,
        tenantId,
        mainBranchName: getProjectMainBranchName(tenantId, projectId),
      });

      // Verify metadata exists
      let projectMetadata = await getProjectMetadata(runDb)({ tenantId, projectId });
      expect(projectMetadata).not.toBeNull();

      // Delete - should succeed even though branch doesn't exist
      const result = await deleteProjectWithBranch(
        runDb,
        configDb
      )({
        tenantId,
        projectId,
      });

      expect(result).toBe(true);

      // Verify metadata is deleted
      projectMetadata = await getProjectMetadata(runDb)({ tenantId, projectId });
      expect(projectMetadata).toBeNull();

      // Remove from cleanup list since already deleted
      const index = createdProjects.findIndex(
        (p) => p.tenantId === tenantId && p.projectId === projectId
      );
      if (index > -1) {
        createdProjects.splice(index, 1);
      }
    });
  });

  describe('branch naming convention', () => {
    it('should create branches with {tenantId}_{projectId}_main format', async () => {
      const tenantId = getTestId('tenant-naming');
      const projectId = getTestId('project-naming');

      createdProjects.push({ tenantId, projectId });

      const result = await createProjectMetadataAndBranch(
        runDb,
        configDb
      )({
        tenantId,
        projectId,
      });

      createdBranches.add(result.mainBranchName);

      // Verify the branch name follows the convention
      expect(result.mainBranchName).toBe(`${tenantId}_${projectId}_main`);
      expect(result.mainBranchName).toContain('_main');

      // Verify it can be found in Dolt
      const branches = await doltListBranches(configDb)();
      const branch = branches.find((b) => b.name === result.mainBranchName);
      expect(branch).toBeDefined();
    });

    it('should handle tenant and project IDs with hyphens', async () => {
      const tenantId = getTestId('tenant-with-hyphens');
      const projectId = getTestId('project-with-hyphens');

      createdProjects.push({ tenantId, projectId });

      const result = await createProjectMetadataAndBranch(
        runDb,
        configDb
      )({
        tenantId,
        projectId,
      });

      createdBranches.add(result.mainBranchName);

      expect(result.mainBranchName).toBe(`${tenantId}_${projectId}_main`);

      // Verify branch exists in Dolt
      const branches = await doltListBranches(configDb)();
      expect(branches.find((b) => b.name === result.mainBranchName)).toBeDefined();
    });
  });

  describe('multiple projects per tenant', () => {
    it('should create separate branches for each project in the same tenant', async () => {
      const tenantId = getTestId('multi-project-tenant');
      const projectId1 = getTestId('project-1');
      const projectId2 = getTestId('project-2');

      createdProjects.push({ tenantId, projectId: projectId1 });
      createdProjects.push({ tenantId, projectId: projectId2 });

      // Create first project
      const result1 = await createProjectMetadataAndBranch(
        runDb,
        configDb
      )({
        tenantId,
        projectId: projectId1,
      });
      createdBranches.add(result1.mainBranchName);

      // Create second project
      const result2 = await createProjectMetadataAndBranch(
        runDb,
        configDb
      )({
        tenantId,
        projectId: projectId2,
      });
      createdBranches.add(result2.mainBranchName);

      // Verify both branches exist
      const branches = await doltListBranches(configDb)();
      const branch1 = branches.find((b) => b.name === result1.mainBranchName);
      const branch2 = branches.find((b) => b.name === result2.mainBranchName);

      expect(branch1).toBeDefined();
      expect(branch2).toBeDefined();
      expect(branch1!.name).not.toBe(branch2!.name);

      // Verify both projects exist in runtime DB
      const metadata1 = await getProjectMetadata(runDb)({ tenantId, projectId: projectId1 });
      const metadata2 = await getProjectMetadata(runDb)({ tenantId, projectId: projectId2 });

      expect(metadata1).not.toBeNull();
      expect(metadata2).not.toBeNull();
      expect(metadata1!.mainBranchName).toBe(result1.mainBranchName);
      expect(metadata2!.mainBranchName).toBe(result2.mainBranchName);
    });
  });
});
