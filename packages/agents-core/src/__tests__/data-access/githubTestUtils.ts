import { beforeAll, beforeEach } from 'vitest';
import {
  addRepositories,
  createInstallation,
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

export interface GitHubTestContext {
  dbClient: AgentsRunDatabaseClient;
  tenantId: string;
  tenantId2: string;
}

export function setupGitHubTestContext(tenantSuffix: string): GitHubTestContext {
  const context: GitHubTestContext = {
    dbClient: null as unknown as AgentsRunDatabaseClient,
    tenantId: `test-tenant-${tenantSuffix}`,
    tenantId2: `test-tenant-${tenantSuffix}-2`,
  };

  beforeAll(async () => {
    context.dbClient = testRunDbClient;
  });

  beforeEach(async () => {
    await cleanupGitHubTables(context.dbClient);
    await createTestOrganizations(context.dbClient, context.tenantId, context.tenantId2);
  });

  return context;
}

export async function cleanupGitHubTables(dbClient: AgentsRunDatabaseClient): Promise<void> {
  await dbClient.delete(workAppGitHubMcpToolRepositoryAccess);
  await dbClient.delete(workAppGitHubMcpToolAccessMode);
  await dbClient.delete(workAppGitHubProjectRepositoryAccess);
  await dbClient.delete(workAppGitHubProjectAccessMode);
  await dbClient.delete(workAppGitHubRepositories);
  await dbClient.delete(workAppGitHubInstallations);
}

export async function createTestOrganizations(
  dbClient: AgentsRunDatabaseClient,
  tenantId: string,
  tenantId2: string
): Promise<void> {
  await dbClient
    .insert(organization)
    .values([
      {
        id: tenantId,
        name: `Test Organization ${tenantId}`,
        slug: `test-org-${tenantId}`,
        createdAt: new Date(),
      },
      {
        id: tenantId2,
        name: `Test Organization ${tenantId2}`,
        slug: `test-org-${tenantId2}`,
        createdAt: new Date(),
      },
    ])
    .onConflictDoNothing();
}

export async function createTestInstallation(
  dbClient: AgentsRunDatabaseClient,
  tenantId: string,
  installationId = '12345678',
  accountLogin = 'test-org'
): Promise<{ id: string; installationId: string }> {
  const result = await createInstallation(dbClient)({
    id: generateId(),
    tenantId,
    installationId,
    accountLogin,
    accountId: '987654',
    accountType: 'Organization',
    status: 'active',
  });
  return { id: result.id, installationId: result.installationId };
}

export async function createTestRepositories(
  dbClient: AgentsRunDatabaseClient,
  installationId: string
): Promise<{ repoId1: string; repoId2: string }> {
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
  return {
    repoId1: repo1?.id ?? '',
    repoId2: repo2?.id ?? '',
  };
}

export { generateId };
