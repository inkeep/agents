import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { getProjectMainBranchName } from '../../data-access/manage/projectLifecycle';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
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
} from '../../db/manage/manage-schema';
import type {
  AgentInsert,
  AgentSelect,
  AgentUpdate,
  FullAgentDefinition,
  FullAgentSelect,
  FullAgentSelectWithRelationIds,
} from '../../types/entities';
import type { AgentScopeConfig, PaginationConfig, ProjectScopeConfig } from '../../types/utility';
import { generateId } from '../../utils/conversations';
import { getLogger } from '../../utils/logger';
import { getContextConfigById } from './contextConfigs';
import { getExternalAgent } from './externalAgents';
import { getFunction } from './functions';
import { listFunctionTools } from './functionTools';
import { getSkillsForSubAgents } from './skills';
import { getSubAgentExternalAgentRelationsByAgent } from './subAgentExternalAgentRelations';
import { getAgentRelations, getAgentRelationsByAgent } from './subAgentRelations';
import { getSubAgentById } from './subAgents';
import { getSubAgentTeamAgentRelationsByAgent } from './subAgentTeamAgentRelations';
import { listScheduledTriggers } from './scheduledTriggers';
import { listTools } from './tools';
import { listTriggers } from './triggers';

export const getAgentById =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
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
  (db: AgentsManageDatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
    const result = await db.query.agents.findFirst({
      where: and(
        eq(agents.tenantId, params.scopes.tenantId),
        eq(agents.projectId, params.scopes.projectId),
        eq(agents.id, params.scopes.agentId)
      ),
      with: {
        defaultSubAgent: true,
      },
    });
    return result ?? null;
  };

export const listAgents =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: ProjectScopeConfig }) => {
    return await db.query.agents.findMany({
      where: and(
        eq(agents.tenantId, params.scopes.tenantId),
        eq(agents.projectId, params.scopes.projectId)
      ),
    });
  };

export const listAgentsPaginated =
  (db: AgentsManageDatabaseClient) =>
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

export type AvailableAgentInfo = {
  agentId: string;
  agentName: string;
  projectId: string;
};

const agentsLogger = getLogger('agents-data-access');

/**
 * List agents across multiple project main branches for a tenant.
 *
 * Uses Dolt AS OF queries against each project's main branch without checkout.
 *
 * @param db - Database client
 * @param params - Tenant and project IDs
 */
export async function listAgentsAcrossProjectMainBranches(
  db: AgentsManageDatabaseClient,
  params: { tenantId: string; projectIds: string[] }
): Promise<AvailableAgentInfo[]> {
  const { tenantId, projectIds } = params;
  const allAgents: AvailableAgentInfo[] = [];

  for (const projectId of projectIds) {
    try {
      const branchName = getProjectMainBranchName(tenantId, projectId);

      const result = await db.execute(
        sql`
          SELECT id as "agentId", name as "agentName", project_id as "projectId"
          FROM agent AS OF ${branchName}
          WHERE tenant_id = ${tenantId} AND project_id = ${projectId}
          ORDER BY name
        `
      );

      allAgents.push(...(result.rows as AvailableAgentInfo[]));
    } catch (error) {
      agentsLogger.warn({ error, projectId }, 'Failed to fetch agents for project, skipping');
    }
  }

  return allAgents;
}

export const createAgent = (db: AgentsManageDatabaseClient) => async (data: AgentInsert) => {
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
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; data: AgentUpdate }) => {
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

export const deleteAgent =
  (db: AgentsManageDatabaseClient) => async (params: { scopes: AgentScopeConfig }) => {
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
  (db: AgentsManageDatabaseClient) =>
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
  (db: AgentsManageDatabaseClient) =>
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

type SkillWithIndex = {
  id: string;
  name: string;
  description: string;
  content: string;
  metadata: Record<string, unknown> | null;
  index: number;
  alwaysLoaded: boolean;
  subAgentSkillId: string;
  subAgentId: string;
  createdAt: string;
  updatedAt: string;
};

const getFullAgentDefinitionInternal =
  (db: AgentsManageDatabaseClient) =>
  async ({
    scopes: { tenantId, projectId, agentId },
    includeRelationIds = false,
  }: {
    scopes: AgentScopeConfig;
    includeRelationIds?: boolean;
  }): Promise<FullAgentSelect | FullAgentSelectWithRelationIds | null> => {
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

    const subAgentIds = agentSubAgents.map((subAgent) => subAgent.id);

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

    const subAgentSkillsList = await getSkillsForSubAgents(db)({
      scopes: { tenantId, projectId, agentId },
      subAgentIds,
    });

    const skillsBySubAgent: Record<string, SkillWithIndex[]> = {};
    for (const skill of subAgentSkillsList) {
      skillsBySubAgent[skill.subAgentId] ??= [];
      skillsBySubAgent[skill.subAgentId].push({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        content: skill.content,
        metadata: skill.metadata,
        index: skill.index,
        alwaysLoaded: skill.alwaysLoaded,
        subAgentSkillId: skill.subAgentSkillId,
        subAgentId: skill.subAgentId,
        createdAt: skill.createdAt,
        updatedAt: skill.updatedAt,
      });
    }

    const processedSubAgents = await Promise.all(
      agentSubAgents.map(async (agent) => {
        if (!agent) return null;

        const subAgentRelationsList = agentRelations.filter(
          (relation) => relation.sourceSubAgentId === agent.id
        );

        const canTransferTo = includeRelationIds
          ? subAgentRelationsList
              .filter(
                (rel) =>
                  (rel.relationType === 'transfer' || rel.relationType === 'transfer_to') &&
                  rel.targetSubAgentId !== null
              )
              .map((rel) => ({
                subAgentId: rel.targetSubAgentId as string,
                subAgentSubAgentRelationId: rel.id,
              }))
          : subAgentRelationsList
              .filter(
                (rel) => rel.relationType === 'transfer' || rel.relationType === 'transfer_to'
              )
              .map((rel) => rel.targetSubAgentId)
              .filter((id): id is string => id !== null);

        const canDelegateToInternal = includeRelationIds
          ? subAgentRelationsList
              .filter(
                (rel) =>
                  (rel.relationType === 'delegate' || rel.relationType === 'delegate_to') &&
                  rel.targetSubAgentId !== null
              )
              .map((rel) => ({
                subAgentId: rel.targetSubAgentId as string,
                subAgentSubAgentRelationId: rel.id,
              }))
          : subAgentRelationsList
              .filter(
                (rel) => rel.relationType === 'delegate' || rel.relationType === 'delegate_to'
              )
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

        const canDelegateTo = [
          ...canDelegateToInternal,
          ...canDelegateToExternal,
          ...canDelegateToTeam,
        ];

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
            toolPolicies: subAgentToolRelations.toolPolicies,
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
            toolPolicies: subAgentFunctionToolRelations.toolPolicies,
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
          toolPolicies: tool.toolPolicies || null,
        }));

        const functionToolCanUse = agentFunctionTools.map((tool) => ({
          agentToolRelationId: tool.agentToolRelationId,
          toolId: tool.id,
          toolSelection: null, // Function tools don't have tool selection
          headers: null, // Function tools don't have headers
          toolPolicies: tool.toolPolicies || null,
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
          skills: skillsBySubAgent[agent.id] || [],
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
        return result as FullAgentSelect;
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
      const usedToolIds = new Set(
        Object.values(agentsObject)
          .flatMap((a) => (Array.isArray((a as any)?.canUse) ? (a as any).canUse : []))
          .map((ref) => ref?.toolId)
          .filter(Boolean)
      );

      const toolsObject: Record<string, any> = {};

      if (usedToolIds.size > 0) {
        const { data } = await listTools(db)({
          scopes: { tenantId, projectId },
          pagination: { page: 1, limit: 1000 },
        });

        for (const tool of data) {
          if (!usedToolIds.has(tool.id)) continue;

          toolsObject[tool.id] = {
            id: tool.id,
            name: tool.name,
            description: tool.description,
            config: tool.config,
            credentialReferenceId: tool.credentialReferenceId,
            imageUrl: tool.imageUrl,
          };
        }
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

    // Fetch triggers (agent-scoped)
    try {
      const triggersList = await listTriggers(db)({
        scopes: { tenantId, projectId, agentId },
      });

      console.log(
        `[getFullAgentDefinitionInternal] Fetched ${triggersList.length} triggers for agent ${agentId}`
      );

      if (triggersList.length > 0) {
        const triggersObject: Record<string, any> = {};
        for (const trigger of triggersList) {
          triggersObject[trigger.id] = {
            id: trigger.id,
            name: trigger.name,
            description: trigger.description,
            enabled: trigger.enabled,
            inputSchema: trigger.inputSchema,
            outputTransform: trigger.outputTransform,
            messageTemplate: trigger.messageTemplate,
            authentication: trigger.authentication,
            signingSecretCredentialReferenceId: trigger.signingSecretCredentialReferenceId,
            signatureVerification: trigger.signatureVerification,
          };
        }
        result.triggers = triggersObject;
        console.log(
          `[getFullAgentDefinitionInternal] Added triggers to result:`,
          Object.keys(triggersObject)
        );
      }
    } catch (error) {
      console.warn('Failed to load triggers:', error);
    }

    // Fetch scheduled triggers (agent-scoped)
    try {
      const scheduledTriggersList = await listScheduledTriggers(db)({
        scopes: { tenantId, projectId, agentId },
      });

      if (scheduledTriggersList.length > 0) {
        const scheduledTriggersObject: Record<string, any> = {};
        for (const scheduledTrigger of scheduledTriggersList) {
          scheduledTriggersObject[scheduledTrigger.id] = {
            id: scheduledTrigger.id,
            name: scheduledTrigger.name,
            description: scheduledTrigger.description,
            enabled: scheduledTrigger.enabled,
            cronExpression: scheduledTrigger.cronExpression,
            cronTimezone: scheduledTrigger.cronTimezone,
            runAt: scheduledTrigger.runAt,
            payload: scheduledTrigger.payload,
            messageTemplate: scheduledTrigger.messageTemplate,
            maxRetries: scheduledTrigger.maxRetries,
            retryDelaySeconds: scheduledTrigger.retryDelaySeconds,
            timeoutSeconds: scheduledTrigger.timeoutSeconds,
          };
        }
        result.scheduledTriggers = scheduledTriggersObject;
      }
    } catch (error) {
      console.warn('Failed to load scheduled triggers:', error);
    }

    return result;
  };

export const getFullAgentDefinition =
  (db: AgentsManageDatabaseClient) =>
  async ({ scopes }: { scopes: AgentScopeConfig }): Promise<FullAgentDefinition | null> => {
    return getFullAgentDefinitionInternal(db)({
      scopes,
      includeRelationIds: false,
    }) as Promise<FullAgentDefinition | null>;
  };

export const getFullAgentDefinitionWithRelationIds =
  (db: AgentsManageDatabaseClient) =>
  async ({
    scopes,
  }: {
    scopes: AgentScopeConfig;
  }): Promise<FullAgentSelectWithRelationIds | null> => {
    return getFullAgentDefinitionInternal(db)({
      scopes,
      includeRelationIds: true,
    }) as Promise<FullAgentSelectWithRelationIds | null>;
  };

/**
 * Upsert an agent (create if it doesn't exist, update if it does)
 */
export const upsertAgent =
  (db: AgentsManageDatabaseClient) =>
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
