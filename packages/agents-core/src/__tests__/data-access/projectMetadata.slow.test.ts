import { beforeEach, describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import {
  countProjectsInRuntime,
  createProjectMetadata,
  deleteProjectMetadata,
  getProjectMetadata,
  listProjectsMetadata,
  listProjectsMetadataPaginated,
  projectsMetadataExists,
} from '../../data-access/runtime/projects';
import { createTestOrganization } from '../../db/runtime/test-runtime-client';

describe('Runtime Project Metadata Data Access', () => {
  const testTenantId = 'test-tenant-projects';

  beforeEach(async () => {
    // Create test organization (tenant) before each test
    await createTestOrganization(testRunDbClient, testTenantId);
  });

  describe('createProjectMetadata', () => {
    it('should create a new project metadata record', async () => {
      const projectData = {
        id: 'test-project-1',
        tenantId: testTenantId,
        mainBranchName: `${testTenantId}_test-project-1_main`,
        createdBy: 'test-user',
      };

      const result = await createProjectMetadata(testRunDbClient)(projectData);

      expect(result).toBeDefined();
      expect(result.id).toBe(projectData.id);
      expect(result.tenantId).toBe(projectData.tenantId);
      expect(result.mainBranchName).toBe(projectData.mainBranchName);
      expect(result.createdBy).toBe(projectData.createdBy);
      expect(result.createdAt).toBeDefined();
    });

    it('should create project metadata without createdBy', async () => {
      const projectData = {
        id: 'test-project-no-creator',
        tenantId: testTenantId,
        mainBranchName: `${testTenantId}_test-project-no-creator_main`,
      };

      const result = await createProjectMetadata(testRunDbClient)(projectData);

      expect(result).toBeDefined();
      expect(result.id).toBe(projectData.id);
      expect(result.createdBy).toBeNull();
    });

    it('should fail when creating duplicate project', async () => {
      const projectData = {
        id: 'duplicate-project',
        tenantId: testTenantId,
        mainBranchName: `${testTenantId}_duplicate-project_main`,
      };

      await createProjectMetadata(testRunDbClient)(projectData);

      await expect(createProjectMetadata(testRunDbClient)(projectData)).rejects.toThrow();
    });
  });

  describe('getProjectMetadata', () => {
    it('should get an existing project', async () => {
      const projectData = {
        id: 'get-test-project',
        tenantId: testTenantId,
        mainBranchName: `${testTenantId}_get-test-project_main`,
        createdBy: 'test-user',
      };

      await createProjectMetadata(testRunDbClient)(projectData);

      const result = await getProjectMetadata(testRunDbClient)({
        tenantId: testTenantId,
        projectId: projectData.id,
      });

      expect(result).toBeDefined();
      expect(result?.id).toBe(projectData.id);
      expect(result?.tenantId).toBe(testTenantId);
    });

    it('should return null for non-existent project', async () => {
      const result = await getProjectMetadata(testRunDbClient)({
        tenantId: testTenantId,
        projectId: 'non-existent-project',
      });

      expect(result).toBeNull();
    });

    it('should not return project from different tenant', async () => {
      const otherTenantId = 'other-tenant';
      await createTestOrganization(testRunDbClient, otherTenantId);

      const projectData = {
        id: 'tenant-scoped-project',
        tenantId: otherTenantId,
        mainBranchName: `${otherTenantId}_tenant-scoped-project_main`,
      };

      await createProjectMetadata(testRunDbClient)(projectData);

      const result = await getProjectMetadata(testRunDbClient)({
        tenantId: testTenantId,
        projectId: projectData.id,
      });

      expect(result).toBeNull();
    });
  });

  describe('listProjectsMetadata', () => {
    it('should list all projects for a tenant', async () => {
      // Create multiple projects
      await createProjectMetadata(testRunDbClient)({
        id: 'list-project-1',
        tenantId: testTenantId,
        mainBranchName: `${testTenantId}_list-project-1_main`,
      });
      await createProjectMetadata(testRunDbClient)({
        id: 'list-project-2',
        tenantId: testTenantId,
        mainBranchName: `${testTenantId}_list-project-2_main`,
      });

      const result = await listProjectsMetadata(testRunDbClient)({
        tenantId: testTenantId,
      });

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.id)).toContain('list-project-1');
      expect(result.map((p) => p.id)).toContain('list-project-2');
    });

    it('should return empty array for tenant with no projects', async () => {
      const emptyTenantId = 'empty-tenant';
      await createTestOrganization(testRunDbClient, emptyTenantId);

      const result = await listProjectsMetadata(testRunDbClient)({
        tenantId: emptyTenantId,
      });

      expect(result).toHaveLength(0);
    });

    it('should only list projects for the specified tenant', async () => {
      const otherTenantId = 'other-tenant-list';
      await createTestOrganization(testRunDbClient, otherTenantId);

      await createProjectMetadata(testRunDbClient)({
        id: 'tenant-a-project',
        tenantId: testTenantId,
        mainBranchName: `${testTenantId}_tenant-a-project_main`,
      });
      await createProjectMetadata(testRunDbClient)({
        id: 'tenant-b-project',
        tenantId: otherTenantId,
        mainBranchName: `${otherTenantId}_tenant-b-project_main`,
      });

      const result = await listProjectsMetadata(testRunDbClient)({
        tenantId: testTenantId,
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('tenant-a-project');
    });
  });

  describe('listProjectsMetadataPaginated', () => {
    beforeEach(async () => {
      // Create 15 projects for pagination tests
      for (let i = 1; i <= 15; i++) {
        await createProjectMetadata(testRunDbClient)({
          id: `paginated-project-${i.toString().padStart(2, '0')}`,
          tenantId: testTenantId,
          mainBranchName: `${testTenantId}_paginated-project-${i}_main`,
        });
      }
    });

    it('should return paginated results with default pagination', async () => {
      const result = await listProjectsMetadataPaginated(testRunDbClient)({
        tenantId: testTenantId,
      });

      expect(result.data).toHaveLength(10); // Default limit
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.total).toBe(15);
      expect(result.pagination.pages).toBe(2);
    });

    it('should return correct page when specified', async () => {
      const result = await listProjectsMetadataPaginated(testRunDbClient)({
        tenantId: testTenantId,
        pagination: { page: 2, limit: 10 },
      });

      expect(result.data).toHaveLength(5); // Remaining 5 on page 2
      expect(result.pagination.page).toBe(2);
    });

    it('should respect custom limit', async () => {
      const result = await listProjectsMetadataPaginated(testRunDbClient)({
        tenantId: testTenantId,
        pagination: { page: 1, limit: 5 },
      });

      expect(result.data).toHaveLength(5);
      expect(result.pagination.limit).toBe(5);
      expect(result.pagination.pages).toBe(3);
    });

    it('should cap limit at 100', async () => {
      const result = await listProjectsMetadataPaginated(testRunDbClient)({
        tenantId: testTenantId,
        pagination: { page: 1, limit: 200 },
      });

      expect(result.pagination.limit).toBe(100);
    });
  });

  describe('deleteProjectMetadata', () => {
    it('should delete an existing project', async () => {
      const projectData = {
        id: 'delete-test-project',
        tenantId: testTenantId,
        mainBranchName: `${testTenantId}_delete-test-project_main`,
      };

      await createProjectMetadata(testRunDbClient)(projectData);

      const deleted = await deleteProjectMetadata(testRunDbClient)({
        tenantId: testTenantId,
        projectId: projectData.id,
      });

      expect(deleted).toBe(true);

      // Verify it's actually deleted
      const result = await getProjectMetadata(testRunDbClient)({
        tenantId: testTenantId,
        projectId: projectData.id,
      });
      expect(result).toBeNull();
    });

    it('should return false when deleting non-existent project', async () => {
      const deleted = await deleteProjectMetadata(testRunDbClient)({
        tenantId: testTenantId,
        projectId: 'non-existent-delete',
      });

      expect(deleted).toBe(false);
    });

    it('should not delete project from different tenant', async () => {
      const otherTenantId = 'other-tenant-delete';
      await createTestOrganization(testRunDbClient, otherTenantId);

      const projectData = {
        id: 'cross-tenant-delete',
        tenantId: otherTenantId,
        mainBranchName: `${otherTenantId}_cross-tenant-delete_main`,
      };

      await createProjectMetadata(testRunDbClient)(projectData);

      // Try to delete from wrong tenant
      const deleted = await deleteProjectMetadata(testRunDbClient)({
        tenantId: testTenantId,
        projectId: projectData.id,
      });

      expect(deleted).toBe(false);

      // Verify it still exists
      const result = await getProjectMetadata(testRunDbClient)({
        tenantId: otherTenantId,
        projectId: projectData.id,
      });
      expect(result).not.toBeNull();
    });
  });

  describe('projectsMetadataExists', () => {
    it('should return true for existing project', async () => {
      const projectData = {
        id: 'exists-test-project',
        tenantId: testTenantId,
        mainBranchName: `${testTenantId}_exists-test-project_main`,
      };

      await createProjectMetadata(testRunDbClient)(projectData);

      const exists = await projectsMetadataExists(testRunDbClient)({
        tenantId: testTenantId,
        projectId: projectData.id,
      });

      expect(exists).toBe(true);
    });

    it('should return false for non-existent project', async () => {
      const exists = await projectsMetadataExists(testRunDbClient)({
        tenantId: testTenantId,
        projectId: 'non-existent-exists',
      });

      expect(exists).toBe(false);
    });
  });

  describe('countProjectsInRuntime', () => {
    it('should return correct count of projects', async () => {
      // Create 3 projects
      for (let i = 1; i <= 3; i++) {
        await createProjectMetadata(testRunDbClient)({
          id: `count-project-${i}`,
          tenantId: testTenantId,
          mainBranchName: `${testTenantId}_count-project-${i}_main`,
        });
      }

      const count = await countProjectsInRuntime(testRunDbClient)({
        tenantId: testTenantId,
      });

      expect(count).toBe(3);
    });

    it('should return 0 for tenant with no projects', async () => {
      const emptyTenantId = 'empty-tenant-count';
      await createTestOrganization(testRunDbClient, emptyTenantId);

      const count = await countProjectsInRuntime(testRunDbClient)({
        tenantId: emptyTenantId,
      });

      expect(count).toBe(0);
    });

    it('should only count projects for the specified tenant', async () => {
      const otherTenantId = 'other-tenant-count';
      await createTestOrganization(testRunDbClient, otherTenantId);

      await createProjectMetadata(testRunDbClient)({
        id: 'count-a',
        tenantId: testTenantId,
        mainBranchName: `${testTenantId}_count-a_main`,
      });
      await createProjectMetadata(testRunDbClient)({
        id: 'count-b',
        tenantId: otherTenantId,
        mainBranchName: `${otherTenantId}_count-b_main`,
      });

      const count = await countProjectsInRuntime(testRunDbClient)({
        tenantId: testTenantId,
      });

      expect(count).toBe(1);
    });
  });
});
