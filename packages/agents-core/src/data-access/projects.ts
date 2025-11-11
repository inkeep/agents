import { and, count, desc, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { createDataAccessFn } from '../db/data-access-helper';
import {
  agents,
  artifactComponents,
  contextCache,
  contextConfigs,
  conversations,
  credentialReferences,
  dataComponents,
  externalAgents,
  ledgerArtifacts,
  messages,
  projects,
  subAgentArtifactComponents,
  subAgentDataComponents,
  subAgentRelations,
  subAgents,
  subAgentToolRelations,
  taskRelations,
  tasks,
  tools,
} from '../db/schema';
import type { ProjectInsert, ProjectSelect, ProjectUpdate } from '../types/entities';
import type {
  PaginationConfig,
  PaginationResult,
  ProjectInfo,
  ProjectResourceCounts,
  ProjectScopeConfig,
} from '../types/utility';

/**
 * List all unique project IDs within a tenant by scanning all resource tables
 */
export const listProjects =
  (db: DatabaseClient) =>
  async (params: { tenantId: string }): Promise<ProjectInfo[]> => {
    const projectsFromTable = await db
      .select({ projectId: projects.id }) // id IS the project ID
      .from(projects)
      .where(eq(projects.tenantId, params.tenantId));

    if (projectsFromTable.length > 0) {
      return projectsFromTable.map((p) => ({ projectId: p.projectId }));
    }

    const projectIdSets = await Promise.all([
      db
        .selectDistinct({ projectId: subAgents.projectId })
        .from(subAgents)
        .where(eq(subAgents.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: agents.projectId })
        .from(agents)
        .where(eq(agents.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: tools.projectId })
        .from(tools)
        .where(eq(tools.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: contextConfigs.projectId })
        .from(contextConfigs)
        .where(eq(contextConfigs.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: externalAgents.projectId })
        .from(externalAgents)
        .where(eq(externalAgents.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: subAgentRelations.projectId })
        .from(subAgentRelations)
        .where(eq(subAgentRelations.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: subAgentToolRelations.projectId })
        .from(subAgentToolRelations)
        .where(eq(subAgentToolRelations.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: subAgentDataComponents.projectId })
        .from(subAgentDataComponents)
        .where(eq(subAgentDataComponents.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: subAgentArtifactComponents.projectId })
        .from(subAgentArtifactComponents)
        .where(eq(subAgentArtifactComponents.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: dataComponents.projectId })
        .from(dataComponents)
        .where(eq(dataComponents.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: artifactComponents.projectId })
        .from(artifactComponents)
        .where(eq(artifactComponents.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: tasks.projectId })
        .from(tasks)
        .where(eq(tasks.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: taskRelations.projectId })
        .from(taskRelations)
        .where(eq(taskRelations.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: conversations.projectId })
        .from(conversations)
        .where(eq(conversations.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: messages.projectId })
        .from(messages)
        .where(eq(messages.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: contextCache.projectId })
        .from(contextCache)
        .where(eq(contextCache.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: credentialReferences.projectId })
        .from(credentialReferences)
        .where(eq(credentialReferences.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: ledgerArtifacts.projectId })
        .from(ledgerArtifacts)
        .where(eq(ledgerArtifacts.tenantId, params.tenantId)),
    ]);

    const allProjectIds = new Set<string>();
    projectIdSets.forEach((results) => {
      results.forEach((row) => {
        if (row.projectId) {
          allProjectIds.add(row.projectId);
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
 */
export const listProjectsPaginated = createDataAccessFn(
  async (
    db: DatabaseClient,
    params: {
      tenantId: string;
      pagination?: PaginationConfig;
    }
  ): Promise<{
    data: ProjectSelect[];
    pagination: PaginationResult;
  }> => {
    const page = params.pagination?.page || 1;
    const limit = params.pagination?.limit || 10;
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(projects)
        .where(eq(projects.tenantId, params.tenantId))
        .limit(limit)
        .offset(offset)
        .orderBy(desc(projects.createdAt)),
      db.select({ count: count() }).from(projects).where(eq(projects.tenantId, params.tenantId)),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data: data,
      pagination: { page, limit, total, pages },
    };
  }
);

/**
 * Get resource counts for a specific project
 */
export const getProjectResourceCounts =
  (db: DatabaseClient) =>
  async (params: ProjectScopeConfig): Promise<ProjectResourceCounts> => {
    const whereClause = (table: any) =>
      and(eq(table.tenantId, params.tenantId), eq(table.projectId, params.projectId));

    const [subAgentResults, agentResults, toolResults, contextConfigResults, externalAgentResults] =
      await Promise.all([
        db.select({ count: subAgents.id }).from(subAgents).where(whereClause(subAgents)),
        db.select({ count: agents.id }).from(agents).where(whereClause(agents)),
        db.select({ count: tools.id }).from(tools).where(whereClause(tools)),
        db
          .select({ count: contextConfigs.id })
          .from(contextConfigs)
          .where(whereClause(contextConfigs)),
        db
          .select({ count: externalAgents.id })
          .from(externalAgents)
          .where(whereClause(externalAgents)),
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
  (db: DatabaseClient) =>
  async (params: ProjectScopeConfig): Promise<boolean> => {
    const whereClause = (table: any) =>
      and(eq(table.tenantId, params.tenantId), eq(table.projectId, params.projectId));

    const checks = [
      db.select({ id: subAgents.id }).from(subAgents).where(whereClause(subAgents)).limit(1),
      db.select({ id: agents.id }).from(agents).where(whereClause(agents)).limit(1),
      db.select({ id: tools.id }).from(tools).where(whereClause(tools)).limit(1),
      db
        .select({ id: contextConfigs.id })
        .from(contextConfigs)
        .where(whereClause(contextConfigs))
        .limit(1),
      db
        .select({ id: externalAgents.id })
        .from(externalAgents)
        .where(whereClause(externalAgents))
        .limit(1),
      db.select({ id: tasks.id }).from(tasks).where(whereClause(tasks)).limit(1),
      db
        .select({ id: conversations.id })
        .from(conversations)
        .where(whereClause(conversations))
        .limit(1),
    ];

    const results = await Promise.all(checks);
    return results.some((result) => result.length > 0);
  };

/**
 * Count total projects for a tenant
 */
export const countProjects =
  (db: DatabaseClient) =>
  async (params: { tenantId: string }): Promise<number> => {
    const projects = await listProjects(db)(params);
    return projects.length;
  };

/**
 * Get a single project by ID
 */
export const getProject = createDataAccessFn(
  async (db: DatabaseClient, params: { scopes: ProjectScopeConfig }): Promise<ProjectSelect | null> => {
    const result = await db.query.projects.findFirst({
      where: and(
        eq(projects.tenantId, params.scopes.tenantId),
        eq(projects.id, params.scopes.projectId)
      ),
    });
    return result || null;
  }
);

/**
 * Create a new project
 */
export const createProject =
  (db: DatabaseClient) =>
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
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    data: ProjectUpdate;
  }): Promise<ProjectSelect | null> => {
    const now = new Date().toISOString();

    const currentProject = await db.query.projects.findFirst({
      where: and(
        eq(projects.tenantId, params.scopes.tenantId),
        eq(projects.id, params.scopes.projectId)
      ),
    });

    const [updated] = await db
      .update(projects)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(
        and(eq(projects.tenantId, params.scopes.tenantId), eq(projects.id, params.scopes.projectId))
      )
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
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<boolean> => {
    const result = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(eq(projects.tenantId, params.scopes.tenantId), eq(projects.id, params.scopes.projectId))
      )
      .limit(1);

    return result.length > 0;
  };

/**
 * Check if a project has any resources (used before deletion)
 */
export const projectHasResources =
  (db: DatabaseClient) =>
  async (params: ProjectScopeConfig): Promise<boolean> => {
    return await projectExists(db)(params);
  };

/**
 * Delete a project (with validation for existing resources)
 */
export const deleteProject =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<boolean> => {
    const projectExistsInTableResult = await projectExistsInTable(db)({ scopes: params.scopes });
    if (!projectExistsInTableResult) {
      return false; // Project not found
    }

    await db
      .delete(projects)
      .where(
        and(eq(projects.tenantId, params.scopes.tenantId), eq(projects.id, params.scopes.projectId))
      );

    return true;
  };

/**
 * Cascade stopWhen updates from project to Agents and Sub Agents
 */
async function cascadeStopWhenUpdates(
  db: DatabaseClient,
  scopes: ProjectScopeConfig,
  oldStopWhen: any,
  newStopWhen: any
): Promise<void> {
  const { tenantId, projectId } = scopes;

  if (oldStopWhen?.transferCountIs !== newStopWhen?.transferCountIs) {
    const agentsToUpdate = await db.query.agents.findMany({
      where: and(eq(agents.tenantId, tenantId), eq(agents.projectId, projectId)),
    });

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
          .where(
            and(
              eq(agents.tenantId, tenantId),
              eq(agents.projectId, projectId),
              eq(agents.id, agent.id)
            )
          );
      }
    }
  }

  if (oldStopWhen?.stepCountIs !== newStopWhen?.stepCountIs) {
    const agentsToUpdate = await db.query.subAgents.findMany({
      where: and(eq(subAgents.tenantId, tenantId), eq(subAgents.projectId, projectId)),
    });

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
          .where(
            and(
              eq(subAgents.tenantId, tenantId),
              eq(subAgents.projectId, projectId),
              eq(subAgents.id, agent.id)
            )
          );
      }
    }
  }
}
