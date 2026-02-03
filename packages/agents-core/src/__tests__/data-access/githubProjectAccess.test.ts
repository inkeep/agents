import { beforeEach, describe, expect, it } from 'vitest';
import {
  addRepositories,
  checkProjectRepositoryAccess,
  clearProjectRepositoryAccess,
  createInstallation,
  disconnectInstallation,
  getMcpToolRepositoryAccess,
  getProjectRepositoryAccess,
  getProjectRepositoryAccessWithDetails,
  setMcpToolAccessMode,
  setMcpToolRepositoryAccess,
  setProjectAccessMode,
  setProjectRepositoryAccess,
  validateRepositoryOwnership,
} from '../../data-access/runtime/github-work-app-installations';
import {
  createTestInstallation,
  createTestRepositories,
  generateId,
  setupGitHubTestContext,
} from './githubTestUtils';

describe('GitHub Project Repository Access', () => {
  const ctx = setupGitHubTestContext('project-access');
  let installationId: string;
  let repoId1: string;
  let repoId2: string;
  const projectId = 'test-project-123';

  beforeEach(async () => {
    const installation = await createTestInstallation(ctx.dbClient, ctx.tenantId);
    installationId = installation.id;
    const repos = await createTestRepositories(ctx.dbClient, installationId);
    repoId1 = repos.repoId1;
    repoId2 = repos.repoId2;
  });

  describe('setProjectRepositoryAccess', () => {
    it('should set project repository access', async () => {
      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1],
      });

      const access = await getProjectRepositoryAccess(ctx.dbClient)(projectId);
      expect(access).toHaveLength(1);
      expect(access[0].repositoryDbId).toBe(repoId1);
    });

    it('should replace existing access', async () => {
      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1],
      });

      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId2],
      });

      const access = await getProjectRepositoryAccess(ctx.dbClient)(projectId);
      expect(access).toHaveLength(1);
      expect(access[0].repositoryDbId).toBe(repoId2);
    });

    it('should clear access when given empty array', async () => {
      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1, repoId2],
      });

      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [],
      });

      const access = await getProjectRepositoryAccess(ctx.dbClient)(projectId);
      expect(access).toHaveLength(0);
    });

    it('should cascade changes to MCP tools with selected mode', async () => {
      const toolId = 'cascade-test-tool';

      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1, repoId2],
      });

      await setMcpToolAccessMode(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        mode: 'selected',
      });
      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1],
      });

      let toolAccess = await getMcpToolRepositoryAccess(ctx.dbClient)(toolId);
      expect(toolAccess).toHaveLength(1);
      expect(toolAccess[0].repositoryDbId).toBe(repoId1);

      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId2],
      });

      toolAccess = await getMcpToolRepositoryAccess(ctx.dbClient)(toolId);
      expect(toolAccess).toHaveLength(0);
    });

    it('should not affect MCP tools with mode=all', async () => {
      const toolId = 'cascade-test-tool-all';

      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1, repoId2],
      });

      await setMcpToolAccessMode(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        mode: 'all',
      });

      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId2],
      });

      const toolAccess = await getMcpToolRepositoryAccess(ctx.dbClient)(toolId);
      expect(toolAccess).toHaveLength(0);
    });

    it('should cascade to multiple MCP tools', async () => {
      const toolId1 = 'cascade-tool-1';
      const toolId2 = 'cascade-tool-2';

      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1, repoId2],
      });

      await setMcpToolAccessMode(ctx.dbClient)({
        toolId: toolId1,
        tenantId: ctx.tenantId,
        projectId,
        mode: 'selected',
      });
      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId: toolId1,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1, repoId2],
      });

      await setMcpToolAccessMode(ctx.dbClient)({
        toolId: toolId2,
        tenantId: ctx.tenantId,
        projectId,
        mode: 'selected',
      });
      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId: toolId2,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1],
      });

      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId2],
      });

      const tool1Access = await getMcpToolRepositoryAccess(ctx.dbClient)(toolId1);
      expect(tool1Access).toHaveLength(1);
      expect(tool1Access[0].repositoryDbId).toBe(repoId2);

      const tool2Access = await getMcpToolRepositoryAccess(ctx.dbClient)(toolId2);
      expect(tool2Access).toHaveLength(0);
    });

    it('should not affect tools in other projects', async () => {
      const toolId = 'other-project-tool';
      const otherProjectId = 'other-project';

      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1],
      });
      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId: otherProjectId,
        repositoryIds: [repoId1],
      });

      await setMcpToolAccessMode(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId: otherProjectId,
        mode: 'selected',
      });
      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId: otherProjectId,
        repositoryIds: [repoId1],
      });

      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [],
      });

      const toolAccess = await getMcpToolRepositoryAccess(ctx.dbClient)(toolId);
      expect(toolAccess).toHaveLength(1);
      expect(toolAccess[0].repositoryDbId).toBe(repoId1);
    });
  });

  describe('getProjectRepositoryAccess', () => {
    it('should return empty array when no access configured', async () => {
      const access = await getProjectRepositoryAccess(ctx.dbClient)(projectId);
      expect(access).toHaveLength(0);
    });
  });

  describe('getProjectRepositoryAccessWithDetails', () => {
    it('should return access entries with full repository details when mode is selected', async () => {
      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1],
      });

      const access = await getProjectRepositoryAccessWithDetails(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
      });

      expect(access).toHaveLength(1);
      expect(access[0].repositoryName).toBe('repo-1');
      expect(access[0].repositoryFullName).toBe('test-org/repo-1');
      expect(access[0].accessId).toBeDefined();
      expect(access[0].installationAccountLogin).toBe('test-org');
      expect(access[0].installationId).toBe('12345678');
    });

    it('should return all tenant repositories when mode is all', async () => {
      await setProjectAccessMode(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        mode: 'all',
      });

      const access = await getProjectRepositoryAccessWithDetails(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
      });

      expect(access).toHaveLength(2);
      const repo1Access = access.find((a) => a.repositoryName === 'repo-1');
      const repo2Access = access.find((a) => a.repositoryName === 'repo-2');
      expect(repo1Access).toBeDefined();
      expect(repo2Access).toBeDefined();
      expect(repo1Access?.installationAccountLogin).toBe('test-org');
      expect(repo2Access?.installationAccountLogin).toBe('test-org');
    });
  });

  describe('checkProjectRepositoryAccess', () => {
    it('should allow access when mode is explicitly set to all', async () => {
      await setProjectAccessMode(ctx.dbClient)({ tenantId: ctx.tenantId, projectId, mode: 'all' });

      const result = await checkProjectRepositoryAccess(ctx.dbClient)({
        projectId,
        repositoryFullName: 'test-org/repo-1',
        tenantId: ctx.tenantId,
      });

      expect(result.hasAccess).toBe(true);
      expect(result.reason).toBe('Project has access to all repositories');
    });

    it('should deny access when repo not in tenant (with mode=all)', async () => {
      await setProjectAccessMode(ctx.dbClient)({ tenantId: ctx.tenantId, projectId, mode: 'all' });

      const result = await checkProjectRepositoryAccess(ctx.dbClient)({
        projectId,
        repositoryFullName: 'other-org/other-repo',
        tenantId: ctx.tenantId,
      });

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('Repository not found in tenant installations');
    });

    it('should deny access when no mode configured (defaults to selected)', async () => {
      const result = await checkProjectRepositoryAccess(ctx.dbClient)({
        projectId,
        repositoryFullName: 'test-org/repo-1',
        tenantId: ctx.tenantId,
      });

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('Repository not in project access list');
    });

    it('should allow access when repo is in explicit access list', async () => {
      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1],
      });

      const result = await checkProjectRepositoryAccess(ctx.dbClient)({
        projectId,
        repositoryFullName: 'test-org/repo-1',
        tenantId: ctx.tenantId,
      });

      expect(result.hasAccess).toBe(true);
      expect(result.reason).toBe('Repository explicitly allowed for project');
    });

    it('should deny access when repo not in explicit access list', async () => {
      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1],
      });

      const result = await checkProjectRepositoryAccess(ctx.dbClient)({
        projectId,
        repositoryFullName: 'test-org/repo-2',
        tenantId: ctx.tenantId,
      });

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('Repository not in project access list');
    });

    it('should deny access for deleted installation repos', async () => {
      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1],
      });

      await disconnectInstallation(ctx.dbClient)({
        tenantId: ctx.tenantId,
        id: installationId,
      });

      const result = await checkProjectRepositoryAccess(ctx.dbClient)({
        projectId,
        repositoryFullName: 'test-org/repo-1',
        tenantId: ctx.tenantId,
      });

      expect(result.hasAccess).toBe(false);
    });
  });

  describe('clearProjectRepositoryAccess', () => {
    it('should clear all access for a project', async () => {
      await setProjectRepositoryAccess(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1, repoId2],
      });

      const deleted = await clearProjectRepositoryAccess(ctx.dbClient)(projectId);

      expect(deleted).toBe(2);

      const access = await getProjectRepositoryAccess(ctx.dbClient)(projectId);
      expect(access).toHaveLength(0);
    });

    it('should return 0 when no access to clear', async () => {
      const deleted = await clearProjectRepositoryAccess(ctx.dbClient)(projectId);
      expect(deleted).toBe(0);
    });
  });

  describe('validateRepositoryOwnership', () => {
    it('should return empty array when all repos belong to tenant', async () => {
      const invalid = await validateRepositoryOwnership(ctx.dbClient)({
        tenantId: ctx.tenantId,
        repositoryIds: [repoId1, repoId2],
      });

      expect(invalid).toHaveLength(0);
    });

    it('should return invalid repo IDs', async () => {
      const invalid = await validateRepositoryOwnership(ctx.dbClient)({
        tenantId: ctx.tenantId,
        repositoryIds: [repoId1, 'non-existent-id'],
      });

      expect(invalid).toHaveLength(1);
      expect(invalid[0]).toBe('non-existent-id');
    });

    it('should handle empty array', async () => {
      const invalid = await validateRepositoryOwnership(ctx.dbClient)({
        tenantId: ctx.tenantId,
        repositoryIds: [],
      });

      expect(invalid).toHaveLength(0);
    });

    it('should not include repos from deleted installations', async () => {
      await disconnectInstallation(ctx.dbClient)({
        tenantId: ctx.tenantId,
        id: installationId,
      });

      const invalid = await validateRepositoryOwnership(ctx.dbClient)({
        tenantId: ctx.tenantId,
        repositoryIds: [repoId1],
      });

      expect(invalid).toHaveLength(1);
    });

    it('should not include repos from other tenants', async () => {
      const otherTenantInstall = await createInstallation(ctx.dbClient)({
        id: generateId(),
        tenantId: ctx.tenantId2,
        installationId: '99999999',
        accountLogin: 'other-tenant-org',
        accountId: '999',
        accountType: 'Organization',
        status: 'active',
      });

      const otherRepos = await addRepositories(ctx.dbClient)({
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

      const invalid = await validateRepositoryOwnership(ctx.dbClient)({
        tenantId: ctx.tenantId,
        repositoryIds: [otherRepos[0].id],
      });

      expect(invalid).toHaveLength(1);
    });
  });
});
