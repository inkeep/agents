import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import {
  organization,
  workAppGitHubInstallations,
  workAppGitHubProjectRepositoryAccess,
  workAppGitHubRepositories,
} from '../../db/runtime/runtime-schema';
import { generateId } from '../../utils/conversations';
import { testRunDbClient } from '../setup';

describe('GitHub App Installation Schema Tests', () => {
  let dbClient: AgentsRunDatabaseClient;
  const tenantId = 'test-tenant-github';

  beforeAll(async () => {
    dbClient = testRunDbClient;
  });

  beforeEach(async () => {
    // Clean up GitHub tables in correct order (respecting FK constraints)
    await dbClient.delete(workAppGitHubProjectRepositoryAccess);
    await dbClient.delete(workAppGitHubRepositories);
    await dbClient.delete(workAppGitHubInstallations);

    // Create test organization (tenant)
    await dbClient
      .insert(organization)
      .values({
        id: tenantId,
        name: 'Test Organization',
        slug: 'test-org-github',
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  });

  describe('github_app_installations table', () => {
    it('should create an installation record', async () => {
      const installationId = generateId();

      await dbClient.insert(workAppGitHubInstallations).values({
        id: installationId,
        tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
        status: 'active',
      });

      const result = await dbClient
        .select()
        .from(workAppGitHubInstallations)
        .where(eq(workAppGitHubInstallations.id, installationId));

      expect(result).toHaveLength(1);
      expect(result[0].installationId).toBe('12345678');
      expect(result[0].accountLogin).toBe('test-org');
      expect(result[0].accountType).toBe('Organization');
      expect(result[0].status).toBe('active');
    });

    it('should enforce unique constraint on installation_id', async () => {
      const id1 = generateId();
      const id2 = generateId();
      const sharedInstallationId = '12345678';

      await dbClient.insert(workAppGitHubInstallations).values({
        id: id1,
        tenantId,
        installationId: sharedInstallationId,
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
      });

      // Attempting to insert another record with the same installationId should fail
      await expect(
        dbClient.insert(workAppGitHubInstallations).values({
          id: id2,
          tenantId,
          installationId: sharedInstallationId,
          accountLogin: 'another-org',
          accountId: '111111',
          accountType: 'Organization',
        })
      ).rejects.toThrow();
    });

    it('should default status to active', async () => {
      const installationId = generateId();

      await dbClient.insert(workAppGitHubInstallations).values({
        id: installationId,
        tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
      });

      const result = await dbClient
        .select()
        .from(workAppGitHubInstallations)
        .where(eq(workAppGitHubInstallations.id, installationId));

      expect(result[0].status).toBe('active');
    });

    it('should support all status values', async () => {
      const statuses = ['pending', 'active', 'suspended', 'disconnected'] as const;

      for (const status of statuses) {
        const id = generateId();
        const githubInstallId = `status-test-${status}`;

        await dbClient.insert(workAppGitHubInstallations).values({
          id,
          tenantId,
          installationId: githubInstallId,
          accountLogin: 'test-org',
          accountId: '987654',
          accountType: 'Organization',
          status,
        });

        const result = await dbClient
          .select()
          .from(workAppGitHubInstallations)
          .where(eq(workAppGitHubInstallations.id, id));

        expect(result[0].status).toBe(status);
      }
    });

    it('should support both account types', async () => {
      const accountTypes = ['Organization', 'User'] as const;

      for (const accountType of accountTypes) {
        const id = generateId();
        const githubInstallId = `type-test-${accountType}`;

        await dbClient.insert(workAppGitHubInstallations).values({
          id,
          tenantId,
          installationId: githubInstallId,
          accountLogin: 'test-account',
          accountId: '987654',
          accountType,
        });

        const result = await dbClient
          .select()
          .from(workAppGitHubInstallations)
          .where(eq(workAppGitHubInstallations.id, id));

        expect(result[0].accountType).toBe(accountType);
      }
    });
  });

  describe('github_app_repositories table', () => {
    let installationRecordId: string;

    beforeEach(async () => {
      installationRecordId = generateId();
      await dbClient.insert(workAppGitHubInstallations).values({
        id: installationRecordId,
        tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
      });
    });

    it('should create a repository record', async () => {
      const repoId = generateId();

      await dbClient.insert(workAppGitHubRepositories).values({
        id: repoId,
        installationDbId: installationRecordId,
        repositoryId: '111222333',
        repositoryName: 'my-repo',
        repositoryFullName: 'test-org/my-repo',
        private: false,
      });

      const result = await dbClient
        .select()
        .from(workAppGitHubRepositories)
        .where(eq(workAppGitHubRepositories.id, repoId));

      expect(result).toHaveLength(1);
      expect(result[0].repositoryName).toBe('my-repo');
      expect(result[0].repositoryFullName).toBe('test-org/my-repo');
      expect(result[0].private).toBe(false);
    });

    it('should enforce unique constraint on (installation_id, repository_id)', async () => {
      const repoId1 = generateId();
      const repoId2 = generateId();
      const sharedGitHubRepoId = '111222333';

      await dbClient.insert(workAppGitHubRepositories).values({
        id: repoId1,
        installationDbId: installationRecordId,
        repositoryId: sharedGitHubRepoId,
        repositoryName: 'my-repo',
        repositoryFullName: 'test-org/my-repo',
        private: false,
      });

      // Attempting to insert another record with the same (installationId, repositoryId) should fail
      await expect(
        dbClient.insert(workAppGitHubRepositories).values({
          id: repoId2,
          installationDbId: installationRecordId,
          repositoryId: sharedGitHubRepoId,
          repositoryName: 'my-repo-duplicate',
          repositoryFullName: 'test-org/my-repo-duplicate',
          private: false,
        })
      ).rejects.toThrow();
    });

    it('should cascade delete repositories when installation is deleted', async () => {
      const repoId1 = generateId();
      const repoId2 = generateId();

      await dbClient.insert(workAppGitHubRepositories).values([
        {
          id: repoId1,
          installationDbId: installationRecordId,
          repositoryId: '111',
          repositoryName: 'repo-1',
          repositoryFullName: 'test-org/repo-1',
          private: false,
        },
        {
          id: repoId2,
          installationDbId: installationRecordId,
          repositoryId: '222',
          repositoryName: 'repo-2',
          repositoryFullName: 'test-org/repo-2',
          private: true,
        },
      ]);

      // Verify repositories exist
      const reposBefore = await dbClient
        .select()
        .from(workAppGitHubRepositories)
        .where(eq(workAppGitHubRepositories.installationDbId, installationRecordId));
      expect(reposBefore).toHaveLength(2);

      // Delete the installation
      await dbClient
        .delete(workAppGitHubInstallations)
        .where(eq(workAppGitHubInstallations.id, installationRecordId));

      // Verify repositories are cascade deleted
      const reposAfter = await dbClient
        .select()
        .from(workAppGitHubRepositories)
        .where(eq(workAppGitHubRepositories.installationDbId, installationRecordId));
      expect(reposAfter).toHaveLength(0);
    });
  });

  describe('github_project_repository_access table', () => {
    let installationRecordId: string;
    let repoRecordId: string;
    const projectId = 'test-project-123';

    beforeEach(async () => {
      installationRecordId = generateId();
      repoRecordId = generateId();

      await dbClient.insert(workAppGitHubInstallations).values({
        id: installationRecordId,
        tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
      });

      await dbClient.insert(workAppGitHubRepositories).values({
        id: repoRecordId,
        installationDbId: installationRecordId,
        repositoryId: '111222333',
        repositoryName: 'my-repo',
        repositoryFullName: 'test-org/my-repo',
        private: false,
      });
    });

    it('should create a project repository access record', async () => {
      const accessId = generateId();

      await dbClient.insert(workAppGitHubProjectRepositoryAccess).values({
        id: accessId,
        projectId,
        tenantId,
        repositoryDbId: repoRecordId,
      });

      const result = await dbClient
        .select()
        .from(workAppGitHubProjectRepositoryAccess)
        .where(eq(workAppGitHubProjectRepositoryAccess.id, accessId));

      expect(result).toHaveLength(1);
      expect(result[0].projectId).toBe(projectId);
      expect(result[0].repositoryDbId).toBe(repoRecordId);
    });

    it('should enforce unique constraint on (project_id, github_repository_id)', async () => {
      const accessId1 = generateId();
      const accessId2 = generateId();

      await dbClient.insert(workAppGitHubProjectRepositoryAccess).values({
        id: accessId1,
        projectId,
        tenantId,
        repositoryDbId: repoRecordId,
      });

      // Attempting to insert another record with the same (projectId, githubRepositoryId) should fail
      await expect(
        dbClient.insert(workAppGitHubProjectRepositoryAccess).values({
          id: accessId2,
          projectId,
          tenantId,
          repositoryDbId: repoRecordId,
        })
      ).rejects.toThrow();
    });

    it('should cascade delete access records when repository is deleted', async () => {
      const accessId = generateId();

      await dbClient.insert(workAppGitHubProjectRepositoryAccess).values({
        id: accessId,
        projectId,
        tenantId,
        repositoryDbId: repoRecordId,
      });

      // Verify access record exists
      const accessBefore = await dbClient
        .select()
        .from(workAppGitHubProjectRepositoryAccess)
        .where(eq(workAppGitHubProjectRepositoryAccess.projectId, projectId));
      expect(accessBefore).toHaveLength(1);

      // Delete the repository
      await dbClient
        .delete(workAppGitHubRepositories)
        .where(eq(workAppGitHubRepositories.id, repoRecordId));

      // Verify access record is cascade deleted
      const accessAfter = await dbClient
        .select()
        .from(workAppGitHubProjectRepositoryAccess)
        .where(eq(workAppGitHubProjectRepositoryAccess.projectId, projectId));
      expect(accessAfter).toHaveLength(0);
    });

    it('should cascade delete access records when installation is deleted (via repository cascade)', async () => {
      const accessId = generateId();

      await dbClient.insert(workAppGitHubProjectRepositoryAccess).values({
        id: accessId,
        projectId,
        tenantId,
        repositoryDbId: repoRecordId,
      });

      // Delete the installation (should cascade to repos, then to access records)
      await dbClient
        .delete(workAppGitHubInstallations)
        .where(eq(workAppGitHubInstallations.id, installationRecordId));

      // Verify all related records are deleted
      const reposAfter = await dbClient
        .select()
        .from(workAppGitHubRepositories)
        .where(eq(workAppGitHubRepositories.installationDbId, installationRecordId));
      expect(reposAfter).toHaveLength(0);

      const accessAfter = await dbClient
        .select()
        .from(workAppGitHubProjectRepositoryAccess)
        .where(eq(workAppGitHubProjectRepositoryAccess.projectId, projectId));
      expect(accessAfter).toHaveLength(0);
    });
  });

  describe('Tenant isolation', () => {
    it('should cascade delete installations when organization is deleted', async () => {
      const installId = generateId();

      await dbClient.insert(workAppGitHubInstallations).values({
        id: installId,
        tenantId,
        installationId: '12345678',
        accountLogin: 'test-org',
        accountId: '987654',
        accountType: 'Organization',
      });

      // Verify installation exists
      const installBefore = await dbClient
        .select()
        .from(workAppGitHubInstallations)
        .where(eq(workAppGitHubInstallations.tenantId, tenantId));
      expect(installBefore).toHaveLength(1);

      // Delete the organization
      await dbClient.delete(organization).where(eq(organization.id, tenantId));

      // Verify installation is cascade deleted
      const installAfter = await dbClient
        .select()
        .from(workAppGitHubInstallations)
        .where(eq(workAppGitHubInstallations.tenantId, tenantId));
      expect(installAfter).toHaveLength(0);
    });

    it('should not affect other tenants when deleting one tenant installation', async () => {
      const tenant2Id = 'test-tenant-github-2';

      // Create second organization
      await dbClient
        .insert(organization)
        .values({
          id: tenant2Id,
          name: 'Test Organization 2',
          slug: 'test-org-github-2',
          createdAt: new Date(),
        })
        .onConflictDoNothing();

      const install1Id = generateId();
      const install2Id = generateId();

      await dbClient.insert(workAppGitHubInstallations).values([
        {
          id: install1Id,
          tenantId,
          installationId: '11111111',
          accountLogin: 'org-1',
          accountId: '111',
          accountType: 'Organization',
        },
        {
          id: install2Id,
          tenantId: tenant2Id,
          installationId: '22222222',
          accountLogin: 'org-2',
          accountId: '222',
          accountType: 'Organization',
        },
      ]);

      // Delete tenant 1's installation
      await dbClient
        .delete(workAppGitHubInstallations)
        .where(eq(workAppGitHubInstallations.id, install1Id));

      // Verify tenant 1's installation is deleted
      const tenant1InstallsAfter = await dbClient
        .select()
        .from(workAppGitHubInstallations)
        .where(eq(workAppGitHubInstallations.tenantId, tenantId));
      expect(tenant1InstallsAfter).toHaveLength(0);

      // Verify tenant 2's installation still exists
      const tenant2InstallsAfter = await dbClient
        .select()
        .from(workAppGitHubInstallations)
        .where(eq(workAppGitHubInstallations.tenantId, tenant2Id));
      expect(tenant2InstallsAfter).toHaveLength(1);

      // Cleanup tenant 2
      await dbClient
        .delete(workAppGitHubInstallations)
        .where(eq(workAppGitHubInstallations.tenantId, tenant2Id));
      await dbClient.delete(organization).where(eq(organization.id, tenant2Id));
    });
  });
});
