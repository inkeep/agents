import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addRepositories,
  checkProjectRepositoryAccess,
  clearMcpToolRepositoryAccess,
  clearProjectRepositoryAccess,
  createInstallation,
  deleteInstallation,
  disconnectInstallation,
  getInstallationByGitHubId,
  getInstallationById,
  getInstallationsByTenantId,
  getMcpToolRepositoryAccess,
  getMcpToolRepositoryAccessWithDetails,
  getProjectRepositoryAccess,
  getProjectRepositoryAccessWithDetails,
  getRepositoriesByInstallationId,
  getRepositoriesByTenantId,
  getRepositoryByFullName,
  getRepositoryById,
  getRepositoryCount,
  removeRepositories,
  setMcpToolAccessMode,
  setMcpToolRepositoryAccess,
  setProjectAccessMode,
  setProjectRepositoryAccess,
  syncRepositories,
  updateInstallationStatus,
  updateInstallationStatusByGitHubId,
  validateRepositoryOwnership,
} from '../../data-access/runtime/github-work-app-installations';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import {
  organization,
  workAppGitHubInstallations,
  workAppGitHubMcpToolAccessMode,
  workAppGitHubMcpToolRepositoryAccess,
  workAppGitHubProjectAccessMode,
  workAppGitHubProjectRepositoryAccess,
  workAppGitHubRepositories,
} from '../../db/runtime/runtime-schema';
import { generateId } from '../../utils/conversations';
import { testRunDbClient } from '../setup';

describe('GitHub Installations Data Access', () => {
  let dbClient: AgentsRunDatabaseClient;
  const tenantId = 'test-tenant-da';
  const tenantId2 = 'test-tenant-da-2';

  beforeAll(async () => {
    dbClient = testRunDbClient;
  });

  beforeEach(async () => {
    // Clean up in correct FK order
    await dbClient.delete(workAppGitHubMcpToolRepositoryAccess);
    await dbClient.delete(workAppGitHubMcpToolAccessMode);
    await dbClient.delete(workAppGitHubProjectRepositoryAccess);
    await dbClient.delete(workAppGitHubProjectAccessMode);
    await dbClient.delete(workAppGitHubRepositories);
    await dbClient.delete(workAppGitHubInstallations);

    // Create test organizations
    await dbClient
      .insert(organization)
      .values([
        {
          id: tenantId,
          name: 'Test Organization DA',
          slug: 'test-org-da',
          createdAt: new Date(),
        },
        {
          id: tenantId2,
          name: 'Test Organization DA 2',
          slug: 'test-org-da-2',
          createdAt: new Date(),
        },
      ])
      .onConflictDoNothing();
  });

  describe('Installation Management', () => {
    describe('createInstallation', () => {
      it('should create an installation with default status', async () => {
        const result = await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '987654',
          accountType: 'Organization',
          status: 'active',
        });

        expect(result.id).toBeDefined();
        expect(result.tenantId).toBe(tenantId);
        expect(result.installationId).toBe('12345678');
        expect(result.accountLogin).toBe('test-org');
        expect(result.accountType).toBe('Organization');
        expect(result.status).toBe('active');
        expect(result.createdAt).toBeDefined();
        expect(result.updatedAt).toBeDefined();
      });

      it('should create an installation with pending status', async () => {
        const result = await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '12345679',
          accountLogin: 'test-org',
          accountId: '987654',
          accountType: 'Organization',
          status: 'pending',
        });

        expect(result.status).toBe('pending');
      });

      it('should support User account type', async () => {
        const result = await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
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
        await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '987654',
          accountType: 'Organization',
          status: 'active',
        });

        const result = await getInstallationByGitHubId(dbClient)('12345678');

        expect(result).not.toBeNull();
        expect(result?.installationId).toBe('12345678');
      });

      it('should return null for non-existent installation', async () => {
        const result = await getInstallationByGitHubId(dbClient)('non-existent');
        expect(result).toBeNull();
      });
    });

    describe('getInstallationById', () => {
      it('should find installation by internal ID with tenant validation', async () => {
        const created = await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '987654',
          accountType: 'Organization',
          status: 'active',
        });

        const result = await getInstallationById(dbClient)({
          tenantId,
          id: created.id,
        });

        expect(result).not.toBeNull();
        expect(result?.id).toBe(created.id);
      });

      it('should return null for wrong tenant', async () => {
        const created = await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '987654',
          accountType: 'Organization',
          status: 'active',
        });

        const result = await getInstallationById(dbClient)({
          tenantId: 'other-tenant',
          id: created.id,
        });

        expect(result).toBeNull();
      });
    });

    describe('getInstallationsByTenantId', () => {
      it('should get all active installations for a tenant', async () => {
        await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '11111111',
          accountLogin: 'org-1',
          accountId: '111',
          accountType: 'Organization',
          status: 'active',
        });

        await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '22222222',
          accountLogin: 'org-2',
          accountId: '222',
          accountType: 'Organization',
          status: 'active',
        });

        const result = await getInstallationsByTenantId(dbClient)({ tenantId });

        expect(result).toHaveLength(2);
      });

      it('should exclude deleted installations by default', async () => {
        await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '11111111',
          accountLogin: 'org-1',
          accountId: '111',
          accountType: 'Organization',
          status: 'active',
        });

        await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '22222222',
          accountLogin: 'org-2',
          accountId: '222',
          accountType: 'Organization',
          status: 'disconnected',
        });

        const result = await getInstallationsByTenantId(dbClient)({ tenantId });

        expect(result).toHaveLength(1);
        expect(result[0].installationId).toBe('11111111');
      });

      it('should include deleted installations when requested', async () => {
        await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '11111111',
          accountLogin: 'org-1',
          accountId: '111',
          accountType: 'Organization',
          status: 'active',
        });

        await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '22222222',
          accountLogin: 'org-2',
          accountId: '222',
          accountType: 'Organization',
          status: 'disconnected',
        });

        const result = await getInstallationsByTenantId(dbClient)({
          tenantId,
          includeDisconnected: true,
        });

        expect(result).toHaveLength(2);
      });
    });

    describe('updateInstallationStatus', () => {
      it('should update installation status', async () => {
        const created = await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '987654',
          accountType: 'Organization',
          status: 'active',
        });

        const updated = await updateInstallationStatus(dbClient)({
          tenantId,
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
        const updated = await updateInstallationStatus(dbClient)({
          tenantId,
          id: 'non-existent',
          status: 'suspended',
        });

        expect(updated).toBeNull();
      });
    });

    describe('updateInstallationStatusByGitHubId', () => {
      it('should update status by GitHub installation ID', async () => {
        await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '987654',
          accountType: 'Organization',
          status: 'active',
        });

        const updated = await updateInstallationStatusByGitHubId(dbClient)({
          gitHubInstallationId: '12345678',
          status: 'suspended',
        });

        expect(updated?.status).toBe('suspended');
      });
    });

    describe('disconnectInstallation', () => {
      it('should soft delete an installation (set status to disconnected)', async () => {
        const created = await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '987654',
          accountType: 'Organization',
          status: 'active',
        });

        const result = await disconnectInstallation(dbClient)({
          tenantId,
          id: created.id,
        });

        expect(result).toBe(true);

        const after = await getInstallationById(dbClient)({
          tenantId,
          id: created.id,
        });
        expect(after?.status).toBe('disconnected');
      });

      it('should remove project repository access when installation is deleted', async () => {
        const installation = await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '987654',
          accountType: 'Organization',
          status: 'active',
        });

        const repos = await addRepositories(dbClient)({
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

        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId: 'project-1',
          repositoryIds: [repos[0].id],
        });

        // Verify access exists
        const accessBefore = await getProjectRepositoryAccess(dbClient)('project-1');
        expect(accessBefore).toHaveLength(1);

        // Delete installation
        await disconnectInstallation(dbClient)({
          tenantId,
          id: installation.id,
        });

        // Verify access is removed
        const accessAfter = await getProjectRepositoryAccess(dbClient)('project-1');
        expect(accessAfter).toHaveLength(0);
      });
    });

    describe('deleteInstallation (hard delete)', () => {
      it('should permanently delete an installation', async () => {
        const created = await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '987654',
          accountType: 'Organization',
          status: 'active',
        });

        const result = await deleteInstallation(dbClient)({
          tenantId,
          id: created.id,
        });

        expect(result).toBe(true);

        const after = await getInstallationById(dbClient)({
          tenantId,
          id: created.id,
        });
        expect(after).toBeNull();
      });

      it('should cascade delete repositories when installation is hard deleted', async () => {
        const installation = await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '987654',
          accountType: 'Organization',
          status: 'active',
        });

        const repos = await addRepositories(dbClient)({
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

        // Hard delete installation
        await deleteInstallation(dbClient)({
          tenantId,
          id: installation.id,
        });

        // Verify repositories are cascade deleted
        const reposAfter = await getRepositoriesByInstallationId(dbClient)(installation.id);
        expect(reposAfter).toHaveLength(0);
      });

      it('should cascade delete project repository access when installation is hard deleted', async () => {
        const installation = await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '12345678',
          accountLogin: 'test-org',
          accountId: '987654',
          accountType: 'Organization',
          status: 'active',
        });

        const repos = await addRepositories(dbClient)({
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

        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId: 'project-1',
          repositoryIds: [repos[0].id],
        });

        // Verify access exists
        const accessBefore = await getProjectRepositoryAccess(dbClient)('project-1');
        expect(accessBefore).toHaveLength(1);

        // Hard delete installation
        await deleteInstallation(dbClient)({
          tenantId,
          id: installation.id,
        });

        // Verify access is cascade deleted
        const accessAfter = await getProjectRepositoryAccess(dbClient)('project-1');
        expect(accessAfter).toHaveLength(0);
      });

      it('should return false when installation does not exist', async () => {
        const result = await deleteInstallation(dbClient)({
          tenantId,
          id: 'non-existent-id',
        });

        expect(result).toBe(false);
      });
    });
  });

  describe('Repository Management', () => {
    let installationId: string;

    beforeEach(async () => {
      const installation = await createInstallation(dbClient)({
        id: generateId(),
        tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });
      installationId = installation.id;
    });

    describe('syncRepositories', () => {
      it('should add new repositories', async () => {
        const result = await syncRepositories(dbClient)({
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
        await addRepositories(dbClient)({
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

        const result = await syncRepositories(dbClient)({
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
        await addRepositories(dbClient)({
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

        const result = await syncRepositories(dbClient)({
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

        const repos = await getRepositoriesByInstallationId(dbClient)(installationId);
        expect(repos[0].repositoryName).toBe('repo-1-renamed');
        expect(repos[0].private).toBe(true);
      });

      it('should remove project access when repos are removed', async () => {
        const repos = await addRepositories(dbClient)({
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

        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId: 'project-1',
          repositoryIds: [repos[0].id],
        });

        // Sync with empty list (removes all repos)
        await syncRepositories(dbClient)({
          installationId,
          repositories: [],
        });

        const access = await getProjectRepositoryAccess(dbClient)('project-1');
        expect(access).toHaveLength(0);
      });
    });

    describe('addRepositories', () => {
      it('should add repositories', async () => {
        const result = await addRepositories(dbClient)({
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
        const result = await addRepositories(dbClient)({
          installationId,
          repositories: [],
        });

        expect(result).toHaveLength(0);
      });

      it('should ignore duplicates', async () => {
        await addRepositories(dbClient)({
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

        // Try to add the same repo again
        const result = await addRepositories(dbClient)({
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

        // Should still return the existing one
        expect(result).toHaveLength(1);

        // Total should be 1
        const all = await getRepositoriesByInstallationId(dbClient)(installationId);
        expect(all).toHaveLength(1);
      });
    });

    describe('removeRepositories', () => {
      it('should remove repositories by GitHub repository IDs', async () => {
        await addRepositories(dbClient)({
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

        const removed = await removeRepositories(dbClient)({
          installationId,
          repositoryIds: ['111'],
        });

        expect(removed).toBe(1);

        const remaining = await getRepositoriesByInstallationId(dbClient)(installationId);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].repositoryId).toBe('222');
      });

      it('should return 0 for empty array', async () => {
        const removed = await removeRepositories(dbClient)({
          installationId,
          repositoryIds: [],
        });

        expect(removed).toBe(0);
      });

      it('should remove project access when repos are removed', async () => {
        const repos = await addRepositories(dbClient)({
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

        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId: 'project-1',
          repositoryIds: [repos[0].id],
        });

        await removeRepositories(dbClient)({
          installationId,
          repositoryIds: ['111'],
        });

        const access = await getProjectRepositoryAccess(dbClient)('project-1');
        expect(access).toHaveLength(0);
      });
    });

    describe('getRepositoriesByInstallationId', () => {
      it('should get all repositories for an installation', async () => {
        await addRepositories(dbClient)({
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

        const repos = await getRepositoriesByInstallationId(dbClient)(installationId);

        expect(repos).toHaveLength(2);
      });
    });

    describe('getRepositoryByFullName', () => {
      it('should find repository by full name', async () => {
        await addRepositories(dbClient)({
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

        const repo = await getRepositoryByFullName(dbClient)('test-org/repo-1');

        expect(repo).not.toBeNull();
        expect(repo?.repositoryName).toBe('repo-1');
      });

      it('should return null for non-existent repo', async () => {
        const repo = await getRepositoryByFullName(dbClient)('non-existent/repo');
        expect(repo).toBeNull();
      });
    });

    describe('getRepositoryById', () => {
      it('should find repository by internal ID', async () => {
        const repos = await addRepositories(dbClient)({
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

        const repo = await getRepositoryById(dbClient)(repos[0].id);

        expect(repo).not.toBeNull();
        expect(repo?.repositoryName).toBe('repo-1');
      });
    });

    describe('getRepositoriesByTenantId', () => {
      it('should get all repositories across all tenant installations', async () => {
        // Create second installation
        const install2 = await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '22222222',
          accountLogin: 'other-org',
          accountId: '222',
          accountType: 'Organization',
          status: 'active',
        });

        await addRepositories(dbClient)({
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

        await addRepositories(dbClient)({
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

        const repos = await getRepositoriesByTenantId(dbClient)(tenantId);

        expect(repos).toHaveLength(2);
        expect(repos.find((r) => r.installationAccountLogin === 'test-org')).toBeDefined();
        expect(repos.find((r) => r.installationAccountLogin === 'other-org')).toBeDefined();
      });

      it('should exclude repos from deleted installations', async () => {
        const deletedInstall = await createInstallation(dbClient)({
          id: generateId(),
          tenantId,
          installationId: '22222222',
          accountLogin: 'deleted-org',
          accountId: '222',
          accountType: 'Organization',
          status: 'disconnected',
        });

        await addRepositories(dbClient)({
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

        await addRepositories(dbClient)({
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

        const repos = await getRepositoriesByTenantId(dbClient)(tenantId);

        expect(repos).toHaveLength(1);
        expect(repos[0].installationAccountLogin).toBe('test-org');
      });
    });

    describe('getRepositoryCount', () => {
      it('should return repository count for an installation', async () => {
        await addRepositories(dbClient)({
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

        const count = await getRepositoryCount(dbClient)(installationId);
        expect(count).toBe(2);
      });

      it('should return 0 for installation with no repos', async () => {
        const count = await getRepositoryCount(dbClient)(installationId);
        expect(count).toBe(0);
      });
    });
  });

  describe('Project Repository Access', () => {
    let installationId: string;
    let repoId1: string;
    let repoId2: string;
    const projectId = 'test-project-123';

    beforeEach(async () => {
      const installation = await createInstallation(dbClient)({
        id: generateId(),
        tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });
      installationId = installation.id;

      const repos = await addRepositories(dbClient)({
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
      const repo1 = repos.find((r) => r.repositoryId === '111');
      const repo2 = repos.find((r) => r.repositoryId === '222');
      expect(repo1).toBeDefined();
      expect(repo2).toBeDefined();
      repoId1 = repo1?.id ?? '';
      repoId2 = repo2?.id ?? '';
    });

    describe('setProjectRepositoryAccess', () => {
      it('should set project repository access', async () => {
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId1],
        });

        const access = await getProjectRepositoryAccess(dbClient)(projectId);
        expect(access).toHaveLength(1);
        expect(access[0].repositoryDbId).toBe(repoId1);
      });

      it('should replace existing access', async () => {
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId1],
        });

        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId2],
        });

        const access = await getProjectRepositoryAccess(dbClient)(projectId);
        expect(access).toHaveLength(1);
        expect(access[0].repositoryDbId).toBe(repoId2);
      });

      it('should clear access when given empty array', async () => {
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId1, repoId2],
        });

        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [],
        });

        const access = await getProjectRepositoryAccess(dbClient)(projectId);
        expect(access).toHaveLength(0);
      });

      it('should cascade changes to MCP tools with selected mode', async () => {
        const toolId = 'cascade-test-tool';

        // Set up: project has access to both repos
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId1, repoId2],
        });

        // MCP tool has mode='selected' with repo1 selected
        await setMcpToolAccessMode(dbClient)({
          toolId,
          tenantId,
          projectId,
          mode: 'selected',
        });
        await setMcpToolRepositoryAccess(dbClient)({
          toolId,
          tenantId,
          projectId,
          repositoryIds: [repoId1],
        });

        // Verify tool has access to repo1
        let toolAccess = await getMcpToolRepositoryAccess(dbClient)(toolId);
        expect(toolAccess).toHaveLength(1);
        expect(toolAccess[0].repositoryDbId).toBe(repoId1);

        // Update project to only have access to repo2 (removing repo1)
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId2],
        });

        // Tool should no longer have access to repo1 (it was cascaded)
        toolAccess = await getMcpToolRepositoryAccess(dbClient)(toolId);
        expect(toolAccess).toHaveLength(0);
      });

      it('should not affect MCP tools with mode=all', async () => {
        const toolId = 'cascade-test-tool-all';

        // Set up: project has access to both repos
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId1, repoId2],
        });

        // MCP tool has mode='all' (no explicit repo selection needed)
        await setMcpToolAccessMode(dbClient)({
          toolId,
          tenantId,
          projectId,
          mode: 'all',
        });

        // Update project access
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId2],
        });

        // Tool with mode='all' should still have mode='all' (unchanged)
        // It inherits from project, so no explicit repo access rows to cascade
        const toolAccess = await getMcpToolRepositoryAccess(dbClient)(toolId);
        expect(toolAccess).toHaveLength(0); // mode='all' means no explicit rows
      });

      it('should cascade to multiple MCP tools', async () => {
        const toolId1 = 'cascade-tool-1';
        const toolId2 = 'cascade-tool-2';

        // Set up: project has access to both repos
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId1, repoId2],
        });

        // Tool 1 has mode='selected' with both repos
        await setMcpToolAccessMode(dbClient)({
          toolId: toolId1,
          tenantId,
          projectId,
          mode: 'selected',
        });
        await setMcpToolRepositoryAccess(dbClient)({
          toolId: toolId1,
          tenantId,
          projectId,
          repositoryIds: [repoId1, repoId2],
        });

        // Tool 2 has mode='selected' with repo1 only
        await setMcpToolAccessMode(dbClient)({
          toolId: toolId2,
          tenantId,
          projectId,
          mode: 'selected',
        });
        await setMcpToolRepositoryAccess(dbClient)({
          toolId: toolId2,
          tenantId,
          projectId,
          repositoryIds: [repoId1],
        });

        // Update project to only have access to repo2
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId2],
        });

        // Tool 1 should now only have repo2
        const tool1Access = await getMcpToolRepositoryAccess(dbClient)(toolId1);
        expect(tool1Access).toHaveLength(1);
        expect(tool1Access[0].repositoryDbId).toBe(repoId2);

        // Tool 2 should have no repos (repo1 was removed from project)
        const tool2Access = await getMcpToolRepositoryAccess(dbClient)(toolId2);
        expect(tool2Access).toHaveLength(0);
      });

      it('should not affect tools in other projects', async () => {
        const toolId = 'other-project-tool';
        const otherProjectId = 'other-project';

        // Set up: both projects have access to repo1
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId1],
        });
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId: otherProjectId,
          repositoryIds: [repoId1],
        });

        // Tool in other project has mode='selected' with repo1
        await setMcpToolAccessMode(dbClient)({
          toolId,
          tenantId,
          projectId: otherProjectId,
          mode: 'selected',
        });
        await setMcpToolRepositoryAccess(dbClient)({
          toolId,
          tenantId,
          projectId: otherProjectId,
          repositoryIds: [repoId1],
        });

        // Update first project to remove repo1
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [],
        });

        // Tool in other project should still have repo1
        const toolAccess = await getMcpToolRepositoryAccess(dbClient)(toolId);
        expect(toolAccess).toHaveLength(1);
        expect(toolAccess[0].repositoryDbId).toBe(repoId1);
      });
    });

    describe('getProjectRepositoryAccess', () => {
      it('should return empty array when no access configured', async () => {
        const access = await getProjectRepositoryAccess(dbClient)(projectId);
        expect(access).toHaveLength(0);
      });
    });

    describe('getProjectRepositoryAccessWithDetails', () => {
      it('should return access entries with full repository details', async () => {
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId1],
        });

        const access = await getProjectRepositoryAccessWithDetails(dbClient)(projectId);

        expect(access).toHaveLength(1);
        expect(access[0].repositoryName).toBe('repo-1');
        expect(access[0].repositoryFullName).toBe('test-org/repo-1');
        expect(access[0].accessId).toBeDefined();
      });
    });

    describe('checkProjectRepositoryAccess', () => {
      it('should allow access when mode is explicitly set to all', async () => {
        // Explicitly set mode to 'all'
        await setProjectAccessMode(dbClient)({ tenantId, projectId, mode: 'all' });

        const result = await checkProjectRepositoryAccess(dbClient)({
          projectId,
          repositoryFullName: 'test-org/repo-1',
          tenantId,
        });

        expect(result.hasAccess).toBe(true);
        expect(result.reason).toBe('Project has access to all repositories');
      });

      it('should deny access when repo not in tenant (with mode=all)', async () => {
        // Explicitly set mode to 'all' to test tenant-level validation
        await setProjectAccessMode(dbClient)({ tenantId, projectId, mode: 'all' });

        const result = await checkProjectRepositoryAccess(dbClient)({
          projectId,
          repositoryFullName: 'other-org/other-repo',
          tenantId,
        });

        expect(result.hasAccess).toBe(false);
        expect(result.reason).toBe('Repository not found in tenant installations');
      });

      it('should deny access when no mode configured (defaults to selected)', async () => {
        // No mode set - should default to 'selected' which means no access without explicit rows
        const result = await checkProjectRepositoryAccess(dbClient)({
          projectId,
          repositoryFullName: 'test-org/repo-1',
          tenantId,
        });

        expect(result.hasAccess).toBe(false);
        expect(result.reason).toBe('Repository not in project access list');
      });

      it('should allow access when repo is in explicit access list', async () => {
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId1],
        });

        const result = await checkProjectRepositoryAccess(dbClient)({
          projectId,
          repositoryFullName: 'test-org/repo-1',
          tenantId,
        });

        expect(result.hasAccess).toBe(true);
        expect(result.reason).toBe('Repository explicitly allowed for project');
      });

      it('should deny access when repo not in explicit access list', async () => {
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId1],
        });

        const result = await checkProjectRepositoryAccess(dbClient)({
          projectId,
          repositoryFullName: 'test-org/repo-2',
          tenantId,
        });

        expect(result.hasAccess).toBe(false);
        expect(result.reason).toBe('Repository not in project access list');
      });

      it('should deny access for deleted installation repos', async () => {
        // Set up access
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId1],
        });

        // Delete the installation
        await disconnectInstallation(dbClient)({
          tenantId,
          id: installationId,
        });

        // Access entries were removed by deleteInstallation
        const result = await checkProjectRepositoryAccess(dbClient)({
          projectId,
          repositoryFullName: 'test-org/repo-1',
          tenantId,
        });

        // Since no access entries exist, it checks mode=all, but repo is from deleted installation
        expect(result.hasAccess).toBe(false);
      });
    });

    describe('clearProjectRepositoryAccess', () => {
      it('should clear all access for a project', async () => {
        await setProjectRepositoryAccess(dbClient)({
          tenantId,
          projectId,
          repositoryIds: [repoId1, repoId2],
        });

        const deleted = await clearProjectRepositoryAccess(dbClient)(projectId);

        expect(deleted).toBe(2);

        const access = await getProjectRepositoryAccess(dbClient)(projectId);
        expect(access).toHaveLength(0);
      });

      it('should return 0 when no access to clear', async () => {
        const deleted = await clearProjectRepositoryAccess(dbClient)(projectId);
        expect(deleted).toBe(0);
      });
    });

    describe('validateRepositoryOwnership', () => {
      it('should return empty array when all repos belong to tenant', async () => {
        const invalid = await validateRepositoryOwnership(dbClient)({
          tenantId,
          repositoryIds: [repoId1, repoId2],
        });

        expect(invalid).toHaveLength(0);
      });

      it('should return invalid repo IDs', async () => {
        const invalid = await validateRepositoryOwnership(dbClient)({
          tenantId,
          repositoryIds: [repoId1, 'non-existent-id'],
        });

        expect(invalid).toHaveLength(1);
        expect(invalid[0]).toBe('non-existent-id');
      });

      it('should handle empty array', async () => {
        const invalid = await validateRepositoryOwnership(dbClient)({
          tenantId,
          repositoryIds: [],
        });

        expect(invalid).toHaveLength(0);
      });

      it('should not include repos from deleted installations', async () => {
        // Delete the installation (soft delete)
        await disconnectInstallation(dbClient)({
          tenantId,
          id: installationId,
        });

        const invalid = await validateRepositoryOwnership(dbClient)({
          tenantId,
          repositoryIds: [repoId1],
        });

        // Repo is still in DB but installation is deleted
        expect(invalid).toHaveLength(1);
      });

      it('should not include repos from other tenants', async () => {
        const otherTenantInstall = await createInstallation(dbClient)({
          id: generateId(),
          tenantId: tenantId2,
          installationId: '99999999',
          accountLogin: 'other-tenant-org',
          accountId: '999',
          accountType: 'Organization',
          status: 'active',
        });

        const otherRepos = await addRepositories(dbClient)({
          installationId: otherTenantInstall.id,
          repositories: [
            {
              repositoryId: '999',
              repositoryName: 'other-repo',
              repositoryFullName: 'other-tenant-org/other-repo',
              private: false,
            },
          ],
        });

        const invalid = await validateRepositoryOwnership(dbClient)({
          tenantId,
          repositoryIds: [otherRepos[0].id],
        });

        expect(invalid).toHaveLength(1);
      });
    });
  });

  describe('MCP Tool Repository Access', () => {
    let installationId: string;
    let repoId1: string;
    let repoId2: string;
    const toolId = 'test-tool-123';
    const projectId = 'test-project-mcp';

    beforeEach(async () => {
      const installation = await createInstallation(dbClient)({
        id: generateId(),
        tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });
      installationId = installation.id;

      const repos = await addRepositories(dbClient)({
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
      const repo1 = repos.find((r) => r.repositoryId === '111');
      const repo2 = repos.find((r) => r.repositoryId === '222');
      expect(repo1).toBeDefined();
      expect(repo2).toBeDefined();
      repoId1 = repo1?.id ?? '';
      repoId2 = repo2?.id ?? '';
    });

    describe('setMcpToolRepositoryAccess', () => {
      it('should set MCP tool repository access', async () => {
        await setMcpToolRepositoryAccess(dbClient)({
          toolId,
          tenantId,
          projectId,
          repositoryIds: [repoId1],
        });

        const access = await getMcpToolRepositoryAccess(dbClient)(toolId);
        expect(access).toHaveLength(1);
        expect(access[0].repositoryDbId).toBe(repoId1);
      });

      it('should replace existing access', async () => {
        await setMcpToolRepositoryAccess(dbClient)({
          toolId,
          tenantId,
          projectId,
          repositoryIds: [repoId1],
        });

        await setMcpToolRepositoryAccess(dbClient)({
          toolId,
          tenantId,
          projectId,
          repositoryIds: [repoId2],
        });

        const access = await getMcpToolRepositoryAccess(dbClient)(toolId);
        expect(access).toHaveLength(1);
        expect(access[0].repositoryDbId).toBe(repoId2);
      });

      it('should set multiple repositories', async () => {
        await setMcpToolRepositoryAccess(dbClient)({
          toolId,
          tenantId,
          projectId,
          repositoryIds: [repoId1, repoId2],
        });

        const access = await getMcpToolRepositoryAccess(dbClient)(toolId);
        expect(access).toHaveLength(2);
      });

      it('should clear access when given empty array', async () => {
        await setMcpToolRepositoryAccess(dbClient)({
          toolId,
          tenantId,
          projectId,
          repositoryIds: [repoId1, repoId2],
        });

        await setMcpToolRepositoryAccess(dbClient)({
          toolId,
          tenantId,
          projectId,
          repositoryIds: [],
        });

        const access = await getMcpToolRepositoryAccess(dbClient)(toolId);
        expect(access).toHaveLength(0);
      });
    });

    describe('getMcpToolRepositoryAccess', () => {
      it('should return empty array when no access configured', async () => {
        const access = await getMcpToolRepositoryAccess(dbClient)(toolId);
        expect(access).toHaveLength(0);
      });

      it('should return access entries with correct fields', async () => {
        await setMcpToolRepositoryAccess(dbClient)({
          toolId,
          tenantId,
          projectId,
          repositoryIds: [repoId1],
        });

        const access = await getMcpToolRepositoryAccess(dbClient)(toolId);
        expect(access).toHaveLength(1);
        expect(access[0]).toMatchObject({
          toolId,
          tenantId,
          projectId,
          repositoryDbId: repoId1,
        });
        expect(access[0].id).toBeDefined();
        expect(access[0].createdAt).toBeDefined();
      });
    });

    describe('getMcpToolRepositoryAccessWithDetails', () => {
      it('should return access entries with full repository details', async () => {
        await setMcpToolRepositoryAccess(dbClient)({
          toolId,
          tenantId,
          projectId,
          repositoryIds: [repoId1],
        });

        const access = await getMcpToolRepositoryAccessWithDetails(dbClient)(toolId);

        expect(access).toHaveLength(1);
        expect(access[0].repositoryName).toBe('repo-1');
        expect(access[0].repositoryFullName).toBe('test-org/repo-1');
        expect(access[0].private).toBe(false);
        expect(access[0].accessId).toBeDefined();
        expect(access[0].installationAccountLogin).toBe('test-org');
      });

      it('should return empty array when no access configured', async () => {
        const access = await getMcpToolRepositoryAccessWithDetails(dbClient)(toolId);
        expect(access).toHaveLength(0);
      });

      it('should return multiple repositories with details', async () => {
        await setMcpToolRepositoryAccess(dbClient)({
          toolId,
          tenantId,
          projectId,
          repositoryIds: [repoId1, repoId2],
        });

        const access = await getMcpToolRepositoryAccessWithDetails(dbClient)(toolId);

        expect(access).toHaveLength(2);
        const repo1Access = access.find((a) => a.repositoryName === 'repo-1');
        const repo2Access = access.find((a) => a.repositoryName === 'repo-2');
        expect(repo1Access).toBeDefined();
        expect(repo2Access).toBeDefined();
        expect(repo1Access?.private).toBe(false);
        expect(repo2Access?.private).toBe(true);
      });
    });

    describe('clearMcpToolRepositoryAccess', () => {
      it('should clear all access for a tool', async () => {
        await setMcpToolRepositoryAccess(dbClient)({
          toolId,
          tenantId,
          projectId,
          repositoryIds: [repoId1, repoId2],
        });

        const deleted = await clearMcpToolRepositoryAccess(dbClient)(toolId);

        expect(deleted).toBe(2);

        const access = await getMcpToolRepositoryAccess(dbClient)(toolId);
        expect(access).toHaveLength(0);
      });

      it('should return 0 when no access to clear', async () => {
        const deleted = await clearMcpToolRepositoryAccess(dbClient)(toolId);
        expect(deleted).toBe(0);
      });

      it('should only clear access for the specified tool', async () => {
        const otherToolId = 'other-tool-456';

        await setMcpToolRepositoryAccess(dbClient)({
          toolId,
          tenantId,
          projectId,
          repositoryIds: [repoId1],
        });

        await setMcpToolRepositoryAccess(dbClient)({
          toolId: otherToolId,
          tenantId,
          projectId,
          repositoryIds: [repoId2],
        });

        await clearMcpToolRepositoryAccess(dbClient)(toolId);

        const access1 = await getMcpToolRepositoryAccess(dbClient)(toolId);
        const access2 = await getMcpToolRepositoryAccess(dbClient)(otherToolId);

        expect(access1).toHaveLength(0);
        expect(access2).toHaveLength(1);
      });
    });
  });
});
