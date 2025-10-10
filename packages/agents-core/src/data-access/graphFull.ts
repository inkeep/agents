import { and, eq, inArray, not } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import { projects, subAgents, subAgentToolRelations } from '../db/schema';
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
  deleteAgentRelationsByGraph,
  deleteAgentToolRelationByAgent,
  upsertAgentRelation,
} from './subAgentRelations';
import { deleteSubAgent, listSubAgents, upsertSubAgent } from './subAgents';
import { upsertSubAgentToolRelation } from './tools';

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

      for (const [subAgentId, agentData] of Object.entries(graphData.subAgents)) {
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

      // Note: MCP Tools are now project-scoped and should be created separately
      logger.info({}, 'MCP Tools are project-scoped - skipping tool creation in graph');

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
            defaultSubAgentId: typed.defaultSubAgentId,
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
              defaultSubAgentId: typed.defaultSubAgentId,
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

      // Step 6: Create functions (project-scoped) - must be created before function tools
      if (typed.functions && Object.keys(typed.functions).length > 0) {
        logger.info(
          {
            graphId: finalGraphId,
            functionCount: Object.keys(typed.functions).length,
          },
          'Creating functions for graph'
        );

        const functionPromises = Object.entries(typed.functions).map(
          async ([functionId, functionData]) => {
            try {
              logger.info({ graphId: finalGraphId, functionId }, 'Creating function for graph');
              await upsertFunction(db)({
                data: {
                  ...functionData,
                  id: functionId,
                },
                scopes: { tenantId, projectId },
              });
              logger.info({ graphId: finalGraphId, functionId }, 'Function created successfully');
            } catch (error) {
              logger.error(
                { graphId: finalGraphId, functionId, error },
                'Failed to create function for graph'
              );
              throw error;
            }
          }
        );

        await Promise.all(functionPromises);
        logger.info(
          {
            graphId: finalGraphId,
            functionCount: Object.keys(typed.functions).length,
          },
          'All functions created successfully'
        );
      }

      // Step 7: Create function tools (graph-scoped)
      if (typed.functionTools && Object.keys(typed.functionTools).length > 0) {
        logger.info(
          {
            graphId: finalGraphId,
            functionToolCount: Object.keys(typed.functionTools).length,
          },
          'Creating function tools for graph'
        );

        const functionToolPromises = Object.entries(typed.functionTools).map(
          async ([functionToolId, functionToolData]) => {
            try {
              logger.info(
                { graphId: finalGraphId, functionToolId },
                'Creating function tool in graph'
              );
              await upsertFunctionTool(db)({
                data: {
                  ...functionToolData,
                  id: functionToolId,
                },
                scopes: { tenantId, projectId, graphId: finalGraphId },
              });
              logger.info(
                { graphId: finalGraphId, functionToolId },
                'Function tool created successfully'
              );
            } catch (error) {
              logger.error(
                { graphId: finalGraphId, functionToolId, error },
                'Failed to create function tool in graph'
              );
              throw error;
            }
          }
        );

        await Promise.all(functionToolPromises);
        logger.info(
          {
            graphId: finalGraphId,
            functionToolCount: Object.keys(typed.functionTools).length,
          },
          'All function tools created successfully'
        );
      }

      // Step 7: Create/update internal agents (now with graphId)
      const internalAgentPromises = Object.entries(typed.subAgents)
        .filter(([_, agentData]) => isInternalAgent(agentData)) // Internal agents have prompt
        .map(async ([subAgentId, agentData]) => {
          // Type assertion since we've filtered for internal agents
          const internalAgent = agentData as InternalAgentDefinition;
          try {
            logger.info({ subAgentId }, 'Processing internal agent');
            await upsertSubAgent(db)({
              data: {
                id: subAgentId,
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

      // Step 8: Create/update external agents (now with graphId)
      const externalAgentPromises = Object.entries(typed.subAgents)
        .filter(([_, agentData]) => isExternalAgent(agentData)) // External agents have baseUrl
        .map(async ([subAgentId, agentData]) => {
          // Type assertion since we've filtered for external agents
          const externalAgent = agentData as ExternalAgentApiInsert;
          try {
            logger.info({ subAgentId }, 'Processing external agent');
            await upsertExternalAgent(db)({
              data: {
                id: subAgentId,
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

      // Step 10: Create agent-tool relationships (both MCP tools and function tools)
      const agentToolPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typed.subAgents)) {
        if (isInternalAgent(agentData) && agentData.canUse && Array.isArray(agentData.canUse)) {
          for (const canUseItem of agentData.canUse) {
            agentToolPromises.push(
              (async () => {
                try {
                  const { toolId, toolSelection, headers, agentToolRelationId } = canUseItem;
                  // Check if this is a function tool or MCP tool
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
                    // Create agent-function tool relation
                    logger.info({ subAgentId, toolId }, 'Processing agent-function tool relation');
                    await upsertSubAgentFunctionToolRelation(db)({
                      scopes: { tenantId, projectId, graphId: finalGraphId },
                      subAgentId,
                      functionToolId: toolId,
                      relationId: agentToolRelationId,
                    });
                    logger.info(
                      { subAgentId, toolId },
                      'Agent-function tool relation processed successfully'
                    );
                  } else {
                    // Create agent-MCP tool relation
                    logger.info({ subAgentId, toolId }, 'Processing agent-MCP tool relation');
                    await upsertSubAgentToolRelation(db)({
                      scopes: { tenantId, projectId, graphId: finalGraphId },
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
                  // Don't throw - allow partial success for relations
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

      // Step 10: Create agent-dataComponent relationships
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
                    scopes: { tenantId, projectId, graphId: finalGraphId, subAgentId: subAgentId },
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
                    scopes: { tenantId, projectId, graphId: finalGraphId, subAgentId: subAgentId },
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

      for (const [subAgentId, agentData] of Object.entries(typed.subAgents)) {
        // Create transfer relations
        if (isInternalAgent(agentData) && agentData.canTransferTo) {
          for (const targetSubAgentId of agentData.canTransferTo) {
            agentRelationPromises.push(
              (async () => {
                try {
                  logger.info(
                    { subAgentId, targetSubAgentId, type: 'transfer' },
                    'Processing agent transfer relation'
                  );
                  await upsertAgentRelation(db)({
                    id: nanoid(),
                    tenantId,
                    projectId,
                    graphId: finalGraphId,
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

        // Create delegation relations
        if (isInternalAgent(agentData) && agentData.canDelegateTo) {
          for (const targetSubAgentId of agentData.canDelegateTo) {
            // Check if the target agent is external by looking it up in the typed.agents
            const targetAgentData = typed.subAgents[targetSubAgentId];
            const isTargetExternal = isExternalAgent(targetAgentData);

            agentRelationPromises.push(
              (async () => {
                try {
                  logger.info(
                    { subAgentId, targetSubAgentId, type: 'delegate' },
                    'Processing agent delegation relation'
                  );
                  await upsertAgentRelation(db)({
                    id: nanoid(),
                    tenantId,
                    projectId,
                    graphId: finalGraphId,
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
        agentCount: Object.keys(typedGraphDefinition.subAgents).length,
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
        return createFullGraphServerSide(db, logger)(scopes, graphData);
      }

      // Store existing graph models for cascade comparison
      const existingGraphModels = existingGraph.models;

      // Note: CredentialReferences are now project-scoped and should be created separately
      logger.info(
        {},
        'CredentialReferences are project-scoped - skipping credential reference update in graph'
      );

      // Step 2: Create/update tools (agents depend on them)
      // Note: MCP Tools are now project-scoped and should be created separately
      logger.info({}, 'MCP Tools are project-scoped - skipping tool creation in graph update');

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
            defaultSubAgentId: typedGraphDefinition.defaultSubAgentId,
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
              defaultSubAgentId: typedGraphDefinition.defaultSubAgentId,
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

      // Step 6: Create/update functions (project-scoped) - must be updated before function tools
      if (
        typedGraphDefinition.functions &&
        Object.keys(typedGraphDefinition.functions).length > 0
      ) {
        logger.info(
          {
            graphId: finalGraphId,
            functionCount: Object.keys(typedGraphDefinition.functions).length,
          },
          'Updating functions for graph'
        );

        const functionPromises = Object.entries(typedGraphDefinition.functions).map(
          async ([functionId, functionData]) => {
            try {
              logger.info({ graphId: finalGraphId, functionId }, 'Updating function for graph');
              await upsertFunction(db)({
                data: {
                  ...functionData,
                  id: functionId,
                },
                scopes: { tenantId, projectId },
              });
              logger.info({ graphId: finalGraphId, functionId }, 'Function updated successfully');
            } catch (error) {
              logger.error(
                { graphId: finalGraphId, functionId, error },
                'Failed to update function for graph'
              );
              throw error;
            }
          }
        );

        await Promise.all(functionPromises);
        logger.info(
          {
            graphId: finalGraphId,
            functionCount: Object.keys(typedGraphDefinition.functions).length,
          },
          'All functions updated successfully'
        );
      }

      // Step 7: Create/update function tools (graph-scoped)
      if (
        typedGraphDefinition.functionTools &&
        Object.keys(typedGraphDefinition.functionTools).length > 0
      ) {
        logger.info(
          {
            graphId: finalGraphId,
            functionToolCount: Object.keys(typedGraphDefinition.functionTools).length,
          },
          'Updating function tools for graph'
        );

        const functionToolPromises = Object.entries(typedGraphDefinition.functionTools).map(
          async ([functionToolId, functionToolData]) => {
            try {
              logger.info(
                { graphId: finalGraphId, functionToolId },
                'Updating function tool in graph'
              );
              await upsertFunctionTool(db)({
                data: {
                  ...functionToolData,
                  id: functionToolId,
                },
                scopes: { tenantId, projectId, graphId: finalGraphId },
              });
              logger.info(
                { graphId: finalGraphId, functionToolId },
                'Function tool updated successfully'
              );
            } catch (error) {
              logger.error(
                { graphId: finalGraphId, functionToolId, error },
                'Failed to update function tool in graph'
              );
              throw error;
            }
          }
        );

        await Promise.all(functionToolPromises);
        logger.info(
          {
            graphId: finalGraphId,
            functionToolCount: Object.keys(typedGraphDefinition.functionTools).length,
          },
          'All function tools updated successfully'
        );
      }

      // Step 7: Create/update internal agents (now with graphId) with model cascade logic
      const internalAgentPromises = Object.entries(typedGraphDefinition.subAgents)
        .filter(([_, agentData]) => isInternalAgent(agentData)) // Internal agents have prompt
        .map(async ([subAgentId, agentData]) => {
          const internalAgent = agentData as InternalAgentDefinition;

          // Get the existing agent to check for inheritance
          let existingAgent = null;
          try {
            existingAgent = await db.query.subAgents.findFirst({
              where: and(
                eq(subAgents.id, subAgentId),
                eq(subAgents.tenantId, tenantId),
                eq(subAgents.projectId, projectId)
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
                    subAgentId,
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
            logger.info({ subAgentId }, 'Processing internal agent');
            await upsertSubAgent(db)({
              data: {
                id: subAgentId,
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
            logger.info({ subAgentId }, 'Internal agent processed successfully');
          } catch (error) {
            logger.error({ subAgentId, error }, 'Failed to create/update internal agent');
            throw error;
          }
        });

      await Promise.all(internalAgentPromises);
      const internalAgentCount = Object.entries(typedGraphDefinition.subAgents).filter(
        ([_, agentData]) => isInternalAgent(agentData)
      ).length;
      logger.info({ internalAgentCount }, 'All internal agents created/updated successfully');

      // Step 8: Create/update external agents (now with graphId)
      const externalAgentPromises = Object.entries(typedGraphDefinition.subAgents)
        .filter(([_, agentData]) => isExternalAgent(agentData)) // External agents have baseUrl
        .map(async ([subAgentId, agentData]) => {
          // Type assertion since we've filtered for external agents
          const externalAgent = agentData as ExternalAgentApiInsert;
          try {
            logger.info({ subAgentId }, 'Processing external agent');
            await upsertExternalAgent(db)({
              data: {
                id: subAgentId,
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
            logger.info({ subAgentId }, 'External agent processed successfully');
          } catch (error) {
            logger.error({ subAgentId, error }, 'Failed to create/update external agent');
            throw error;
          }
        });

      await Promise.all(externalAgentPromises);
      const externalAgentCount = Object.entries(typedGraphDefinition.subAgents).filter(
        ([_, agentData]) => isExternalAgent(agentData)
      ).length;
      logger.info({ externalAgentCount }, 'All external agents created/updated successfully');

      // Step 8a: Delete agents that are no longer in the graph definition
      const incomingAgentIds = new Set(Object.keys(typedGraphDefinition.subAgents));

      // Get existing internal agents for this graph
      const existingInternalAgents = await listSubAgents(db)({
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
            await deleteSubAgent(db)({
              scopes: { tenantId, projectId, graphId: finalGraphId },
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
              scopes: { tenantId, projectId, graphId: finalGraphId },
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
          'Deleted orphaned agents from graph'
        );
      }

      // Step 8: Update the graph metadata
      await updateAgentGraph(db)({
        scopes: { tenantId, projectId, graphId: typedGraphDefinition.id },
        data: {
          name: typedGraphDefinition.name,
          defaultSubAgentId: typedGraphDefinition.defaultSubAgentId,
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
      for (const [_subAgentId, agentData] of Object.entries(typedGraphDefinition.subAgents)) {
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
      for (const subAgentId of Object.keys(typedGraphDefinition.subAgents)) {
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
                  eq(subAgentToolRelations.graphId, finalGraphId),
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
                  eq(subAgentToolRelations.graphId, finalGraphId),
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
          // Don't throw - allow partial success for relations
        }
      }

      // Then upsert the incoming relationships
      const agentToolPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typedGraphDefinition.subAgents)) {
        if (isInternalAgent(agentData) && agentData.canUse && Array.isArray(agentData.canUse)) {
          for (const canUseItem of agentData.canUse) {
            agentToolPromises.push(
              (async () => {
                try {
                  const { toolId, toolSelection, headers, agentToolRelationId } = canUseItem;

                  // Check if this is a function tool or MCP tool
                  const isFunctionTool =
                    typedGraphDefinition.functionTools &&
                    toolId in typedGraphDefinition.functionTools;

                  if (isFunctionTool) {
                    // Create agent-function tool relation
                    logger.info({ subAgentId, toolId }, 'Processing agent-function tool relation');
                    await upsertSubAgentFunctionToolRelation(db)({
                      scopes: { tenantId, projectId, graphId: finalGraphId },
                      subAgentId,
                      functionToolId: toolId,
                      relationId: agentToolRelationId,
                    });
                    logger.info(
                      { subAgentId, toolId, relationId: agentToolRelationId },
                      'Agent-function tool relation upserted'
                    );
                  } else {
                    // Create agent-MCP tool relation
                    logger.info({ subAgentId, toolId }, 'Processing agent-MCP tool relation');
                    await upsertSubAgentToolRelation(db)({
                      scopes: { tenantId, projectId, graphId: finalGraphId },
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
      for (const subAgentId of Object.keys(typedGraphDefinition.subAgents)) {
        await deleteAgentDataComponentRelationByAgent(db)({
          scopes: { tenantId, projectId, graphId: finalGraphId, subAgentId: subAgentId },
        });
      }

      // Then create new agent-dataComponent relationships
      const agentDataComponentPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typedGraphDefinition.subAgents)) {
        if (isInternalAgent(agentData) && agentData.dataComponents) {
          for (const dataComponentId of agentData.dataComponents) {
            agentDataComponentPromises.push(
              (async () => {
                try {
                  await associateDataComponentWithAgent(db)({
                    scopes: { tenantId, projectId, graphId: finalGraphId, subAgentId: subAgentId },
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
      for (const subAgentId of Object.keys(typedGraphDefinition.subAgents)) {
        await deleteAgentArtifactComponentRelationByAgent(db)({
          scopes: { tenantId, projectId, graphId: finalGraphId, subAgentId: subAgentId },
        });
      }

      // Then create new agent-artifactComponent relationships
      const agentArtifactComponentPromises: Promise<void>[] = [];

      for (const [subAgentId, agentData] of Object.entries(typedGraphDefinition.subAgents)) {
        if (isInternalAgent(agentData) && agentData.artifactComponents) {
          for (const artifactComponentId of agentData.artifactComponents) {
            agentArtifactComponentPromises.push(
              (async () => {
                try {
                  await associateArtifactComponentWithAgent(db)({
                    scopes: { tenantId, projectId, graphId: finalGraphId, subAgentId: subAgentId },
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

      for (const [subAgentId, agentData] of Object.entries(typedGraphDefinition.subAgents)) {
        // Create transfer relations
        if (isInternalAgent(agentData) && agentData.canTransferTo) {
          for (const targetSubAgentId of agentData.canTransferTo) {
            agentRelationPromises.push(
              (async () => {
                try {
                  // Check if the target agent is external by looking it up in the typed.agents
                  const targetAgentData = typedGraphDefinition.subAgents[targetSubAgentId];
                  const isTargetExternal = isExternalAgent(targetAgentData);
                  const targetField = isTargetExternal ? 'externalSubAgentId' : 'targetSubAgentId';

                  const relationData = {
                    id: nanoid(),
                    graphId: typedGraphDefinition.id || '',
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

        // Create delegation relations
        if (isInternalAgent(agentData) && agentData.canDelegateTo) {
          for (const targetSubAgentId of agentData.canDelegateTo) {
            // External agents can't delegate to other agents

            // Check if the target agent is external by looking it up in the typed.agents
            const targetAgentData = typedGraphDefinition.subAgents[targetSubAgentId];
            const isTargetExternal = isExternalAgent(targetAgentData);
            const targetField = isTargetExternal ? 'externalSubAgentId' : 'targetSubAgentId';

            agentRelationPromises.push(
              (async () => {
                try {
                  const relationData = {
                    id: nanoid(),
                    graphId: typedGraphDefinition.id || '',
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
          agentCount: Object.keys(graph.subAgents).length,
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
      const subAgentIds = Object.keys(graph.subAgents);
      if (subAgentIds.length > 0) {
        // Delete agent-tool relations for all agents in this graph
        for (const subAgentId of subAgentIds) {
          await deleteAgentToolRelationByAgent(db)({
            scopes: { tenantId, projectId, graphId, subAgentId: subAgentId },
          });
        }

        logger.info(
          { tenantId, graphId, agentCount: subAgentIds.length },
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
