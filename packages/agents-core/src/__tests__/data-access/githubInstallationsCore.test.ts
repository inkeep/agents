import { describe, expect, it } from 'vitest';
import {
  addRepositories,
  createInstallation,
  deleteInstallation,
  disconnectInstallation,
  getInstallationByGitHubId,
  getInstallationById,
  getInstallationsByTenantId,
  getProjectRepositoryAccess,
  setProjectRepositoryAccess,
  updateInstallationStatus,
  updateInstallationStatusByGitHubId,
} from '../../data-access/runtime/github-work-app-installations';
import { generateId, setupGitHubTestContext } from './githubTestUtils';

describe('GitHub Installations - Core', () => {
  const ctx = setupGitHubTestContext('core');

  describe('createInstallation', () => {
    it('should create an installation with default status', async () => {
      const result = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });

      expect(result.id).toBeDefined();
      expect(result.tenantId).toBe(ctx.tenantId);
      expect(result.installationId).toBe('12345678');
      expect(result.accountLogin).toBe('test-org');
      expect(result.accountType).toBe('Organization');
      expect(result.status).toBe('active');
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should create an installation with pending status', async () => {
      const result = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '12345679',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'pending',
      });

      expect(result.status).toBe('pending');
    });

    it('should support User account type', async () => {
      const result = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '12345680',
        accountLogin: 'test-user',
        accountId: '123456',
        accountType: 'User',
        status: 'active',
      });

      expect(result.accountType).toBe('User');
    });
  });

  describe('getInstallationByGitHubId', () => {
    it('should find installation by GitHub installation ID', async () => {
      await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });

      const result = await getInstallationByGitHubId(ctx.dbClient)('12345678');

      expect(result).not.toBeNull();
      expect(result?.installationId).toBe('12345678');
    });

    it('should return null for non-existent installation', async () => {
      const result = await getInstallationByGitHubId(ctx.dbClient)('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getInstallationById', () => {
    it('should find installation by internal ID with tenant validation', async () => {
      const created = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });

      const result = await getInstallationById(ctx.dbClient)({
        tenantId: ctx.tenantId,
        id: created.id,
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(created.id);
    });

    it('should return null for wrong tenant', async () => {
      const created = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });

      const result = await getInstallationById(ctx.dbClient)({
        tenantId: 'other-tenant',
        id: created.id,
      });

      expect(result).toBeNull();
    });
  });

  describe('getInstallationsByTenantId', () => {
    it('should get all active installations for a tenant', async () => {
      await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '11111111',
        accountLogin: 'org-1',
        accountId: '111',
        accountType: 'Organization',
        status: 'active',
      });

      await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '22222222',
        accountLogin: 'org-2',
        accountId: '222',
        accountType: 'Organization',
        status: 'active',
      });

      const result = await getInstallationsByTenantId(ctx.dbClient)({ tenantId: ctx.tenantId });

      expect(result).toHaveLength(2);
    });

    it('should exclude deleted installations by default', async () => {
      await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '11111111',
        accountLogin: 'org-1',
        accountId: '111',
        accountType: 'Organization',
        status: 'active',
      });

      await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '22222222',
        accountLogin: 'org-2',
        accountId: '222',
        accountType: 'Organization',
        status: 'disconnected',
      });

      const result = await getInstallationsByTenantId(ctx.dbClient)({ tenantId: ctx.tenantId });

      expect(result).toHaveLength(1);
      expect(result[0].installationId).toBe('11111111');
    });

    it('should include deleted installations when requested', async () => {
      await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '11111111',
        accountLogin: 'org-1',
        accountId: '111',
        accountType: 'Organization',
        status: 'active',
      });

      await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '22222222',
        accountLogin: 'org-2',
        accountId: '222',
        accountType: 'Organization',
        status: 'disconnected',
      });

      const result = await getInstallationsByTenantId(ctx.dbClient)({
        tenantId: ctx.tenantId,
        includeDisconnected: true,
      });

      expect(result).toHaveLength(2);
    });
  });

  describe('updateInstallationStatus', () => {
    it('should update installation status', async () => {
      const created = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });

      const updated = await updateInstallationStatus(ctx.dbClient)({
        tenantId: ctx.tenantId,
        id: created.id,
        status: 'suspended',
      });

      expect(updated?.status).toBe('suspended');
      expect(updated?.updatedAt).toBeDefined();
      if (updated?.updatedAt) {
        expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
          new Date(created.updatedAt).getTime()
        );
      }
    });

    it('should return null for non-existent installation', async () => {
      const updated = await updateInstallationStatus(ctx.dbClient)({
        tenantId: ctx.tenantId,
        id: 'non-existent',
        status: 'suspended',
      });

      expect(updated).toBeNull();
    });
  });

  describe('updateInstallationStatusByGitHubId', () => {
    it('should update status by GitHub installation ID', async () => {
      await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });

      const updated = await updateInstallationStatusByGitHubId(ctx.dbClient)({
        gitHubInstallationId: '12345678',
        status: 'suspended',
      });

      expect(updated?.status).toBe('suspended');
    });
  });

  describe('disconnectInstallation', () => {
    it('should soft delete an installation (set status to disconnected)', async () => {
      const created = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });

      const result = await disconnectInstallation(ctx.dbClient)({
        tenantId: ctx.tenantId,
        id: created.id,
      });

      expect(result).toBe(true);

      const after = await getInstallationById(ctx.dbClient)({
        tenantId: ctx.tenantId,
        id: created.id,
      });
      expect(after?.status).toBe('disconnected');
    });

    it('should remove project repository access when installation is deleted', async () => {
      const installation = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });

      const repos = await addRepositories(ctx.dbClient)({
        installationId: installation.id,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
        ],
      });

      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId: 'project-1',
        repositoryIds: [repos[0].id],
      });

      const accessBefore = await getProjectRepositoryAccess(ctx.dbClient)('project-1');
      expect(accessBefore).toHaveLength(1);

      await disconnectInstallation(ctx.dbClient)({
        tenantId: ctx.tenantId,
        id: installation.id,
      });

      const accessAfter = await getProjectRepositoryAccess(ctx.dbClient)('project-1');
      expect(accessAfter).toHaveLength(0);
    });
  });

  describe('deleteInstallation (hard delete)', () => {
    it('should permanently delete an installation', async () => {
      const created = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });

      const result = await deleteInstallation(ctx.dbClient)({
        tenantId: ctx.tenantId,
        id: created.id,
      });

      // deleteInstallation now returns the deleted record
      expect(result).not.toBeNull();
      expect(result?.id).toBe(created.id);

      const after = await getInstallationById(ctx.dbClient)({
        tenantId: ctx.tenantId,
        id: created.id,
      });
      expect(after).toBeNull();
    });

    it('should cascade delete repositories when installation is hard deleted', async () => {
      const installation = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });

      const repos = await addRepositories(ctx.dbClient)({
        installationId: installation.id,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
          {
            repositoryId: '222',
            repositoryName: 'repo-2',
            repositoryFullName: 'test-org/repo-2',
            private: true,
          },
        ],
      });

      expect(repos).toHaveLength(2);

      await deleteInstallation(ctx.dbClient)({
        tenantId: ctx.tenantId,
        id: installation.id,
      });

      const { getRepositoriesByInstallationId } = await import(
        '../../data-access/runtime/github-work-app-installations'
      );
      const reposAfter = await getRepositoriesByInstallationId(ctx.dbClient)(installation.id);
      expect(reposAfter).toHaveLength(0);
    });

    it('should cascade delete project repository access when installation is hard deleted', async () => {
      const installation = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });

      const repos = await addRepositories(ctx.dbClient)({
        installationId: installation.id,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
        ],
      });

      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId: 'project-1',
        repositoryIds: [repos[0].id],
      });

      const accessBefore = await getProjectRepositoryAccess(ctx.dbClient)('project-1');
      expect(accessBefore).toHaveLength(1);

      await deleteInstallation(ctx.dbClient)({
        tenantId: ctx.tenantId,
        id: installation.id,
      });

      const accessAfter = await getProjectRepositoryAccess(ctx.dbClient)('project-1');
      expect(accessAfter).toHaveLength(0);
    });

    it('should return null when installation does not exist', async () => {
      const result = await deleteInstallation(ctx.dbClient)({
        tenantId: ctx.tenantId,
        id: 'non-existent-id',
      });

      expect(result).toBeNull();
    });
  });
});
