import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createProjectMetadataAndBranch,
  deleteProjectWithBranch,
  getProjectMainBranchName,
} from '../../data-access/manage/projectLifecycle';
import { createProjectMetadata, getProjectMetadata } from '../../data-access/runtime/projects';
import { createTestOrganization } from '../../db/runtime/test-runtime-client';
import { testRunDbClient } from '../setup';

// Mock the dolt branch operations
vi.mock('../../dolt/branch', () => ({
  doltBranch: vi.fn(),
  doltBranchExists: vi.fn(),
  doltCheckout: vi.fn(),
  doltDeleteBranch: vi.fn(),
}));

// Import mocked modules
import { doltBranch, doltBranchExists, doltCheckout, doltDeleteBranch } from '../../dolt/branch';

// Type the mocked functions
const mockedDoltBranch = doltBranch as ReturnType<typeof vi.fn>;
const mockedDoltBranchExists = doltBranchExists as ReturnType<typeof vi.fn>;
const mockedDoltCheckout = doltCheckout as ReturnType<typeof vi.fn>;
const mockedDoltDeleteBranch = doltDeleteBranch as ReturnType<typeof vi.fn>;

describe('Project Lifecycle Utilities', () => {
  const testTenantId = 'test-tenant-lifecycle';

  beforeEach(async () => {
    vi.clearAllMocks();
    await createTestOrganization(testRunDbClient, testTenantId);
  });

  describe('getProjectMainBranchName', () => {
    it('should generate correct branch name format', () => {
      const result = getProjectMainBranchName('tenant-1', 'project-1');
      expect(result).toBe('tenant-1_project-1_main');
    });

    it('should handle various tenant and project IDs', () => {
      expect(getProjectMainBranchName('abc', 'xyz')).toBe('abc_xyz_main');
      expect(getProjectMainBranchName('tenant_with_underscore', 'project')).toBe(
        'tenant_with_underscore_project_main'
      );
      expect(getProjectMainBranchName('org-123', 'proj-456')).toBe('org-123_proj-456_main');
    });

    it('should be consistent for same inputs', () => {
      const result1 = getProjectMainBranchName('tenant', 'project');
      const result2 = getProjectMainBranchName('tenant', 'project');
      expect(result1).toBe(result2);
    });
  });

  describe('createProjectMetadataAndBranch', () => {
    it('should create project metadata and call doltBranch', async () => {
      const mockConfigDb = {} as any;
      const mockDoltBranchExistsFn = vi.fn().mockResolvedValue(false);
      mockedDoltBranchExists.mockReturnValue(mockDoltBranchExistsFn);
      const mockDoltBranchFn = vi.fn().mockResolvedValue(undefined);
      mockedDoltBranch.mockReturnValue(mockDoltBranchFn);

      const result = await createProjectMetadataAndBranch(
        testRunDbClient,
        mockConfigDb
      )({
        tenantId: testTenantId,
        projectId: 'lifecycle-test-project',
        createdBy: 'test-user',
      });

      // Verify project metadata was created
      expect(result.id).toBe('lifecycle-test-project');
      expect(result.tenantId).toBe(testTenantId);
      expect(result.mainBranchName).toBe(`${testTenantId}_lifecycle-test-project_main`);
      expect(result.createdBy).toBe('test-user');
      expect(result.createdAt).toBeDefined();

      // Verify doltBranch was called with correct branch name
      expect(mockedDoltBranch).toHaveBeenCalledWith(mockConfigDb);
      expect(mockDoltBranchFn).toHaveBeenCalledWith({
        name: `${testTenantId}_lifecycle-test-project_main`,
      });

      // Verify project exists in runtime DB
      const project = await getProjectMetadata(testRunDbClient)({
        tenantId: testTenantId,
        projectId: 'lifecycle-test-project',
      });
      expect(project).not.toBeNull();
    });

    it('should rollback project metadata if branch creation fails', async () => {
      const mockConfigDb = {} as any;
      const mockDoltBranchExistsFn = vi.fn().mockResolvedValue(false);
      mockedDoltBranchExists.mockReturnValue(mockDoltBranchExistsFn);
      const mockDoltBranchFn = vi.fn().mockRejectedValue(new Error('Branch creation failed'));
      mockedDoltBranch.mockReturnValue(mockDoltBranchFn);

      await expect(
        createProjectMetadataAndBranch(
          testRunDbClient,
          mockConfigDb
        )({
          tenantId: testTenantId,
          projectId: 'rollback-test-project',
        })
      ).rejects.toThrow('Branch creation failed');

      // Verify project was rolled back (deleted from runtime DB)
      const project = await getProjectMetadata(testRunDbClient)({
        tenantId: testTenantId,
        projectId: 'rollback-test-project',
      });
      expect(project).toBeNull();
    });

    it('should create project without createdBy', async () => {
      const mockConfigDb = {} as any;
      const mockDoltBranchExistsFn = vi.fn().mockResolvedValue(false);
      mockedDoltBranchExists.mockReturnValue(mockDoltBranchExistsFn);
      const mockDoltBranchFn = vi.fn().mockResolvedValue(undefined);
      mockedDoltBranch.mockReturnValue(mockDoltBranchFn);

      const result = await createProjectMetadataAndBranch(
        testRunDbClient,
        mockConfigDb
      )({
        tenantId: testTenantId,
        projectId: 'no-creator-project',
      });

      expect(result.createdBy).toBeNull();
    });
  });

  describe('deleteProjectWithBranch', () => {
    it('should delete project metadata and branch', async () => {
      const mockConfigDb = {} as any;

      // First create a project
      await createProjectMetadata(testRunDbClient)({
        id: 'delete-lifecycle-project',
        tenantId: testTenantId,
        mainBranchName: `${testTenantId}_delete-lifecycle-project_main`,
      });

      const mockDoltDeleteBranchFn = vi.fn().mockResolvedValue(undefined);
      mockedDoltDeleteBranch.mockReturnValue(mockDoltDeleteBranchFn);

      const mockDoltCheckoutFn = vi.fn().mockResolvedValue(undefined);
      mockedDoltCheckout.mockReturnValue(mockDoltCheckoutFn);

      const result = await deleteProjectWithBranch(
        testRunDbClient,
        mockConfigDb
      )({
        tenantId: testTenantId,
        projectId: 'delete-lifecycle-project',
      });

      expect(result).toBe(true);

      // Verify doltCheckout was called
      expect(mockedDoltCheckout).toHaveBeenCalledWith(mockConfigDb);
      expect(mockDoltCheckoutFn).toHaveBeenCalledWith({ branch: 'main' });

      // Verify doltDeleteBranch was called
      expect(mockedDoltDeleteBranch).toHaveBeenCalledWith(mockConfigDb);
      expect(mockDoltDeleteBranchFn).toHaveBeenCalledWith({
        name: `${testTenantId}_delete-lifecycle-project_main`,
        force: true,
      });

      // Verify project was deleted from runtime DB
      const project = await getProjectMetadata(testRunDbClient)({
        tenantId: testTenantId,
        projectId: 'delete-lifecycle-project',
      });
      expect(project).toBeNull();
    });

    it('should return false for non-existent project', async () => {
      const mockConfigDb = {} as any;

      const result = await deleteProjectWithBranch(
        testRunDbClient,
        mockConfigDb
      )({
        tenantId: testTenantId,
        projectId: 'non-existent-project',
      });

      expect(result).toBe(false);

      // doltDeleteBranch should not have been called
      expect(mockedDoltDeleteBranch).not.toHaveBeenCalled();
    });

    it('should still delete project metadata even if branch deletion fails', async () => {
      const mockConfigDb = {} as any;

      // Create a project first
      await createProjectMetadata(testRunDbClient)({
        id: 'branch-fail-project',
        tenantId: testTenantId,
        mainBranchName: `${testTenantId}_branch-fail-project_main`,
      });

      const mockDoltDeleteBranchFn = vi.fn().mockRejectedValue(new Error('Branch deletion failed'));
      mockedDoltDeleteBranch.mockReturnValue(mockDoltDeleteBranchFn);

      const mockDoltCheckoutFn = vi.fn().mockResolvedValue(undefined);
      mockedDoltCheckout.mockReturnValue(mockDoltCheckoutFn);

      // Should not throw, but continue with cleanup
      const result = await deleteProjectWithBranch(
        testRunDbClient,
        mockConfigDb
      )({
        tenantId: testTenantId,
        projectId: 'branch-fail-project',
      });

      expect(result).toBe(true);

      // Verify project was still deleted from runtime DB
      const project = await getProjectMetadata(testRunDbClient)({
        tenantId: testTenantId,
        projectId: 'branch-fail-project',
      });
      expect(project).toBeNull();
    });
  });
});
