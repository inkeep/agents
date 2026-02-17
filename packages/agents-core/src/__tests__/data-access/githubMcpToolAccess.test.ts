import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearMcpToolRepositoryAccess,
  getMcpToolRepositoryAccess,
  getMcpToolRepositoryAccessWithDetails,
  setMcpToolAccessMode,
  setMcpToolRepositoryAccess,
  setProjectAccessMode,
  setProjectRepositoryAccess,
} from '../../data-access/runtime/github-work-app-installations';
import {
  createTestInstallation,
  createTestRepositories,
  setupGitHubTestContext,
} from './githubTestUtils';

describe('GitHub MCP Tool Repository Access', () => {
  const ctx = setupGitHubTestContext('mcp-access');
  let installationId: string;
  let repoId1: string;
  let repoId2: string;
  const toolId = 'test-tool-123';
  const projectId = 'test-project-mcp';

  beforeEach(async () => {
    const installation = await createTestInstallation(ctx.dbClient, ctx.tenantId);
    installationId = installation.id;
    const repos = await createTestRepositories(ctx.dbClient, installationId);
    repoId1 = repos.repoId1;
    repoId2 = repos.repoId2;
  });

  describe('setMcpToolRepositoryAccess', () => {
    it('should set MCP tool repository access', async () => {
      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1],
      });

      const access = await getMcpToolRepositoryAccess(ctx.dbClient)(toolId);
      expect(access).toHaveLength(1);
      expect(access[0].repositoryDbId).toBe(repoId1);
    });

    it('should replace existing access', async () => {
      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1],
      });

      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId2],
      });

      const access = await getMcpToolRepositoryAccess(ctx.dbClient)(toolId);
      expect(access).toHaveLength(1);
      expect(access[0].repositoryDbId).toBe(repoId2);
    });

    it('should set multiple repositories', async () => {
      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1, repoId2],
      });

      const access = await getMcpToolRepositoryAccess(ctx.dbClient)(toolId);
      expect(access).toHaveLength(2);
    });

    it('should clear access when given empty array', async () => {
      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1, repoId2],
      });

      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [],
      });

      const access = await getMcpToolRepositoryAccess(ctx.dbClient)(toolId);
      expect(access).toHaveLength(0);
    });
  });

  describe('getMcpToolRepositoryAccess', () => {
    it('should return empty array when no access configured', async () => {
      const access = await getMcpToolRepositoryAccess(ctx.dbClient)(toolId);
      expect(access).toHaveLength(0);
    });

    it('should return access entries with correct fields', async () => {
      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1],
      });

      const access = await getMcpToolRepositoryAccess(ctx.dbClient)(toolId);
      expect(access).toHaveLength(1);
      expect(access[0]).toMatchObject({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        repositoryDbId: repoId1,
      });
      expect(access[0].id).toBeDefined();
      expect(access[0].createdAt).toBeDefined();
    });
  });

  describe('getMcpToolRepositoryAccessWithDetails', () => {
    it('should return access entries with full repository details', async () => {
      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1],
      });

      const access = await getMcpToolRepositoryAccessWithDetails(ctx.dbClient)(toolId);

      expect(access).toHaveLength(1);
      expect(access[0].repositoryName).toBe('repo-1');
      expect(access[0].repositoryFullName).toBe('test-org/repo-1');
      expect(access[0].private).toBe(false);
      expect(access[0].accessId).toBeDefined();
      expect(access[0].installationAccountLogin).toBe('test-org');
    });

    it('should return empty array when no access configured', async () => {
      const access = await getMcpToolRepositoryAccessWithDetails(ctx.dbClient)(toolId);
      expect(access).toHaveLength(0);
    });

    it('should return multiple repositories with details', async () => {
      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1, repoId2],
      });

      const access = await getMcpToolRepositoryAccessWithDetails(ctx.dbClient)(toolId);

      expect(access).toHaveLength(2);
      const repo1Access = access.find((a) => a.repositoryName === 'repo-1');
      const repo2Access = access.find((a) => a.repositoryName === 'repo-2');
      expect(repo1Access).toBeDefined();
      expect(repo2Access).toBeDefined();
      expect(repo1Access?.private).toBe(false);
      expect(repo2Access?.private).toBe(true);
    });

    it('should return all project repositories when mode is all', async () => {
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

      const access = await getMcpToolRepositoryAccessWithDetails(ctx.dbClient)(toolId);

      expect(access).toHaveLength(2);
      const repo1Access = access.find((a) => a.repositoryName === 'repo-1');
      const repo2Access = access.find((a) => a.repositoryName === 'repo-2');
      expect(repo1Access).toBeDefined();
      expect(repo2Access).toBeDefined();
      expect(repo1Access?.installationAccountLogin).toBe('test-org');
      expect(repo2Access?.installationAccountLogin).toBe('test-org');
    });

    it('should return only explicit access when mode is selected', async () => {
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

      const access = await getMcpToolRepositoryAccessWithDetails(ctx.dbClient)(toolId);

      expect(access).toHaveLength(1);
      expect(access[0].repositoryName).toBe('repo-1');
    });

    it('should return all tenant repositories when both tool and project modes are all', async () => {
      await setProjectAccessMode(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        mode: 'all',
      });

      await setMcpToolAccessMode(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        mode: 'all',
      });

      const access = await getMcpToolRepositoryAccessWithDetails(ctx.dbClient)(toolId);

      expect(access).toHaveLength(2);
      const repo1Access = access.find((a) => a.repositoryName === 'repo-1');
      const repo2Access = access.find((a) => a.repositoryName === 'repo-2');
      expect(repo1Access).toBeDefined();
      expect(repo2Access).toBeDefined();
    });

    it('should return empty when mode is all and project mode is selected with no repos', async () => {
      await setProjectAccessMode(ctx.dbClient)({
        tenantId: ctx.tenantId,
        projectId,
        mode: 'selected',
      });

      await setMcpToolAccessMode(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        mode: 'all',
      });

      const access = await getMcpToolRepositoryAccessWithDetails(ctx.dbClient)(toolId);

      expect(access).toHaveLength(0);
    });
  });

  describe('clearMcpToolRepositoryAccess', () => {
    it('should clear all access for a tool', async () => {
      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1, repoId2],
      });

      const deleted = await clearMcpToolRepositoryAccess(ctx.dbClient)(toolId);

      expect(deleted).toBe(2);

      const access = await getMcpToolRepositoryAccess(ctx.dbClient)(toolId);
      expect(access).toHaveLength(0);
    });

    it('should return 0 when no access to clear', async () => {
      const deleted = await clearMcpToolRepositoryAccess(ctx.dbClient)(toolId);
      expect(deleted).toBe(0);
    });

    it('should only clear access for the specified tool', async () => {
      const otherToolId = 'other-tool-456';

      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId1],
      });

      await setMcpToolRepositoryAccess(ctx.dbClient)({
        toolId: otherToolId,
        tenantId: ctx.tenantId,
        projectId,
        repositoryIds: [repoId2],
      });

      await clearMcpToolRepositoryAccess(ctx.dbClient)(toolId);

      const access1 = await getMcpToolRepositoryAccess(ctx.dbClient)(toolId);
      const access2 = await getMcpToolRepositoryAccess(ctx.dbClient)(otherToolId);

      expect(access1).toHaveLength(0);
      expect(access2).toHaveLength(1);
    });
  });
});
