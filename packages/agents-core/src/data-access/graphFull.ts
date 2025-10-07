import { and, eq, inArray, not } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import { agents, agentToolRelations, projects } from '../db/schema';
import type {
  AgentDefinition,
  ExternalAgentApiInsert,
  FullGraphDefinition,
  InternalAgentDefinition,
} from '../types/entities';
import type { GraphScopeConfig, ProjectScopeConfig } from '../types/utility';
import {
  isExternalAgent,
  isInternalAgent,
  validateAndTypeGraphData,
  validateGraphStructure,
} from '../validation/graphFull';
import {
  deleteAgentGraph,
  getAgentGraphById,
  getFullGraphDefinition,
  updateAgentGraph,
  upsertAgentGraph,
} from './agentGraphs';
import {
  createAgentRelation,
  deleteAgentRelationsByGraph,
  deleteAgentToolRelationByAgent,
  upsertAgentRelation,
} from './agentRelations';
import { deleteAgent, listAgents, upsertAgent } from './agents';
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
import { upsertAgentToolRelation } from './tools';

// Logger interface for dependency injection
export interface GraphLogger {
  info(obj: Record<string, any>, msg?: string): void;
  error(obj: Record<string, any>, msg?: string): void;
}

// Default no-op logger
const defaultLogger: GraphLogger = {
  info: () => {},
  error: () => {},
};

/**
 * Apply execution limits inheritance from project to graph and agents
 */
async function applyExecutionLimitsInheritance(
  db: DatabaseClient,
  logger: GraphLogger,
  scopes: ProjectScopeConfig,
  graphData: FullGraphDefinition
): Promise<void> {
  const { tenantId, projectId } = scopes;

  try {
    // Get project stopWhen configuration
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

    // Initialize graph stopWhen if not exists
    if (!graphData.stopWhen) {
      graphData.stopWhen = {};
    }

    // Inherit transferCountIs from project if graph doesn't have it explicitly set
    if (
      graphData.stopWhen.transferCountIs === undefined &&
      projectStopWhen?.transferCountIs !== undefined
    ) {
      graphData.stopWhen.transferCountIs = projectStopWhen.transferCountIs;
      logger.info(
        {
          graphId: graphData.id,
          inheritedValue: projectStopWhen.transferCountIs,
        },
        'Graph inherited transferCountIs from project'
      );
    }

    // Set default transferCountIs if still not set
    if (graphData.stopWhen.transferCountIs === undefined) {
      graphData.stopWhen.transferCountIs = 10;
      logger.info(
        {
          graphId: graphData.id,
          defaultValue: 10,
        },
        'Graph set to default transferCountIs'
      );
    }

    // Propagate stepCountIs from project to agents
    if (projectStopWhen?.stepCountIs !== undefined) {
      logger.info(
        {
          projectId,
          stepCountIs: projectStopWhen.stepCountIs,
        },
        'Propagating stepCountIs to agents'
      );

      for (const [agentId, agentData] of Object.entries(graphData.agents)) {
        // Only apply to internal agents (have prompt)
        if (isInternalAgent(agentData as AgentDefinition)) {
          const agent = agentData as any;

          // Initialize agent stopWhen if it doesn't exist
          if (!agent.stopWhen) {
            agent.stopWhen = {};
          }

          // Set stepCountIs in stopWhen if not explicitly set
          if (agent.stopWhen.stepCountIs === undefined) {
            agent.stopWhen.stepCountIs = projectStopWhen.stepCountIs;
            logger.info(
              {
                agentId,
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
    // Don't throw - inheritance failure shouldn't block graph creation
  }
}

/**
 * Server-side implementation of createFullGraph that performs actual database operations.
 * This function creates a complete graph with all agents, tools, and relationships.
 */
export const createFullGraphServerSide =
  (db: DatabaseClient, logger: GraphLogger = defaultLogger) =>
  async (
    scopes: ProjectScopeConfig,
    graphData: FullGraphDefinition
  ): Promise<FullGraphDefinition> => {
    const { tenantId, projectId } = scopes;

    const typed = validateAndTypeGraphData(graphData);

    // Validate the graph structure
    validateGraphStructure(typed);

    // Apply inheritance logic for execution limits
    await applyExecutionLimitsInheritance(db, logger, { tenantId, projectId }, typed);

    try {
      // Note: CredentialReferences are now project-scoped and should be created separately
      logger.info(
        {},
        'CredentialReferences are project-scoped - skipping credential reference creation in graph'
      );

      // Note: Tools are now project-scoped and should be created separately
      // They are no longer part of the graph definition
      logger.info({}, 'Tools are project-scoped - skipping tool creation in graph');

      // Step 3: Create the graph metadata FIRST (before agents, as they need graphId)
      let finalGraphId: string;
      try {
        const graphId = typed.id || nanoid();
        logger.info({ graphId }, 'Creating agent graph metadata');
        const agentGraph = await upsertAgentGraph(db)({
          data: {
            id: graphId,
            tenantId,
            projectId,
            name: typed.name,
            defaultAgentId: typed.defaultAgentId,
            description: typed.description,
            contextConfigId: undefined, // Will be updated later if context config exists
            models: typed.models,
            statusUpdates: typed.statusUpdates,
            graphPrompt: typed.graphPrompt,
            stopWhen: typed.stopWhen,
          },
        });
        finalGraphId = agentGraph.id;
        logger.info({ graphId: finalGraphId }, 'Agent graph metadata created successfully');
      } catch (error) {
        logger.error({ graphId: typed.id, error }, 'Failed to create/update graph metadata');
        throw error;
      }

      // Step 4: create/update context config
      let contextConfigId: string | undefined;
      if (typed.contextConfig) {
        try {
          logger.info({ contextConfigId: typed.contextConfig.id }, 'Processing context config');
          const contextConfig = await upsertContextConfig(db)({
            data: {
              ...typed.contextConfig,
              graphId: finalGraphId,
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

      // Update the graph with the contextConfigId if we created one
      if (contextConfigId) {
        try {
          logger.info(
            { graphId: finalGraphId, contextConfigId },
            'Updating graph with contextConfigId'
          );
          await upsertAgentGraph(db)({
            data: {
              id: finalGraphId,
              tenantId,
              projectId,
              name: typed.name,
              defaultAgentId: typed.defaultAgentId,
              description: typed.description,
              contextConfigId,
              models: typed.models,
              statusUpdates: typed.statusUpdates,
              graphPrompt: typed.graphPrompt,
              stopWhen: typed.stopWhen,
            },
          });
          logger.info(
            { graphId: finalGraphId, contextConfigId },
            'Graph updated with contextConfigId successfully'
          );
        } catch (error) {
          logger.error(
            { graphId: finalGraphId, contextConfigId, error },
            'Failed to update graph with contextConfigId'
          );
          throw error;
        }
      }

      // Note: DataComponents are now project-scoped and should be created separately
      logger.info(
        {},
        'DataComponents are project-scoped - skipping dataComponent creation in graph'
      );

      // Note: ArtifactComponents are now project-scoped and should be created separately
      logger.info(
        {},
        'ArtifactComponents are project-scoped - skipping artifactComponent creation in graph'
      );

      // Step 7: Create/update internal agents (now with graphId)
      const internalAgentPromises = Object.entries(typed.agents)
        .filter(([_, agentData]) => isInternalAgent(agentData)) // Internal agents have prompt
        .map(async ([agentId, agentData]) => {
          // Type assertion since we've filtered for internal agents
          const internalAgent = agentData as InternalAgentDefinition;
          try {
            logger.info({ agentId }, 'Processing internal agent');
            await upsertAgent(db)({
              data: {
                id: agentId,
                tenantId,
                projectId,
                graphId: finalGraphId,
                name: internalAgent.name || '',
                description: internalAgent.description || '',
                prompt: internalAgent.prompt || '',
                conversationHistoryConfig: internalAgent.conversationHistoryConfig,
                models: internalAgent.models,
                stopWhen: internalAgent.stopWhen,
              },
            });
            logger.info({ agentId }, 'Internal agent processed successfully');
          } catch (error) {
            logger.error({ agentId, error }, 'Failed to create/update internal agent');
            throw error;
          }
        });

      await Promise.all(internalAgentPromises);
      const internalAgentCount = Object.entries(typed.agents).filter(([_, agentData]) =>
        isInternalAgent(agentData)
      ).length;
      logger.info({ internalAgentCount }, 'All internal agents created/updated successfully');

      // Step 8: Create/update external agents (now with graphId)
      const externalAgentPromises = Object.entries(typed.agents)
        .filter(([_, agentData]) => isExternalAgent(agentData)) // External agents have baseUrl
        .map(async ([agentId, agentData]) => {
          // Type assertion since we've filtered for external agents
          const externalAgent = agentData as ExternalAgentApiInsert;
          try {
            logger.info({ agentId }, 'Processing external agent');
            await upsertExternalAgent(db)({
              data: {
                id: agentId,
                tenantId,
                projectId,
                graphId: finalGraphId,
                name: externalAgent.name,
                description: externalAgent.description || '',
                baseUrl: externalAgent.baseUrl,
                credentialReferenceId: externalAgent.credentialReferenceId || undefined,
                headers: externalAgent.headers || undefined,
              },
            });
            logger.info({ agentId }, 'External agent processed successfully');
          } catch (error) {
            logger.error({ agentId, error }, 'Failed to create/update external agent');
            throw error;
          }
        });

      await Promise.all(externalAgentPromises);
      const externalAgentCount = Object.entries(typed.agents).filter(([_, agentData]) =>
        isExternalAgent(agentData)
      ).length;
      logger.info({ externalAgentCount }, 'All external agents created/updated successfully');

      // Step 9: Update the graph with contextConfigId if it was created
      if (contextConfigId) {
        try {
          logger.info(
            { graphId: finalGraphId, contextConfigId },
            'Updating graph with context config'
          );
          await updateAgentGraph(db)({
            scopes: { tenantId, projectId, graphId: finalGraphId },
            data: { contextConfigId },
          });
          logger.info({ graphId: finalGraphId }, 'Graph updated with context config');
        } catch (error) {
          logger.error(
            { graphId: finalGraphId, error },
            'Failed to update graph with context config'
          );
          throw error;
        }
      }

      // Step 10: Create agent-tool relationships
      const agentToolPromises: Promise<void>[] = [];

      for (const [agentId, agentData] of Object.entries(typed.agents)) {
        if (isInternalAgent(agentData) && agentData.canUse && Array.isArray(agentData.canUse)) {
          for (const canUseItem of agentData.canUse) {
            agentToolPromises.push(
              (async () => {
                try {
                  const { toolId, toolSelection, headers, agentToolRelationId } = canUseItem;
                  logger.info({ agentId, toolId }, 'Processing agent-tool relation');
                  await upsertAgentToolRelation(db)({
                    scopes: { tenantId, projectId, graphId: finalGraphId },
                    agentId,
                    toolId,
                    selectedTools: toolSelection || undefined,
                    headers: headers || undefined,
                    relationId: agentToolRelationId,
                  });
                  logger.info({ agentId, toolId }, 'Agent-tool relation processed successfully');
                } catch (error) {
                  logger.error(
                    { agentId, toolId: canUseItem.toolId, error },
                    'Failed to create agent-tool relation'
                  );
                  // Don't throw - allow partial success for relations
                }
              })()
            );
          }
        }
      }

      await Promise.all(agentToolPromises);
      logger.info(
        { agentToolCount: Object.keys(typed.agents).length },
        'All agent-tool relations created'
      );

      // Step 10: Create agent-dataComponent relationships
      const agentDataComponentPromises: Promise<void>[] = [];

      for (const [agentId, agentData] of Object.entries(typed.agents)) {
        if (isInternalAgent(agentData) && agentData.dataComponents) {
          for (const dataComponentId of agentData.dataComponents) {
            agentDataComponentPromises.push(
              (async () => {
                try {
                  logger.info(
                    { agentId, dataComponentId },
                    'Processing agent-data component relation'
                  );
                  await upsertAgentDataComponentRelation(db)({
                    scopes: { tenantId, projectId, graphId: finalGraphId, agentId },
                    dataComponentId,
                  });
                  logger.info(
                    { agentId, dataComponentId },
                    'Agent-data component relation processed successfully'
                  );
                } catch (error) {
                  logger.error(
                    { agentId, dataComponentId, error },
                    'Failed to create agent-data component relation'
                  );
                  // Don't throw - allow partial success for relations
                }
              })()
            );
          }
        }
      }

      await Promise.all(agentDataComponentPromises);
      logger.info({}, 'All agent-data component relations created');

      // Step 11: Create agent-artifactComponent relationships
      const agentArtifactComponentPromises: Promise<void>[] = [];

      for (const [agentId, agentData] of Object.entries(typed.agents)) {
        if (isInternalAgent(agentData) && agentData.artifactComponents) {
          for (const artifactComponentId of agentData.artifactComponents) {
            agentArtifactComponentPromises.push(
              (async () => {
                try {
                  logger.info(
                    { agentId, artifactComponentId },
                    'Processing agent-artifact component relation'
                  );
                  await upsertAgentArtifactComponentRelation(db)({
                    scopes: { tenantId, projectId, graphId: finalGraphId, agentId },
                    artifactComponentId,
                  });
                  logger.info(
                    { agentId, artifactComponentId },
                    'Agent-artifact component relation processed successfully'
                  );
                } catch (error) {
                  logger.error(
                    { agentId, artifactComponentId, error },
                    'Failed to create agent-artifact component relation'
                  );
                  // Don't throw - allow partial success for relations
                }
              })()
            );
          }
        }
      }

      await Promise.all(agentArtifactComponentPromises);
      logger.info({}, 'All agent-artifact component relations created');

      // Step 12: Create agent relationships (transfer/delegation)
      const agentRelationPromises: Promise<void>[] = [];

      for (const [agentId, agentData] of Object.entries(typed.agents)) {
        // Create transfer relations
        if (isInternalAgent(agentData) && agentData.canTransferTo) {
          for (const targetAgentId of agentData.canTransferTo) {
            agentRelationPromises.push(
              (async () => {
                try {
                  logger.info(
                    { agentId, targetAgentId, type: 'transfer' },
                    'Processing agent transfer relation'
                  );
                  await upsertAgentRelation(db)({
                    id: nanoid(),
                    tenantId,
                    projectId,
                    graphId: finalGraphId,
                    sourceAgentId: agentId,
                    targetAgentId,
                    relationType: 'transfer',
                  });
                  logger.info(
                    { agentId, targetAgentId, type: 'transfer' },
                    'Agent transfer relation processed successfully'
                  );
                } catch (error) {
                  logger.error(
                    { agentId, targetAgentId, type: 'transfer', error },
                    'Failed to create transfer relation'
                  );
                }
              })()
            );
          }
        }

        // Create delegation relations
        if (isInternalAgent(agentData) && agentData.canDelegateTo) {
          for (const targetAgentId of agentData.canDelegateTo) {
            // Check if the target agent is external by looking it up in the typed.agents
            const targetAgentData = typed.agents[targetAgentId];
            const isTargetExternal = isExternalAgent(targetAgentData);

            agentRelationPromises.push(
              (async () => {
                try {
                  logger.info(
                    { agentId, targetAgentId, type: 'delegate' },
                    'Processing agent delegation relation'
                  );
                  await upsertAgentRelation(db)({
                    id: nanoid(),
                    tenantId,
                    projectId,
                    graphId: finalGraphId,
                    sourceAgentId: agentId,
                    targetAgentId: isTargetExternal ? undefined : targetAgentId,
                    externalAgentId: isTargetExternal ? targetAgentId : undefined,
                    relationType: 'delegate',
                  });
                  logger.info(
                    { agentId, targetAgentId, type: 'delegate' },
                    'Agent delegation relation processed successfully'
                  );
                } catch (error) {
                  logger.error(
                    { agentId, targetAgentId, type: 'delegate', error },
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
        { agentRelationCount: agentRelationPromises.length },
        'All agent relations created'
      );

      // Retrieve and return the created graph
      const createdGraph = await getFullGraphDefinition(db)({
        scopes: { tenantId, projectId, graphId: finalGraphId },
      });

      if (!createdGraph) {
        throw new Error('Failed to retrieve created graph');
      }

      logger.info({ tenantId, graphId: finalGraphId }, 'Full graph created successfully');

      return createdGraph as FullGraphDefinition;
    } catch (error) {
      const errorGraphId = typed.id || 'unknown';
      logger.error({ tenantId, graphId: errorGraphId, error }, 'Failed to create full graph');
      throw error;
    }
  };

/**
 * Server-side implementation of updateFullGraph that performs actual database operations.
 * This function updates a complete graph with all agents, tools, and relationships.
 */
export const updateFullGraphServerSide =
  (db: DatabaseClient, logger: GraphLogger = defaultLogger) =>
  async (
    scopes: ProjectScopeConfig,
    graphData: FullGraphDefinition
  ): Promise<FullGraphDefinition> => {
    const { tenantId, projectId } = scopes;

    const typedGraphDefinition = validateAndTypeGraphData(graphData);

    if (!typedGraphDefinition.id) {
      throw new Error('Graph ID is required');
    }

    logger.info(
      {
        tenantId,
        graphId: typedGraphDefinition.id,
        agentCount: Object.keys(typedGraphDefinition.agents).length,
      },
      'Updating full graph in database'
    );

    // Validate the graph structure
    validateGraphStructure(typedGraphDefinition);

    // Apply inheritance logic for execution limits
    await applyExecutionLimitsInheritance(
      db,
      logger,
      { tenantId, projectId },
      typedGraphDefinition
    );

    try {
      // Verify graph exists and get existing models for cascade logic
      const existingGraph = await getAgentGraphById(db)({
        scopes: { tenantId, projectId, graphId: typedGraphDefinition.id },
      });

      if (!existingGraph) {
        // If graph doesn't exist, create it (upsert behavior)
        logger.info(
          { graphId: typedGraphDefinition.id },
          'Graph does not exist, creating new graph'
        );
        return createFullGraphServerSide(db)(scopes, graphData);
      }

      // Store existing graph models for cascade comparison
      const existingGraphModels = existingGraph.models;

      // Note: CredentialReferences are now project-scoped and should be created separately
      logger.info(
        {},
        'CredentialReferences are project-scoped - skipping credential reference update in graph'
      );

      // Step 2: Create/update tools (agents depend on them)
      // Note: Tools are now project-scoped and should be created separately
      logger.info({}, 'Tools are project-scoped - skipping tool creation in graph update');

      // Step 3: Get or create the graph metadata FIRST (before agents, as they need graphId)
      let finalGraphId: string;
      try {
        const graphId = typedGraphDefinition.id || nanoid();
        logger.info({ graphId }, 'Getting/creating agent graph metadata');
        const agentGraph = await upsertAgentGraph(db)({
          data: {
            id: graphId,
            tenantId,
            projectId,
            name: typedGraphDefinition.name,
            defaultAgentId: typedGraphDefinition.defaultAgentId,
            description: typedGraphDefinition.description,
            contextConfigId: undefined, // Will be updated later if context config exists
            models: typedGraphDefinition.models,
            statusUpdates: typedGraphDefinition.statusUpdates,
            graphPrompt: typedGraphDefinition.graphPrompt,
            stopWhen: typedGraphDefinition.stopWhen,
          },
        });
        finalGraphId = agentGraph.id;
        logger.info({ graphId: finalGraphId }, 'Agent graph metadata ready');
      } catch (error) {
        logger.error(
          { graphId: typedGraphDefinition.id, error },
          'Failed to get/update graph metadata'
        );
        throw error;
      }

      // Step 4: create/update context config
      let contextConfigId: string | undefined;
      if (typedGraphDefinition.contextConfig) {
        logger.info(
          { contextConfigId: typedGraphDefinition.contextConfig?.id },
          ' context config exists'
        );
      }
      if (typedGraphDefinition.contextConfig) {
        try {
          const contextConfig = await upsertContextConfig(db)({
            data: {
              ...typedGraphDefinition.contextConfig,
              graphId: finalGraphId,
              tenantId,
              projectId,
            },
          });
          contextConfigId = contextConfig.id;
          logger.info({ contextConfigId }, 'Context config processed successfully');
        } catch (error) {
          logger.error(
            { contextConfigId: typedGraphDefinition.contextConfig.id, error },
            'Failed to create/update context config'
          );
          throw error;
        }
      }

      // Update the graph with the contextConfigId if we created one
      if (contextConfigId) {
        try {
          logger.info(
            { graphId: finalGraphId, contextConfigId },
            'Updating graph with contextConfigId'
          );
          await upsertAgentGraph(db)({
            data: {
              id: finalGraphId,
              tenantId,
              projectId,
              name: typedGraphDefinition.name,
              defaultAgentId: typedGraphDefinition.defaultAgentId,
              description: typedGraphDefinition.description,
              contextConfigId,
              models: typedGraphDefinition.models,
              statusUpdates: typedGraphDefinition.statusUpdates,
              graphPrompt: typedGraphDefinition.graphPrompt,
              stopWhen: typedGraphDefinition.stopWhen,
            },
          });
          logger.info(
            { graphId: finalGraphId, contextConfigId },
            'Graph updated with contextConfigId successfully'
          );
        } catch (error) {
          logger.error(
            { graphId: finalGraphId, contextConfigId, error },
            'Failed to update graph with contextConfigId'
          );
          throw error;
        }
      }

      // Step 5: Create/update dataComponents (agents depend on them)
      // Note: DataComponents are now project-scoped and should be created separately
      logger.info({}, 'DataComponents are project-scoped - skipping dataComponent update in graph');
      // Note: ArtifactComponents are now project-scoped and should be created separately
      logger.info(
        {},
        'ArtifactComponents are project-scoped - skipping artifactComponent update in graph'
      );

      // Step 7: Create/update internal agents (now with graphId) with model cascade logic
      const internalAgentPromises = Object.entries(typedGraphDefinition.agents)
        .filter(([_, agentData]) => isInternalAgent(agentData)) // Internal agents have prompt
        .map(async ([agentId, agentData]) => {
          const internalAgent = agentData as InternalAgentDefinition;

          // Get the existing agent to check for inheritance
          let existingAgent = null;
          try {
            existingAgent = await db.query.agents.findFirst({
              where: and(
                eq(agents.id, agentId),
                eq(agents.tenantId, tenantId),
                eq(agents.projectId, projectId)
              ),
              columns: {
                models: true,
              },
            });
          } catch (_error) {
            // Agent might not exist yet, that's ok
          }

          // Determine final model settings with cascade logic
          let finalModelSettings =
            internalAgent.models === undefined ? undefined : internalAgent.models;

          // If graph models changed, cascade to agents that were inheriting
          if (existingAgent?.models && typedGraphDefinition.models) {
            const agentModels = existingAgent.models as any;
            const graphModels = typedGraphDefinition.models;

            // Check each model type for inheritance and cascade if needed
            const modelTypes = ['base', 'structuredOutput', 'summarizer'] as const;
            const cascadedModels: any = { ...finalModelSettings };

            for (const modelType of modelTypes) {
              // If the agent's current model matches the old graph model (was inheriting)
              // and the graph model OR providerOptions have changed, cascade the change
              if (
                agentModels[modelType]?.model &&
                existingGraphModels?.[modelType]?.model &&
                agentModels[modelType].model === existingGraphModels[modelType].model &&
                graphModels[modelType] &&
                // Model name changed
                (graphModels[modelType].model !== existingGraphModels[modelType].model ||
                  // OR providerOptions changed
                  JSON.stringify(graphModels[modelType].providerOptions) !==
                    JSON.stringify(existingGraphModels[modelType].providerOptions))
              ) {
                // Agent was inheriting from graph, cascade the new value (including providerOptions)
                cascadedModels[modelType] = graphModels[modelType];
                logger.info(
                  {
                    agentId,
                    modelType,
                    oldModel: agentModels[modelType].model,
                    newModel: graphModels[modelType].model,
                    hasProviderOptions: !!graphModels[modelType].providerOptions,
                  },
                  'Cascading model change from graph to agent'
                );
              }
            }

            finalModelSettings = cascadedModels;
          }

          try {
            logger.info({ agentId }, 'Processing internal agent');
            await upsertAgent(db)({
              data: {
                id: agentId,
                tenantId,
                projectId,
                graphId: finalGraphId,
                name: internalAgent.name || '',
                description: internalAgent.description || '',
                prompt: internalAgent.prompt || '',
                conversationHistoryConfig: internalAgent.conversationHistoryConfig,
                models: finalModelSettings,
                stopWhen: internalAgent.stopWhen,
              },
            });
            logger.info({ agentId }, 'Internal agent processed successfully');
          } catch (error) {
            logger.error({ agentId, error }, 'Failed to create/update internal agent');
            throw error;
          }
        });

      await Promise.all(internalAgentPromises);
      const internalAgentCount = Object.entries(typedGraphDefinition.agents).filter(
        ([_, agentData]) => isInternalAgent(agentData)
      ).length;
      logger.info({ internalAgentCount }, 'All internal agents created/updated successfully');

      // Step 8: Create/update external agents (now with graphId)
      const externalAgentPromises = Object.entries(typedGraphDefinition.agents)
        .filter(([_, agentData]) => isExternalAgent(agentData)) // External agents have baseUrl
        .map(async ([agentId, agentData]) => {
          // Type assertion since we've filtered for external agents
          const externalAgent = agentData as ExternalAgentApiInsert;
          try {
            logger.info({ agentId }, 'Processing external agent');
            await upsertExternalAgent(db)({
              data: {
                id: agentId,
                tenantId,
                projectId,
                graphId: finalGraphId,
                name: externalAgent.name,
                description: externalAgent.description || '',
                baseUrl: externalAgent.baseUrl,
                credentialReferenceId: externalAgent.credentialReferenceId || undefined,
                headers: externalAgent.headers || undefined,
              },
            });
            logger.info({ agentId }, 'External agent processed successfully');
          } catch (error) {
            logger.error({ agentId, error }, 'Failed to create/update external agent');
            throw error;
          }
        });

      await Promise.all(externalAgentPromises);
      const externalAgentCount = Object.entries(typedGraphDefinition.agents).filter(
        ([_, agentData]) => isExternalAgent(agentData)
      ).length;
      logger.info({ externalAgentCount }, 'All external agents created/updated successfully');

      // Step 8a: Delete agents that are no longer in the graph definition
      const incomingAgentIds = new Set(Object.keys(typedGraphDefinition.agents));

      // Get existing internal agents for this graph
      const existingInternalAgents = await listAgents(db)({
        scopes: { tenantId, projectId, graphId: finalGraphId },
      });

      // Get existing external agents for this graph
      const existingExternalAgents = await listExternalAgents(db)({
        scopes: { tenantId, projectId, graphId: finalGraphId },
      });

      // Delete internal agents not in incoming set
      let deletedInternalCount = 0;
      for (const agent of existingInternalAgents) {
        if (!incomingAgentIds.has(agent.id)) {
          try {
            await deleteAgent(db)({
              scopes: { tenantId, projectId, graphId: finalGraphId },
              agentId: agent.id,
            });
            deletedInternalCount++;
            logger.info({ agentId: agent.id }, 'Deleted orphaned internal agent');
          } catch (error) {
            logger.error({ agentId: agent.id, error }, 'Failed to delete orphaned internal agent');
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
              scopes: { tenantId, projectId, graphId: finalGraphId },
              agentId: agent.id,
            });
            deletedExternalCount++;
            logger.info({ agentId: agent.id }, 'Deleted orphaned external agent');
          } catch (error) {
            logger.error({ agentId: agent.id, error }, 'Failed to delete orphaned external agent');
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
          'Deleted orphaned agents from graph'
        );
      }

      // Step 8: Update the graph metadata
      await updateAgentGraph(db)({
        scopes: { tenantId, projectId, graphId: typedGraphDefinition.id },
        data: {
          name: typedGraphDefinition.name,
          defaultAgentId: typedGraphDefinition.defaultAgentId,
          description: typedGraphDefinition.description,
          contextConfigId: contextConfigId,
          models: typedGraphDefinition.models,
          statusUpdates: typedGraphDefinition.statusUpdates,
          graphPrompt: typedGraphDefinition.graphPrompt,
          stopWhen: typedGraphDefinition.stopWhen,
        },
      });

      logger.info({ graphId: typedGraphDefinition.id }, 'Graph metadata updated');

      // Step 9: Update agent-tool relationships (selective delete and upsert)

      // First, collect all incoming relationshipIds
      const incomingRelationshipIds = new Set<string>();
      for (const [_agentId, agentData] of Object.entries(typedGraphDefinition.agents)) {
        if (isInternalAgent(agentData) && agentData.canUse && Array.isArray(agentData.canUse)) {
          for (const canUseItem of agentData.canUse) {
            if (canUseItem.agentToolRelationId) {
              incomingRelationshipIds.add(canUseItem.agentToolRelationId);
            }
          }
        }
      }

      // Delete relationships that are not in the incoming set (for agents in this graph)
      // Use atomic deletion to avoid race conditions
      for (const agentId of Object.keys(typedGraphDefinition.agents)) {
        try {
          let deletedCount = 0;

          if (incomingRelationshipIds.size === 0) {
            // Delete all relationships for this agent if no incoming IDs
            const result = await db
              .delete(agentToolRelations)
              .where(
                and(
                  eq(agentToolRelations.tenantId, tenantId),
                  eq(agentToolRelations.projectId, projectId),
                  eq(agentToolRelations.graphId, finalGraphId),
                  eq(agentToolRelations.agentId, agentId)
                )
              );
            deletedCount = result.rowsAffected || 0;
          } else {
            // Delete relationships not in the incoming set
            const result = await db
              .delete(agentToolRelations)
              .where(
                and(
                  eq(agentToolRelations.tenantId, tenantId),
                  eq(agentToolRelations.projectId, projectId),
                  eq(agentToolRelations.graphId, finalGraphId),
                  eq(agentToolRelations.agentId, agentId),
                  not(inArray(agentToolRelations.id, Array.from(incomingRelationshipIds)))
                )
              );
            deletedCount = result.rowsAffected || 0;
          }

          if (deletedCount > 0) {
            logger.info({ agentId, deletedCount }, 'Deleted orphaned agent-tool relations');
          }
        } catch (error) {
          logger.error({ agentId, error }, 'Failed to delete orphaned agent-tool relations');
          // Don't throw - allow partial success for relations
        }
      }

      // Then upsert the incoming relationships
      const agentToolPromises: Promise<void>[] = [];

      for (const [agentId, agentData] of Object.entries(typedGraphDefinition.agents)) {
        if (isInternalAgent(agentData) && agentData.canUse && Array.isArray(agentData.canUse)) {
          for (const canUseItem of agentData.canUse) {
            agentToolPromises.push(
              (async () => {
                try {
                  const { toolId, toolSelection, headers, agentToolRelationId } = canUseItem;
                  await upsertAgentToolRelation(db)({
                    scopes: { tenantId, projectId, graphId: finalGraphId },
                    agentId,
                    toolId,
                    selectedTools: toolSelection || undefined,
                    headers: headers || undefined,
                    relationId: agentToolRelationId,
                  });
                  logger.info(
                    { agentId, toolId, relationId: agentToolRelationId },
                    'Agent-tool relation upserted'
                  );
                } catch (error) {
                  logger.error(
                    {
                      agentId,
                      toolId: canUseItem.toolId,
                      relationId: canUseItem.agentToolRelationId,
                      error,
                    },
                    'Failed to upsert agent-tool relation'
                  );
                  // Don't throw - allow partial success for relations
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
      // First, delete existing relationships for all agents in this graph
      for (const agentId of Object.keys(typedGraphDefinition.agents)) {
        await deleteAgentDataComponentRelationByAgent(db)({
          scopes: { tenantId, projectId, graphId: finalGraphId, agentId },
        });
      }

      // Then create new agent-dataComponent relationships
      const agentDataComponentPromises: Promise<void>[] = [];

      for (const [agentId, agentData] of Object.entries(typedGraphDefinition.agents)) {
        if (isInternalAgent(agentData) && agentData.dataComponents) {
          for (const dataComponentId of agentData.dataComponents) {
            agentDataComponentPromises.push(
              (async () => {
                try {
                  await associateDataComponentWithAgent(db)({
                    scopes: { tenantId, projectId, graphId: finalGraphId, agentId },
                    dataComponentId,
                  });

                  logger.info({ agentId, dataComponentId }, 'Agent-dataComponent relation created');
                } catch (error) {
                  logger.error(
                    { agentId, dataComponentId, error },
                    'Failed to create agent-dataComponent relation'
                  );
                  // Don't throw - allow partial success for relations
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
      // First, delete existing relationships for all agents in this graph
      for (const agentId of Object.keys(typedGraphDefinition.agents)) {
        await deleteAgentArtifactComponentRelationByAgent(db)({
          scopes: { tenantId, projectId, graphId: finalGraphId, agentId },
        });
      }

      // Then create new agent-artifactComponent relationships
      const agentArtifactComponentPromises: Promise<void>[] = [];

      for (const [agentId, agentData] of Object.entries(typedGraphDefinition.agents)) {
        if (isInternalAgent(agentData) && agentData.artifactComponents) {
          for (const artifactComponentId of agentData.artifactComponents) {
            agentArtifactComponentPromises.push(
              (async () => {
                try {
                  await associateArtifactComponentWithAgent(db)({
                    scopes: { tenantId, projectId, graphId: finalGraphId, agentId },
                    artifactComponentId,
                  });

                  logger.info(
                    { agentId, artifactComponentId },
                    'Agent-artifactComponent relation created'
                  );
                } catch (error) {
                  logger.error(
                    { agentId, artifactComponentId, error },
                    'Failed to create agent-artifactComponent relation'
                  );
                  // Don't throw - allow partial success for relations
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
      // First, delete existing relationships for this graph
      await deleteAgentRelationsByGraph(db)({
        scopes: { tenantId, projectId, graphId: typedGraphDefinition.id },
      });
      // Then create new relationships
      const agentRelationPromises: Promise<void>[] = [];

      for (const [agentId, agentData] of Object.entries(typedGraphDefinition.agents)) {
        // Create transfer relations
        if (isInternalAgent(agentData) && agentData.canTransferTo) {
          for (const targetAgentId of agentData.canTransferTo) {
            agentRelationPromises.push(
              (async () => {
                try {
                  // Check if the target agent is external by looking it up in the typed.agents
                  const targetAgentData = typedGraphDefinition.agents[targetAgentId];
                  const isTargetExternal = isExternalAgent(targetAgentData);
                  const targetField = isTargetExternal ? 'externalAgentId' : 'targetAgentId';

                  const relationData = {
                    id: nanoid(),
                    graphId: typedGraphDefinition.id || '',
                    sourceAgentId: agentId,
                    relationType: 'transfer',
                    [targetField]: targetAgentId,
                  };

                  await createAgentRelation(db)({
                    tenantId,
                    projectId,
                    ...relationData,
                  });

                  logger.info(
                    { agentId, targetAgentId, isTargetExternal },
                    'Transfer relation created'
                  );
                } catch (error) {
                  logger.error(
                    { agentId, targetAgentId, error },
                    'Failed to create transfer relation'
                  );
                }
              })()
            );
          }
        }

        // Create delegation relations
        if (isInternalAgent(agentData) && agentData.canDelegateTo) {
          for (const targetAgentId of agentData.canDelegateTo) {
            // External agents can't delegate to other agents

            // Check if the target agent is external by looking it up in the typed.agents
            const targetAgentData = typedGraphDefinition.agents[targetAgentId];
            const isTargetExternal = isExternalAgent(targetAgentData);
            const targetField = isTargetExternal ? 'externalAgentId' : 'targetAgentId';

            agentRelationPromises.push(
              (async () => {
                try {
                  const relationData = {
                    id: nanoid(),
                    graphId: typedGraphDefinition.id || '',
                    sourceAgentId: agentId,
                    relationType: 'delegate',
                    [targetField]: targetAgentId,
                  };

                  await createAgentRelation(db)({
                    tenantId,
                    projectId,
                    ...relationData,
                  });

                  logger.info({ agentId, targetAgentId }, 'Delegation relation created');
                } catch (error) {
                  logger.error(
                    { agentId, targetAgentId, error },
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

      // Retrieve and return the updated graph
      const updatedGraph = await getFullGraphDefinition(db)({
        scopes: { tenantId, projectId, graphId: typedGraphDefinition.id },
      });

      if (!updatedGraph) {
        throw new Error('Failed to retrieve updated graph');
      }

      logger.info({ graphId: typedGraphDefinition.id }, 'Full graph updated successfully');

      return updatedGraph;
    } catch (error) {
      logger.error({ graphId: typedGraphDefinition.id, error }, 'Failed to update full graph');
      throw error;
    }
  };

/**
 * Get a complete graph definition by ID
 */
export const getFullGraph =
  (db: DatabaseClient, logger: GraphLogger = defaultLogger) =>
  async (params: { scopes: GraphScopeConfig }): Promise<FullGraphDefinition | null> => {
    const { scopes } = params;
    const { tenantId, projectId } = scopes;

    logger.info({ tenantId, graphId: scopes.graphId }, 'Retrieving full graph definition');

    try {
      const graph = await getFullGraphDefinition(db)({
        scopes: { tenantId, projectId, graphId: scopes.graphId },
      });

      if (!graph) {
        logger.info({ tenantId, graphId: scopes.graphId }, 'Graph not found');
        return null;
      }

      logger.info(
        {
          tenantId,
          graphId: scopes.graphId,
          agentCount: Object.keys(graph.agents).length,
        },
        'Full graph retrieved successfully'
      );

      return graph;
    } catch (error) {
      logger.error(
        {
          tenantId,
          graphId: scopes.graphId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to retrieve full graph'
      );
      throw error;
    }
  };

/**
 * Delete a complete graph and cascade to all related entities
 */
export const deleteFullGraph =
  (db: DatabaseClient, logger: GraphLogger = defaultLogger) =>
  async (params: { scopes: GraphScopeConfig }): Promise<boolean> => {
    const { tenantId, projectId, graphId } = params.scopes;

    logger.info({ tenantId, graphId }, 'Deleting full graph and related entities');

    try {
      // Get the graph first to ensure it exists
      const graph = await getFullGraphDefinition(db)({
        scopes: { tenantId, projectId, graphId },
      });

      if (!graph) {
        logger.info({ tenantId, graphId }, 'Graph not found for deletion');
        return false;
      }

      // Step 1: Delete all agent relations for this graph
      await deleteAgentRelationsByGraph(db)({
        scopes: { tenantId, projectId, graphId },
      });
      logger.info({ tenantId, graphId }, 'Agent relations deleted');

      // Step 2: Delete agent-tool relations for agents in this graph
      const agentIds = Object.keys(graph.agents);
      if (agentIds.length > 0) {
        // Delete agent-tool relations for all agents in this graph
        for (const agentId of agentIds) {
          await deleteAgentToolRelationByAgent(db)({
            scopes: { tenantId, projectId, graphId, agentId },
          });
        }

        logger.info(
          { tenantId, graphId, agentCount: agentIds.length },
          'Agent-tool relations deleted'
        );
      }

      // Step 3: Delete the graph metadata
      await deleteAgentGraph(db)({
        scopes: { tenantId, projectId, graphId },
      });

      logger.info({ tenantId, graphId }, 'Graph metadata deleted');

      // Note: We don't delete agents or tools themselves as they might be used in other graphs
      // Only relationships specific to this graph are deleted

      logger.info({ tenantId, graphId }, 'Full graph deleted successfully');

      return true;
    } catch (error) {
      logger.error(
        {
          tenantId,
          graphId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to delete full graph'
      );
      throw error;
    }
  };
