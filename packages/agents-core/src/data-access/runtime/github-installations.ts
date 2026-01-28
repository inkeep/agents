import { and, count, desc, eq, inArray, ne } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import {
  workappsGithubAppInstallations,
  workappsGithubAppRepositories,
  workappsGithubProjectRepositoryAccess,
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
      .insert(workappsGithubAppInstallations)
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
    const result = await db.query.workappsGithubAppInstallations.findFirst({
      where: eq(workappsGithubAppInstallations.installationId, gitHubInstallationId),
    });

    return result ?? null;
  };

/**
 * Get installation by internal ID with tenant validation
 */
export const getInstallationById =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; id: string }): Promise<GitHubAppInstallationSelect | null> => {
    const result = await db.query.workappsGithubAppInstallations.findFirst({
      where: and(
        eq(workappsGithubAppInstallations.tenantId, params.tenantId),
        eq(workappsGithubAppInstallations.id, params.id)
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
    includeDisconnected?: boolean;
  }): Promise<GitHubAppInstallationSelect[]> => {
    const conditions = [eq(workappsGithubAppInstallations.tenantId, params.tenantId)];

    if (!params.includeDisconnected) {
      conditions.push(ne(workappsGithubAppInstallations.status, 'disconnected'));
    }

    const result = await db
      .select()
      .from(workappsGithubAppInstallations)
      .where(and(...conditions))
      .orderBy(desc(workappsGithubAppInstallations.createdAt));

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
      .update(workappsGithubAppInstallations)
      .set({
        status: params.status,
        updatedAt: now,
      })
      .where(
        and(
          eq(workappsGithubAppInstallations.tenantId, params.tenantId),
          eq(workappsGithubAppInstallations.id, params.id)
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
      .update(workappsGithubAppInstallations)
      .set({
        status: params.status,
        updatedAt: now,
      })
      .where(eq(workappsGithubAppInstallations.installationId, params.gitHubInstallationId))
      .returning();

    return updated ?? null;
  };

/**
 * Soft delete an installation (set status to 'disconnected')
 * Also removes all project repository access for this installation's repositories
 */
export const disconnectInstallation =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; id: string }): Promise<boolean> => {
    const now = new Date().toISOString();

    // Get all repository IDs for this installation
    const repos = await db
      .select({ id: workappsGithubAppRepositories.id })
      .from(workappsGithubAppRepositories)
      .where(eq(workappsGithubAppRepositories.installationDbId, params.id));

    const repoIds = repos.map((r) => r.id);

    // Remove project repository access for all repositories
    if (repoIds.length > 0) {
      await db
        .delete(workappsGithubProjectRepositoryAccess)
        .where(inArray(workappsGithubProjectRepositoryAccess.repositoryDbId, repoIds));
    }

    // Soft delete the installation
    const [updated] = await db
      .update(workappsGithubAppInstallations)
      .set({
        status: 'disconnected',
        updatedAt: now,
      })
      .where(
        and(
          eq(workappsGithubAppInstallations.tenantId, params.tenantId),
          eq(workappsGithubAppInstallations.id, params.id)
        )
      )
      .returning();

    return !!updated;
  };

/**
 * Delete an installation (hard delete)
 */
export const deleteInstallation =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; id: string }): Promise<boolean> => {
    const result = await db
      .delete(workappsGithubAppInstallations)
      .where(eq(workappsGithubAppInstallations.id, params.id))
      .returning();

    return result.length > 0;
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
      .from(workappsGithubAppRepositories)
      .where(eq(workappsGithubAppRepositories.installationDbId, params.installationId));

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
        .delete(workappsGithubProjectRepositoryAccess)
        .where(inArray(workappsGithubProjectRepositoryAccess.repositoryDbId, removeIds));

      // Then remove the repos
      await db
        .delete(workappsGithubAppRepositories)
        .where(inArray(workappsGithubAppRepositories.id, removeIds));
    }

    // Add new repos
    if (toAdd.length > 0) {
      await db.insert(workappsGithubAppRepositories).values(
        toAdd.map((repo) => ({
          id: generateId(),
          installationDbId: params.installationId,
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
          .update(workappsGithubAppRepositories)
          .set({
            repositoryName: repo.repositoryName,
            repositoryFullName: repo.repositoryFullName,
            private: repo.private,
            updatedAt: now,
          })
          .where(eq(workappsGithubAppRepositories.id, existing.id));
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
      .insert(workappsGithubAppRepositories)
      .values(
        params.repositories.map((repo) => ({
          id: generateId(),
          installationDbId: params.installationId,
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
      .from(workappsGithubAppRepositories)
      .where(
        and(
          eq(workappsGithubAppRepositories.installationDbId, params.installationId),
          inArray(workappsGithubAppRepositories.repositoryId, insertedRepoIds)
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
      .select({ id: workappsGithubAppRepositories.id })
      .from(workappsGithubAppRepositories)
      .where(
        and(
          eq(workappsGithubAppRepositories.installationDbId, params.installationId),
          inArray(workappsGithubAppRepositories.repositoryId, params.repositoryIds)
        )
      );

    const repoIds = repos.map((r) => r.id);

    if (repoIds.length === 0) {
      return 0;
    }

    // First remove project access for these repos
    await db
      .delete(workappsGithubProjectRepositoryAccess)
      .where(inArray(workappsGithubProjectRepositoryAccess.repositoryDbId, repoIds));

    // Then remove the repos
    const deleted = await db
      .delete(workappsGithubAppRepositories)
      .where(inArray(workappsGithubAppRepositories.id, repoIds))
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
      .from(workappsGithubAppRepositories)
      .where(eq(workappsGithubAppRepositories.installationDbId, installationId))
      .orderBy(workappsGithubAppRepositories.repositoryFullName);

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
      .from(workappsGithubAppRepositories)
      .where(eq(workappsGithubAppRepositories.repositoryFullName, repositoryFullName))
      .limit(1);

    return result[0] ?? null;
  };

/**
 * Get repository by internal ID
 */
export const getRepositoryById =
  (db: AgentsRunDatabaseClient) =>
  async (id: string): Promise<GitHubAppRepositorySelect | null> => {
    const result = await db.query.workappsGithubAppRepositories.findFirst({
      where: eq(workappsGithubAppRepositories.id, id),
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
        id: workappsGithubAppRepositories.id,
        installationDbId: workappsGithubAppRepositories.installationDbId,
        repositoryId: workappsGithubAppRepositories.repositoryId,
        repositoryName: workappsGithubAppRepositories.repositoryName,
        repositoryFullName: workappsGithubAppRepositories.repositoryFullName,
        private: workappsGithubAppRepositories.private,
        createdAt: workappsGithubAppRepositories.createdAt,
        updatedAt: workappsGithubAppRepositories.updatedAt,
        installationAccountLogin: workappsGithubAppInstallations.accountLogin,
      })
      .from(workappsGithubAppRepositories)
      .innerJoin(
        workappsGithubAppInstallations,
        eq(workappsGithubAppRepositories.installationDbId, workappsGithubAppInstallations.id)
      )
      .where(
        and(
          eq(workappsGithubAppInstallations.tenantId, tenantId),
          ne(workappsGithubAppInstallations.status, 'disconnected')
        )
      )
      .orderBy(workappsGithubAppRepositories.repositoryFullName);

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
  async (params: {
    tenantId: string;
    projectId: string;
    repositoryIds: string[];
  }): Promise<void> => {
    const now = new Date().toISOString();

    // Remove all existing access for this project
    await db
      .delete(workappsGithubProjectRepositoryAccess)
      .where(eq(workappsGithubProjectRepositoryAccess.projectId, params.projectId));

    // Add new access entries
    if (params.repositoryIds.length > 0) {
      await db.insert(workappsGithubProjectRepositoryAccess).values(
        params.repositoryIds.map((repoId) => ({
          id: generateId(),
          tenantId: params.tenantId,
          projectId: params.projectId,
          repositoryDbId: repoId,
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
      .from(workappsGithubProjectRepositoryAccess)
      .where(eq(workappsGithubProjectRepositoryAccess.projectId, projectId));

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
        accessId: workappsGithubProjectRepositoryAccess.id,
        id: workappsGithubAppRepositories.id,
        installationDbId: workappsGithubAppRepositories.installationDbId,
        repositoryId: workappsGithubAppRepositories.repositoryId,
        repositoryName: workappsGithubAppRepositories.repositoryName,
        repositoryFullName: workappsGithubAppRepositories.repositoryFullName,
        private: workappsGithubAppRepositories.private,
        createdAt: workappsGithubAppRepositories.createdAt,
        updatedAt: workappsGithubAppRepositories.updatedAt,
      })
      .from(workappsGithubProjectRepositoryAccess)
      .innerJoin(
        workappsGithubAppRepositories,
        eq(workappsGithubProjectRepositoryAccess.repositoryDbId, workappsGithubAppRepositories.id)
      )
      .where(eq(workappsGithubProjectRepositoryAccess.projectId, projectId));

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
      .select({ id: workappsGithubProjectRepositoryAccess.id })
      .from(workappsGithubProjectRepositoryAccess)
      .where(eq(workappsGithubProjectRepositoryAccess.projectId, params.projectId))
      .limit(1);

    // If no access entries, project has access to all repos (mode='all')
    if (accessEntries.length === 0) {
      // Verify the repo belongs to a tenant installation
      const repo = await db
        .select({ id: workappsGithubAppRepositories.id })
        .from(workappsGithubAppRepositories)
        .innerJoin(
          workappsGithubAppInstallations,
          eq(workappsGithubAppRepositories.installationDbId, workappsGithubAppInstallations.id)
        )
        .where(
          and(
            eq(workappsGithubAppRepositories.repositoryFullName, params.repositoryFullName),
            eq(workappsGithubAppInstallations.tenantId, params.tenantId),
            ne(workappsGithubAppInstallations.status, 'disconnected')
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
      .select({ id: workappsGithubProjectRepositoryAccess.id })
      .from(workappsGithubProjectRepositoryAccess)
      .innerJoin(
        workappsGithubAppRepositories,
        eq(workappsGithubProjectRepositoryAccess.repositoryDbId, workappsGithubAppRepositories.id)
      )
      .innerJoin(
        workappsGithubAppInstallations,
        eq(workappsGithubAppRepositories.installationDbId, workappsGithubAppInstallations.id)
      )
      .where(
        and(
          eq(workappsGithubProjectRepositoryAccess.projectId, params.projectId),
          eq(workappsGithubAppRepositories.repositoryFullName, params.repositoryFullName),
          eq(workappsGithubAppInstallations.tenantId, params.tenantId),
          ne(workappsGithubAppInstallations.status, 'disconnected')
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
      .delete(workappsGithubProjectRepositoryAccess)
      .where(eq(workappsGithubProjectRepositoryAccess.projectId, projectId))
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
      .select({ id: workappsGithubAppRepositories.id })
      .from(workappsGithubAppRepositories)
      .innerJoin(
        workappsGithubAppInstallations,
        eq(workappsGithubAppRepositories.installationDbId, workappsGithubAppInstallations.id)
      )
      .where(
        and(
          eq(workappsGithubAppInstallations.tenantId, params.tenantId),
          ne(workappsGithubAppInstallations.status, 'disconnected'),
          inArray(workappsGithubAppRepositories.id, params.repositoryIds)
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
      .from(workappsGithubAppRepositories)
      .where(eq(workappsGithubAppRepositories.installationDbId, installationId));

    const total = result[0]?.count ?? 0;
    return typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
  };

/**
 * Get repository counts for multiple installations in a single query
 */
export const getRepositoryCountsByInstallationIds =
  (db: AgentsRunDatabaseClient) =>
  async (installationIds: string[]): Promise<Map<string, number>> => {
    if (installationIds.length === 0) {
      return new Map();
    }

    const results = await db
      .select({
        installationId: workappsGithubAppRepositories.installationDbId,
        count: count(),
      })
      .from(workappsGithubAppRepositories)
      .where(inArray(workappsGithubAppRepositories.installationDbId, installationIds))
      .groupBy(workappsGithubAppRepositories.installationDbId);

    const countsMap = new Map<string, number>();
    for (const row of results) {
      const total =
        typeof row.count === 'string' ? Number.parseInt(row.count, 10) : (row.count as number);
      countsMap.set(row.installationId, total);
    }

    return countsMap;
  };
