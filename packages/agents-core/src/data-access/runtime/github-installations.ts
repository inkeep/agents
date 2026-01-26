import { and, count, desc, eq, inArray, ne } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import {
  githubAppInstallations,
  githubAppRepositories,
  githubProjectRepositoryAccess,
} from '../../db/runtime/runtime-schema';
import type {
  GitHubAppInstallationInsert,
  GitHubAppInstallationSelect,
  GitHubAppRepositoryInput,
  GitHubAppRepositorySelect,
  GitHubProjectRepositoryAccessSelect,
} from '../../types/entities';
import type { GitHubInstallationStatus } from '../../types/utility';
import { generateId } from '../../utils/conversations';

// ============================================================================
// Installation Management Functions
// ============================================================================

/**
 * Create a new GitHub App installation record
 */
export const createInstallation =
  (db: AgentsRunDatabaseClient) =>
  async (input: GitHubAppInstallationInsert): Promise<GitHubAppInstallationSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(githubAppInstallations)
      .values({
        ...input,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

/**
 * Get installation by GitHub installation ID
 */
export const getInstallationByGitHubId =
  (db: AgentsRunDatabaseClient) =>
  async (gitHubInstallationId: string): Promise<GitHubAppInstallationSelect | null> => {
    const result = await db.query.githubAppInstallations.findFirst({
      where: eq(githubAppInstallations.installationId, gitHubInstallationId),
    });

    return result ?? null;
  };

/**
 * Get installation by internal ID with tenant validation
 */
export const getInstallationById =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; id: string }): Promise<GitHubAppInstallationSelect | null> => {
    const result = await db.query.githubAppInstallations.findFirst({
      where: and(
        eq(githubAppInstallations.tenantId, params.tenantId),
        eq(githubAppInstallations.id, params.id)
      ),
    });

    return result ?? null;
  };

/**
 * Get all installations for a tenant
 */
export const getInstallationsByTenantId =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    includeDeleted?: boolean;
  }): Promise<GitHubAppInstallationSelect[]> => {
    const conditions = [eq(githubAppInstallations.tenantId, params.tenantId)];

    if (!params.includeDeleted) {
      conditions.push(ne(githubAppInstallations.status, 'deleted'));
    }

    const result = await db
      .select()
      .from(githubAppInstallations)
      .where(and(...conditions))
      .orderBy(desc(githubAppInstallations.createdAt));

    return result;
  };

/**
 * Update installation status
 */
export const updateInstallationStatus =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    id: string;
    status: GitHubInstallationStatus;
  }): Promise<GitHubAppInstallationSelect | null> => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(githubAppInstallations)
      .set({
        status: params.status,
        updatedAt: now,
      })
      .where(
        and(
          eq(githubAppInstallations.tenantId, params.tenantId),
          eq(githubAppInstallations.id, params.id)
        )
      )
      .returning();

    return updated ?? null;
  };

/**
 * Update installation status by GitHub installation ID (for webhook handlers)
 */
export const updateInstallationStatusByGitHubId =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    gitHubInstallationId: string;
    status: GitHubInstallationStatus;
  }): Promise<GitHubAppInstallationSelect | null> => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(githubAppInstallations)
      .set({
        status: params.status,
        updatedAt: now,
      })
      .where(eq(githubAppInstallations.installationId, params.gitHubInstallationId))
      .returning();

    return updated ?? null;
  };

/**
 * Soft delete an installation (set status to 'deleted')
 * Also removes all project repository access for this installation's repositories
 */
export const deleteInstallation =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; id: string }): Promise<boolean> => {
    const now = new Date().toISOString();

    // Get all repository IDs for this installation
    const repos = await db
      .select({ id: githubAppRepositories.id })
      .from(githubAppRepositories)
      .where(eq(githubAppRepositories.installationId, params.id));

    const repoIds = repos.map((r) => r.id);

    // Remove project repository access for all repositories
    if (repoIds.length > 0) {
      await db
        .delete(githubProjectRepositoryAccess)
        .where(inArray(githubProjectRepositoryAccess.githubRepositoryId, repoIds));
    }

    // Soft delete the installation
    const [updated] = await db
      .update(githubAppInstallations)
      .set({
        status: 'deleted',
        updatedAt: now,
      })
      .where(
        and(
          eq(githubAppInstallations.tenantId, params.tenantId),
          eq(githubAppInstallations.id, params.id)
        )
      )
      .returning();

    return !!updated;
  };

// ============================================================================
// Repository Management Functions
// ============================================================================

/**
 * Sync repositories for an installation
 * Adds new repos, removes missing repos, updates existing
 */
export const syncRepositories =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    installationId: string;
    repositories: GitHubAppRepositoryInput[];
  }): Promise<{ added: number; removed: number; updated: number }> => {
    const now = new Date().toISOString();

    // Get existing repositories
    const existingRepos = await db
      .select()
      .from(githubAppRepositories)
      .where(eq(githubAppRepositories.installationId, params.installationId));

    const existingRepoIds = new Set(existingRepos.map((r) => r.repositoryId));
    const newRepoIds = new Set(params.repositories.map((r) => r.repositoryId));

    // Find repos to add, remove, and update
    const toAdd = params.repositories.filter((r) => !existingRepoIds.has(r.repositoryId));
    const toRemove = existingRepos.filter((r) => !newRepoIds.has(r.repositoryId));
    const toUpdate = params.repositories.filter((r) => existingRepoIds.has(r.repositoryId));

    // Remove repos that are no longer in the installation
    if (toRemove.length > 0) {
      const removeIds = toRemove.map((r) => r.id);

      // First remove project access for these repos
      await db
        .delete(githubProjectRepositoryAccess)
        .where(inArray(githubProjectRepositoryAccess.githubRepositoryId, removeIds));

      // Then remove the repos
      await db.delete(githubAppRepositories).where(inArray(githubAppRepositories.id, removeIds));
    }

    // Add new repos
    if (toAdd.length > 0) {
      await db.insert(githubAppRepositories).values(
        toAdd.map((repo) => ({
          id: generateId(),
          installationId: params.installationId,
          repositoryId: repo.repositoryId,
          repositoryName: repo.repositoryName,
          repositoryFullName: repo.repositoryFullName,
          private: repo.private,
          createdAt: now,
          updatedAt: now,
        }))
      );
    }

    // Update existing repos (name changes, visibility changes, etc.)
    let updatedCount = 0;
    for (const repo of toUpdate) {
      const existing = existingRepos.find((e) => e.repositoryId === repo.repositoryId);
      if (
        existing &&
        (existing.repositoryName !== repo.repositoryName ||
          existing.repositoryFullName !== repo.repositoryFullName ||
          existing.private !== repo.private)
      ) {
        await db
          .update(githubAppRepositories)
          .set({
            repositoryName: repo.repositoryName,
            repositoryFullName: repo.repositoryFullName,
            private: repo.private,
            updatedAt: now,
          })
          .where(eq(githubAppRepositories.id, existing.id));
        updatedCount++;
      }
    }

    return {
      added: toAdd.length,
      removed: toRemove.length,
      updated: updatedCount,
    };
  };

/**
 * Add repositories to an installation (for webhook 'added' events)
 */
export const addRepositories =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    installationId: string;
    repositories: GitHubAppRepositoryInput[];
  }): Promise<GitHubAppRepositorySelect[]> => {
    const now = new Date().toISOString();

    if (params.repositories.length === 0) {
      return [];
    }

    await db
      .insert(githubAppRepositories)
      .values(
        params.repositories.map((repo) => ({
          id: generateId(),
          installationId: params.installationId,
          repositoryId: repo.repositoryId,
          repositoryName: repo.repositoryName,
          repositoryFullName: repo.repositoryFullName,
          private: repo.private,
          createdAt: now,
          updatedAt: now,
        }))
      )
      .onConflictDoNothing()
      .returning();

    // Fetch all inserted records
    const insertedRepoIds = params.repositories.map((r) => r.repositoryId);
    const inserted = await db
      .select()
      .from(githubAppRepositories)
      .where(
        and(
          eq(githubAppRepositories.installationId, params.installationId),
          inArray(githubAppRepositories.repositoryId, insertedRepoIds)
        )
      );

    return inserted;
  };

/**
 * Remove repositories from an installation (for webhook 'removed' events)
 * Also removes associated project repository access entries
 */
export const removeRepositories =
  (db: AgentsRunDatabaseClient) =>
  async (params: { installationId: string; repositoryIds: string[] }): Promise<number> => {
    if (params.repositoryIds.length === 0) {
      return 0;
    }

    // Get internal IDs for these GitHub repository IDs
    const repos = await db
      .select({ id: githubAppRepositories.id })
      .from(githubAppRepositories)
      .where(
        and(
          eq(githubAppRepositories.installationId, params.installationId),
          inArray(githubAppRepositories.repositoryId, params.repositoryIds)
        )
      );

    const repoIds = repos.map((r) => r.id);

    if (repoIds.length === 0) {
      return 0;
    }

    // First remove project access for these repos
    await db
      .delete(githubProjectRepositoryAccess)
      .where(inArray(githubProjectRepositoryAccess.githubRepositoryId, repoIds));

    // Then remove the repos
    const deleted = await db
      .delete(githubAppRepositories)
      .where(inArray(githubAppRepositories.id, repoIds))
      .returning();

    return deleted.length;
  };

/**
 * Get all repositories for an installation
 */
export const getRepositoriesByInstallationId =
  (db: AgentsRunDatabaseClient) =>
  async (installationId: string): Promise<GitHubAppRepositorySelect[]> => {
    const result = await db
      .select()
      .from(githubAppRepositories)
      .where(eq(githubAppRepositories.installationId, installationId))
      .orderBy(githubAppRepositories.repositoryFullName);

    return result;
  };

/**
 * Get repository by full name (e.g., "org/repo")
 */
export const getRepositoryByFullName =
  (db: AgentsRunDatabaseClient) =>
  async (repositoryFullName: string): Promise<GitHubAppRepositorySelect | null> => {
    const result = await db
      .select()
      .from(githubAppRepositories)
      .where(eq(githubAppRepositories.repositoryFullName, repositoryFullName))
      .limit(1);

    return result[0] ?? null;
  };

/**
 * Get repository by internal ID
 */
export const getRepositoryById =
  (db: AgentsRunDatabaseClient) =>
  async (id: string): Promise<GitHubAppRepositorySelect | null> => {
    const result = await db.query.githubAppRepositories.findFirst({
      where: eq(githubAppRepositories.id, id),
    });

    return result ?? null;
  };

/**
 * Get all repositories for a tenant (across all installations)
 */
export const getRepositoriesByTenantId =
  (db: AgentsRunDatabaseClient) =>
  async (
    tenantId: string
  ): Promise<(GitHubAppRepositorySelect & { installationAccountLogin: string })[]> => {
    const result = await db
      .select({
        id: githubAppRepositories.id,
        installationId: githubAppRepositories.installationId,
        repositoryId: githubAppRepositories.repositoryId,
        repositoryName: githubAppRepositories.repositoryName,
        repositoryFullName: githubAppRepositories.repositoryFullName,
        private: githubAppRepositories.private,
        createdAt: githubAppRepositories.createdAt,
        updatedAt: githubAppRepositories.updatedAt,
        installationAccountLogin: githubAppInstallations.accountLogin,
      })
      .from(githubAppRepositories)
      .innerJoin(
        githubAppInstallations,
        eq(githubAppRepositories.installationId, githubAppInstallations.id)
      )
      .where(
        and(
          eq(githubAppInstallations.tenantId, tenantId),
          ne(githubAppInstallations.status, 'deleted')
        )
      )
      .orderBy(githubAppRepositories.repositoryFullName);

    return result as (GitHubAppRepositorySelect & { installationAccountLogin: string })[];
  };

// ============================================================================
// Project Repository Access Functions
// ============================================================================

/**
 * Set project repository access (full replacement)
 * Pass empty array to clear all access (effectively mode='all')
 */
export const setProjectRepositoryAccess =
  (db: AgentsRunDatabaseClient) =>
  async (params: { projectId: string; repositoryIds: string[] }): Promise<void> => {
    const now = new Date().toISOString();

    // Remove all existing access for this project
    await db
      .delete(githubProjectRepositoryAccess)
      .where(eq(githubProjectRepositoryAccess.projectId, params.projectId));

    // Add new access entries
    if (params.repositoryIds.length > 0) {
      await db.insert(githubProjectRepositoryAccess).values(
        params.repositoryIds.map((repoId) => ({
          id: generateId(),
          projectId: params.projectId,
          githubRepositoryId: repoId,
          createdAt: now,
          updatedAt: now,
        }))
      );
    }
  };

/**
 * Get project repository access entries
 * Empty result means project has access to all repos (mode='all')
 */
export const getProjectRepositoryAccess =
  (db: AgentsRunDatabaseClient) =>
  async (projectId: string): Promise<GitHubProjectRepositoryAccessSelect[]> => {
    const result = await db
      .select()
      .from(githubProjectRepositoryAccess)
      .where(eq(githubProjectRepositoryAccess.projectId, projectId));

    return result;
  };

/**
 * Get project repository access with full repository details
 */
export const getProjectRepositoryAccessWithDetails =
  (db: AgentsRunDatabaseClient) =>
  async (projectId: string): Promise<(GitHubAppRepositorySelect & { accessId: string })[]> => {
    const result = await db
      .select({
        accessId: githubProjectRepositoryAccess.id,
        id: githubAppRepositories.id,
        installationId: githubAppRepositories.installationId,
        repositoryId: githubAppRepositories.repositoryId,
        repositoryName: githubAppRepositories.repositoryName,
        repositoryFullName: githubAppRepositories.repositoryFullName,
        private: githubAppRepositories.private,
        createdAt: githubAppRepositories.createdAt,
        updatedAt: githubAppRepositories.updatedAt,
      })
      .from(githubProjectRepositoryAccess)
      .innerJoin(
        githubAppRepositories,
        eq(githubProjectRepositoryAccess.githubRepositoryId, githubAppRepositories.id)
      )
      .where(eq(githubProjectRepositoryAccess.projectId, projectId));

    return result as (GitHubAppRepositorySelect & { accessId: string })[];
  };

/**
 * Check if a project has access to a specific repository
 * Returns true if:
 * - Project has no specific access configured (mode='all') - has access to all tenant repos
 * - Repository is explicitly in the project's access list
 */
export const checkProjectRepositoryAccess =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    projectId: string;
    repositoryFullName: string;
    tenantId: string;
  }): Promise<{ hasAccess: boolean; reason: string }> => {
    // Get project's access configuration
    const accessEntries = await db
      .select({ id: githubProjectRepositoryAccess.id })
      .from(githubProjectRepositoryAccess)
      .where(eq(githubProjectRepositoryAccess.projectId, params.projectId))
      .limit(1);

    // If no access entries, project has access to all repos (mode='all')
    if (accessEntries.length === 0) {
      // Verify the repo belongs to a tenant installation
      const repo = await db
        .select({ id: githubAppRepositories.id })
        .from(githubAppRepositories)
        .innerJoin(
          githubAppInstallations,
          eq(githubAppRepositories.installationId, githubAppInstallations.id)
        )
        .where(
          and(
            eq(githubAppRepositories.repositoryFullName, params.repositoryFullName),
            eq(githubAppInstallations.tenantId, params.tenantId),
            ne(githubAppInstallations.status, 'deleted')
          )
        )
        .limit(1);

      if (repo.length === 0) {
        return {
          hasAccess: false,
          reason: 'Repository not found in tenant installations',
        };
      }

      return {
        hasAccess: true,
        reason: 'Project has access to all repositories',
      };
    }

    // Check if this specific repository is in the access list
    const accessCheck = await db
      .select({ id: githubProjectRepositoryAccess.id })
      .from(githubProjectRepositoryAccess)
      .innerJoin(
        githubAppRepositories,
        eq(githubProjectRepositoryAccess.githubRepositoryId, githubAppRepositories.id)
      )
      .innerJoin(
        githubAppInstallations,
        eq(githubAppRepositories.installationId, githubAppInstallations.id)
      )
      .where(
        and(
          eq(githubProjectRepositoryAccess.projectId, params.projectId),
          eq(githubAppRepositories.repositoryFullName, params.repositoryFullName),
          eq(githubAppInstallations.tenantId, params.tenantId),
          ne(githubAppInstallations.status, 'deleted')
        )
      )
      .limit(1);

    if (accessCheck.length === 0) {
      return {
        hasAccess: false,
        reason: 'Repository not in project access list',
      };
    }

    return {
      hasAccess: true,
      reason: 'Repository explicitly allowed for project',
    };
  };

/**
 * Remove all project repository access for a specific project
 */
export const clearProjectRepositoryAccess =
  (db: AgentsRunDatabaseClient) =>
  async (projectId: string): Promise<number> => {
    const deleted = await db
      .delete(githubProjectRepositoryAccess)
      .where(eq(githubProjectRepositoryAccess.projectId, projectId))
      .returning();

    return deleted.length;
  };

/**
 * Validate that all repository IDs belong to installations owned by a tenant
 * Returns list of invalid repository IDs
 */
export const validateRepositoryOwnership =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; repositoryIds: string[] }): Promise<string[]> => {
    if (params.repositoryIds.length === 0) {
      return [];
    }

    // Get all valid repository IDs that belong to this tenant's installations
    const validRepos = await db
      .select({ id: githubAppRepositories.id })
      .from(githubAppRepositories)
      .innerJoin(
        githubAppInstallations,
        eq(githubAppRepositories.installationId, githubAppInstallations.id)
      )
      .where(
        and(
          eq(githubAppInstallations.tenantId, params.tenantId),
          ne(githubAppInstallations.status, 'deleted'),
          inArray(githubAppRepositories.id, params.repositoryIds)
        )
      );

    const validRepoIds = new Set(validRepos.map((r) => r.id));
    return params.repositoryIds.filter((id) => !validRepoIds.has(id));
  };

/**
 * Get repository count for an installation
 */
export const getRepositoryCount =
  (db: AgentsRunDatabaseClient) =>
  async (installationId: string): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(githubAppRepositories)
      .where(eq(githubAppRepositories.installationId, installationId));

    const total = result[0]?.count ?? 0;
    return typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
  };
