import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import {
  agentArtifactComponents,
  agentDataComponents,
  agentGraph,
  agents,
  agentToolRelations,
  artifactComponents,
  dataComponents,
  projects,
  tools,
} from '../db/schema';
import type { AgentGraphInsert, AgentGraphUpdate, FullGraphDefinition } from '../types/entities';
import type { GraphScopeConfig, PaginationConfig, ProjectScopeConfig } from '../types/utility';
import { getAgentRelations, getAgentRelationsByGraph } from './agentRelations';
import { getAgentById } from './agents';
import { getContextConfigById } from './contextConfigs';
import { getExternalAgent } from './externalAgents';

export const getAgentGraphById =
  (db: DatabaseClient) => async (params: { scopes: ProjectScopeConfig; graphId: string }) => {
    const result = await db.query.agentGraph.findFirst({
      where: and(
        eq(agentGraph.tenantId, params.scopes.tenantId),
        eq(agentGraph.projectId, params.scopes.projectId),
        eq(agentGraph.id, params.graphId)
      ),
    });
    return result ?? null;
  };

export const getAgentGraphWithDefaultAgent =
  (db: DatabaseClient) => async (params: { scopes: GraphScopeConfig }) => {
    const result = await db.query.agentGraph.findFirst({
      where: and(
        eq(agentGraph.tenantId, params.scopes.tenantId),
        eq(agentGraph.projectId, params.scopes.projectId),
        eq(agentGraph.id, params.scopes.graphId)
      ),
      with: {
        defaultAgent: true,
      },
    });
    return result ?? null;
  };

export const listAgentGraphs =
  (db: DatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    return await db.query.agentGraph.findMany({
      where: and(
        eq(agentGraph.tenantId, params.scopes.tenantId),
        eq(agentGraph.projectId, params.scopes.projectId)
      ),
    });
  };

export const listAgentGraphsPaginated =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(agentGraph.tenantId, params.scopes.tenantId),
      eq(agentGraph.projectId, params.scopes.projectId)
    );

    const query = db
      .select()
      .from(agentGraph)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(agentGraph.createdAt));

    const [data, totalResult] = await Promise.all([
      query,
      db.select({ count: count() }).from(agentGraph).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

export const createAgentGraph = (db: DatabaseClient) => async (data: AgentGraphInsert) => {
  const now = new Date().toISOString();

  const insertData: any = {
    ...data,
    createdAt: now,
    updatedAt: now,
  };

  if (data.description !== undefined) {
    insertData.description = data.description;
  }
  if (data.contextConfigId !== undefined) {
    insertData.contextConfigId = data.contextConfigId;
  }
  if (data.models !== undefined) {
    insertData.models = data.models;
  }
  if (data.statusUpdates !== undefined) {
    insertData.statusUpdates = data.statusUpdates;
  }
  if (data.graphPrompt !== undefined) {
    insertData.graphPrompt = data.graphPrompt;
  }
  if (data.stopWhen !== undefined) {
    insertData.stopWhen = data.stopWhen;
  }

  const graph = await db.insert(agentGraph).values(insertData).returning();

  return graph[0];
};

export const updateAgentGraph =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; graphId: string; data: AgentGraphUpdate }) => {
    const data = params.data;

    // Handle model settings clearing - if empty object or no model field, set to null
    if (data.models !== undefined) {
      if (
        !data.models ||
        (!data.models.base?.model &&
          !data.models.structuredOutput?.model &&
          !data.models.summarizer?.model &&
          !data.models.base?.providerOptions &&
          !data.models.structuredOutput?.providerOptions &&
          !data.models.summarizer?.providerOptions)
      ) {
        (data as any).models = null;
      }
    }

    if (data.statusUpdates !== undefined) {
      // If statusUpdates is null, set to null to clear it
      if (!data.statusUpdates) {
        data.statusUpdates = null;
      }
    }

    // Handle contextConfigId clearing
    if (data.contextConfigId !== undefined && !data.contextConfigId) {
      (data as any).contextConfigId = null;
    }

    // Handle graphPrompt clearing
    if (data.graphPrompt !== undefined && !data.graphPrompt) {
      (data as any).graphPrompt = null;
    }

    // Handle stopWhen clearing
    if (data.stopWhen !== undefined && !data.stopWhen) {
      (data as any).stopWhen = null;
    }

    const updateData = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    const graph = await db
      .update(agentGraph)
      .set(updateData)
      .where(
        and(
          eq(agentGraph.tenantId, params.scopes.tenantId),
          eq(agentGraph.projectId, params.scopes.projectId),
          eq(agentGraph.id, params.graphId)
        )
      )
      .returning();

    return graph[0] ?? null;
  };

export const deleteAgentGraph =
  (db: DatabaseClient) => async (params: { scopes: ProjectScopeConfig; graphId: string }) => {
    const result = await db
      .delete(agentGraph)
      .where(
        and(
          eq(agentGraph.tenantId, params.scopes.tenantId),
          eq(agentGraph.projectId, params.scopes.projectId),
          eq(agentGraph.id, params.graphId)
        )
      )
      .returning();

    return result.length > 0;
  };

/**
 * Helper function to fetch component relationships using efficient joins
 */
export const fetchComponentRelationships =
  (db: DatabaseClient) =>
  async <T extends Record<string, any>>(
    scopes: ProjectScopeConfig,
    agentIds: string[],
    config: {
      relationTable: any;
      componentTable: any;
      relationIdField: any;
      componentIdField: any;
      selectFields: Record<string, any>;
    }
  ): Promise<Record<string, T>> => {
    const componentsObject: Record<string, T> = {};

    if (agentIds.length > 0) {
      const results = await db
        .select(config.selectFields)
        .from(config.relationTable)
        .innerJoin(config.componentTable, eq(config.relationIdField, config.componentIdField))
        .where(
          and(
            eq(config.relationTable.tenantId, scopes.tenantId),
            eq(config.relationTable.projectId, scopes.projectId),
            inArray(config.relationTable.agentId, agentIds)
          )
        );

      for (const component of results) {
        componentsObject[component.id] = component as T;
      }
    }

    return componentsObject;
  };

export const getGraphAgentInfos =
  (db: DatabaseClient) =>
  async ({
    scopes,
    graphId,
    agentId,
  }: {
    scopes: ProjectScopeConfig;
    graphId: string;
    agentId: string;
  }) => {
    const { tenantId, projectId } = scopes;
    // First, verify that the graph exists
    const graph = await getAgentGraphById(db)({
      scopes: { tenantId, projectId },
      graphId,
    });
    if (!graph) {
      throw new Error(`Agent graph with ID ${graphId} not found for tenant ${tenantId}`);
    }

    // Get all relations for the agent within the tenant
    // For now, this works without graph-specific filtering until schema is properly updated
    const relations = await getAgentRelations(db)({
      scopes: { tenantId, projectId, graphId, agentId },
      graphId,
    });
    const targetAgentIds = relations
      .map((relation) => relation.targetAgentId)
      .filter((id): id is string => id !== null);

    // If no relations found, return empty array
    if (targetAgentIds.length === 0) {
      return [];
    }

    // Get agent information for each target agent
    const agentInfos = await Promise.all(
      targetAgentIds.map(async (targetAgentId) => {
        const agent = await getAgentById(db)({
          scopes: { tenantId, projectId, graphId },
          agentId: targetAgentId,
        });
        if (agent !== undefined) {
          return { id: agent.id, name: agent.name, description: agent.description };
        }
        return null;
      })
    );

    // Filter out null results
    return agentInfos.filter((agent): agent is NonNullable<typeof agent> => agent !== null);
  };

// NEW METHOD: Get full graph definition with all agents, relationships, and tools
export const getFullGraphDefinition =
  (db: DatabaseClient) =>
  async ({
    scopes: { tenantId, projectId },
    graphId,
  }: {
    scopes: ProjectScopeConfig;
    graphId: string;
  }): Promise<FullGraphDefinition | null> => {
    // First, get the basic graph info
    const graph = await getAgentGraphById(db)({
      scopes: { tenantId, projectId },
      graphId,
    });
    if (!graph) {
      return null;
    }

    // Get all agents that are part of this graph through relations
    // First get all unique agent IDs in this graph (both source and target agents)
    const graphRelations = await getAgentRelationsByGraph(db)({
      scopes: { tenantId, projectId, graphId },
    });

    // Instead of collecting agent IDs from relationships and tools,
    // we should directly query for agents that belong to this graph
    // Agents are scoped to graphs via their graphId field
    const graphAgents = await db.query.agents.findMany({
      where: and(
        eq(agents.tenantId, tenantId),
        eq(agents.projectId, projectId),
        eq(agents.graphId, graphId)
      ),
    });

    // Get external agents referenced in relationships
    const externalAgentIds = new Set<string>();
    for (const relation of graphRelations) {
      if (relation.externalAgentId) {
        externalAgentIds.add(relation.externalAgentId);
      }
    }

    // Process internal agents from the graph
    const processedAgents = await Promise.all(
      graphAgents.map(async (agent) => {
        if (!agent) return null;

        // Get relationships for this agent
        const agentRelationsList = graphRelations.filter(
          (relation) => relation.sourceAgentId === agent.id
        );

        // Group relationships by type
        const canTransferTo = agentRelationsList
          .filter((rel) => rel.relationType === 'transfer' || rel.relationType === 'transfer_to')
          .map((rel) => rel.targetAgentId)
          .filter((id): id is string => id !== null);

        const canDelegateTo = agentRelationsList
          .filter((rel) => rel.relationType === 'delegate' || rel.relationType === 'delegate_to')
          .map((rel) => rel.targetAgentId || rel.externalAgentId) // Delegations can be to internal or external agents
          .filter((id): id is string => id !== null);

        // Get tools for this agent
        const agentTools = await db
          .select({
            id: tools.id,
            name: tools.name,
            config: tools.config,
            imageUrl: tools.imageUrl,
            status: tools.status,
            capabilities: tools.capabilities,
            lastHealthCheck: tools.lastHealthCheck,
            lastError: tools.lastError,
            availableTools: tools.availableTools,
            lastToolsSync: tools.lastToolsSync,
            selectedTools: agentToolRelations.selectedTools,
          })
          .from(agentToolRelations)
          .innerJoin(tools, eq(agentToolRelations.toolId, tools.id))
          .where(
            and(eq(agentToolRelations.tenantId, tenantId), eq(agentToolRelations.agentId, agent.id))
          );

        // Get dataComponents for this agent
        const agentDataComponentRelations = await db.query.agentDataComponents.findMany({
          where: and(
            eq(agentDataComponents.tenantId, tenantId),
            eq(agentDataComponents.agentId, agent.id)
          ),
        });
        const agentDataComponentIds = agentDataComponentRelations.map((rel) => rel.dataComponentId);

        // Get artifactComponents for this agent
        const agentArtifactComponentRelations = await db.query.agentArtifactComponents.findMany({
          where: and(
            eq(agentArtifactComponents.tenantId, tenantId),
            eq(agentArtifactComponents.agentId, agent.id)
          ),
        });
        const agentArtifactComponentIds = agentArtifactComponentRelations.map(
          (rel) => rel.artifactComponentId
        );

        // Construct selectedTools Record from agentTools
        const selectedTools: Record<string, string[]> = {};
        agentTools.forEach((tool) => {
          if (tool.selectedTools && Array.isArray(tool.selectedTools)) {
            selectedTools[tool.id] = tool.selectedTools;
          }
        });

        return {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          prompt: agent.prompt,
          models: agent.models,
          stopWhen: agent.stopWhen,
          canTransferTo,
          canDelegateTo,
          dataComponents: agentDataComponentIds,
          artifactComponents: agentArtifactComponentIds,
          ...(Object.keys(selectedTools).length > 0 && { selectedTools }),
          tools: agentTools.map((tool) => ({
            id: tool.id,
            name: tool.name,
            config: tool.config,
            imageUrl: tool.imageUrl || undefined,
            status: tool.status,
            capabilities: tool.capabilities || undefined,
            lastHealthCheck:
              tool.lastHealthCheck && !Number.isNaN(new Date(tool.lastHealthCheck).getTime())
                ? new Date(tool.lastHealthCheck).toISOString()
                : undefined,
            lastError: tool.lastError || undefined,
            availableTools: tool.availableTools || undefined,
            activeTools: (tool.config as any)?.mcp?.activeTools || undefined,
            lastToolsSync:
              tool.lastToolsSync && !Number.isNaN(new Date(tool.lastToolsSync).getTime())
                ? new Date(tool.lastToolsSync).toISOString()
                : undefined,
          })),
        };
      })
    );

    const externalAgents = await Promise.all(
      Array.from(externalAgentIds).map(async (agentId) => {
        const agent = await getExternalAgent(db)({
          scopes: { tenantId, projectId, graphId },
          agentId,
        });
        if (!agent) return null;

        // External agents need to match the FullGraphAgentSchema structure
        return {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          baseUrl: agent.baseUrl,
        };
      })
    );

    // Filter out null results
    const validAgents = [...processedAgents, ...externalAgents].filter(
      (agent): agent is NonNullable<typeof agent> => agent !== null
    );

    // Convert agents array to object with agentId as key
    const agentsObject: Record<string, any> = {};
    const toolsObject: Record<string, any> = {};

    for (const agent of validAgents) {
      // Check if this is an external agent (has baseUrl property)
      const isExternalAgent = 'baseUrl' in agent && agent.baseUrl;
      if (isExternalAgent) {
        // External agent - only include basic fields
        agentsObject[agent.id] = {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          baseUrl: (agent as any).baseUrl,
        };
      } else {
        // Internal agent - extract tools and include all fields
        const toolsData = (agent as any).tools || [];
        const toolIds: string[] = [];
        const agentSelectedTools: Record<string, string[]> = {};

        // Build tools object and collect tool IDs for the agent
        for (const tool of toolsData) {
          toolsObject[tool.id] = tool;
          toolIds.push(tool.id);
          if (tool.selectedTools !== null && tool.selectedTools !== undefined) {
            agentSelectedTools[tool.id] = tool.selectedTools;
          }
        }

        agentsObject[agent.id] = {
          ...agent,
          tools: toolIds, // Replace tool objects with tool IDs
          ...(Object.keys(agentSelectedTools).length > 0 && { selectedTools: agentSelectedTools }),
        };
      }
    }

    // Get contextConfig if it exists
    let contextConfig = null;
    if (graph.contextConfigId) {
      try {
        contextConfig = await getContextConfigById(db)({
          scopes: { tenantId, projectId },
          id: graph.contextConfigId,
        });
      } catch (error) {
        // Don't fail the entire request if contextConfig retrieval fails
        console.warn(`Failed to retrieve contextConfig ${graph.contextConfigId}:`, error);
      }
    }

    // Get dataComponents for all agents in this graph
    let dataComponentsObject: Record<string, any> = {};
    try {
      // Collect all internal agent IDs from the graph
      const internalAgentIds = graphAgents.map((agent) => agent.id);
      const agentIds = Array.from(internalAgentIds);

      dataComponentsObject = await fetchComponentRelationships(db)(
        { tenantId, projectId },
        agentIds,
        {
          relationTable: agentDataComponents,
          componentTable: dataComponents,
          relationIdField: agentDataComponents.dataComponentId,
          componentIdField: dataComponents.id,
          selectFields: {
            id: dataComponents.id,
            name: dataComponents.name,
            description: dataComponents.description,
            props: dataComponents.props,
          },
        }
      );
    } catch (error) {
      // Don't fail the entire request if dataComponents retrieval fails
      console.warn('Failed to retrieve dataComponents:', error);
    }

    // Get artifactComponents for all agents in this graph
    let artifactComponentsObject: Record<string, any> = {};
    try {
      // Collect all internal agent IDs from the graph
      const internalAgentIds = graphAgents.map((agent) => agent.id);
      const agentIds = Array.from(internalAgentIds);

      artifactComponentsObject = await fetchComponentRelationships(db)(
        { tenantId, projectId },
        agentIds,
        {
          relationTable: agentArtifactComponents,
          componentTable: artifactComponents,
          relationIdField: agentArtifactComponents.artifactComponentId,
          componentIdField: artifactComponents.id,
          selectFields: {
            id: artifactComponents.id,
            name: artifactComponents.name,
            description: artifactComponents.description,
            summaryProps: artifactComponents.summaryProps,
            fullProps: artifactComponents.fullProps,
          },
        }
      );
    } catch (error) {
      // Don't fail the entire request if artifactComponents retrieval fails
      console.warn('Failed to retrieve artifactComponents:', error);
    }

    const result: any = {
      id: graph.id,
      name: graph.name,
      description: graph.description,
      defaultAgentId: graph.defaultAgentId,
      agents: agentsObject,
      tools: toolsObject,
      createdAt:
        graph.createdAt && !Number.isNaN(new Date(graph.createdAt).getTime())
          ? new Date(graph.createdAt).toISOString()
          : new Date().toISOString(),
      updatedAt:
        graph.updatedAt && !Number.isNaN(new Date(graph.updatedAt).getTime())
          ? new Date(graph.updatedAt).toISOString()
          : new Date().toISOString(),
    };

    // Add optional fields if they exist
    if (graph.models) {
      result.models = graph.models;
    }

    if (graph.statusUpdates) {
      result.statusUpdates = graph.statusUpdates;
    }

    if (graph.graphPrompt) {
      result.graphPrompt = graph.graphPrompt;
    }

    if (graph.stopWhen) {
      result.stopWhen = graph.stopWhen;
    }

    if (contextConfig) {
      result.contextConfig = {
        id: contextConfig.id,
        name: contextConfig.name,
        description: contextConfig.description,
        requestContextSchema: contextConfig.requestContextSchema,
        contextVariables: contextConfig.contextVariables,
      };
    }

    if (Object.keys(dataComponentsObject).length > 0) {
      result.dataComponents = dataComponentsObject;
    }

    if (Object.keys(artifactComponentsObject).length > 0) {
      result.artifactComponents = artifactComponentsObject;
    }

    // Apply agent stepCountIs inheritance from project
    try {
      // Check if projects query is available (may not be in test environments)
      if (!db.query?.projects?.findFirst) {
        return result;
      }

      // Get project stopWhen configuration
      const project = await db.query.projects.findFirst({
        where: and(eq(projects.tenantId, tenantId), eq(projects.id, projectId)),
      });

      if (project?.stopWhen) {
        const projectStopWhen = project.stopWhen as any;

        // Propagate stepCountIs from project to agents
        if (projectStopWhen?.stepCountIs !== undefined) {
          for (const [agentId, agentData] of Object.entries(result.agents)) {
            // Only apply to internal agents (not external agents with baseUrl)
            if (agentData && typeof agentData === 'object' && !('baseUrl' in agentData)) {
              const agent = agentData as any;

              // Check if agent needs to inherit stepCountIs
              const needsInheritance = !agent.stopWhen || agent.stopWhen.stepCountIs === undefined;

              if (needsInheritance) {
                // Initialize agent stopWhen if it doesn't exist or is null
                if (!agent.stopWhen) {
                  agent.stopWhen = {};
                }

                // Set stepCountIs in stopWhen
                agent.stopWhen.stepCountIs = projectStopWhen.stepCountIs;

                // Persist the inherited value to the database
                try {
                  await db
                    .update(agents)
                    .set({
                      stopWhen: agent.stopWhen,
                      updatedAt: new Date().toISOString(),
                    })
                    .where(
                      and(
                        eq(agents.tenantId, tenantId),
                        eq(agents.projectId, projectId),
                        eq(agents.id, agentId)
                      )
                    );

                  // Update the in-memory agent data to reflect the persisted values
                  // This ensures the UI gets the updated data
                  result.agents[agentId] = {
                    ...result.agents[agentId],
                    stopWhen: agent.stopWhen,
                  };
                } catch (dbError) {
                  console.warn(`Failed to persist stopWhen for agent ${agentId}:`, dbError);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      // Don't fail the entire request if inheritance fails
      console.warn('Failed to apply agent stepCountIs inheritance:', error);
    }

    return result;
  };

/**
 * Upsert an agent graph (create if it doesn't exist, update if it does)
 */
export const upsertAgentGraph =
  (db: DatabaseClient) =>
  async (params: { data: AgentGraphInsert }): Promise<any> => {
    const scopes = { tenantId: params.data.tenantId, projectId: params.data.projectId };
    const graphId = params.data.id || nanoid();

    const existing = await getAgentGraphById(db)({
      scopes,
      graphId,
    });

    if (existing) {
      // Update existing agent graph
      return await updateAgentGraph(db)({
        scopes,
        graphId,
        data: {
          name: params.data.name,
          defaultAgentId: params.data.defaultAgentId,
          description: params.data.description,
          contextConfigId: params.data.contextConfigId,
          models: params.data.models,
          statusUpdates: params.data.statusUpdates,
        },
      });
    } else {
      // Create new agent graph
      return await createAgentGraph(db)({
        ...params.data,
        id: graphId,
      });
    }
  };
