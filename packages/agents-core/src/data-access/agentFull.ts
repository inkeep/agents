import { and, eq, inArray, not } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { projects, subAgents, subAgentToolRelations } from '../db/schema';
import type { FullAgentDefinition } from '../types/entities';
import type { AgentScopeConfig, ProjectScopeConfig } from '../types/utility';
import { generateId } from '../utils/conversations';
import { validateAgentStructure, validateAndTypeAgentData } from '../validation/agentFull';
import {
  deleteAgent,
  getAgentById,
  getFullAgentDefinition,
  updateAgent,
  upsertAgent,
} from './agents';
import {
  associateArtifactComponentWithAgent,
  deleteAgentArtifactComponentRelationByAgent,
  upsertAgentArtifactComponentRelation,
} from './artifactComponents';
import { upsertContextConfig } from './contextConfigs';
import {
  associateDataComponentWithAgent,
  deleteAgentDataComponentRelationByAgent,
  upsertAgentDataComponentRelation,
} from './dataComponents';
import { upsertFunction } from './functions';
import { upsertFunctionTool, upsertSubAgentFunctionToolRelation } from './functionTools';
import {
  deleteSubAgentExternalAgentRelation,
  getSubAgentExternalAgentRelationsByAgent,
  upsertSubAgentExternalAgentRelation,
} from './subAgentExternalAgentRelations';
import {
  createSubAgentRelation,
  deleteAgentRelationsByAgent,
  deleteAgentToolRelationByAgent,
  upsertSubAgentRelation,
} from './subAgentRelations';
import { deleteSubAgent, listSubAgents, upsertSubAgent } from './subAgents';
import {
  deleteSubAgentTeamAgentRelation,
  getSubAgentTeamAgentRelationsByAgent,
  upsertSubAgentTeamAgentRelation,
} from './subAgentTeamAgentRelations';
import { upsertSubAgentToolRelation } from './tools';

export interface AgentLogger {
  info(obj: Record<string, any>, msg?: string): void;
  error(obj: Record<string, any>, msg?: string): void;
}

const defaultLogger: AgentLogger = {
  info: () => {},
  error: () => {},
};

/**
 * Apply execution limits inheritance from project to Agents and Sub Agents
 */
async function applyExecutionLimitsInheritance(
  db: DatabaseClient,
  logger: AgentLogger,
  scopes: ProjectScopeConfig,
  agentData: FullAgentDefinition
): Promise<void> {
  const { tenantId, projectId } = scopes;

  try {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.tenantId, tenantId), eq(projects.id, projectId)),
    });

    if (!project?.stopWhen) {
      return;
    }

    const projectStopWhen = project.stopWhen as any;

    if (!agentData.stopWhen) {
      agentData.stopWhen = {};
    }

    if (
      agentData.stopWhen.transferCountIs === undefined &&
      projectStopWhen?.transferCountIs !== undefined
    ) {
      agentData.stopWhen.transferCountIs = projectStopWhen.transferCountIs;
    }

    if (agentData.stopWhen.transferCountIs === undefined) {
      agentData.stopWhen.transferCountIs = 10;
    }

    if (projectStopWhen?.stepCountIs !== undefined) {
      for (const [_subAgentId, subAgentData] of Object.entries(agentData.subAgents)) {
        if (subAgentData.canTransferTo && Array.isArray(subAgentData.canTransferTo)) {
          const agent = agentData as any;

          if (!agent.stopWhen) {
            agent.stopWhen = {};
          }

          if (agent.stopWhen.stepCountIs === undefined) {
            agent.stopWhen.stepCountIs = projectStopWhen.stepCountIs;
          }
        }
      }
    }
  } catch (error) {
    logger.error(
      {
        projectId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to apply execution limits inheritance'
    );
  }
}

/**
 * Server-side implementation of createFullAgent that performs actual database operations.
 * This function creates a complete agent with all agents, tools, and relationships.
 */
export const createFullAgentServerSide =
  (db: DatabaseClient, logger: AgentLogger = defaultLogger) =>
  async (
    scopes: ProjectScopeConfig,
    agentData: FullAgentDefinition
  ): Promise<FullAgentDefinition> => {
    const { tenantId, projectId } = scopes;

    const typed = validateAndTypeAgentData(agentData);

    validateAgentStructure(typed);

    await applyExecutionLimitsInheritance(db, logger, { tenantId, projectId }, typed);

    try {
      let finalAgentId: string;
      try {
        const agentId = typed.id || generateId();
        const agent = await upsertAgent(db)({
          data: {
            id: agentId,
            tenantId,
            projectId,
            name: typed.name,
            defaultSubAgentId: typed.defaultSubAgentId,
            description: typed.description,
            contextConfigId: undefined,
            models: typed.models,
            statusUpdates: typed.statusUpdates,
            prompt: typed.prompt,
            stopWhen: typed.stopWhen,
          },
        });
        if (!agent?.id) {
          throw new Error('Failed to create agent: no ID returned');
        }
        finalAgentId = agent.id;
      } catch (error) {
        logger.error({ agentId: typed.id, error }, 'Failed to create/update agent metadata');
        throw error;
      }

      let contextConfigId: string | undefined;
      if (typed.contextConfig) {
        try {
          const contextConfig = await upsertContextConfig(db)({
            data: {
              ...typed.contextConfig,
              agentId: finalAgentId,
              tenantId,
              projectId,
            },
          });
          contextConfigId = contextConfig.id;
        } catch (error) {
          logger.error(
            { contextConfigId: typed.contextConfig.id, error },
            'Failed to create/update context config'
          );
          throw error;
        }
      }

      if (contextConfigId) {
        try {
          await upsertAgent(db)({
            data: {
              id: finalAgentId,
              tenantId,
              projectId,
              name: typed.name,
              defaultSubAgentId: typed.defaultSubAgentId,
              description: typed.description,
              contextConfigId,
              models: typed.models,
              statusUpdates: typed.statusUpdates,
              prompt: typed.prompt,
              stopWhen: typed.stopWhen,
            },
          });
        } catch (error) {
          logger.error(
            { agentId: finalAgentId, contextConfigId, error },
            'Failed to update agent with contextConfigId'
          );
          throw error;
        }
      }

      if (typed.functions && Object.keys(typed.functions).length > 0) {
        const functionPromises = Object.entries(typed.functions).map(
          async ([functionId, functionData]) => {
            try {
              await upsertFunction(db)({
                data: {
                  ...functionData,
                  id: functionId,
                },
                scopes: { tenantId, projectId },
              });
            } catch (error) {
              logger.error(
                { agentId: finalAgentId, functionId, error },
                'Failed to create function for agent'
              );
              throw error;
            }
          }
        );

        await Promise.all(functionPromises);
      }

      if (typed.functionTools && Object.keys(typed.functionTools).length > 0) {
        const functionToolPromises = Object.entries(typed.functionTools).map(
          async ([functionToolId, functionToolData]) => {
            try {
              await upsertFunctionTool(db)({
                data: {
                  ...functionToolData,
                  id: functionToolId,
                },
                scopes: { tenantId, projectId, agentId: finalAgentId },
              });
            } catch (error) {
              logger.error(
                { agentId: finalAgentId, functionToolId, error },
                'Failed to create function tool in agent'
              );
              throw error;
            }
          }
        );

        await Promise.all(functionToolPromises);
      }

      const subAgentPromises = Object.entries(typed.subAgents).map(
        async ([subAgentId, agentData]) => {
          const subAgent = agentData;
          try {
            await upsertSubAgent(db)({
              data: {
                id: subAgentId,
                tenantId,
                projectId,
                agentId: finalAgentId,
                name: subAgent.name || '',
                description: subAgent.description || '',
                prompt: subAgent.prompt || '',
                conversationHistoryConfig: subAgent.conversationHistoryConfig,
                models: subAgent.models,
                stopWhen: subAgent.stopWhen,
              },
            });
          } catch (error) {
            logger.error({ subAgentId, error }, 'Failed to create/update sub-agent');
            throw error;
          }
        }
      );

      await Promise.all(subAgentPromises);

      const agentToolPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typed.subAgents)) {
        if (agentData.canUse && Array.isArray(agentData.canUse)) {
          for (const canUseItem of agentData.canUse) {
            agentToolPromises.push(
              (async () => {
                try {
                  const { toolId, toolSelection, headers, toolPolicies, agentToolRelationId } =
                    canUseItem;
                  const isFunctionTool = typed.functionTools && toolId in typed.functionTools;

                  if (isFunctionTool) {
                    await upsertSubAgentFunctionToolRelation(db)({
                      scopes: { tenantId, projectId, agentId: finalAgentId },
                      subAgentId,
                      functionToolId: toolId,
                      relationId: agentToolRelationId,
                    });
                  } else {
                    await upsertSubAgentToolRelation(db)({
                      scopes: { tenantId, projectId, agentId: finalAgentId },
                      subAgentId,
                      toolId,
                      selectedTools: toolSelection,
                      headers: headers,
                      toolPolicies: toolPolicies,
                      relationId: agentToolRelationId,
                    });
                  }
                } catch (error) {
                  logger.error(
                    { subAgentId, toolId: canUseItem.toolId, error },
                    'Failed to create agent-tool relation'
                  );
                }
              })()
            );
          }
        }
      }

      await Promise.all(agentToolPromises);

      const agentDataComponentPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typed.subAgents)) {
        if (agentData.dataComponents) {
          for (const dataComponentId of agentData.dataComponents) {
            agentDataComponentPromises.push(
              (async () => {
                try {
                  await upsertAgentDataComponentRelation(db)({
                    scopes: { tenantId, projectId, agentId: finalAgentId, subAgentId: subAgentId },
                    dataComponentId,
                  });
                } catch (error) {
                  logger.error(
                    { subAgentId, dataComponentId, error },
                    'Failed to create agent-data component relation'
                  );
                }
              })()
            );
          }
        }
      }

      await Promise.all(agentDataComponentPromises);

      const agentArtifactComponentPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typed.subAgents)) {
        if (agentData.artifactComponents) {
          for (const artifactComponentId of agentData.artifactComponents) {
            agentArtifactComponentPromises.push(
              (async () => {
                try {
                  await upsertAgentArtifactComponentRelation(db)({
                    scopes: { tenantId, projectId, agentId: finalAgentId, subAgentId: subAgentId },
                    artifactComponentId,
                  });
                } catch (error) {
                  logger.error(
                    { subAgentId, artifactComponentId, error },
                    'Failed to create agent-artifact component relation'
                  );
                }
              })()
            );
          }
        }
      }

      await Promise.all(agentArtifactComponentPromises);

      const subAgentRelationPromises: Promise<void>[] = [];
      const subAgentExternalAgentRelationPromises: Promise<void>[] = [];
      const subAgentTeamAgentRelationPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typed.subAgents)) {
        if (agentData.canTransferTo) {
          for (const targetSubAgentId of agentData.canTransferTo) {
            subAgentRelationPromises.push(
              (async () => {
                try {
                  await upsertSubAgentRelation(db)({
                    id: generateId(),
                    tenantId,
                    projectId,
                    agentId: finalAgentId,
                    sourceSubAgentId: subAgentId,
                    targetSubAgentId: targetSubAgentId,
                    relationType: 'transfer',
                  });
                } catch (error) {
                  logger.error(
                    { subAgentId, targetSubAgentId, type: 'transfer', error },
                    'Failed to create transfer relation'
                  );
                }
              })()
            );
          }
          if (agentData.canDelegateTo) {
            for (const targetItem of agentData.canDelegateTo) {
              if (typeof targetItem === 'string') {
                subAgentRelationPromises.push(
                  (async () => {
                    try {
                      await upsertSubAgentRelation(db)({
                        id: generateId(),
                        tenantId,
                        projectId,
                        agentId: finalAgentId,
                        sourceSubAgentId: subAgentId,
                        targetSubAgentId: targetItem,
                        relationType: 'delegate',
                      });
                    } catch (error) {
                      logger.error(
                        { subAgentId, targetSubAgentId: targetItem, type: 'delegate', error },
                        'Failed to create sub-agent delegation relation'
                      );
                    }
                  })()
                );
              } else if (typeof targetItem === 'object' && 'externalAgentId' in targetItem) {
                subAgentExternalAgentRelationPromises.push(
                  (async () => {
                    try {
                      await upsertSubAgentExternalAgentRelation(db)({
                        scopes: {
                          tenantId,
                          projectId,
                          agentId: finalAgentId,
                          subAgentId,
                        },
                        relationId: targetItem.subAgentExternalAgentRelationId,
                        data: {
                          externalAgentId: targetItem.externalAgentId,
                          headers: targetItem.headers || null,
                        },
                      });
                    } catch (error) {
                      logger.error(
                        {
                          subAgentId,
                          externalAgentId: targetItem.externalAgentId,
                          error,
                        },
                        'Failed to create external delegation relation'
                      );
                    }
                  })()
                );
              } else if (typeof targetItem === 'object' && 'agentId' in targetItem) {
                subAgentTeamAgentRelationPromises.push(
                  (async () => {
                    try {
                      await upsertSubAgentTeamAgentRelation(db)({
                        scopes: {
                          tenantId,
                          projectId,
                          agentId: finalAgentId,
                          subAgentId,
                        },
                        relationId: targetItem.subAgentTeamAgentRelationId,
                        data: {
                          targetAgentId: targetItem.agentId,
                          headers: targetItem.headers || null,
                        },
                      });
                    } catch (error) {
                      logger.error(
                        { subAgentId, agentId: targetItem.agentId, error },
                        'Failed to create team agent delegation relation'
                      );
                    }
                  })()
                );
              }
            }
          }
        }
      }

      await Promise.all(subAgentRelationPromises);
      await Promise.all(subAgentExternalAgentRelationPromises);
      await Promise.all(subAgentTeamAgentRelationPromises);

      const createdAgent = await getFullAgentDefinition(db)({
        scopes: { tenantId, projectId, agentId: finalAgentId },
      });

      if (!createdAgent) {
        throw new Error('Failed to retrieve created agent');
      }

      logger.info(
        {
          agentId: finalAgentId,
          subAgents: Object.keys(typed.subAgents).length,
          functions: Object.keys(typed.functions || {}).length,
          functionTools: Object.keys(typed.functionTools || {}).length,
        },
        'Agent created'
      );

      return createdAgent as FullAgentDefinition;
    } catch (error) {
      const errorAgentId = typed.id || 'unknown';
      logger.error({ tenantId, agentId: errorAgentId, error }, 'Failed to create full agent');
      throw error;
    }
  };

/**
 * Server-side implementation of updateFullAgent that performs actual database operations.
 * This function updates a complete agent with all agents, tools, and relationships.
 */
export const updateFullAgentServerSide =
  (db: DatabaseClient, logger: AgentLogger = defaultLogger) =>
  async (
    scopes: ProjectScopeConfig,
    agentData: FullAgentDefinition
  ): Promise<FullAgentDefinition> => {
    const { tenantId, projectId } = scopes;

    const typedAgentDefinition = validateAndTypeAgentData(agentData);

    if (!typedAgentDefinition.id) {
      throw new Error('Agent ID is required');
    }

    validateAgentStructure(typedAgentDefinition);

    await applyExecutionLimitsInheritance(
      db,
      logger,
      { tenantId, projectId },
      typedAgentDefinition
    );

    try {
      const existingAgent = await getAgentById(db)({
        scopes: { tenantId, projectId, agentId: typedAgentDefinition.id },
      });

      if (!existingAgent) {
        return createFullAgentServerSide(db, logger)(scopes, agentData);
      }

      const existingAgentModels = existingAgent.models;

      let finalAgentId: string;
      try {
        const agentId = typedAgentDefinition.id || generateId();
        const agent = await upsertAgent(db)({
          data: {
            id: agentId,
            tenantId,
            projectId,
            name: typedAgentDefinition.name,
            defaultSubAgentId: typedAgentDefinition.defaultSubAgentId,
            description: typedAgentDefinition.description,
            contextConfigId: undefined,
            models: typedAgentDefinition.models,
            statusUpdates: typedAgentDefinition.statusUpdates,
            prompt: typedAgentDefinition.prompt,
            stopWhen: typedAgentDefinition.stopWhen,
          },
        });
        if (!agent?.id) {
          throw new Error('Failed to upsert agent: no ID returned');
        }
        finalAgentId = agent.id;
      } catch (error) {
        logger.error(
          { agentId: typedAgentDefinition.id, error },
          'Failed to get/update agent metadata'
        );
        throw error;
      }

      let contextConfigId: string | undefined;
      if (typedAgentDefinition.contextConfig) {
        try {
          const contextConfig = await upsertContextConfig(db)({
            data: {
              ...typedAgentDefinition.contextConfig,
              agentId: finalAgentId,
              tenantId,
              projectId,
            },
          });
          contextConfigId = contextConfig.id;
        } catch (error) {
          logger.error(
            { contextConfigId: typedAgentDefinition.contextConfig.id, error },
            'Failed to create/update context config'
          );
          throw error;
        }
      }

      if (contextConfigId) {
        try {
          await upsertAgent(db)({
            data: {
              id: finalAgentId,
              tenantId,
              projectId,
              name: typedAgentDefinition.name,
              defaultSubAgentId: typedAgentDefinition.defaultSubAgentId,
              description: typedAgentDefinition.description,
              contextConfigId,
              models: typedAgentDefinition.models,
              statusUpdates: typedAgentDefinition.statusUpdates,
              prompt: typedAgentDefinition.prompt,
              stopWhen: typedAgentDefinition.stopWhen,
            },
          });
        } catch (error) {
          logger.error(
            { agentId: finalAgentId, contextConfigId, error },
            'Failed to update agent with contextConfigId'
          );
          throw error;
        }
      }

      if (
        typedAgentDefinition.functions &&
        Object.keys(typedAgentDefinition.functions).length > 0
      ) {
        const functionPromises = Object.entries(typedAgentDefinition.functions).map(
          async ([functionId, functionData]) => {
            try {
              await upsertFunction(db)({
                data: {
                  ...functionData,
                  id: functionId,
                },
                scopes: { tenantId, projectId },
              });
            } catch (error) {
              logger.error(
                { agentId: finalAgentId, functionId, error },
                'Failed to update function for agent'
              );
              throw error;
            }
          }
        );

        await Promise.all(functionPromises);
      }

      if (
        typedAgentDefinition.functionTools &&
        Object.keys(typedAgentDefinition.functionTools).length > 0
      ) {
        const functionToolPromises = Object.entries(typedAgentDefinition.functionTools).map(
          async ([functionToolId, functionToolData]) => {
            try {
              await upsertFunctionTool(db)({
                data: {
                  ...functionToolData,
                  id: functionToolId,
                },
                scopes: { tenantId, projectId, agentId: finalAgentId },
              });
            } catch (error) {
              logger.error(
                { agentId: finalAgentId, functionToolId, error },
                'Failed to update function tool in agent'
              );
              throw error;
            }
          }
        );

        await Promise.all(functionToolPromises);
      }

      const subAgentPromises = Object.entries(typedAgentDefinition.subAgents).map(
        async ([subAgentId, agentData]) => {
          const subAgent = agentData;

          let existingSubAgent = null;
          try {
            existingSubAgent = await db.query.subAgents.findFirst({
              where: and(
                eq(subAgents.id, subAgentId),
                eq(subAgents.tenantId, tenantId),
                eq(subAgents.projectId, projectId)
              ),
              columns: {
                models: true,
              },
            });
          } catch (_error) {}

          let finalModelSettings = subAgent.models === undefined ? undefined : subAgent.models;

          if (existingSubAgent?.models && typedAgentDefinition.models) {
            const subAgentModels = existingSubAgent.models as any;
            const agentModels = typedAgentDefinition.models;

            const modelTypes = ['base', 'structuredOutput', 'summarizer'] as const;
            const cascadedModels: any = { ...finalModelSettings };

            for (const modelType of modelTypes) {
              if (
                subAgentModels[modelType]?.model &&
                existingAgentModels?.[modelType]?.model &&
                subAgentModels[modelType].model === existingAgentModels[modelType].model &&
                agentModels[modelType] &&
                (agentModels[modelType].model !== existingAgentModels[modelType]?.model ||
                  JSON.stringify(agentModels[modelType].providerOptions) !==
                    JSON.stringify(existingAgentModels[modelType]?.providerOptions))
              ) {
                cascadedModels[modelType] = agentModels[modelType];
              }
            }

            finalModelSettings = cascadedModels;
          }

          try {
            await upsertSubAgent(db)({
              data: {
                id: subAgentId,
                tenantId,
                projectId,
                agentId: finalAgentId,
                name: subAgent.name || '',
                description: subAgent.description || '',
                prompt: subAgent.prompt || '',
                conversationHistoryConfig: subAgent.conversationHistoryConfig,
                models: finalModelSettings,
                stopWhen: subAgent.stopWhen,
              },
            });
          } catch (error) {
            logger.error({ subAgentId, error }, 'Failed to create/update sub-agent');
            throw error;
          }
        }
      );

      await Promise.all(subAgentPromises);

      const incomingSubAgentIds = new Set(Object.keys(typedAgentDefinition.subAgents));

      const existingSubAgents = await listSubAgents(db)({
        scopes: { tenantId, projectId, agentId: finalAgentId },
      });

      for (const subAgent of existingSubAgents) {
        if (!incomingSubAgentIds.has(subAgent.id)) {
          try {
            await deleteSubAgent(db)({
              scopes: { tenantId, projectId, agentId: finalAgentId },
              subAgentId: subAgent.id,
            });
          } catch (error) {
            logger.error({ subAgentId: subAgent.id, error }, 'Failed to delete orphaned sub-agent');
          }
        }
      }

      // Delete orphaned subAgentExternalAgentRelations
      const incomingExternalAgentRelationIds = new Map<string, string>();
      const incomingTeamAgentRelationIds = new Map<string, string>();
      for (const [subAgentId, agentData] of Object.entries(typedAgentDefinition.subAgents)) {
        if (agentData.canDelegateTo && Array.isArray(agentData.canDelegateTo)) {
          for (const delegateItem of agentData.canDelegateTo) {
            if (typeof delegateItem === 'object') {
              if ('externalAgentId' in delegateItem) {
                incomingExternalAgentRelationIds.set(
                  subAgentId,
                  delegateItem.subAgentExternalAgentRelationId ?? ''
                );
              } else if ('agentId' in delegateItem) {
                incomingTeamAgentRelationIds.set(
                  subAgentId,
                  delegateItem.subAgentTeamAgentRelationId ?? ''
                );
              }
            }
          }
        }
      }

      const existingExternalAgentRelations = await getSubAgentExternalAgentRelationsByAgent(db)({
        scopes: { tenantId, projectId, agentId: finalAgentId },
      });

      for (const relation of existingExternalAgentRelations) {
        if (!incomingExternalAgentRelationIds.get(relation.subAgentId)?.includes(relation.id)) {
          try {
            await deleteSubAgentExternalAgentRelation(db)({
              scopes: {
                tenantId,
                projectId,
                agentId: finalAgentId,
                subAgentId: relation.subAgentId,
              },
              relationId: relation.id,
            });
          } catch (error) {
            logger.error(
              { relationId: relation.id, error },
              'Failed to delete orphaned external agent relation'
            );
          }
        }
      }

      const existingTeamAgentRelations = await getSubAgentTeamAgentRelationsByAgent(db)({
        scopes: { tenantId, projectId, agentId: finalAgentId },
      });
      for (const relation of existingTeamAgentRelations) {
        if (!incomingTeamAgentRelationIds.get(relation.subAgentId)?.includes(relation.id)) {
          try {
            await deleteSubAgentTeamAgentRelation(db)({
              scopes: {
                tenantId,
                projectId,
                agentId: finalAgentId,
                subAgentId: relation.subAgentId,
              },
              relationId: relation.id,
            });
          } catch (error) {
            logger.error(
              { relationId: relation.id, error },
              'Failed to delete orphaned team agent relation'
            );
          }
        }
      }

      await updateAgent(db)({
        scopes: { tenantId, projectId, agentId: typedAgentDefinition.id },
        data: {
          name: typedAgentDefinition.name,
          defaultSubAgentId: typedAgentDefinition.defaultSubAgentId,
          description: typedAgentDefinition.description,
          contextConfigId: contextConfigId,
          models: typedAgentDefinition.models,
          statusUpdates: typedAgentDefinition.statusUpdates,
          prompt: typedAgentDefinition.prompt,
          stopWhen: typedAgentDefinition.stopWhen,
        },
      });

      const incomingRelationshipIds = new Set<string>();
      for (const [_subAgentId, agentData] of Object.entries(typedAgentDefinition.subAgents)) {
        if (agentData.canUse && Array.isArray(agentData.canUse)) {
          for (const canUseItem of agentData.canUse) {
            if (canUseItem.agentToolRelationId) {
              incomingRelationshipIds.add(canUseItem.agentToolRelationId);
            }
          }
        }
      }

      for (const subAgentId of Object.keys(typedAgentDefinition.subAgents)) {
        try {
          if (incomingRelationshipIds.size === 0) {
            await db
              .delete(subAgentToolRelations)
              .where(
                and(
                  eq(subAgentToolRelations.tenantId, tenantId),
                  eq(subAgentToolRelations.projectId, projectId),
                  eq(subAgentToolRelations.agentId, finalAgentId),
                  eq(subAgentToolRelations.subAgentId, subAgentId)
                )
              )
              .returning();
          } else {
            await db
              .delete(subAgentToolRelations)
              .where(
                and(
                  eq(subAgentToolRelations.tenantId, tenantId),
                  eq(subAgentToolRelations.projectId, projectId),
                  eq(subAgentToolRelations.agentId, finalAgentId),
                  eq(subAgentToolRelations.subAgentId, subAgentId),
                  not(inArray(subAgentToolRelations.id, Array.from(incomingRelationshipIds)))
                )
              )
              .returning();
          }
        } catch (error) {
          logger.error({ subAgentId, error }, 'Failed to delete orphaned agent-tool relations');
        }
      }

      const subAgentToolPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typedAgentDefinition.subAgents)) {
        if (agentData.canUse && Array.isArray(agentData.canUse)) {
          for (const canUseItem of agentData.canUse) {
            subAgentToolPromises.push(
              (async () => {
                try {
                  const { toolId, toolSelection, headers, toolPolicies, agentToolRelationId } =
                    canUseItem;

                  const isFunctionTool =
                    typedAgentDefinition.functionTools &&
                    toolId in typedAgentDefinition.functionTools;

                  if (isFunctionTool) {
                    await upsertSubAgentFunctionToolRelation(db)({
                      scopes: { tenantId, projectId, agentId: finalAgentId },
                      subAgentId,
                      functionToolId: toolId,
                      relationId: agentToolRelationId,
                    });
                  } else {
                    await upsertSubAgentToolRelation(db)({
                      scopes: { tenantId, projectId, agentId: finalAgentId },
                      subAgentId,
                      toolId,
                      selectedTools: toolSelection,
                      headers: headers,
                      toolPolicies: toolPolicies,
                      relationId: agentToolRelationId,
                    });
                  }
                } catch (error) {
                  logger.error(
                    {
                      subAgentId,
                      toolId: canUseItem.toolId,
                      relationId: canUseItem.agentToolRelationId,
                      error,
                    },
                    'Failed to upsert agent-tool relation'
                  );
                }
              })()
            );
          }
        }
      }

      await Promise.all(subAgentToolPromises);

      for (const subAgentId of Object.keys(typedAgentDefinition.subAgents)) {
        await deleteAgentDataComponentRelationByAgent(db)({
          scopes: { tenantId, projectId, agentId: finalAgentId, subAgentId: subAgentId },
        });
      }

      const agentDataComponentPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typedAgentDefinition.subAgents)) {
        if (agentData.dataComponents) {
          for (const dataComponentId of agentData.dataComponents) {
            agentDataComponentPromises.push(
              (async () => {
                try {
                  await associateDataComponentWithAgent(db)({
                    scopes: { tenantId, projectId, agentId: finalAgentId, subAgentId: subAgentId },
                    dataComponentId,
                  });
                } catch (error) {
                  logger.error(
                    { subAgentId, dataComponentId, error },
                    'Failed to create sub-agent-dataComponent relation'
                  );
                }
              })()
            );
          }
        }
      }

      await Promise.all(agentDataComponentPromises);

      for (const subAgentId of Object.keys(typedAgentDefinition.subAgents)) {
        await deleteAgentArtifactComponentRelationByAgent(db)({
          scopes: { tenantId, projectId, agentId: finalAgentId, subAgentId: subAgentId },
        });
      }

      const agentArtifactComponentPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typedAgentDefinition.subAgents)) {
        if (agentData.artifactComponents) {
          for (const artifactComponentId of agentData.artifactComponents) {
            agentArtifactComponentPromises.push(
              (async () => {
                try {
                  await associateArtifactComponentWithAgent(db)({
                    scopes: { tenantId, projectId, agentId: finalAgentId, subAgentId: subAgentId },
                    artifactComponentId,
                  });
                } catch (error) {
                  logger.error(
                    { subAgentId, artifactComponentId, error },
                    'Failed to create sub-agent-artifactComponent relation'
                  );
                }
              })()
            );
          }
        }
      }

      await Promise.all(agentArtifactComponentPromises);

      await deleteAgentRelationsByAgent(db)({
        scopes: { tenantId, projectId, agentId: typedAgentDefinition.id },
      });

      const subAgentRelationPromises: Promise<void>[] = [];
      const subAgentExternalAgentRelationPromises: Promise<void>[] = [];
      const subAgentTeamAgentRelationPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typedAgentDefinition.subAgents)) {
        if (agentData.canTransferTo) {
          for (const targetSubAgentId of agentData.canTransferTo) {
            subAgentRelationPromises.push(
              (async () => {
                try {
                  await createSubAgentRelation(db)({
                    tenantId,
                    projectId,
                    id: generateId(),
                    agentId: typedAgentDefinition.id || '',
                    sourceSubAgentId: subAgentId,
                    targetSubAgentId: targetSubAgentId,
                    relationType: 'transfer',
                  });
                } catch (error) {
                  logger.error(
                    { subAgentId, targetSubAgentId, error },
                    'Failed to create transfer relation'
                  );
                }
              })()
            );
          }
        }

        if (agentData.canDelegateTo) {
          for (const targetItem of agentData.canDelegateTo) {
            if (typeof targetItem === 'string') {
              subAgentRelationPromises.push(
                (async () => {
                  try {
                    await createSubAgentRelation(db)({
                      tenantId,
                      projectId,
                      id: generateId(),
                      agentId: typedAgentDefinition.id || '',
                      sourceSubAgentId: subAgentId,
                      targetSubAgentId: targetItem,
                      relationType: 'delegate',
                    });
                  } catch (error) {
                    logger.error(
                      { subAgentId, targetSubAgentId: targetItem, error },
                      'Failed to create sub-agent delegation relation'
                    );
                  }
                })()
              );
            } else if ('externalAgentId' in targetItem) {
              subAgentExternalAgentRelationPromises.push(
                (async () => {
                  try {
                    await upsertSubAgentExternalAgentRelation(db)({
                      scopes: {
                        tenantId,
                        projectId,
                        agentId: typedAgentDefinition.id || '',
                        subAgentId,
                      },
                      relationId: targetItem.subAgentExternalAgentRelationId,
                      data: {
                        externalAgentId: targetItem.externalAgentId,
                        headers: targetItem.headers || null,
                      },
                    });
                  } catch (error) {
                    logger.error(
                      { subAgentId, externalAgentId: targetItem.externalAgentId, error },
                      'Failed to create external delegation relation'
                    );
                  }
                })()
              );
            } else if ('agentId' in targetItem) {
              subAgentTeamAgentRelationPromises.push(
                (async () => {
                  try {
                    await upsertSubAgentTeamAgentRelation(db)({
                      scopes: { tenantId, projectId, agentId: finalAgentId, subAgentId },
                      relationId: targetItem.subAgentTeamAgentRelationId,
                      data: {
                        targetAgentId: targetItem.agentId,
                        headers: targetItem.headers || null,
                      },
                    });
                  } catch (error) {
                    logger.error(
                      { subAgentId, agentId: targetItem.agentId, error },
                      'Failed to create team agent delegation relation'
                    );
                  }
                })()
              );
            }
          }
        }
      }

      await Promise.all(subAgentRelationPromises);
      await Promise.all(subAgentExternalAgentRelationPromises);
      await Promise.all(subAgentTeamAgentRelationPromises);

      const updatedAgent = await getFullAgentDefinition(db)({
        scopes: { tenantId, projectId, agentId: typedAgentDefinition.id },
      });

      if (!updatedAgent) {
        throw new Error('Failed to retrieve updated agent');
      }

      logger.info(
        {
          agentId: typedAgentDefinition.id,
          subAgents: Object.keys(typedAgentDefinition.subAgents).length,
          functions: Object.keys(typedAgentDefinition.functions || {}).length,
          functionTools: Object.keys(typedAgentDefinition.functionTools || {}).length,
        },
        'Agent updated'
      );

      return updatedAgent;
    } catch (error) {
      logger.error({ agentId: typedAgentDefinition.id, error }, 'Failed to update full agent');
      throw error;
    }
  };

/**
 * Get a complete agent definition by ID
 */
export const getFullAgent =
  (db: DatabaseClient, logger: AgentLogger = defaultLogger) =>
  async (params: { scopes: AgentScopeConfig }): Promise<FullAgentDefinition | null> => {
    const { scopes } = params;
    const { tenantId, projectId } = scopes;

    try {
      const agent = await getFullAgentDefinition(db)({
        scopes: { tenantId, projectId, agentId: scopes.agentId },
      });

      if (!agent) {
        return null;
      }

      return agent;
    } catch (error) {
      logger.error(
        {
          tenantId,
          agentId: scopes.agentId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to retrieve full agent'
      );
      throw error;
    }
  };

/**
 * Delete a complete agent and cascade to all related entities
 */
export const deleteFullAgent =
  (db: DatabaseClient, logger: AgentLogger = defaultLogger) =>
  async (params: { scopes: AgentScopeConfig }): Promise<boolean> => {
    const { tenantId, projectId, agentId } = params.scopes;

    try {
      const agent = await getFullAgentDefinition(db)({
        scopes: { tenantId, projectId, agentId },
      });

      if (!agent) {
        return false;
      }

      await deleteAgentRelationsByAgent(db)({
        scopes: { tenantId, projectId, agentId },
      });

      const subAgentIds = Object.keys(agent.subAgents);
      if (subAgentIds.length > 0) {
        for (const subAgentId of subAgentIds) {
          await deleteAgentToolRelationByAgent(db)({
            scopes: { tenantId, projectId, agentId, subAgentId: subAgentId },
          });
        }
      }

      await deleteAgent(db)({
        scopes: { tenantId, projectId, agentId },
      });

      logger.info({ agentId }, 'Agent deleted');

      return true;
    } catch (error) {
      logger.error(
        {
          tenantId,
          agentId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to delete full agent'
      );
      throw error;
    }
  };
