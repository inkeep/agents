import { and, eq, inArray, not } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import { projects, subAgents, subAgentToolRelations } from '../db/schema';
import type {
  ExternalSubAgentApiInsert,
  FullAgentDefinition,
  InternalSubAgentDefinition,
  SubAgentDefinition,
} from '../types/entities';
import type { AgentScopeConfig, ProjectScopeConfig } from '../types/utility';
import {
  isExternalAgent,
  isInternalAgent,
  validateAgentStructure,
  validateAndTypeAgentData,
} from '../validation/agentFull';
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
import { deleteExternalAgent, listExternalAgents, upsertExternalAgent } from './externalAgents';
import { upsertFunction } from './functions';
import { upsertFunctionTool, upsertSubAgentFunctionToolRelation } from './functionTools';
import {
  createSubAgentRelation,
  deleteAgentRelationsByAgent,
  deleteAgentToolRelationByAgent,
  upsertSubAgentRelation,
} from './subAgentRelations';
import { deleteSubAgent, listSubAgents, upsertSubAgent } from './subAgents';
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
      logger.info({ projectId }, 'No project stopWhen configuration found');
      return;
    }

    const projectStopWhen = project.stopWhen as any;
    logger.info(
      {
        projectId,
        projectStopWhen: projectStopWhen,
      },
      'Found project stopWhen configuration'
    );

    if (!agentData.stopWhen) {
      agentData.stopWhen = {};
    }

    if (
      agentData.stopWhen.transferCountIs === undefined &&
      projectStopWhen?.transferCountIs !== undefined
    ) {
      agentData.stopWhen.transferCountIs = projectStopWhen.transferCountIs;
      logger.info(
        {
          agentId: agentData.id,
          inheritedValue: projectStopWhen.transferCountIs,
        },
        'Agent inherited transferCountIs from project'
      );
    }

    if (agentData.stopWhen.transferCountIs === undefined) {
      agentData.stopWhen.transferCountIs = 10;
      logger.info(
        {
          agentId: agentData.id,
          defaultValue: 10,
        },
        'Agent set to default transferCountIs'
      );
    }

    if (projectStopWhen?.stepCountIs !== undefined) {
      logger.info(
        {
          projectId,
          stepCountIs: projectStopWhen.stepCountIs,
        },
        'Propagating stepCountIs to agents'
      );

      for (const [subAgentId, subAgentData] of Object.entries(agentData.subAgents)) {
        if (isInternalAgent(subAgentData as SubAgentDefinition)) {
          const agent = agentData as any;

          if (!agent.stopWhen) {
            agent.stopWhen = {};
          }

          if (agent.stopWhen.stepCountIs === undefined) {
            agent.stopWhen.stepCountIs = projectStopWhen.stepCountIs;
            logger.info(
              {
                subAgentId,
                inheritedValue: projectStopWhen.stepCountIs,
              },
              'Agent inherited stepCountIs from project'
            );
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
      logger.info(
        {},
        'CredentialReferences are project-scoped - skipping credential reference creation in agent'
      );

      logger.info({}, 'MCP Tools are project-scoped - skipping tool creation in agent');

      let finalAgentId: string;
      try {
        const agentId = typed.id || nanoid();
        logger.info({ agentId: agentId }, 'Creating agent metadata');
        const agent = await upsertAgent(db)({
          data: {
            id: agentId,
            tenantId,
            projectId,
            name: typed.name,
            defaultSubAgentId: typed.defaultSubAgentId,
            description: typed.description,
            contextConfigId: undefined, // Will be updated later if context config exists
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
        logger.info({ agentId: finalAgentId }, 'Agent metadata created successfully');
      } catch (error) {
        logger.error({ agentId: typed.id, error }, 'Failed to create/update agent metadata');
        throw error;
      }

      let contextConfigId: string | undefined;
      if (typed.contextConfig) {
        try {
          logger.info({ contextConfigId: typed.contextConfig.id }, 'Processing context config');
          const contextConfig = await upsertContextConfig(db)({
            data: {
              ...typed.contextConfig,
              agentId: finalAgentId,
              tenantId,
              projectId,
            },
          });
          contextConfigId = contextConfig.id;
          logger.info({ contextConfigId }, 'Context config processed successfully');
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
          logger.info(
            { agentId: finalAgentId, contextConfigId },
            'Updating agent with contextConfigId'
          );
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
          logger.info(
            { agentId: finalAgentId, contextConfigId },
            'Agent updated with contextConfigId successfully'
          );
        } catch (error) {
          logger.error(
            { agentId: finalAgentId, contextConfigId, error },
            'Failed to update agent with contextConfigId'
          );
          throw error;
        }
      }

      logger.info(
        {},
        'DataComponents are project-scoped - skipping dataComponent creation in agent'
      );

      logger.info(
        {},
        'ArtifactComponents are project-scoped - skipping artifactComponent creation in agent'
      );

      if (typed.functions && Object.keys(typed.functions).length > 0) {
        logger.info(
          {
            agentId: finalAgentId,
            functionCount: Object.keys(typed.functions).length,
          },
          'Creating functions for agent'
        );

        const functionPromises = Object.entries(typed.functions).map(
          async ([functionId, functionData]) => {
            try {
              logger.info({ agentId: finalAgentId, functionId }, 'Creating function for agent');
              await upsertFunction(db)({
                data: {
                  ...functionData,
                  id: functionId,
                },
                scopes: { tenantId, projectId },
              });
              logger.info({ agentId: finalAgentId, functionId }, 'Function created successfully');
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
        logger.info(
          {
            agentId: finalAgentId,
            functionCount: Object.keys(typed.functions).length,
          },
          'All functions created successfully'
        );
      }

      if (typed.functionTools && Object.keys(typed.functionTools).length > 0) {
        logger.info(
          {
            agentId: finalAgentId,
            functionToolCount: Object.keys(typed.functionTools).length,
          },
          'Creating function tools for agent'
        );

        const functionToolPromises = Object.entries(typed.functionTools).map(
          async ([functionToolId, functionToolData]) => {
            try {
              logger.info(
                { agentId: finalAgentId, functionToolId },
                'Creating function tool in agent'
              );
              await upsertFunctionTool(db)({
                data: {
                  ...functionToolData,
                  id: functionToolId,
                },
                scopes: { tenantId, projectId, agentId: finalAgentId },
              });
              logger.info(
                { agentId: finalAgentId, functionToolId },
                'Function tool created successfully'
              );
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
        logger.info(
          {
            agentId: finalAgentId,
            functionToolCount: Object.keys(typed.functionTools).length,
          },
          'All function tools created successfully'
        );
      }

      const internalAgentPromises = Object.entries(typed.subAgents)
        .filter(([_, agentData]) => isInternalAgent(agentData)) // Internal agents have prompt
        .map(async ([subAgentId, agentData]) => {
          const internalAgent = agentData as InternalSubAgentDefinition;
          try {
            logger.info({ subAgentId }, 'Processing internal agent');
            await upsertSubAgent(db)({
              data: {
                id: subAgentId,
                tenantId,
                projectId,
                agentId: finalAgentId,
                name: internalAgent.name || '',
                description: internalAgent.description || '',
                prompt: internalAgent.prompt || '',
                conversationHistoryConfig: internalAgent.conversationHistoryConfig,
                models: internalAgent.models,
                stopWhen: internalAgent.stopWhen,
              },
            });
            logger.info({ subAgentId }, 'Internal agent processed successfully');
          } catch (error) {
            logger.error({ subAgentId, error }, 'Failed to create/update internal agent');
            throw error;
          }
        });

      await Promise.all(internalAgentPromises);
      const internalAgentCount = Object.entries(typed.subAgents).filter(([_, agentData]) =>
        isInternalAgent(agentData)
      ).length;
      logger.info({ internalAgentCount }, 'All internal agents created/updated successfully');

      const externalAgentPromises = Object.entries(typed.subAgents)
        .filter(([_, agentData]) => isExternalAgent(agentData)) // External agents have baseUrl
        .map(async ([subAgentId, agentData]) => {
          const externalAgent = agentData as ExternalSubAgentApiInsert;
          try {
            logger.info({ subAgentId }, 'Processing external agent');
            await upsertExternalAgent(db)({
              data: {
                id: subAgentId,
                tenantId,
                projectId,
                agentId: finalAgentId,
                name: externalAgent.name,
                description: externalAgent.description || '',
                baseUrl: externalAgent.baseUrl,
                credentialReferenceId: externalAgent.credentialReferenceId || undefined,
                headers: externalAgent.headers || undefined,
              },
            });
            logger.info({ subAgentId }, 'External agent processed successfully');
          } catch (error) {
            logger.error({ subAgentId, error }, 'Failed to create/update external agent');
            throw error;
          }
        });

      await Promise.all(externalAgentPromises);
      const externalAgentCount = Object.entries(typed.subAgents).filter(([_, agentData]) =>
        isExternalAgent(agentData)
      ).length;
      logger.info({ externalAgentCount }, 'All external agents created/updated successfully');

      if (contextConfigId) {
        try {
          logger.info(
            { agentId: finalAgentId, contextConfigId },
            'Updating agent with context config'
          );
          await updateAgent(db)({
            scopes: { tenantId, projectId, agentId: finalAgentId },
            data: { contextConfigId },
          });
          logger.info({ agentId: finalAgentId }, 'Agent updated with context config');
        } catch (error) {
          logger.error(
            { agentId: finalAgentId, error },
            'Failed to update agent with context config'
          );
          throw error;
        }
      }

      const agentToolPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typed.subAgents)) {
        if (isInternalAgent(agentData) && agentData.canUse && Array.isArray(agentData.canUse)) {
          for (const canUseItem of agentData.canUse) {
            agentToolPromises.push(
              (async () => {
                try {
                  const { toolId, toolSelection, headers, agentToolRelationId } = canUseItem;
                  const isFunctionTool = typed.functionTools && toolId in typed.functionTools;

                  logger.info(
                    {
                      subAgentId,
                      toolId,
                      hasFunctionTools: !!typed.functionTools,
                      functionToolKeys: typed.functionTools ? Object.keys(typed.functionTools) : [],
                      isFunctionTool,
                    },
                    'Processing canUse item'
                  );

                  if (isFunctionTool) {
                    logger.info({ subAgentId, toolId }, 'Processing agent-function tool relation');
                    await upsertSubAgentFunctionToolRelation(db)({
                      scopes: { tenantId, projectId, agentId: finalAgentId },
                      subAgentId,
                      functionToolId: toolId,
                      relationId: agentToolRelationId,
                    });
                    logger.info(
                      { subAgentId, toolId },
                      'Agent-function tool relation processed successfully'
                    );
                  } else {
                    logger.info({ subAgentId, toolId }, 'Processing agent-MCP tool relation');
                    await upsertSubAgentToolRelation(db)({
                      scopes: { tenantId, projectId, agentId: finalAgentId },
                      subAgentId,
                      toolId,
                      selectedTools: toolSelection || undefined,
                      headers: headers || undefined,
                      relationId: agentToolRelationId,
                    });
                    logger.info(
                      { subAgentId, toolId },
                      'Agent-MCP tool relation processed successfully'
                    );
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
      logger.info(
        { agentToolCount: Object.keys(typed.subAgents).length },
        'All agent-tool relations created'
      );

      const agentDataComponentPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typed.subAgents)) {
        if (isInternalAgent(agentData) && agentData.dataComponents) {
          for (const dataComponentId of agentData.dataComponents) {
            agentDataComponentPromises.push(
              (async () => {
                try {
                  logger.info(
                    { subAgentId, dataComponentId },
                    'Processing agent-data component relation'
                  );
                  await upsertAgentDataComponentRelation(db)({
                    scopes: { tenantId, projectId, agentId: finalAgentId, subAgentId: subAgentId },
                    dataComponentId,
                  });
                  logger.info(
                    { subAgentId, dataComponentId },
                    'Agent-data component relation processed successfully'
                  );
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
      logger.info({}, 'All agent-data component relations created');

      const agentArtifactComponentPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typed.subAgents)) {
        if (isInternalAgent(agentData) && agentData.artifactComponents) {
          for (const artifactComponentId of agentData.artifactComponents) {
            agentArtifactComponentPromises.push(
              (async () => {
                try {
                  logger.info(
                    { subAgentId, artifactComponentId },
                    'Processing agent-artifact component relation'
                  );
                  await upsertAgentArtifactComponentRelation(db)({
                    scopes: { tenantId, projectId, agentId: finalAgentId, subAgentId: subAgentId },
                    artifactComponentId,
                  });
                  logger.info(
                    { subAgentId, artifactComponentId },
                    'Agent-artifact component relation processed successfully'
                  );
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
      logger.info({}, 'All agent-artifact component relations created');

      const subAgentRelationPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typed.subAgents)) {
        if (isInternalAgent(agentData) && agentData.canTransferTo) {
          for (const targetSubAgentId of agentData.canTransferTo) {
            subAgentRelationPromises.push(
              (async () => {
                try {
                  logger.info(
                    { subAgentId, targetSubAgentId, type: 'transfer' },
                    'Processing agent transfer relation'
                  );
                  await upsertSubAgentRelation(db)({
                    id: nanoid(),
                    tenantId,
                    projectId,
                    agentId: finalAgentId,
                    sourceSubAgentId: subAgentId,
                    targetSubAgentId: targetSubAgentId,
                    relationType: 'transfer',
                  });
                  logger.info(
                    { subAgentId, targetSubAgentId, type: 'transfer' },
                    'Agent transfer relation processed successfully'
                  );
                } catch (error) {
                  logger.error(
                    { subAgentId, targetSubAgentId, type: 'transfer', error },
                    'Failed to create transfer relation'
                  );
                }
              })()
            );
          }
        }

        if (isInternalAgent(agentData) && agentData.canDelegateTo) {
          for (const targetSubAgentId of agentData.canDelegateTo) {
            const targetAgentData = typed.subAgents[targetSubAgentId];
            const isTargetExternal = isExternalAgent(targetAgentData);

            subAgentRelationPromises.push(
              (async () => {
                try {
                  logger.info(
                    { subAgentId, targetSubAgentId, type: 'delegate' },
                    'Processing agent delegation relation'
                  );
                  await upsertSubAgentRelation(db)({
                    id: nanoid(),
                    tenantId,
                    projectId,
                    agentId: finalAgentId,
                    sourceSubAgentId: subAgentId,
                    targetSubAgentId: isTargetExternal ? undefined : targetSubAgentId,
                    externalSubAgentId: isTargetExternal ? targetSubAgentId : undefined,
                    relationType: 'delegate',
                  });
                  logger.info(
                    { subAgentId, targetSubAgentId, type: 'delegate' },
                    'Agent delegation relation processed successfully'
                  );
                } catch (error) {
                  logger.error(
                    { subAgentId, targetSubAgentId, type: 'delegate', error },
                    'Failed to create delegation relation'
                  );
                }
              })()
            );
          }
        }
      }

      await Promise.all(subAgentRelationPromises);
      logger.info(
        { subAgentRelationCount: subAgentRelationPromises.length },
        'All sub-agent relations created'
      );

      const createdAgent = await getFullAgentDefinition(db)({
        scopes: { tenantId, projectId, agentId: finalAgentId },
      });

      if (!createdAgent) {
        throw new Error('Failed to retrieve created agent');
      }

      logger.info({ tenantId, agentId: finalAgentId }, 'Full agent created successfully');

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

    logger.info(
      {
        tenantId,
        agentId: typedAgentDefinition.id,
        agentCount: Object.keys(typedAgentDefinition.subAgents).length,
      },
      'Updating full agent in database'
    );

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
        logger.info(
          { agentId: typedAgentDefinition.id },
          'Agent does not exist, creating new agent'
        );
        return createFullAgentServerSide(db, logger)(scopes, agentData);
      }

      const existingAgentModels = existingAgent.models;

      logger.info(
        {},
        'CredentialReferences are project-scoped - skipping credential reference update in agent'
      );

      logger.info({}, 'MCP Tools are project-scoped - skipping tool creation in agent update');

      let finalAgentId: string;
      try {
        const agentId = typedAgentDefinition.id || nanoid();
        logger.info({ agentId }, 'Getting/creating agent metadata');
        const agent = await upsertAgent(db)({
          data: {
            id: agentId,
            tenantId,
            projectId,
            name: typedAgentDefinition.name,
            defaultSubAgentId: typedAgentDefinition.defaultSubAgentId,
            description: typedAgentDefinition.description,
            contextConfigId: undefined, // Will be updated later if context config exists
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
        logger.info({ agentId: finalAgentId }, 'Agent metadata ready');
      } catch (error) {
        logger.error(
          { agentId: typedAgentDefinition.id, error },
          'Failed to get/update agent metadata'
        );
        throw error;
      }

      let contextConfigId: string | undefined;
      if (typedAgentDefinition.contextConfig) {
        logger.info(
          { contextConfigId: typedAgentDefinition.contextConfig?.id },
          ' context config exists'
        );
      }
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
          logger.info({ contextConfigId }, 'Context config processed successfully');
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
          logger.info(
            { agentId: finalAgentId, contextConfigId },
            'Updating agent with contextConfigId'
          );
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
          logger.info(
            { agentId: finalAgentId, contextConfigId },
            'Agent updated with contextConfigId successfully'
          );
        } catch (error) {
          logger.error(
            { agentId: finalAgentId, contextConfigId, error },
            'Failed to update agent with contextConfigId'
          );
          throw error;
        }
      }

      logger.info({}, 'DataComponents are project-scoped - skipping dataComponent update in agent');
      logger.info(
        {},
        'ArtifactComponents are project-scoped - skipping artifactComponent update in agent'
      );

      if (
        typedAgentDefinition.functions &&
        Object.keys(typedAgentDefinition.functions).length > 0
      ) {
        logger.info(
          {
            agentId: finalAgentId,
            functionCount: Object.keys(typedAgentDefinition.functions).length,
          },
          'Updating functions for agent'
        );

        const functionPromises = Object.entries(typedAgentDefinition.functions).map(
          async ([functionId, functionData]) => {
            try {
              logger.info({ agentId: finalAgentId, functionId }, 'Updating function for agent');
              await upsertFunction(db)({
                data: {
                  ...functionData,
                  id: functionId,
                },
                scopes: { tenantId, projectId },
              });
              logger.info({ agentId: finalAgentId, functionId }, 'Function updated successfully');
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
        logger.info(
          {
            agentId: finalAgentId,
            functionCount: Object.keys(typedAgentDefinition.functions).length,
          },
          'All functions updated successfully'
        );
      }

      if (
        typedAgentDefinition.functionTools &&
        Object.keys(typedAgentDefinition.functionTools).length > 0
      ) {
        logger.info(
          {
            agentId: finalAgentId,
            functionToolCount: Object.keys(typedAgentDefinition.functionTools).length,
          },
          'Updating function tools for agent'
        );

        const functionToolPromises = Object.entries(typedAgentDefinition.functionTools).map(
          async ([functionToolId, functionToolData]) => {
            try {
              logger.info(
                { agentId: finalAgentId, functionToolId },
                'Updating function tool in agent'
              );
              await upsertFunctionTool(db)({
                data: {
                  ...functionToolData,
                  id: functionToolId,
                },
                scopes: { tenantId, projectId, agentId: finalAgentId },
              });
              logger.info(
                { agentId: finalAgentId, functionToolId },
                'Function tool updated successfully'
              );
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
        logger.info(
          {
            agentId: finalAgentId,
            functionToolCount: Object.keys(typedAgentDefinition.functionTools).length,
          },
          'All function tools updated successfully'
        );
      }

      const internalAgentPromises = Object.entries(typedAgentDefinition.subAgents)
        .filter(([_, agentData]) => isInternalAgent(agentData)) // Internal agents have prompt
        .map(async ([subAgentId, agentData]) => {
          const internalAgent = agentData as InternalSubAgentDefinition;

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

          let finalModelSettings =
            internalAgent.models === undefined ? undefined : internalAgent.models;

          // If agent models changed, cascade to agents that were inheriting
          if (existingSubAgent?.models && typedAgentDefinition.models) {
            const subAgentModels = existingSubAgent.models as any;
            const agentModels = typedAgentDefinition.models;

            // Check each model type for inheritance and cascade if needed
            const modelTypes = ['base', 'structuredOutput', 'summarizer'] as const;
            const cascadedModels: any = { ...finalModelSettings };

            for (const modelType of modelTypes) {
              // If the subAgent's current model matches the old parent agent model (was inheriting)
              // and the parent agent model OR providerOptions have changed, cascade the change
              if (
                subAgentModels[modelType]?.model &&
                existingAgentModels?.[modelType]?.model &&
                subAgentModels[modelType].model === existingAgentModels[modelType].model &&
                agentModels[modelType] &&
                // Model name changed
                (agentModels[modelType].model !== existingAgentModels[modelType]?.model ||
                  // OR providerOptions changed
                  JSON.stringify(agentModels[modelType].providerOptions) !==
                    JSON.stringify(existingAgentModels[modelType]?.providerOptions))
              ) {
                // SubAgent was inheriting from parent agent, cascade the new value (including providerOptions)
                cascadedModels[modelType] = agentModels[modelType];
                logger.info(
                  {
                    subAgentId,
                    modelType,
                    oldModel: existingAgentModels[modelType]?.model,
                    newModel: agentModels[modelType].model,
                    hasProviderOptions: !!agentModels[modelType].providerOptions,
                  },
                  'Cascading model change from parent agent to subAgent'
                );
              }
            }

            finalModelSettings = cascadedModels;
          }

          try {
            logger.info({ subAgentId }, 'Processing internal agent');
            await upsertSubAgent(db)({
              data: {
                id: subAgentId,
                tenantId,
                projectId,
                agentId: finalAgentId,
                name: internalAgent.name || '',
                description: internalAgent.description || '',
                prompt: internalAgent.prompt || '',
                conversationHistoryConfig: internalAgent.conversationHistoryConfig,
                models: finalModelSettings,
                stopWhen: internalAgent.stopWhen,
              },
            });
            logger.info({ subAgentId }, 'Internal agent processed successfully');
          } catch (error) {
            logger.error({ subAgentId, error }, 'Failed to create/update internal agent');
            throw error;
          }
        });

      await Promise.all(internalAgentPromises);
      const internalAgentCount = Object.entries(typedAgentDefinition.subAgents).filter(
        ([_, agentData]) => isInternalAgent(agentData)
      ).length;
      logger.info({ internalAgentCount }, 'All internal agents created/updated successfully');

      const externalAgentPromises = Object.entries(typedAgentDefinition.subAgents)
        .filter(([_, agentData]) => isExternalAgent(agentData)) // External agents have baseUrl
        .map(async ([subAgentId, agentData]) => {
          const externalAgent = agentData as ExternalSubAgentApiInsert;
          try {
            logger.info({ subAgentId }, 'Processing external agent');
            await upsertExternalAgent(db)({
              data: {
                id: subAgentId,
                tenantId,
                projectId,
                agentId: finalAgentId,
                name: externalAgent.name,
                description: externalAgent.description || '',
                baseUrl: externalAgent.baseUrl,
                credentialReferenceId: externalAgent.credentialReferenceId || undefined,
                headers: externalAgent.headers || undefined,
              },
            });
            logger.info({ subAgentId }, 'External agent processed successfully');
          } catch (error) {
            logger.error({ subAgentId, error }, 'Failed to create/update external agent');
            throw error;
          }
        });

      await Promise.all(externalAgentPromises);
      const externalAgentCount = Object.entries(typedAgentDefinition.subAgents).filter(
        ([_, agentData]) => isExternalAgent(agentData)
      ).length;
      logger.info({ externalAgentCount }, 'All external agents created/updated successfully');

      // Step 8a: Delete agents that are no longer in the agent definition
      const incomingAgentIds = new Set(Object.keys(typedAgentDefinition.subAgents));

      // Get existing internal agents for this agent
      const existingInternalAgents = await listSubAgents(db)({
        scopes: { tenantId, projectId, agentId: finalAgentId },
      });

      // Get existing external agents for this agent
      const existingExternalAgents = await listExternalAgents(db)({
        scopes: { tenantId, projectId, agentId: finalAgentId },
      });

      // Delete internal agents not in incoming set
      let deletedInternalCount = 0;
      for (const agent of existingInternalAgents) {
        if (!incomingAgentIds.has(agent.id)) {
          try {
            await deleteSubAgent(db)({
              scopes: { tenantId, projectId, agentId: finalAgentId },
              subAgentId: agent.id,
            });
            deletedInternalCount++;
            logger.info({ subAgentId: agent.id }, 'Deleted orphaned internal agent');
          } catch (error) {
            logger.error(
              { subAgentId: agent.id, error },
              'Failed to delete orphaned internal agent'
            );
            // Don't throw - continue with other deletions
          }
        }
      }

      // Delete external agents not in incoming set
      let deletedExternalCount = 0;
      for (const agent of existingExternalAgents) {
        if (!incomingAgentIds.has(agent.id)) {
          try {
            await deleteExternalAgent(db)({
              scopes: { tenantId, projectId, agentId: finalAgentId },
              subAgentId: agent.id,
            });
            deletedExternalCount++;
            logger.info({ subAgentId: agent.id }, 'Deleted orphaned external agent');
          } catch (error) {
            logger.error(
              { subAgentId: agent.id, error },
              'Failed to delete orphaned external agent'
            );
            // Don't throw - continue with other deletions
          }
        }
      }

      if (deletedInternalCount > 0 || deletedExternalCount > 0) {
        logger.info(
          {
            deletedInternalCount,
            deletedExternalCount,
            totalDeleted: deletedInternalCount + deletedExternalCount,
          },
          'Deleted orphaned agents from agent'
        );
      }

      // Step 8: Update the agent metadata
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

      logger.info({ agentId: typedAgentDefinition.id }, 'Agent metadata updated');

      // Step 9: Update agent-tool relationships (selective delete and upsert)

      // First, collect all incoming relationshipIds
      const incomingRelationshipIds = new Set<string>();
      for (const [_subAgentId, agentData] of Object.entries(typedAgentDefinition.subAgents)) {
        if (isInternalAgent(agentData) && agentData.canUse && Array.isArray(agentData.canUse)) {
          for (const canUseItem of agentData.canUse) {
            if (canUseItem.agentToolRelationId) {
              incomingRelationshipIds.add(canUseItem.agentToolRelationId);
            }
          }
        }
      }

      // Delete relationships that are not in the incoming set (for agents in this agent)
      // Use atomic deletion to avoid race conditions
      for (const subAgentId of Object.keys(typedAgentDefinition.subAgents)) {
        try {
          let deletedCount = 0;

          if (incomingRelationshipIds.size === 0) {
            // Delete all relationships for this agent if no incoming IDs
            const result = await db
              .delete(subAgentToolRelations)
              .where(
                and(
                  eq(subAgentToolRelations.tenantId, tenantId),
                  eq(subAgentToolRelations.projectId, projectId),
                  eq(subAgentToolRelations.agentId, finalAgentId),
                  eq(subAgentToolRelations.subAgentId, subAgentId)
                )
              );
            deletedCount = result.rowsAffected || 0;
          } else {
            // Delete relationships not in the incoming set
            const result = await db
              .delete(subAgentToolRelations)
              .where(
                and(
                  eq(subAgentToolRelations.tenantId, tenantId),
                  eq(subAgentToolRelations.projectId, projectId),
                  eq(subAgentToolRelations.agentId, finalAgentId),
                  eq(subAgentToolRelations.subAgentId, subAgentId),
                  not(inArray(subAgentToolRelations.id, Array.from(incomingRelationshipIds)))
                )
              );
            deletedCount = result.rowsAffected || 0;
          }

          if (deletedCount > 0) {
            logger.info({ subAgentId, deletedCount }, 'Deleted orphaned agent-tool relations');
          }
        } catch (error) {
          logger.error({ subAgentId, error }, 'Failed to delete orphaned agent-tool relations');
        }
      }

      // Then upsert the incoming relationships
      const agentToolPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typedAgentDefinition.subAgents)) {
        if (isInternalAgent(agentData) && agentData.canUse && Array.isArray(agentData.canUse)) {
          for (const canUseItem of agentData.canUse) {
            agentToolPromises.push(
              (async () => {
                try {
                  const { toolId, toolSelection, headers, agentToolRelationId } = canUseItem;

                  const isFunctionTool =
                    typedAgentDefinition.functionTools &&
                    toolId in typedAgentDefinition.functionTools;

                  if (isFunctionTool) {
                    logger.info({ subAgentId, toolId }, 'Processing agent-function tool relation');
                    await upsertSubAgentFunctionToolRelation(db)({
                      scopes: { tenantId, projectId, agentId: finalAgentId },
                      subAgentId,
                      functionToolId: toolId,
                      relationId: agentToolRelationId,
                    });
                    logger.info(
                      { subAgentId, toolId, relationId: agentToolRelationId },
                      'Agent-function tool relation upserted'
                    );
                  } else {
                    logger.info({ subAgentId, toolId }, 'Processing agent-MCP tool relation');
                    await upsertSubAgentToolRelation(db)({
                      scopes: { tenantId, projectId, agentId: finalAgentId },
                      subAgentId,
                      toolId,
                      selectedTools: toolSelection || undefined,
                      headers: headers || undefined,
                      relationId: agentToolRelationId,
                    });
                    logger.info(
                      { subAgentId, toolId, relationId: agentToolRelationId },
                      'Agent-MCP tool relation upserted'
                    );
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

      await Promise.all(agentToolPromises);
      logger.info(
        { agentToolPromisesCount: agentToolPromises.length },
        'All agent-tool relations updated'
      );

      // Step 10: Clear and recreate agent-dataComponent relationships
      // First, delete existing relationships for all agents in this agent
      for (const subAgentId of Object.keys(typedAgentDefinition.subAgents)) {
        await deleteAgentDataComponentRelationByAgent(db)({
          scopes: { tenantId, projectId, agentId: finalAgentId, subAgentId: subAgentId },
        });
      }

      // Then create new agent-dataComponent relationships
      const agentDataComponentPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typedAgentDefinition.subAgents)) {
        if (isInternalAgent(agentData) && agentData.dataComponents) {
          for (const dataComponentId of agentData.dataComponents) {
            agentDataComponentPromises.push(
              (async () => {
                try {
                  await associateDataComponentWithAgent(db)({
                    scopes: { tenantId, projectId, agentId: finalAgentId, subAgentId: subAgentId },
                    dataComponentId,
                  });

                  logger.info(
                    { subAgentId, dataComponentId },
                    'Agent-dataComponent relation created'
                  );
                } catch (error) {
                  logger.error(
                    { subAgentId, dataComponentId, error },
                    'Failed to create agent-dataComponent relation'
                  );
                }
              })()
            );
          }
        }
      }

      await Promise.all(agentDataComponentPromises);
      logger.info(
        { agentDataComponentPromisesCount: agentDataComponentPromises.length },
        'All agent-dataComponent relations updated'
      );

      // Step 11: Clear and recreate agent-artifactComponent relationships
      // First, delete existing relationships for all agents in this agent
      for (const subAgentId of Object.keys(typedAgentDefinition.subAgents)) {
        await deleteAgentArtifactComponentRelationByAgent(db)({
          scopes: { tenantId, projectId, agentId: finalAgentId, subAgentId: subAgentId },
        });
      }

      // Then create new agent-artifactComponent relationships
      const agentArtifactComponentPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typedAgentDefinition.subAgents)) {
        if (isInternalAgent(agentData) && agentData.artifactComponents) {
          for (const artifactComponentId of agentData.artifactComponents) {
            agentArtifactComponentPromises.push(
              (async () => {
                try {
                  await associateArtifactComponentWithAgent(db)({
                    scopes: { tenantId, projectId, agentId: finalAgentId, subAgentId: subAgentId },
                    artifactComponentId,
                  });

                  logger.info(
                    { subAgentId, artifactComponentId },
                    'Agent-artifactComponent relation created'
                  );
                } catch (error) {
                  logger.error(
                    { subAgentId, artifactComponentId, error },
                    'Failed to create agent-artifactComponent relation'
                  );
                }
              })()
            );
          }
        }
      }

      await Promise.all(agentArtifactComponentPromises);
      logger.info(
        { agentArtifactComponentPromisesCount: agentArtifactComponentPromises.length },
        'All agent-artifactComponent relations updated'
      );

      // Step 12: Clear and recreate agent relationships
      // First, delete existing relationships for this agent
      await deleteAgentRelationsByAgent(db)({
        scopes: { tenantId, projectId, agentId: typedAgentDefinition.id },
      });
      // Then create new relationships
      const agentRelationPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typedAgentDefinition.subAgents)) {
        if (isInternalAgent(agentData) && agentData.canTransferTo) {
          for (const targetSubAgentId of agentData.canTransferTo) {
            agentRelationPromises.push(
              (async () => {
                try {
                  const targetAgentData = typedAgentDefinition.subAgents[targetSubAgentId];
                  const isTargetExternal = isExternalAgent(targetAgentData);
                  const targetField = isTargetExternal ? 'externalSubAgentId' : 'targetSubAgentId';

                  const relationData = {
                    id: nanoid(),
                    agentId: typedAgentDefinition.id || '',
                    sourceSubAgentId: subAgentId,
                    relationType: 'transfer',
                    [targetField]: targetSubAgentId,
                  };

                  await createSubAgentRelation(db)({
                    tenantId,
                    projectId,
                    ...relationData,
                  });

                  logger.info(
                    { subAgentId: subAgentId, targetSubAgentId, isTargetExternal },
                    'Transfer relation created'
                  );
                } catch (error) {
                  logger.error(
                    { subAgentId: subAgentId, targetSubAgentId, error },
                    'Failed to create transfer relation'
                  );
                }
              })()
            );
          }
        }

        if (isInternalAgent(agentData) && agentData.canDelegateTo) {
          for (const targetSubAgentId of agentData.canDelegateTo) {
            // External agents can't delegate to other agents

            const targetAgentData = typedAgentDefinition.subAgents[targetSubAgentId];
            const isTargetExternal = isExternalAgent(targetAgentData);
            const targetField = isTargetExternal ? 'externalSubAgentId' : 'targetSubAgentId';

            agentRelationPromises.push(
              (async () => {
                try {
                  const relationData = {
                    id: nanoid(),
                    agentId: typedAgentDefinition.id || '',
                    sourceSubAgentId: subAgentId,
                    relationType: 'delegate',
                    [targetField]: targetSubAgentId,
                  };

                  await createSubAgentRelation(db)({
                    tenantId,
                    projectId,
                    ...relationData,
                  });

                  logger.info({ subAgentId, targetSubAgentId }, 'Delegation relation created');
                } catch (error) {
                  logger.error(
                    { subAgentId, targetSubAgentId, error },
                    'Failed to create delegation relation'
                  );
                }
              })()
            );
          }
        }
      }

      await Promise.all(agentRelationPromises);
      logger.info(
        { agentRelationPromisesCount: agentRelationPromises.length },
        'All agent relations updated'
      );

      // Retrieve and return the updated agent
      const updatedAgent = await getFullAgentDefinition(db)({
        scopes: { tenantId, projectId, agentId: typedAgentDefinition.id },
      });

      if (!updatedAgent) {
        throw new Error('Failed to retrieve updated agent');
      }

      logger.info({ agentId: typedAgentDefinition.id }, 'Full agent updated successfully');

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

    logger.info({ tenantId, agentId: scopes.agentId }, 'Retrieving full agent definition');

    try {
      const agent = await getFullAgentDefinition(db)({
        scopes: { tenantId, projectId, agentId: scopes.agentId },
      });

      if (!agent) {
        logger.info({ tenantId, agentId: scopes.agentId }, 'Agent not found');
        return null;
      }

      logger.info(
        {
          tenantId,
          agentId: scopes.agentId,
          agentCount: Object.keys(agent.subAgents).length,
        },
        'Full agent retrieved successfully'
      );

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

    logger.info({ tenantId, agentId }, 'Deleting full agent and related entities');

    try {
      // Get the agent first to ensure it exists
      const agent = await getFullAgentDefinition(db)({
        scopes: { tenantId, projectId, agentId },
      });

      if (!agent) {
        logger.info({ tenantId, agentId }, 'Agent not found for deletion');
        return false;
      }

      // Step 1: Delete all agent relations for this agent
      await deleteAgentRelationsByAgent(db)({
        scopes: { tenantId, projectId, agentId },
      });
      logger.info({ tenantId, agentId }, 'Agent relations deleted');

      // Step 2: Delete agent-tool relations for agents in this agent
      const subAgentIds = Object.keys(agent.subAgents);
      if (subAgentIds.length > 0) {
        // Delete agent-tool relations for all agents in this agent
        for (const subAgentId of subAgentIds) {
          await deleteAgentToolRelationByAgent(db)({
            scopes: { tenantId, projectId, agentId, subAgentId: subAgentId },
          });
        }

        logger.info(
          { tenantId, agentId, agentCount: subAgentIds.length },
          'Agent-tool relations deleted'
        );
      }

      // Step 3: Delete the agent metadata
      await deleteAgent(db)({
        scopes: { tenantId, projectId, agentId },
      });

      logger.info({ tenantId, agentId }, 'Agent metadata deleted');

      // Note: We don't delete agents or tools themselves as they might be used in other agent
      // Only relationships specific to this agent are deleted

      logger.info({ tenantId, agentId }, 'Full agent deleted successfully');

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
