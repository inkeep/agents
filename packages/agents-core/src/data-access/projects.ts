import { and, count, desc, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import {
  agentArtifactComponents,
  agentDataComponents,
  agentGraph,
  agentRelations,
  agents,
  agentToolRelations,
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
  ScopeConfig,
} from '../types/utility';

/**
 * List all unique project IDs within a tenant by scanning all resource tables
 */
export const listProjects =
  (db: DatabaseClient) =>
  async (params: { tenantId: string }): Promise<ProjectInfo[]> => {
    // First try to get from projects table
    const projectsFromTable = await db
      .select({ projectId: projects.id }) // id IS the project ID
      .from(projects)
      .where(eq(projects.tenantId, params.tenantId));

    if (projectsFromTable.length > 0) {
      return projectsFromTable.map((p) => ({ projectId: p.projectId }));
    }

    // Fallback to scanning all tables for backward compatibility
    const projectIdSets = await Promise.all([
      db
        .selectDistinct({ projectId: agents.projectId })
        .from(agents)
        .where(eq(agents.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: agentGraph.projectId })
        .from(agentGraph)
        .where(eq(agentGraph.tenantId, params.tenantId)),
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
        .selectDistinct({ projectId: agentRelations.projectId })
        .from(agentRelations)
        .where(eq(agentRelations.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: agentToolRelations.projectId })
        .from(agentToolRelations)
        .where(eq(agentToolRelations.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: agentDataComponents.projectId })
        .from(agentDataComponents)
        .where(eq(agentDataComponents.tenantId, params.tenantId)),
      db
        .selectDistinct({ projectId: agentArtifactComponents.projectId })
        .from(agentArtifactComponents)
        .where(eq(agentArtifactComponents.tenantId, params.tenantId)),
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

    // Combine all unique project IDs
    const allProjectIds = new Set<string>();
    projectIdSets.forEach((results) => {
      results.forEach((row) => {
        if (row.projectId) {
          allProjectIds.add(row.projectId);
        }
      });
    });

    // Convert to array and sort
    const projectList = Array.from(allProjectIds)
      .sort()
      .map((projectId) => ({ projectId }));

    return projectList;
  };

/**
 * List all unique project IDs within a tenant with pagination
 */
export const listProjectsPaginated =
  (db: DatabaseClient) =>
  async (params: {
    tenantId: string;
    pagination?: PaginationConfig;
  }): Promise<{
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
  };

/**
 * Get resource counts for a specific project
 */
export const getProjectResourceCounts =
  (db: DatabaseClient) =>
  async (params: ScopeConfig): Promise<ProjectResourceCounts> => {
    const whereClause = (table: any) =>
      and(eq(table.tenantId, params.tenantId), eq(table.projectId, params.projectId));

    // Count resources in parallel
    const [agentResults, graphResults, toolResults, contextConfigResults, externalAgentResults] =
      await Promise.all([
        db.select({ count: agents.id }).from(agents).where(whereClause(agents)),
        db.select({ count: agentGraph.id }).from(agentGraph).where(whereClause(agentGraph)),
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
      agents: agentResults.length,
      agentGraphs: graphResults.length,
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
  async (params: ScopeConfig): Promise<boolean> => {
    // Check if projectId exists in any table (stop at first match for efficiency)
    const whereClause = (table: any) =>
      and(eq(table.tenantId, params.tenantId), eq(table.projectId, params.projectId));

    const checks = [
      db.select({ id: agents.id }).from(agents).where(whereClause(agents)).limit(1),
      db.select({ id: agentGraph.id }).from(agentGraph).where(whereClause(agentGraph)).limit(1),
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
export const getProject =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig }): Promise<ProjectSelect | null> => {
    const result = await db.query.projects.findFirst({
      where: and(
        eq(projects.tenantId, params.scopes.tenantId),
        eq(projects.id, params.scopes.projectId)
      ),
    });
    return result || null;
  };

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
  async (params: { scopes: ScopeConfig; data: ProjectUpdate }): Promise<ProjectSelect | null> => {
    const now = new Date().toISOString();

    // First, get the current project to compare stopWhen values
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

    // If stopWhen was updated, cascade the changes to agents and graphs
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
  async (params: { scopes: ScopeConfig }): Promise<boolean> => {
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
  async (params: ScopeConfig): Promise<boolean> => {
    return await projectExists(db)(params);
  };

/**
 * Delete a project (with validation for existing resources)
 */
export const deleteProject =
  (db: DatabaseClient) =>
  async (params: { scopes: ScopeConfig }): Promise<boolean> => {
    // First check if the project exists in the projects table
    const projectExistsInTableResult = await projectExistsInTable(db)({ scopes: params.scopes });
    if (!projectExistsInTableResult) {
      return false; // Project not found
    }

    // Check if project has any resources
    const hasResources = await projectExists(db)(params.scopes);
    if (hasResources) {
      throw new Error('Cannot delete project with existing resources');
    }

    // Project exists and has no resources, safe to delete
    await db
      .delete(projects)
      .where(
        and(eq(projects.tenantId, params.scopes.tenantId), eq(projects.id, params.scopes.projectId))
      );

    return true;
  };

/**
 * Cascade stopWhen updates from project to graphs and agents
 */
async function cascadeStopWhenUpdates(
  db: DatabaseClient,
  scopes: ScopeConfig,
  oldStopWhen: any,
  newStopWhen: any
): Promise<void> {
  const { tenantId, projectId } = scopes;

  // Update graphs if transferCountIs changed
  if (oldStopWhen?.transferCountIs !== newStopWhen?.transferCountIs) {
    // Find all graphs that inherited the old transferCountIs value
    const graphsToUpdate = await db.query.agentGraph.findMany({
      where: and(eq(agentGraph.tenantId, tenantId), eq(agentGraph.projectId, projectId)),
    });

    for (const graph of graphsToUpdate) {
      const graphStopWhen = graph.stopWhen as any;
      // If graph has no explicit transferCountIs or matches old project value, update it
      if (
        !graphStopWhen?.transferCountIs ||
        graphStopWhen.transferCountIs === oldStopWhen?.transferCountIs
      ) {
        const updatedStopWhen = {
          ...(graphStopWhen || {}),
          transferCountIs: newStopWhen?.transferCountIs,
        };

        await db
          .update(agentGraph)
          .set({
            stopWhen: updatedStopWhen,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(agentGraph.tenantId, tenantId),
              eq(agentGraph.projectId, projectId),
              eq(agentGraph.id, graph.id)
            )
          );
      }
    }
  }

  // Update agents if stepCountIs changed
  if (oldStopWhen?.stepCountIs !== newStopWhen?.stepCountIs) {
    // Find all agents that inherited the old stepCountIs value
    const agentsToUpdate = await db.query.agents.findMany({
      where: and(eq(agents.tenantId, tenantId), eq(agents.projectId, projectId)),
    });

    for (const agent of agentsToUpdate) {
      const agentStopWhen = agent.stopWhen as any;
      // If agent has no explicit stepCountIs or matches old project value, update it
      if (!agentStopWhen?.stepCountIs || agentStopWhen.stepCountIs === oldStopWhen?.stepCountIs) {
        const updatedStopWhen = {
          ...(agentStopWhen || {}),
          stepCountIs: newStopWhen?.stepCountIs,
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
}
