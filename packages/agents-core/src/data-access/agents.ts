import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { DatabaseClient } from '../db/client';
import {
  agents,
  artifactComponents,
  dataComponents,
  functionTools,
  projects,
  subAgentArtifactComponents,
  subAgentDataComponents,
  subAgentFunctionToolRelations,
  subAgents,
  subAgentToolRelations,
  tools,
} from '../db/schema';
import type { AgentInsert, AgentSelect, AgentUpdate, FullAgentDefinition } from '../types/entities';
import type { AgentScopeConfig, PaginationConfig, ProjectScopeConfig } from '../types/utility';
import { generateId } from '../utils/conversations';
import { getContextConfigById } from './contextConfigs';
import { getExternalAgent } from './externalAgents';
import { getFunction } from './functions';
import { listFunctionTools } from './functionTools';
import { getSubAgentExternalAgentRelationsByAgent } from './subAgentExternalAgentRelations';
import { getAgentRelations, getAgentRelationsByAgent } from './subAgentRelations';
import { getSubAgentById } from './subAgents';
import { getSubAgentTeamAgentRelationsByAgent } from './subAgentTeamAgentRelations';
import { listTools } from './tools';

export const getAgentById =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    const result = await db.query.agents.findFirst({
      where: and(
        eq(agents.tenantId, params.scopes.tenantId),
        eq(agents.projectId, params.scopes.projectId),
        eq(agents.id, params.scopes.agentId)
      ),
    });
    return result ?? null;
  };

export const getAgentWithDefaultSubAgent =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    const result = await db
      .select()
      .from(agents)
      .innerJoin(subAgents, eq(agents.defaultSubAgentId, subAgents.id))
      .where(
        and(
          eq(agents.tenantId, params.scopes.tenantId),
          eq(agents.projectId, params.scopes.projectId),
          eq(agents.id, params.scopes.agentId)
        )
      )
      .limit(1);
    const agent = result[0]?.agent ?? null;
    const defaultSubAgent = result[0]?.sub_agents ?? null;
    if (!agent || !defaultSubAgent) {
      return null;
    }
    return { ...agent, defaultSubAgent };
  };

export const listAgents =
  (db: DatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    return await db.query.agents.findMany({
      where: and(
        eq(agents.tenantId, params.scopes.tenantId),
        eq(agents.projectId, params.scopes.projectId)
      ),
    });
  };

export const listAgentsPaginated =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(agents.tenantId, params.scopes.tenantId),
      eq(agents.projectId, params.scopes.projectId)
    );

    const query = db
      .select()
      .from(agents)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(agents.createdAt));

    const [data, totalResult] = await Promise.all([
      query,
      db.select({ count: count() }).from(agents).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

export const createAgent = (db: DatabaseClient) => async (data: AgentInsert) => {
  const now = new Date().toISOString();

  const insertData = {
    ...data,
    createdAt: now,
    updatedAt: now,
    ...(data.description !== undefined && { description: data.description }),
    ...(data.contextConfigId !== undefined && { contextConfigId: data.contextConfigId }),
    ...(data.models !== undefined && { models: data.models }),
    ...(data.statusUpdates !== undefined && { statusUpdates: data.statusUpdates }),
    ...(data.prompt !== undefined && { prompt: data.prompt }),
    ...(data.stopWhen !== undefined && { stopWhen: data.stopWhen }),
  };

  const agent = await db.insert(agents).values(insertData).returning();

  return agent[0];
};

export const updateAgent =
  (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig; data: AgentUpdate }) => {
    const data = params.data;

    const updateData: Record<string, unknown> = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

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
        updateData.models = null;
      }
    }

    if (data.statusUpdates !== undefined) {
      if (!data.statusUpdates) {
        updateData.statusUpdates = null;
      }
    }

    if (data.contextConfigId !== undefined && !data.contextConfigId) {
      updateData.contextConfigId = null;
    }

    if (data.prompt !== undefined && !data.prompt) {
      updateData.prompt = null;
    }

    if (data.stopWhen !== undefined && !data.stopWhen) {
      updateData.stopWhen = null;
    }

    const agent = await db
      .update(agents)
      .set(updateData)
      .where(
        and(
          eq(agents.tenantId, params.scopes.tenantId),
          eq(agents.projectId, params.scopes.projectId),
          eq(agents.id, params.scopes.agentId)
        )
      )
      .returning();

    return agent[0] ?? null;
  };

export const deleteAgent = (db: DatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
  const result = await db
    .delete(agents)
    .where(
      and(
        eq(agents.tenantId, params.scopes.tenantId),
        eq(agents.projectId, params.scopes.projectId),
        eq(agents.id, params.scopes.agentId)
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
  async <T extends Record<string, unknown>>(
    scopes: ProjectScopeConfig,
    subAgentIds: string[],
    config: {
      relationTable: PgTable<any>;
      componentTable: PgTable<any>;
      relationIdField: unknown;
      componentIdField: unknown;
      subAgentIdField: unknown;
      selectFields: Record<string, unknown>;
    }
  ): Promise<Record<string, T>> => {
    const componentsObject: Record<string, T> = {};

    if (subAgentIds.length > 0) {
      const results = await db
        .select(config.selectFields as any)
        .from(config.relationTable)
        .innerJoin(
          config.componentTable,
          eq(config.relationIdField as any, config.componentIdField as any)
        )
        .where(
          and(
            eq((config.relationTable as any).tenantId, scopes.tenantId),
            eq((config.relationTable as any).projectId, scopes.projectId),
            inArray(config.subAgentIdField as any, subAgentIds)
          )
        );

      for (const component of results) {
        componentsObject[(component as any).id] = component as T;
      }
    }

    return componentsObject;
  };

export const getAgentSubAgentInfos =
  (db: DatabaseClient) =>
  async ({
    scopes: { tenantId, projectId },
    agentId,
    subAgentId,
  }: {
    scopes: ProjectScopeConfig;
    agentId: string;
    subAgentId: string;
  }) => {
    const agent = await getAgentById(db)({
      scopes: { tenantId, projectId, agentId },
    });
    if (!agent) {
      throw new Error(`Agent with ID ${agentId} not found for tenant ${tenantId}`);
    }

    const relations = await getAgentRelations(db)({
      scopes: { tenantId, projectId, agentId, subAgentId },
    });
    const targetSubAgentIds = relations
      .map((relation) => relation.targetSubAgentId)
      .filter((id): id is string => id !== null);

    if (targetSubAgentIds.length === 0) {
      return [];
    }

    const agentInfos = await Promise.all(
      targetSubAgentIds.map(async (subAgentId) => {
        const agent = await getSubAgentById(db)({
          scopes: { tenantId, projectId, agentId },
          subAgentId,
        });
        return agent ? { id: agent.id, name: agent.name, description: agent.description } : null;
      })
    );

    return agentInfos.filter((agent): agent is NonNullable<typeof agent> => agent !== null);
  };

export const getFullAgentDefinition =
  (db: DatabaseClient) =>
  async ({
    scopes: { tenantId, projectId, agentId },
  }: {
    scopes: AgentScopeConfig;
  }): Promise<FullAgentDefinition | null> => {
    const agent = await getAgentById(db)({
      scopes: { tenantId, projectId, agentId },
    });
    if (!agent) {
      return null;
    }

    const agentRelations = await getAgentRelationsByAgent(db)({
      scopes: { tenantId, projectId, agentId },
    });

    const agentSubAgents = await db.query.subAgents.findMany({
      where: and(
        eq(subAgents.tenantId, tenantId),
        eq(subAgents.projectId, projectId),
        eq(subAgents.agentId, agentId)
      ),
    });

    const externalAgentRelations = await getSubAgentExternalAgentRelationsByAgent(db)({
      scopes: { tenantId, projectId, agentId },
    });

    const teamAgentRelations = await getSubAgentTeamAgentRelationsByAgent(db)({
      scopes: { tenantId, projectId, agentId },
    });

    const teamAgentSubAgentIds = new Set<string>();
    for (const relation of teamAgentRelations) {
      teamAgentSubAgentIds.add(relation.targetAgentId);
    }

    const externalSubAgentIds = new Set<string>();
    for (const relation of externalAgentRelations) {
      externalSubAgentIds.add(relation.externalAgentId);
    }

    const processedSubAgents = await Promise.all(
      agentSubAgents.map(async (agent) => {
        if (!agent) return null;

        const subAgentRelationsList = agentRelations.filter(
          (relation) => relation.sourceSubAgentId === agent.id
        );

        const canTransferTo = subAgentRelationsList
          .filter((rel) => rel.relationType === 'transfer' || rel.relationType === 'transfer_to')
          .map((rel) => rel.targetSubAgentId)
          .filter((id): id is string => id !== null);

        const canDelegateToInternal = subAgentRelationsList
          .filter((rel) => rel.relationType === 'delegate' || rel.relationType === 'delegate_to')
          .map((rel) => rel.targetSubAgentId)
          .filter((id): id is string => id !== null);

        const canDelegateToExternal = externalAgentRelations
          .filter((rel) => rel.subAgentId === agent.id)
          .map((rel) => ({
            externalAgentId: rel.externalAgentId,
            subAgentExternalAgentRelationId: rel.id,
            headers: rel.headers as Record<string, string> | null | undefined,
          }));

        const canDelegateToTeam = teamAgentRelations
          .filter((rel) => rel.subAgentId === agent.id)
          .map((rel) => ({
            agentId: rel.targetAgentId,
            subAgentTeamAgentRelationId: rel.id,
            headers: rel.headers as Record<string, string> | null | undefined,
          }));

        const canDelegateTo: (
          | string
          | {
              externalAgentId: string;
              subAgentExternalAgentRelationId?: string;
              headers?: Record<string, string> | null;
            }
          | {
              agentId: string;
              subAgentTeamAgentRelationId?: string;
              headers?: Record<string, string> | null;
            }
        )[] = [...canDelegateToInternal, ...canDelegateToExternal, ...canDelegateToTeam];

        const subAgentTools = await db
          .select({
            id: tools.id,
            name: tools.name,
            config: tools.config,
            createdAt: tools.createdAt,
            updatedAt: tools.updatedAt,
            capabilities: tools.capabilities,
            lastError: tools.lastError,
            credentialReferenceId: tools.credentialReferenceId,
            tenantId: tools.tenantId,
            projectId: tools.projectId,
            imageUrl: tools.imageUrl,
            selectedTools: subAgentToolRelations.selectedTools,
            headers: subAgentToolRelations.headers,
            agentToolRelationId: subAgentToolRelations.id,
          })
          .from(subAgentToolRelations)
          .innerJoin(
            tools,
            and(
              eq(subAgentToolRelations.toolId, tools.id),
              eq(subAgentToolRelations.tenantId, tools.tenantId),
              eq(subAgentToolRelations.projectId, tools.projectId)
            )
          )
          .where(
            and(
              eq(subAgentToolRelations.tenantId, tenantId),
              eq(subAgentToolRelations.projectId, projectId),
              eq(subAgentToolRelations.agentId, agentId),
              eq(subAgentToolRelations.subAgentId, agent.id)
            )
          );

        const agentFunctionTools = await db
          .select({
            id: functionTools.id,
            name: functionTools.name,
            description: functionTools.description,
            functionId: functionTools.functionId,
            createdAt: functionTools.createdAt,
            updatedAt: functionTools.updatedAt,
            tenantId: functionTools.tenantId,
            projectId: functionTools.projectId,
            agentId: functionTools.agentId,
            agentToolRelationId: subAgentFunctionToolRelations.id,
          })
          .from(subAgentFunctionToolRelations)
          .innerJoin(
            functionTools,
            and(
              eq(subAgentFunctionToolRelations.functionToolId, functionTools.id),
              eq(subAgentFunctionToolRelations.tenantId, functionTools.tenantId),
              eq(subAgentFunctionToolRelations.projectId, functionTools.projectId),
              eq(subAgentFunctionToolRelations.agentId, functionTools.agentId)
            )
          )
          .where(
            and(
              eq(subAgentFunctionToolRelations.tenantId, tenantId),
              eq(subAgentFunctionToolRelations.projectId, projectId),
              eq(subAgentFunctionToolRelations.agentId, agentId),
              eq(subAgentFunctionToolRelations.subAgentId, agent.id)
            )
          );

        const agentDataComponentRelations = await db.query.subAgentDataComponents.findMany({
          where: and(
            eq(subAgentDataComponents.tenantId, tenantId),
            eq(subAgentDataComponents.subAgentId, agent.id)
          ),
        });
        const agentDataComponentIds = agentDataComponentRelations.map((rel) => rel.dataComponentId);

        const agentArtifactComponentRelations = await db.query.subAgentArtifactComponents.findMany({
          where: and(
            eq(subAgentArtifactComponents.tenantId, tenantId),
            eq(subAgentArtifactComponents.subAgentId, agent.id)
          ),
        });
        const agentArtifactComponentIds = agentArtifactComponentRelations.map(
          (rel) => rel.artifactComponentId
        );

        const mcpToolCanUse = subAgentTools.map((tool) => ({
          agentToolRelationId: tool.agentToolRelationId,
          toolId: tool.id,
          toolSelection: tool.selectedTools || null,
          headers: tool.headers || null,
        }));

        const functionToolCanUse = agentFunctionTools.map((tool) => ({
          agentToolRelationId: tool.agentToolRelationId,
          toolId: tool.id,
          toolSelection: null, // Function tools don't have tool selection
          headers: null, // Function tools don't have headers
        }));

        const canUse = [...mcpToolCanUse, ...functionToolCanUse];

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
          canUse,
        };
      })
    );

    const externalAgents = await Promise.all(
      Array.from(externalSubAgentIds).map(async (externalAgentId) => {
        const subAgent = await getExternalAgent(db)({
          scopes: { tenantId, projectId },
          externalAgentId,
        });
        if (!subAgent) return null;

        return {
          ...subAgent,
          type: 'external' as const,
        };
      })
    );

    const teamAgents = await Promise.all(
      Array.from(teamAgentSubAgentIds).map(async (teamAgentId) => {
        const teamAgent = await getAgentById(db)({
          scopes: { tenantId, projectId, agentId: teamAgentId },
        });
        if (!teamAgent) return null;

        return {
          id: teamAgent.id,
          name: teamAgent.name,
          description: teamAgent.description,
          type: 'team' as const,
        };
      })
    );

    const validSubAgents = processedSubAgents.filter(
      (agent): agent is NonNullable<typeof agent> => agent !== null
    );

    const validExternalAgents = externalAgents.filter(
      (agent): agent is NonNullable<typeof agent> => agent !== null
    );

    const validTeamAgents = teamAgents.filter(
      (agent): agent is NonNullable<typeof agent> => agent !== null
    );

    const agentsObject: Record<string, unknown> = {};
    const externalAgentsObject: Record<string, unknown> = {};
    const teamAgentsObject: Record<string, unknown> = {};
    // Add internal agents to agentsObject
    for (const subAgent of validSubAgents) {
      agentsObject[subAgent.id] = subAgent;
    }

    // Add external agents to externalAgentsObject
    for (const externalAgent of validExternalAgents) {
      externalAgentsObject[externalAgent.id] = {
        id: externalAgent.id,
        name: externalAgent.name,
        description: externalAgent.description,
        baseUrl: externalAgent.baseUrl,
        credentialReferenceId: externalAgent.credentialReferenceId,
        type: 'external',
      };
    }
    for (const teamAgent of validTeamAgents) {
      teamAgentsObject[teamAgent.id] = teamAgent;
    }

    let contextConfig = null;
    if (agent.contextConfigId) {
      try {
        contextConfig = await getContextConfigById(db)({
          scopes: { tenantId, projectId, agentId },
          id: agent.contextConfigId,
        });
      } catch (error) {
        console.warn(`Failed to retrieve contextConfig ${agent.contextConfigId}:`, error);
      }
    }

    try {
      const internalAgentIds = agentSubAgents.map((subAgent) => subAgent.id);
      const subAgentIds = Array.from(internalAgentIds);

      await fetchComponentRelationships(db)({ tenantId, projectId }, subAgentIds, {
        relationTable: subAgentDataComponents,
        componentTable: dataComponents,
        relationIdField: subAgentDataComponents.dataComponentId,
        componentIdField: dataComponents.id,
        subAgentIdField: subAgentDataComponents.subAgentId,
        selectFields: {
          id: dataComponents.id,
          name: dataComponents.name,
          description: dataComponents.description,
          props: dataComponents.props,
        },
      });
    } catch (error) {
      console.warn('Failed to retrieve dataComponents:', error);
    }

    try {
      const internalAgentIds = agentSubAgents.map((subAgent) => subAgent.id);
      const subAgentIds = Array.from(internalAgentIds);

      await fetchComponentRelationships(db)({ tenantId, projectId }, subAgentIds, {
        relationTable: subAgentArtifactComponents,
        componentTable: artifactComponents,
        relationIdField: subAgentArtifactComponents.artifactComponentId,
        componentIdField: artifactComponents.id,
        subAgentIdField: subAgentArtifactComponents.subAgentId,
        selectFields: {
          id: artifactComponents.id,
          name: artifactComponents.name,
          description: artifactComponents.description,
          props: artifactComponents.props,
        },
      });
    } catch (error) {
      console.warn('Failed to retrieve artifactComponents:', error);
    }

    const result: any = {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      defaultSubAgentId: agent.defaultSubAgentId,
      subAgents: agentsObject,
      createdAt:
        agent.createdAt && !Number.isNaN(new Date(agent.createdAt).getTime())
          ? new Date(agent.createdAt)
          : new Date(),
      updatedAt:
        agent.updatedAt && !Number.isNaN(new Date(agent.updatedAt).getTime())
          ? new Date(agent.updatedAt)
          : new Date(),
    };

    // Add external agents if any exist
    if (Object.keys(externalAgentsObject).length > 0) {
      result.externalAgents = externalAgentsObject;
    }

    if (Object.keys(teamAgentsObject).length > 0) {
      result.teamAgents = teamAgentsObject;
    }

    if (agent.models) {
      result.models = agent.models;
    }

    if (agent.statusUpdates) {
      result.statusUpdates = agent.statusUpdates;
    }

    if (agent.prompt) {
      result.prompt = agent.prompt;
    }

    if (agent.stopWhen) {
      result.stopWhen = agent.stopWhen;
    }

    if (contextConfig) {
      const { id, headersSchema, contextVariables } = contextConfig;
      result.contextConfig = { id, headersSchema, contextVariables };
    }

    try {
      if (!db.query?.projects?.findFirst) {
        return result as FullAgentDefinition;
      }

      const project = await db.query.projects.findFirst({
        where: and(eq(projects.tenantId, tenantId), eq(projects.id, projectId)),
      });

      if (project?.stopWhen) {
        const projectStopWhen = project.stopWhen;

        if (projectStopWhen.stepCountIs !== undefined) {
          const resultSubAgents = (result as any).subAgents as Record<string, unknown>;
          if (resultSubAgents) {
            for (const [subAgentId, agentData] of Object.entries(resultSubAgents)) {
              if (agentData && typeof agentData === 'object' && !('baseUrl' in agentData)) {
                const agent = agentData as {
                  stopWhen?: { stepCountIs?: number; transferCountIs?: number };
                };

                const needsInheritance =
                  !agent.stopWhen || agent.stopWhen.stepCountIs === undefined;

                if (needsInheritance) {
                  if (!agent.stopWhen) {
                    agent.stopWhen = {};
                  }

                  agent.stopWhen.stepCountIs = projectStopWhen.stepCountIs;

                  try {
                    await db
                      .update(subAgents)
                      .set({
                        stopWhen: agent.stopWhen,
                        updatedAt: new Date().toISOString(),
                      })
                      .where(
                        and(
                          eq(subAgents.tenantId, tenantId),
                          eq(subAgents.projectId, projectId),
                          eq(subAgents.id, subAgentId)
                        )
                      );

                    (result as any).subAgents[subAgentId] = {
                      ...(result as any).subAgents[subAgentId],
                      stopWhen: agent.stopWhen,
                    };
                  } catch (dbError) {
                    console.warn(`Failed to persist stopWhen for agent ${subAgentId}:`, dbError);
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to apply agent stepCountIs inheritance:', error);
    }

    try {
      const toolsList = await listTools(db)({
        scopes: { tenantId, projectId },
        pagination: { page: 1, limit: 1000 },
      });

      const toolsObject: Record<string, any> = {};
      for (const tool of toolsList.data) {
        toolsObject[tool.id] = {
          id: tool.id,
          name: tool.name,
          description: tool.description,
          config: tool.config,
          credentialReferenceId: tool.credentialReferenceId,
          imageUrl: tool.imageUrl,
        };
      }
      result.tools = toolsObject;

      const functionToolsList = await listFunctionTools(db)({
        scopes: { tenantId, projectId, agentId },
        pagination: { page: 1, limit: 1000 },
      });

      const functionToolsObject: Record<string, any> = {};
      for (const functionTool of functionToolsList.data) {
        functionToolsObject[functionTool.id] = {
          id: functionTool.id,
          name: functionTool.name,
          description: functionTool.description,
          functionId: functionTool.functionId,
        };
      }
      result.functionTools = functionToolsObject;

      const functionIds = new Set<string>();
      for (const functionTool of functionToolsList.data) {
        if (functionTool.functionId) {
          functionIds.add(functionTool.functionId);
        }
      }

      if (functionIds.size > 0) {
        const functions = (
          await Promise.all(
            Array.from(functionIds).map(async (functionId) => {
              const func = await getFunction(db)({
                functionId,
                scopes: { tenantId, projectId },
              });
              return func
                ? ([
                    functionId,
                    {
                      id: func.id,
                      inputSchema: func.inputSchema,
                      executeCode: func.executeCode,
                      dependencies: func.dependencies,
                    },
                  ] as const)
                : null;
            })
          )
        ).filter((entry) => entry !== null);

        result.functions = Object.fromEntries(functions);
      }
    } catch (error) {
      console.warn('Failed to load tools/functions lookups:', error);
    }

    return result as FullAgentDefinition;
  };

/**
 * Upsert an agent (create if it doesn't exist, update if it does)
 */
export const upsertAgent =
  (db: DatabaseClient) =>
  async (params: { data: AgentInsert }): Promise<AgentSelect | null> => {
    const agentId = params.data.id || generateId();
    const scopes = { tenantId: params.data.tenantId, projectId: params.data.projectId, agentId };

    const existing = await getAgentById(db)({
      scopes,
    });

    if (existing) {
      return await updateAgent(db)({
        scopes,
        data: {
          name: params.data.name,
          defaultSubAgentId: params.data.defaultSubAgentId,
          description: params.data.description,
          contextConfigId: params.data.contextConfigId,
          models: params.data.models,
          statusUpdates: params.data.statusUpdates,
        },
      });
    }

    return await createAgent(db)({
      ...params.data,
      id: agentId,
    });
  };
