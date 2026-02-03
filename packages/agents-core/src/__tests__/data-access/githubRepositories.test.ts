import { beforeEach, describe, expect, it } from 'vitest';
import {
  addRepositories,
  createInstallation,
  getProjectRepositoryAccess,
  getRepositoriesByInstallationId,
  getRepositoriesByTenantId,
  getRepositoryByFullName,
  getRepositoryById,
  getRepositoryCount,
  getRepositoryCountsByTenantId,
  removeRepositories,
  setProjectRepositoryAccess,
  syncRepositories,
} from '../../data-access/runtime/github-work-app-installations';
import { createTestInstallation, generateId, setupGitHubTestContext } from './githubTestUtils';

describe('GitHub Repositories - Management', () => {
  const ctx = setupGitHubTestContext('repos');
  let installationId: string;

  beforeEach(async () => {
    const installation = await createTestInstallation(ctx.dbClient, ctx.tenantId);
    installationId = installation.id;
  });

  describe('syncRepositories', () => {
    it('should add new repositories', async () => {
      const result = await syncRepositories(ctx.dbClient)({
        installationId,
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

      expect(result.added).toBe(2);
      expect(result.removed).toBe(0);
      expect(result.updated).toBe(0);
    });

    it('should remove missing repositories', async () => {
      await addRepositories(ctx.dbClient)({
        installationId,
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

      const result = await syncRepositories(ctx.dbClient)({
        installationId,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
        ],
      });

      expect(result.added).toBe(0);
      expect(result.removed).toBe(1);
      expect(result.updated).toBe(0);
    });

    it('should update changed repositories', async () => {
      await addRepositories(ctx.dbClient)({
        installationId,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
        ],
      });

      const result = await syncRepositories(ctx.dbClient)({
        installationId,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1-renamed',
            repositoryFullName: 'test-org/repo-1-renamed',
            private: true,
          },
        ],
      });

      expect(result.added).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.updated).toBe(1);

      const repos = await getRepositoriesByInstallationId(ctx.dbClient)(installationId);
      expect(repos[0].repositoryName).toBe('repo-1-renamed');
      expect(repos[0].private).toBe(true);
    });

    it('should remove project access when repos are removed', async () => {
      const repos = await addRepositories(ctx.dbClient)({
        installationId,
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

      await syncRepositories(ctx.dbClient)({
        installationId,
        repositories: [],
      });

      const access = await getProjectRepositoryAccess(ctx.dbClient)('project-1');
      expect(access).toHaveLength(0);
    });
  });

  describe('addRepositories', () => {
    it('should add repositories', async () => {
      const result = await addRepositories(ctx.dbClient)({
        installationId,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0].repositoryName).toBe('repo-1');
    });

    it('should handle empty array', async () => {
      const result = await addRepositories(ctx.dbClient)({
        installationId,
        repositories: [],
      });

      expect(result).toHaveLength(0);
    });

    it('should ignore duplicates', async () => {
      await addRepositories(ctx.dbClient)({
        installationId,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
        ],
      });

      const result = await addRepositories(ctx.dbClient)({
        installationId,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
        ],
      });

      expect(result).toHaveLength(1);

      const all = await getRepositoriesByInstallationId(ctx.dbClient)(installationId);
      expect(all).toHaveLength(1);
    });
  });

  describe('removeRepositories', () => {
    it('should remove repositories by GitHub repository IDs', async () => {
      await addRepositories(ctx.dbClient)({
        installationId,
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
            private: false,
          },
        ],
      });

      const removed = await removeRepositories(ctx.dbClient)({
        installationId,
        repositoryIds: ['111'],
      });

      expect(removed).toBe(1);

      const remaining = await getRepositoriesByInstallationId(ctx.dbClient)(installationId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].repositoryId).toBe('222');
    });

    it('should return 0 for empty array', async () => {
      const removed = await removeRepositories(ctx.dbClient)({
        installationId,
        repositoryIds: [],
      });

      expect(removed).toBe(0);
    });

    it('should remove project access when repos are removed', async () => {
      const repos = await addRepositories(ctx.dbClient)({
        installationId,
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

      await removeRepositories(ctx.dbClient)({
        installationId,
        repositoryIds: ['111'],
      });

      const access = await getProjectRepositoryAccess(ctx.dbClient)('project-1');
      expect(access).toHaveLength(0);
    });
  });

  describe('getRepositoriesByInstallationId', () => {
    it('should get all repositories for an installation', async () => {
      await addRepositories(ctx.dbClient)({
        installationId,
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

      const repos = await getRepositoriesByInstallationId(ctx.dbClient)(installationId);

      expect(repos).toHaveLength(2);
    });
  });

  describe('getRepositoryByFullName', () => {
    it('should find repository by full name', async () => {
      await addRepositories(ctx.dbClient)({
        installationId,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
        ],
      });

      const repo = await getRepositoryByFullName(ctx.dbClient)('test-org/repo-1');

      expect(repo).not.toBeNull();
      expect(repo?.repositoryName).toBe('repo-1');
    });

    it('should return null for non-existent repo', async () => {
      const repo = await getRepositoryByFullName(ctx.dbClient)('non-existent/repo');
      expect(repo).toBeNull();
    });
  });

  describe('getRepositoryById', () => {
    it('should find repository by internal ID', async () => {
      const repos = await addRepositories(ctx.dbClient)({
        installationId,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
        ],
      });

      const repo = await getRepositoryById(ctx.dbClient)(repos[0].id);

      expect(repo).not.toBeNull();
      expect(repo?.repositoryName).toBe('repo-1');
    });
  });

  describe('getRepositoriesByTenantId', () => {
    it('should get all repositories across all tenant installations', async () => {
      const install2 = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '22222222',
        accountLogin: 'other-org',
        accountId: '222',
        accountType: 'Organization',
        status: 'active',
      });

      await addRepositories(ctx.dbClient)({
        installationId,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
        ],
      });

      await addRepositories(ctx.dbClient)({
        installationId: install2.id,
        repositories: [
          {
            repositoryId: '222',
            repositoryName: 'repo-2',
            repositoryFullName: 'other-org/repo-2',
            private: false,
          },
        ],
      });

      const repos = await getRepositoriesByTenantId(ctx.dbClient)(ctx.tenantId);

      expect(repos).toHaveLength(2);
      expect(repos.find((r) => r.installationAccountLogin === 'test-org')).toBeDefined();
      expect(repos.find((r) => r.installationAccountLogin === 'other-org')).toBeDefined();
    });

    it('should exclude repos from deleted installations', async () => {
      const deletedInstall = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '22222222',
        accountLogin: 'deleted-org',
        accountId: '222',
        accountType: 'Organization',
        status: 'disconnected',
      });

      await addRepositories(ctx.dbClient)({
        installationId,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
        ],
      });

      await addRepositories(ctx.dbClient)({
        installationId: deletedInstall.id,
        repositories: [
          {
            repositoryId: '222',
            repositoryName: 'repo-2',
            repositoryFullName: 'deleted-org/repo-2',
            private: false,
          },
        ],
      });

      const repos = await getRepositoriesByTenantId(ctx.dbClient)(ctx.tenantId);

      expect(repos).toHaveLength(1);
      expect(repos[0].installationAccountLogin).toBe('test-org');
    });
  });

  describe('getRepositoryCount', () => {
    it('should return repository count for an installation', async () => {
      await addRepositories(ctx.dbClient)({
        installationId,
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

      const count = await getRepositoryCount(ctx.dbClient)(installationId);
      expect(count).toBe(2);
    });

    it('should return 0 for installation with no repos', async () => {
      const count = await getRepositoryCount(ctx.dbClient)(installationId);
      expect(count).toBe(0);
    });
  });

  describe('getRepositoryCountsByTenantId', () => {
    it('should return repository counts for all tenant installations', async () => {
      const install2 = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '22222222',
        accountLogin: 'other-org',
        accountId: '222',
        accountType: 'Organization',
        status: 'active',
      });

      await addRepositories(ctx.dbClient)({
        installationId,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
          {
            repositoryId: '112',
            repositoryName: 'repo-2',
            repositoryFullName: 'test-org/repo-2',
            private: false,
          },
        ],
      });

      await addRepositories(ctx.dbClient)({
        installationId: install2.id,
        repositories: [
          {
            repositoryId: '222',
            repositoryName: 'other-repo',
            repositoryFullName: 'other-org/other-repo',
            private: false,
          },
        ],
      });

      const counts = await getRepositoryCountsByTenantId(ctx.dbClient)({ tenantId: ctx.tenantId });

      expect(counts.size).toBe(2);
      expect(counts.get(installationId)).toBe(2);
      expect(counts.get(install2.id)).toBe(1);
    });

    it('should return 0 for installations with no repositories', async () => {
      const counts = await getRepositoryCountsByTenantId(ctx.dbClient)({ tenantId: ctx.tenantId });

      expect(counts.size).toBe(1);
      expect(counts.get(installationId)).toBe(0);
    });

    it('should exclude disconnected installations by default', async () => {
      const disconnectedInstall = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '33333333',
        accountLogin: 'disconnected-org',
        accountId: '333',
        accountType: 'Organization',
        status: 'disconnected',
      });

      await addRepositories(ctx.dbClient)({
        installationId,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
        ],
      });

      await addRepositories(ctx.dbClient)({
        installationId: disconnectedInstall.id,
        repositories: [
          {
            repositoryId: '333',
            repositoryName: 'disconnected-repo',
            repositoryFullName: 'disconnected-org/disconnected-repo',
            private: false,
          },
        ],
      });

      const counts = await getRepositoryCountsByTenantId(ctx.dbClient)({ tenantId: ctx.tenantId });

      expect(counts.size).toBe(1);
      expect(counts.get(installationId)).toBe(1);
      expect(counts.has(disconnectedInstall.id)).toBe(false);
    });

    it('should include disconnected installations when includeDisconnected is true', async () => {
      const disconnectedInstall = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId,
        installationId: '33333333',
        accountLogin: 'disconnected-org',
        accountId: '333',
        accountType: 'Organization',
        status: 'disconnected',
      });

      await addRepositories(ctx.dbClient)({
        installationId,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
        ],
      });

      await addRepositories(ctx.dbClient)({
        installationId: disconnectedInstall.id,
        repositories: [
          {
            repositoryId: '333',
            repositoryName: 'disconnected-repo',
            repositoryFullName: 'disconnected-org/disconnected-repo',
            private: false,
          },
        ],
      });

      const counts = await getRepositoryCountsByTenantId(ctx.dbClient)({
        tenantId: ctx.tenantId,
        includeDisconnected: true,
      });

      expect(counts.size).toBe(2);
      expect(counts.get(installationId)).toBe(1);
      expect(counts.get(disconnectedInstall.id)).toBe(1);
    });

    it('should return empty map for tenant with no installations', async () => {
      const counts = await getRepositoryCountsByTenantId(ctx.dbClient)({
        tenantId: 'non-existent-tenant',
      });

      expect(counts.size).toBe(0);
    });

    it('should not include installations from other tenants', async () => {
      const otherTenantInstall = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId2,
        installationId: '44444444',
        accountLogin: 'other-tenant-org',
        accountId: '444',
        accountType: 'Organization',
        status: 'active',
      });

      await addRepositories(ctx.dbClient)({
        installationId,
        repositories: [
          {
            repositoryId: '111',
            repositoryName: 'repo-1',
            repositoryFullName: 'test-org/repo-1',
            private: false,
          },
        ],
      });

      await addRepositories(ctx.dbClient)({
        installationId: otherTenantInstall.id,
        repositories: [
          {
            repositoryId: '444',
            repositoryName: 'other-tenant-repo',
            repositoryFullName: 'other-tenant-org/other-tenant-repo',
            private: false,
          },
        ],
      });

      const counts = await getRepositoryCountsByTenantId(ctx.dbClient)({ tenantId: ctx.tenantId });

      expect(counts.size).toBe(1);
      expect(counts.get(installationId)).toBe(1);
      expect(counts.has(otherTenantInstall.id)).toBe(false);
    });
  });
});
