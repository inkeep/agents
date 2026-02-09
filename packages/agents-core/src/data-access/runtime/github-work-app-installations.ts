import { and, count, desc, eq, inArray, ne } from 'drizzle-orm';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import {
  workAppGitHubInstallations,
  workAppGitHubMcpToolAccessMode,
  workAppGitHubMcpToolRepositoryAccess,
  workAppGitHubProjectAccessMode,
  workAppGitHubProjectRepositoryAccess,
  workAppGitHubRepositories,
} from '../../db/runtime/runtime-schema';
import type {
  McpTool,
  ToolSelect,
  WorkAppGitHubInstallationInsert,
  WorkAppGitHubInstallationSelect,
  WorkAppGitHubProjectRepositoryAccessSelect,
  WorkAppGitHubRepositoryInput,
  WorkAppGitHubRepositorySelect,
} from '../../types/entities';
import type { WorkAppGitHubInstallationStatus } from '../../types/utility';
import { generateId } from '../../utils/conversations';

// ============================================================================
// Installation Management Functions
// ============================================================================

/**
 * Create a new GitHub App installation record
 */
export const createInstallation =
  (db: AgentsRunDatabaseClient) =>
  async (input: WorkAppGitHubInstallationInsert): Promise<WorkAppGitHubInstallationSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(workAppGitHubInstallations)
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
  async (gitHubInstallationId: string): Promise<WorkAppGitHubInstallationSelect | null> => {
    const result = await db.query.workAppGitHubInstallations.findFirst({
      where: eq(workAppGitHubInstallations.installationId, gitHubInstallationId),
    });

    return result ?? null;
  };

/**
 * Get installation by internal ID with tenant validation
 */
export const getInstallationById =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    id: string;
  }): Promise<WorkAppGitHubInstallationSelect | null> => {
    const result = await db.query.workAppGitHubInstallations.findFirst({
      where: and(
        eq(workAppGitHubInstallations.tenantId, params.tenantId),
        eq(workAppGitHubInstallations.id, params.id)
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
  }): Promise<WorkAppGitHubInstallationSelect[]> => {
    const conditions = [eq(workAppGitHubInstallations.tenantId, params.tenantId)];

    if (!params.includeDisconnected) {
      conditions.push(ne(workAppGitHubInstallations.status, 'disconnected'));
    }

    const result = await db
      .select()
      .from(workAppGitHubInstallations)
      .where(and(...conditions))
      .orderBy(desc(workAppGitHubInstallations.createdAt));

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
    status: WorkAppGitHubInstallationStatus;
  }): Promise<WorkAppGitHubInstallationSelect | null> => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(workAppGitHubInstallations)
      .set({
        status: params.status,
        updatedAt: now,
      })
      .where(
        and(
          eq(workAppGitHubInstallations.tenantId, params.tenantId),
          eq(workAppGitHubInstallations.id, params.id)
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
    status: WorkAppGitHubInstallationStatus;
  }): Promise<WorkAppGitHubInstallationSelect | null> => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(workAppGitHubInstallations)
      .set({
        status: params.status,
        updatedAt: now,
      })
      .where(eq(workAppGitHubInstallations.installationId, params.gitHubInstallationId))
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
      .select({ id: workAppGitHubRepositories.id })
      .from(workAppGitHubRepositories)
      .where(eq(workAppGitHubRepositories.installationDbId, params.id));

    const repoIds = repos.map((r) => r.id);

    // Remove project repository access for all repositories
    if (repoIds.length > 0) {
      await db
        .delete(workAppGitHubProjectRepositoryAccess)
        .where(inArray(workAppGitHubProjectRepositoryAccess.repositoryDbId, repoIds));
    }

    // Soft delete the installation
    const [updated] = await db
      .update(workAppGitHubInstallations)
      .set({
        status: 'disconnected',
        updatedAt: now,
      })
      .where(
        and(
          eq(workAppGitHubInstallations.tenantId, params.tenantId),
          eq(workAppGitHubInstallations.id, params.id)
        )
      )
      .returning();

    return !!updated;
  };

/**
 * Delete an installation (hard delete)
 * Returns the deleted installation if found, null otherwise
 */
export const deleteInstallation =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    id: string;
  }): Promise<WorkAppGitHubInstallationSelect | null> => {
    const [deleted] = await db
      .delete(workAppGitHubInstallations)
      .where(
        and(
          eq(workAppGitHubInstallations.tenantId, params.tenantId),
          eq(workAppGitHubInstallations.id, params.id)
        )
      )
      .returning();

    return deleted ?? null;
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
    repositories: WorkAppGitHubRepositoryInput[];
  }): Promise<{ added: number; removed: number; updated: number }> => {
    const now = new Date().toISOString();

    // Get existing repositories
    const existingRepos = await db
      .select()
      .from(workAppGitHubRepositories)
      .where(eq(workAppGitHubRepositories.installationDbId, params.installationId));

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
        .delete(workAppGitHubProjectRepositoryAccess)
        .where(inArray(workAppGitHubProjectRepositoryAccess.repositoryDbId, removeIds));

      // Then remove the repos
      await db
        .delete(workAppGitHubRepositories)
        .where(inArray(workAppGitHubRepositories.id, removeIds));
    }

    // Add new repos
    if (toAdd.length > 0) {
      await db.insert(workAppGitHubRepositories).values(
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
          .update(workAppGitHubRepositories)
          .set({
            repositoryName: repo.repositoryName,
            repositoryFullName: repo.repositoryFullName,
            private: repo.private,
            updatedAt: now,
          })
          .where(eq(workAppGitHubRepositories.id, existing.id));
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
    repositories: WorkAppGitHubRepositoryInput[];
  }): Promise<WorkAppGitHubRepositorySelect[]> => {
    const now = new Date().toISOString();

    if (params.repositories.length === 0) {
      return [];
    }

    await db
      .insert(workAppGitHubRepositories)
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
      .from(workAppGitHubRepositories)
      .where(
        and(
          eq(workAppGitHubRepositories.installationDbId, params.installationId),
          inArray(workAppGitHubRepositories.repositoryId, insertedRepoIds)
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
      .select({ id: workAppGitHubRepositories.id })
      .from(workAppGitHubRepositories)
      .where(
        and(
          eq(workAppGitHubRepositories.installationDbId, params.installationId),
          inArray(workAppGitHubRepositories.repositoryId, params.repositoryIds)
        )
      );

    const repoIds = repos.map((r) => r.id);

    if (repoIds.length === 0) {
      return 0;
    }

    // First remove project access for these repos
    await db
      .delete(workAppGitHubProjectRepositoryAccess)
      .where(inArray(workAppGitHubProjectRepositoryAccess.repositoryDbId, repoIds));

    // Then remove the repos
    const deleted = await db
      .delete(workAppGitHubRepositories)
      .where(inArray(workAppGitHubRepositories.id, repoIds))
      .returning();

    return deleted.length;
  };

/**
 * Get all repositories for an installation
 */
export const getRepositoriesByInstallationId =
  (db: AgentsRunDatabaseClient) =>
  async (installationId: string): Promise<WorkAppGitHubRepositorySelect[]> => {
    const result = await db
      .select()
      .from(workAppGitHubRepositories)
      .where(eq(workAppGitHubRepositories.installationDbId, installationId))
      .orderBy(workAppGitHubRepositories.repositoryFullName);

    return result;
  };

/**
 * Get repository by full name (e.g., "org/repo")
 */
export const getRepositoryByFullName =
  (db: AgentsRunDatabaseClient) =>
  async (repositoryFullName: string): Promise<WorkAppGitHubRepositorySelect | null> => {
    const result = await db
      .select()
      .from(workAppGitHubRepositories)
      .where(eq(workAppGitHubRepositories.repositoryFullName, repositoryFullName))
      .limit(1);

    return result[0] ?? null;
  };

/**
 * Get repository by internal ID
 */
export const getRepositoryById =
  (db: AgentsRunDatabaseClient) =>
  async (id: string): Promise<WorkAppGitHubRepositorySelect | null> => {
    const result = await db.query.workAppGitHubRepositories.findFirst({
      where: eq(workAppGitHubRepositories.id, id),
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
  ): Promise<
    (WorkAppGitHubRepositorySelect & {
      installationAccountLogin: string;
      installationId: string;
    })[]
  > => {
    const result = await db
      .select({
        id: workAppGitHubRepositories.id,
        installationDbId: workAppGitHubRepositories.installationDbId,
        installationId: workAppGitHubInstallations.installationId,
        repositoryId: workAppGitHubRepositories.repositoryId,
        repositoryName: workAppGitHubRepositories.repositoryName,
        repositoryFullName: workAppGitHubRepositories.repositoryFullName,
        private: workAppGitHubRepositories.private,
        createdAt: workAppGitHubRepositories.createdAt,
        updatedAt: workAppGitHubRepositories.updatedAt,
        installationAccountLogin: workAppGitHubInstallations.accountLogin,
      })
      .from(workAppGitHubRepositories)
      .innerJoin(
        workAppGitHubInstallations,
        eq(workAppGitHubRepositories.installationDbId, workAppGitHubInstallations.id)
      )
      .where(
        and(
          eq(workAppGitHubInstallations.tenantId, tenantId),
          ne(workAppGitHubInstallations.status, 'disconnected')
        )
      )
      .orderBy(workAppGitHubRepositories.repositoryFullName);

    return result as (WorkAppGitHubRepositorySelect & {
      installationAccountLogin: string;
      installationId: string;
    })[];
  };

// ============================================================================
// Project Repository Access Functions
// ============================================================================

/**
 * Set project repository access (full replacement)
 * Used when mode='selected' to specify which repositories the project can access.
 * Pass empty array to clear all access entries.
 *
 * Also cascades changes to MCP tools: any MCP tool in this project with mode='selected'
 * will have its selected repositories filtered to only include repos that remain
 * in the project's access list.
 */
export const setProjectRepositoryAccess =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    projectId: string;
    repositoryIds: string[];
  }): Promise<void> => {
    const now = new Date().toISOString();
    const newRepoIdSet = new Set(params.repositoryIds);

    // Remove all existing access for this project
    await db
      .delete(workAppGitHubProjectRepositoryAccess)
      .where(eq(workAppGitHubProjectRepositoryAccess.projectId, params.projectId));

    // Add new access entries
    if (params.repositoryIds.length > 0) {
      await db.insert(workAppGitHubProjectRepositoryAccess).values(
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

    // Cascade changes to MCP tools in this project
    // Find all MCP tools with mode='selected' in this project
    const toolsWithSelectedMode = await db
      .select({ toolId: workAppGitHubMcpToolAccessMode.toolId })
      .from(workAppGitHubMcpToolAccessMode)
      .where(
        and(
          eq(workAppGitHubMcpToolAccessMode.tenantId, params.tenantId),
          eq(workAppGitHubMcpToolAccessMode.projectId, params.projectId),
          eq(workAppGitHubMcpToolAccessMode.mode, 'selected')
        )
      );

    // For each tool, filter its selected repositories to only include those still in project access
    for (const { toolId } of toolsWithSelectedMode) {
      // Get the tool's current selected repositories
      const toolRepoAccess = await db
        .select({
          id: workAppGitHubMcpToolRepositoryAccess.id,
          repositoryDbId: workAppGitHubMcpToolRepositoryAccess.repositoryDbId,
        })
        .from(workAppGitHubMcpToolRepositoryAccess)
        .where(eq(workAppGitHubMcpToolRepositoryAccess.toolId, toolId));

      // Find repos that need to be removed (not in project's new access list)
      const reposToRemove = toolRepoAccess.filter((r) => !newRepoIdSet.has(r.repositoryDbId));

      // Remove the repos that are no longer accessible
      if (reposToRemove.length > 0) {
        await db.delete(workAppGitHubMcpToolRepositoryAccess).where(
          inArray(
            workAppGitHubMcpToolRepositoryAccess.id,
            reposToRemove.map((r) => r.id)
          )
        );
      }
    }
  };

/**
 * Get project repository access entries
 * These entries are used when mode='selected'. Check mode via getProjectAccessMode().
 */
export const getProjectRepositoryAccess =
  (db: AgentsRunDatabaseClient) =>
  async (projectId: string): Promise<WorkAppGitHubProjectRepositoryAccessSelect[]> => {
    const result = await db
      .select()
      .from(workAppGitHubProjectRepositoryAccess)
      .where(eq(workAppGitHubProjectRepositoryAccess.projectId, projectId));

    return result;
  };

/**
 * Get project repository access with full repository details.
 * If project access mode is 'all', returns all tenant repositories.
 * If mode is 'selected' (or not set), returns only explicitly granted repositories.
 */
export const getProjectRepositoryAccessWithDetails =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    projectId: string;
  }): Promise<
    (WorkAppGitHubRepositorySelect & {
      accessId: string;
      installationAccountLogin: string;
      installationId: string;
    })[]
  > => {
    const projectMode = await getProjectAccessMode(db)({
      tenantId: params.tenantId,
      projectId: params.projectId,
    });

    if (projectMode === 'all') {
      const repoAccess = await getRepositoriesByTenantId(db)(params.tenantId);
      return repoAccess.map((repo) => ({
        accessId: repo.id,
        ...repo,
      }));
    }

    const result = await db
      .select({
        accessId: workAppGitHubProjectRepositoryAccess.id,
        id: workAppGitHubRepositories.id,
        installationDbId: workAppGitHubRepositories.installationDbId,
        installationId: workAppGitHubInstallations.installationId,
        repositoryId: workAppGitHubRepositories.repositoryId,
        repositoryName: workAppGitHubRepositories.repositoryName,
        repositoryFullName: workAppGitHubRepositories.repositoryFullName,
        private: workAppGitHubRepositories.private,
        createdAt: workAppGitHubRepositories.createdAt,
        updatedAt: workAppGitHubRepositories.updatedAt,
        installationAccountLogin: workAppGitHubInstallations.accountLogin,
      })
      .from(workAppGitHubProjectRepositoryAccess)
      .innerJoin(
        workAppGitHubRepositories,
        eq(workAppGitHubProjectRepositoryAccess.repositoryDbId, workAppGitHubRepositories.id)
      )
      .innerJoin(
        workAppGitHubInstallations,
        eq(workAppGitHubRepositories.installationDbId, workAppGitHubInstallations.id)
      )
      .where(eq(workAppGitHubProjectRepositoryAccess.projectId, params.projectId));

    return result as (WorkAppGitHubRepositorySelect & {
      accessId: string;
      installationAccountLogin: string;
      installationId: string;
    })[];
  };

/**
 * Check if a project has access to a specific repository
 * Returns true if:
 * - Project mode is 'all' and repository belongs to tenant installations
 * - Project mode is 'selected' and repository is explicitly in the project's access list
 */
export const checkProjectRepositoryAccess =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    projectId: string;
    repositoryFullName: string;
    tenantId: string;
  }): Promise<{ hasAccess: boolean; reason: string }> => {
    // Get project's explicit access mode
    const modeResult = await db
      .select({ mode: workAppGitHubProjectAccessMode.mode })
      .from(workAppGitHubProjectAccessMode)
      .where(
        and(
          eq(workAppGitHubProjectAccessMode.tenantId, params.tenantId),
          eq(workAppGitHubProjectAccessMode.projectId, params.projectId)
        )
      )
      .limit(1);

    // Default to 'selected' if no mode is set (fail-safe)
    const mode = (modeResult[0]?.mode as WorkAppGitHubAccessMode) ?? 'selected';

    if (mode === 'all') {
      // Verify the repo belongs to a tenant installation
      const repo = await db
        .select({ id: workAppGitHubRepositories.id })
        .from(workAppGitHubRepositories)
        .innerJoin(
          workAppGitHubInstallations,
          eq(workAppGitHubRepositories.installationDbId, workAppGitHubInstallations.id)
        )
        .where(
          and(
            eq(workAppGitHubRepositories.repositoryFullName, params.repositoryFullName),
            eq(workAppGitHubInstallations.tenantId, params.tenantId),
            ne(workAppGitHubInstallations.status, 'disconnected')
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

    // mode === 'selected': Check if this specific repository is in the access list
    const accessCheck = await db
      .select({ id: workAppGitHubProjectRepositoryAccess.id })
      .from(workAppGitHubProjectRepositoryAccess)
      .innerJoin(
        workAppGitHubRepositories,
        eq(workAppGitHubProjectRepositoryAccess.repositoryDbId, workAppGitHubRepositories.id)
      )
      .innerJoin(
        workAppGitHubInstallations,
        eq(workAppGitHubRepositories.installationDbId, workAppGitHubInstallations.id)
      )
      .where(
        and(
          eq(workAppGitHubProjectRepositoryAccess.projectId, params.projectId),
          eq(workAppGitHubRepositories.repositoryFullName, params.repositoryFullName),
          eq(workAppGitHubInstallations.tenantId, params.tenantId),
          ne(workAppGitHubInstallations.status, 'disconnected')
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
      .delete(workAppGitHubProjectRepositoryAccess)
      .where(eq(workAppGitHubProjectRepositoryAccess.projectId, projectId))
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
      .select({ id: workAppGitHubRepositories.id })
      .from(workAppGitHubRepositories)
      .innerJoin(
        workAppGitHubInstallations,
        eq(workAppGitHubRepositories.installationDbId, workAppGitHubInstallations.id)
      )
      .where(
        and(
          eq(workAppGitHubInstallations.tenantId, params.tenantId),
          ne(workAppGitHubInstallations.status, 'disconnected'),
          inArray(workAppGitHubRepositories.id, params.repositoryIds)
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
      .from(workAppGitHubRepositories)
      .where(eq(workAppGitHubRepositories.installationDbId, installationId));

    const total = result[0]?.count ?? 0;
    return typeof total === 'string' ? Number.parseInt(total, 10) : (total as number);
  };

/**
 * Get repository counts for all installations belonging to a tenant
 */
export const getRepositoryCountsByTenantId =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    includeDisconnected?: boolean;
  }): Promise<Map<string, number>> => {
    const conditions = [eq(workAppGitHubInstallations.tenantId, params.tenantId)];

    if (!params.includeDisconnected) {
      conditions.push(ne(workAppGitHubInstallations.status, 'disconnected'));
    }

    const results = await db
      .select({
        installationId: workAppGitHubInstallations.id,
        count: count(workAppGitHubRepositories.id),
      })
      .from(workAppGitHubInstallations)
      .leftJoin(
        workAppGitHubRepositories,
        eq(workAppGitHubRepositories.installationDbId, workAppGitHubInstallations.id)
      )
      .where(and(...conditions))
      .groupBy(workAppGitHubInstallations.id);

    const countsMap = new Map<string, number>();
    for (const row of results) {
      const total =
        typeof row.count === 'string' ? Number.parseInt(row.count, 10) : (row.count as number);
      countsMap.set(row.installationId, total);
    }

    return countsMap;
  };

// ============================================================================
// MCP Tool Repository Access Functions
// ============================================================================

/**
 * Set MCP tool repository access (full replacement)
 * Used when mode='selected' to specify which repositories the tool can access.
 * Pass empty array to clear all access entries.
 */
export const setMcpToolRepositoryAccess =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    toolId: string;
    tenantId: string;
    projectId: string;
    repositoryIds: string[];
  }): Promise<void> => {
    const now = new Date().toISOString();

    // Remove all existing access for this tool
    await db
      .delete(workAppGitHubMcpToolRepositoryAccess)
      .where(eq(workAppGitHubMcpToolRepositoryAccess.toolId, params.toolId));

    // Add new access entries
    if (params.repositoryIds.length > 0) {
      await db.insert(workAppGitHubMcpToolRepositoryAccess).values(
        params.repositoryIds.map((repoId) => ({
          id: generateId(),
          toolId: params.toolId,
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
 * Get MCP tool repository access entries
 * These entries are used when mode='selected'. Check mode via getMcpToolAccessMode().
 */
export const getMcpToolRepositoryAccess =
  (db: AgentsRunDatabaseClient) =>
  async (
    toolId: string
  ): Promise<
    {
      id: string;
      toolId: string;
      tenantId: string;
      projectId: string;
      repositoryDbId: string;
      createdAt: string;
      updatedAt: string;
    }[]
  > => {
    const result = await db
      .select()
      .from(workAppGitHubMcpToolRepositoryAccess)
      .where(eq(workAppGitHubMcpToolRepositoryAccess.toolId, toolId));

    return result;
  };

/**
 * Get MCP tool repository access with full repository details.
 * If the tool's access mode is 'all', returns all repositories the project has access to.
 * If mode is 'selected' (or not set), returns only explicitly granted repositories.
 */
export const getMcpToolRepositoryAccessWithDetails =
  (db: AgentsRunDatabaseClient) =>
  async (
    toolId: string
  ): Promise<
    (WorkAppGitHubRepositorySelect & {
      accessId: string;
      installationAccountLogin: string;
      installationId: string;
    })[]
  > => {
    const modeResult = await db
      .select({
        mode: workAppGitHubMcpToolAccessMode.mode,
        projectId: workAppGitHubMcpToolAccessMode.projectId,
        tenantId: workAppGitHubMcpToolAccessMode.tenantId,
      })
      .from(workAppGitHubMcpToolAccessMode)
      .where(eq(workAppGitHubMcpToolAccessMode.toolId, toolId))
      .limit(1);

    const accessMode = modeResult[0];

    if (accessMode?.mode === 'all') {
      return getProjectRepositoryAccessWithDetails(db)({
        tenantId: accessMode.tenantId,
        projectId: accessMode.projectId,
      });
    }

    const result = await db
      .select({
        accessId: workAppGitHubMcpToolRepositoryAccess.id,
        id: workAppGitHubRepositories.id,
        installationDbId: workAppGitHubRepositories.installationDbId,
        installationId: workAppGitHubInstallations.installationId,
        repositoryId: workAppGitHubRepositories.repositoryId,
        repositoryName: workAppGitHubRepositories.repositoryName,
        repositoryFullName: workAppGitHubRepositories.repositoryFullName,
        private: workAppGitHubRepositories.private,
        createdAt: workAppGitHubRepositories.createdAt,
        updatedAt: workAppGitHubRepositories.updatedAt,
        installationAccountLogin: workAppGitHubInstallations.accountLogin,
      })
      .from(workAppGitHubMcpToolRepositoryAccess)
      .innerJoin(
        workAppGitHubRepositories,
        eq(workAppGitHubMcpToolRepositoryAccess.repositoryDbId, workAppGitHubRepositories.id)
      )
      .innerJoin(
        workAppGitHubInstallations,
        eq(workAppGitHubRepositories.installationDbId, workAppGitHubInstallations.id)
      )
      .where(eq(workAppGitHubMcpToolRepositoryAccess.toolId, toolId));

    return result as (WorkAppGitHubRepositorySelect & {
      accessId: string;
      installationAccountLogin: string;
      installationId: string;
    })[];
  };

/**
 * Remove all MCP tool repository access for a specific tool
 */
export const clearMcpToolRepositoryAccess =
  (db: AgentsRunDatabaseClient) =>
  async (toolId: string): Promise<number> => {
    const deleted = await db
      .delete(workAppGitHubMcpToolRepositoryAccess)
      .where(eq(workAppGitHubMcpToolRepositoryAccess.toolId, toolId))
      .returning();

    return deleted.length;
  };

export const isGithubWorkAppTool = (tool: ToolSelect | McpTool) => {
  return tool.isWorkApp && tool.config.mcp.server.url.includes('/github/mcp');
};
// ============================================================================
// Project Access Mode Functions
// ============================================================================

export type WorkAppGitHubAccessMode = 'all' | 'selected';

/**
 * Set the access mode for a project's GitHub repository access.
 * - 'all': Project has access to all repositories from tenant GitHub installations
 * - 'selected': Project only has access to repositories listed in work_app_github_project_repository_access
 */
export const setProjectAccessMode =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    projectId: string;
    mode: WorkAppGitHubAccessMode;
  }): Promise<void> => {
    const now = new Date().toISOString();

    await db
      .insert(workAppGitHubProjectAccessMode)
      .values({
        tenantId: params.tenantId,
        projectId: params.projectId,
        mode: params.mode,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [workAppGitHubProjectAccessMode.tenantId, workAppGitHubProjectAccessMode.projectId],
        set: {
          mode: params.mode,
          updatedAt: now,
        },
      });
  };

/**
 * Get the access mode for a project's GitHub repository access.
 * Returns 'selected' if no mode is explicitly set (fail-safe default).
 */
export const getProjectAccessMode =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; projectId: string }): Promise<WorkAppGitHubAccessMode> => {
    const result = await db
      .select({ mode: workAppGitHubProjectAccessMode.mode })
      .from(workAppGitHubProjectAccessMode)
      .where(
        and(
          eq(workAppGitHubProjectAccessMode.tenantId, params.tenantId),
          eq(workAppGitHubProjectAccessMode.projectId, params.projectId)
        )
      )
      .limit(1);

    // Default to 'selected' if no mode is set (fail-safe)
    return (result[0]?.mode as WorkAppGitHubAccessMode) ?? 'selected';
  };

/**
 * Delete the access mode entry for a project
 */
export const deleteProjectAccessMode =
  (db: AgentsRunDatabaseClient) =>
  async (params: { tenantId: string; projectId: string }): Promise<boolean> => {
    const deleted = await db
      .delete(workAppGitHubProjectAccessMode)
      .where(
        and(
          eq(workAppGitHubProjectAccessMode.tenantId, params.tenantId),
          eq(workAppGitHubProjectAccessMode.projectId, params.projectId)
        )
      )
      .returning();

    return deleted.length > 0;
  };

// ============================================================================
// MCP Tool Access Mode Functions
// ============================================================================

/**
 * Set the access mode for an MCP tool's GitHub repository access.
 * - 'all': Tool has access to all repositories the project has access to
 * - 'selected': Tool only has access to repositories listed in work_app_github_mcp_tool_repository_access
 */
export const setMcpToolAccessMode =
  (db: AgentsRunDatabaseClient) =>
  async (params: {
    toolId: string;
    tenantId: string;
    projectId: string;
    mode: WorkAppGitHubAccessMode;
  }): Promise<void> => {
    const now = new Date().toISOString();

    await db
      .insert(workAppGitHubMcpToolAccessMode)
      .values({
        toolId: params.toolId,
        tenantId: params.tenantId,
        projectId: params.projectId,
        mode: params.mode,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [workAppGitHubMcpToolAccessMode.toolId],
        set: {
          mode: params.mode,
          updatedAt: now,
        },
      });
  };

/**
 * Get the access mode for an MCP tool's GitHub repository access.
 * Returns 'selected' if no mode is explicitly set (fail-safe default).
 */
export const getMcpToolAccessMode =
  (db: AgentsRunDatabaseClient) =>
  async (toolId: string): Promise<WorkAppGitHubAccessMode> => {
    const result = await db
      .select({ mode: workAppGitHubMcpToolAccessMode.mode })
      .from(workAppGitHubMcpToolAccessMode)
      .where(eq(workAppGitHubMcpToolAccessMode.toolId, toolId))
      .limit(1);

    // Default to 'selected' if no mode is set (fail-safe)
    return (result[0]?.mode as WorkAppGitHubAccessMode) ?? 'selected';
  };

/**
 * Delete the access mode entry for an MCP tool
 */
export const deleteMcpToolAccessMode =
  (db: AgentsRunDatabaseClient) =>
  async (toolId: string): Promise<boolean> => {
    const deleted = await db
      .delete(workAppGitHubMcpToolAccessMode)
      .where(eq(workAppGitHubMcpToolAccessMode.toolId, toolId))
      .returning();

    return deleted.length > 0;
  };
