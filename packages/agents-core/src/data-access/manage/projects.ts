import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import {
  agents,
  artifactComponents,
  contextConfigs,
  credentialReferences,
  dataComponents,
  externalAgents,
  projects,
  subAgentArtifactComponents,
  subAgentDataComponents,
  subAgentRelations,
  subAgents,
  subAgentToolRelations,
  tools,
} from '../../db/manage/manage-schema';
import type { ProjectInsert, ProjectSelect, ProjectUpdate } from '../../types/entities';
import type {
  PaginationConfig,
  PaginationResult,
  ProjectInfo,
  ProjectResourceCounts,
  ProjectScopeConfig,
} from '../../types/utility';
import { projectScopedWhere, tenantScopedWhere } from './scope-helpers';

/**
 * List all unique project IDs within a tenant by scanning all resource tables
 * @param projectIds - Optional array of project IDs to filter by. If undefined, returns all projects.
 */
export const listProjects =
  (db: AgentsManageDatabaseClient) =>
  async (params: { tenantId: string; projectIds?: string[] }): Promise<ProjectInfo[]> => {
    // If projectIds filter is provided and empty, return empty result
    if (params.projectIds !== undefined && params.projectIds.length === 0) {
      return [];
    }

    const tenantScope = { tenantId: params.tenantId };
    const whereClause = params.projectIds
      ? and(tenantScopedWhere(projects, tenantScope), inArray(projects.id, params.projectIds))
      : tenantScopedWhere(projects, tenantScope);

    const projectsFromTable = await db
      .select({ projectId: projects.id }) // id IS the project ID
      .from(projects)
      .where(whereClause);

    if (projectsFromTable.length > 0) {
      return projectsFromTable.map((p) => ({ projectId: p.projectId }));
    }

    // Fallback: scan resource tables (only if no projectIds filter or projects table is empty)
    const projectIdSets = await Promise.all([
      db
        .selectDistinct({ projectId: subAgents.projectId })
        .from(subAgents)
        .where(tenantScopedWhere(subAgents, tenantScope)),
      db
        .selectDistinct({ projectId: agents.projectId })
        .from(agents)
        .where(tenantScopedWhere(agents, tenantScope)),
      db
        .selectDistinct({ projectId: tools.projectId })
        .from(tools)
        .where(tenantScopedWhere(tools, tenantScope)),
      db
        .selectDistinct({ projectId: contextConfigs.projectId })
        .from(contextConfigs)
        .where(tenantScopedWhere(contextConfigs, tenantScope)),
      db
        .selectDistinct({ projectId: externalAgents.projectId })
        .from(externalAgents)
        .where(tenantScopedWhere(externalAgents, tenantScope)),
      db
        .selectDistinct({ projectId: subAgentRelations.projectId })
        .from(subAgentRelations)
        .where(tenantScopedWhere(subAgentRelations, tenantScope)),
      db
        .selectDistinct({ projectId: subAgentToolRelations.projectId })
        .from(subAgentToolRelations)
        .where(tenantScopedWhere(subAgentToolRelations, tenantScope)),
      db
        .selectDistinct({ projectId: subAgentDataComponents.projectId })
        .from(subAgentDataComponents)
        .where(tenantScopedWhere(subAgentDataComponents, tenantScope)),
      db
        .selectDistinct({ projectId: subAgentArtifactComponents.projectId })
        .from(subAgentArtifactComponents)
        .where(tenantScopedWhere(subAgentArtifactComponents, tenantScope)),
      db
        .selectDistinct({ projectId: dataComponents.projectId })
        .from(dataComponents)
        .where(tenantScopedWhere(dataComponents, tenantScope)),
      db
        .selectDistinct({ projectId: artifactComponents.projectId })
        .from(artifactComponents)
        .where(tenantScopedWhere(artifactComponents, tenantScope)),
      db
        .selectDistinct({ projectId: credentialReferences.projectId })
        .from(credentialReferences)
        .where(tenantScopedWhere(credentialReferences, tenantScope)),
    ]);

    const allProjectIds = new Set<string>();
    projectIdSets.forEach((results) => {
      results.forEach((row) => {
        if (row.projectId) {
          // Apply projectIds filter if provided
          if (!params.projectIds || params.projectIds.includes(row.projectId)) {
            allProjectIds.add(row.projectId);
          }
        }
      });
    });

    const projectList = Array.from(allProjectIds)
      .sort()
      .map((projectId) => ({ projectId }));

    return projectList;
  };

/**
 * List all unique project IDs within a tenant with pagination
 * Optionally filter by a list of project IDs (for access control)
 */
export const listProjectsPaginated =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    tenantId: string;
    pagination?: PaginationConfig;
    projectIds?: string[];
  }): Promise<{
    data: ProjectSelect[];
    pagination: PaginationResult;
  }> => {
    const page = params.pagination?.page || 1;
    const limit = params.pagination?.limit || 10;
    const offset = (page - 1) * limit;

    // Build WHERE clause: always filter by tenantId, optionally by projectIds
    const tenantScope = { tenantId: params.tenantId };
    const whereClause = params.projectIds
      ? and(tenantScopedWhere(projects, tenantScope), inArray(projects.id, params.projectIds))
      : tenantScopedWhere(projects, tenantScope);

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(projects)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(projects.createdAt)),
      db.select({ count: count() }).from(projects).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data: data,
      pagination: { page, limit, total, pages },
    };
  };

/**
 * Get resource counts for a specific project
 */
export const getProjectResourceCounts =
  (db: AgentsManageDatabaseClient) =>
  async (params: ProjectScopeConfig): Promise<ProjectResourceCounts> => {
    const [subAgentResults, agentResults, toolResults, contextConfigResults, externalAgentResults] =
      await Promise.all([
        db
          .select({ count: subAgents.id })
          .from(subAgents)
          .where(projectScopedWhere(subAgents, params)),
        db.select({ count: agents.id }).from(agents).where(projectScopedWhere(agents, params)),
        db.select({ count: tools.id }).from(tools).where(projectScopedWhere(tools, params)),
        db
          .select({ count: contextConfigs.id })
          .from(contextConfigs)
          .where(projectScopedWhere(contextConfigs, params)),
        db
          .select({ count: externalAgents.id })
          .from(externalAgents)
          .where(projectScopedWhere(externalAgents, params)),
      ]);

    return {
      subAgents: subAgentResults.length,
      agents: agentResults.length,
      tools: toolResults.length,
      contextConfigs: contextConfigResults.length,
      externalAgents: externalAgentResults.length,
    };
  };

/**
 * Check if a project exists (has any resources)
 */
export const projectExists =
  (db: AgentsManageDatabaseClient) =>
  async (params: ProjectScopeConfig): Promise<boolean> => {
    const checks = [
      db
        .select({ id: subAgents.id })
        .from(subAgents)
        .where(projectScopedWhere(subAgents, params))
        .limit(1),
      db.select({ id: agents.id }).from(agents).where(projectScopedWhere(agents, params)).limit(1),
      db.select({ id: tools.id }).from(tools).where(projectScopedWhere(tools, params)).limit(1),
      db
        .select({ id: contextConfigs.id })
        .from(contextConfigs)
        .where(projectScopedWhere(contextConfigs, params))
        .limit(1),
      db
        .select({ id: externalAgents.id })
        .from(externalAgents)
        .where(projectScopedWhere(externalAgents, params))
        .limit(1),
    ];

    const results = await Promise.all(checks);
    return results.some((result) => result.length > 0);
  };

/**
 * Count total projects for a tenant
 */
export const countProjects =
  (db: AgentsManageDatabaseClient) =>
  async (params: { tenantId: string }): Promise<number> => {
    const projects = await listProjects(db)(params);
    return projects.length;
  };

/**
 * Get a single project by ID
 */
export const getProject =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<ProjectSelect | null> => {
    const result = await db
      .select()
      .from(projects)
      .where(
        and(tenantScopedWhere(projects, params.scopes), eq(projects.id, params.scopes.projectId))
      )
      .limit(1);
    return result[0] ?? null;
  };

/**
 * Create a new project
 */
export const createProject =
  (db: AgentsManageDatabaseClient) =>
  async (params: ProjectInsert): Promise<ProjectSelect> => {
    const now = new Date().toISOString();

    const [created] = await db
      .insert(projects)
      .values({
        ...params,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  };

/**
 * Update an existing project
 */
export const updateProject =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    data: ProjectUpdate;
  }): Promise<ProjectSelect | null> => {
    const now = new Date().toISOString();

    const projectWhere = and(
      tenantScopedWhere(projects, params.scopes),
      eq(projects.id, params.scopes.projectId)
    );

    const currentProjectResult = await db.select().from(projects).where(projectWhere).limit(1);
    const currentProject = currentProjectResult[0] ?? null;

    const [updated] = await db
      .update(projects)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(projectWhere)
      .returning();

    if (updated && params.data.stopWhen !== undefined) {
      try {
        await cascadeStopWhenUpdates(
          db,
          params.scopes,
          currentProject?.stopWhen as any,
          params.data.stopWhen as any
        );
      } catch (error) {
        console.warn('Failed to cascade stopWhen updates:', error);
      }
    }

    return updated || null;
  };

/**
 * Check if a project exists in the projects table
 */
export const projectExistsInTable =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<boolean> => {
    const result = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(tenantScopedWhere(projects, params.scopes), eq(projects.id, params.scopes.projectId))
      )
      .limit(1);

    return result.length > 0;
  };

/**
 * Check if a project has any resources (used before deletion)
 */
export const projectHasResources =
  (db: AgentsManageDatabaseClient) =>
  async (params: ProjectScopeConfig): Promise<boolean> => {
    return await projectExists(db)(params);
  };

/**
 * Delete a project (with validation for existing resources)
 */
export const deleteProject =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<boolean> => {
    const projectExistsInTableResult = await projectExistsInTable(db)({ scopes: params.scopes });
    if (!projectExistsInTableResult) {
      return false; // Project not found
    }

    await db
      .delete(projects)
      .where(
        and(tenantScopedWhere(projects, params.scopes), eq(projects.id, params.scopes.projectId))
      );

    return true;
  };

/**
 * Cascade stopWhen updates from project to Agents and Sub Agents
 */
async function cascadeStopWhenUpdates(
  db: AgentsManageDatabaseClient,
  scopes: ProjectScopeConfig,
  oldStopWhen: any,
  newStopWhen: any
): Promise<void> {
  if (oldStopWhen?.transferCountIs !== newStopWhen?.transferCountIs) {
    const agentsToUpdate = await db.select().from(agents).where(projectScopedWhere(agents, scopes));

    for (const agent of agentsToUpdate) {
      const agentStopWhen = agent.stopWhen as any;
      if (
        !agentStopWhen?.transferCountIs ||
        agentStopWhen.transferCountIs === oldStopWhen?.transferCountIs
      ) {
        const updatedStopWhen = {
          ...(agentStopWhen || {}),
          transferCountIs: newStopWhen?.transferCountIs,
        };

        await db
          .update(agents)
          .set({
            stopWhen: updatedStopWhen,
            updatedAt: new Date().toISOString(),
          })
          .where(and(projectScopedWhere(agents, scopes), eq(agents.id, agent.id)));
      }
    }
  }

  if (oldStopWhen?.stepCountIs !== newStopWhen?.stepCountIs) {
    const agentsToUpdate = await db
      .select()
      .from(subAgents)
      .where(projectScopedWhere(subAgents, scopes));

    for (const agent of agentsToUpdate) {
      const agentStopWhen = agent.stopWhen as any;
      if (!agentStopWhen?.stepCountIs || agentStopWhen.stepCountIs === oldStopWhen?.stepCountIs) {
        const updatedStopWhen = {
          ...(agentStopWhen || {}),
          stepCountIs: newStopWhen?.stepCountIs,
        };

        await db
          .update(subAgents)
          .set({
            stopWhen: updatedStopWhen,
            updatedAt: new Date().toISOString(),
          })
          .where(and(projectScopedWhere(subAgents, scopes), eq(subAgents.id, agent.id)));
      }
    }
  }
}
