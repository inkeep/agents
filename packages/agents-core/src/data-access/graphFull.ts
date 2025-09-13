import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import { agents, projects } from '../db/schema';
import type {
  AgentDefinition,
  ExternalAgentApiInsert,
  FullGraphDefinition,
  InternalAgentDefinition,
} from '../types/entities';
import type { ScopeConfig } from '../types/utility';
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
  createAgentToolRelation,
  deleteAgentRelationsByGraph,
  deleteAgentToolRelationByAgent,
  upsertAgentRelation,
} from './agentRelations';
import { upsertAgent } from './agents';
import {
  associateArtifactComponentWithAgent,
  deleteAgentArtifactComponentRelationByAgent,
  upsertAgentArtifactComponentRelation,
  upsertArtifactComponent,
} from './artifactComponents';
import { upsertContextConfig } from './contextConfigs';
import { upsertCredentialReference } from './credentialReferences';
import {
  associateDataComponentWithAgent,
  deleteAgentDataComponentRelationByAgent,
  upsertAgentDataComponentRelation,
  upsertDataComponent,
} from './dataComponents';
import { upsertExternalAgent } from './externalAgents';
import { upsertAgentToolRelation, upsertTool } from './tools';

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
  scopes: ScopeConfig,
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
  async (scopes: ScopeConfig, graphData: FullGraphDefinition): Promise<FullGraphDefinition> => {
    const { tenantId, projectId } = scopes;

    const typed = validateAndTypeGraphData(graphData);

    // Validate the graph structure
    validateGraphStructure(typed);

    // Apply inheritance logic for execution limits
    await applyExecutionLimitsInheritance(db, logger, { tenantId, projectId }, typed);

    try {
      // Step 1: Create/update credential references first (tools and context configs depend on them)
      if (typed.credentialReferences && Object.keys(typed.credentialReferences).length > 0) {
        logger.info(
          { credentialReferencesCount: Object.keys(typed.credentialReferences).length },
          'Processing credential references'
        );
        const credentialRefPromises = Object.entries(typed.credentialReferences).map(
          async ([_credId, credData]) => {
            try {
              logger.info({ credId: credData.id }, 'Processing credential reference');
              await upsertCredentialReference(db)({
                data: {
                  ...credData,
                  tenantId,
                  projectId,
                },
              });
              logger.info({ credId: credData.id }, 'Credential reference processed successfully');
            } catch (error) {
              logger.error(
                { credId: credData.id, error },
                'Failed to create/update credential reference'
              );
              throw error;
            }
          }
        );

        await Promise.all(credentialRefPromises);
        logger.info(
          { credentialReferencesCount: Object.keys(typed.credentialReferences).length },
          'All credential references created/updated successfully'
        );
      }

      // Step 2: Create/update tools (agents depend on them)
      const toolPromises = Object.entries(typed.tools || {}).map(async ([toolId, toolData]) => {
        try {
          logger.info({ toolId }, 'Processing tool');
          await upsertTool(db)({
            data: {
              tenantId,
              projectId,
              ...toolData,
            },
          });
          logger.info({ toolId }, 'Tool processed successfully');
        } catch (error) {
          logger.error({ toolId, error }, 'Failed to create/update tool');
          throw error;
        }
      });

      await Promise.all(toolPromises);
      logger.info(
        { toolCount: Object.keys(typed.tools || {}).length },
        'All tools created/updated successfully'
      );

      // Step 3: create/update context config
      let contextConfigId: string | undefined;
      if (typed.contextConfig) {
        try {
          logger.info({ contextConfigId: typed.contextConfig.id }, 'Processing context config');
          const contextConfig = await upsertContextConfig(db)({
            data: {
              ...typed.contextConfig,
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

      // Step 4: Create/update dataComponents (agents depend on them)
      if (typed.dataComponents && Object.keys(typed.dataComponents).length > 0) {
        const dataComponentPromises = Object.entries(typed.dataComponents).map(
          async ([dataComponentId, dataComponentData]) => {
            try {
              logger.info({ dataComponentId }, 'Processing data component');
              await upsertDataComponent(db)({
                data: {
                  id: dataComponentId,
                  tenantId,
                  projectId,
                  name: dataComponentData.name,
                  description: dataComponentData.description || '',
                  props: dataComponentData.props || {},
                },
              });
              logger.info({ dataComponentId }, 'Data component processed successfully');
            } catch (error) {
              logger.error({ dataComponentId, error }, 'Failed to create/update dataComponent');
              throw error;
            }
          }
        );

        await Promise.all(dataComponentPromises);
        logger.info(
          { dataComponentCount: Object.keys(typed.dataComponents).length },
          'All dataComponents created/updated successfully'
        );
      }

      // Step 5: Create/update artifactComponents (agents depend on them)
      if (typed.artifactComponents && Object.keys(typed.artifactComponents).length > 0) {
        const artifactComponentPromises = Object.entries(typed.artifactComponents).map(
          async ([artifactComponentId, artifactComponentData]) => {
            try {
              logger.info({ artifactComponentId }, 'Processing artifact component');
              await upsertArtifactComponent(db)({
                data: {
                  id: artifactComponentId,
                  tenantId,
                  projectId,
                  name: artifactComponentData.name,
                  description: artifactComponentData.description || '',
                  summaryProps: artifactComponentData.summaryProps || {},
                  fullProps: artifactComponentData.fullProps || {},
                },
              });
              logger.info({ artifactComponentId }, 'Artifact component processed successfully');
            } catch (error) {
              logger.error(
                { artifactComponentId, error },
                'Failed to create/update artifactComponent'
              );
              throw error;
            }
          }
        );

        await Promise.all(artifactComponentPromises);
        logger.info(
          { artifactComponentCount: Object.keys(typed.artifactComponents).length },
          'All artifactComponents created/updated successfully'
        );
      }

      // Step 6: Create/update internal agents
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

      // Step 7: Create/update external agents
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

      // Step 8: Create the graph metadata (or update if exists for upsert behavior)
      let finalGraphId: string;
      try {
        logger.info({ graphId: typed.id }, 'Processing agent graph metadata');
        const agentGraph = await upsertAgentGraph(db)({
          data: {
            id: typed.id || nanoid(),
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
        finalGraphId = agentGraph.id;
        logger.info({ graphId: finalGraphId }, 'Agent graph metadata processed successfully');
      } catch (error) {
        logger.error({ graphId: typed.id, error }, 'Failed to create/update graph metadata');
        throw error;
      }

      // Step 9: Create agent-tool relationships
      const agentToolPromises: Promise<void>[] = [];

      for (const [agentId, agentData] of Object.entries(typed.agents)) {
        if (isInternalAgent(agentData) && agentData.tools && Array.isArray(agentData.tools)) {
          for (const toolId of agentData.tools) {
            agentToolPromises.push(
              (async () => {
                try {
                  const selectedTools = agentData.selectedTools?.[toolId];
                  logger.info({ agentId, toolId }, 'Processing agent-tool relation');
                  await upsertAgentToolRelation(db)({
                    scopes: { tenantId, projectId },
                    agentId,
                    toolId,
                    selectedTools,
                  });
                  logger.info({ agentId, toolId }, 'Agent-tool relation processed successfully');
                } catch (error) {
                  logger.error({ agentId, toolId, error }, 'Failed to create agent-tool relation');
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
                    scopes: { tenantId, projectId },
                    agentId,
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
                    scopes: { tenantId, projectId },
                    agentId,
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
        scopes: { tenantId, projectId },
        graphId: finalGraphId,
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
  async (scopes: ScopeConfig, graphData: FullGraphDefinition): Promise<FullGraphDefinition> => {
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
        toolCount: Object.keys(typedGraphDefinition.tools || {}).length,
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
        scopes: { tenantId, projectId },
        graphId: typedGraphDefinition.id,
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

      // Step 1: Create/update credential references first (tools and context configs depend on them)
      if (
        typedGraphDefinition.credentialReferences &&
        Object.keys(typedGraphDefinition.credentialReferences).length > 0
      ) {
        logger.info(
          {
            credentialReferencesCount: Object.keys(typedGraphDefinition.credentialReferences)
              .length,
          },
          'Processing credential references'
        );
        const credentialRefPromises = Object.entries(typedGraphDefinition.credentialReferences).map(
          async ([_credId, credData]) => {
            try {
              logger.info({ credId: credData.id }, 'Processing credential reference');
              await upsertCredentialReference(db)({
                data: {
                  ...credData,
                  tenantId,
                  projectId,
                },
              });
              logger.info({ credId: credData.id }, 'Credential reference processed successfully');
            } catch (error) {
              logger.error(
                { credId: credData.id, error },
                'Failed to create/update credential reference'
              );
              throw error;
            }
          }
        );

        await Promise.all(credentialRefPromises);
        logger.info(
          {
            credentialReferencesCount: Object.keys(typedGraphDefinition.credentialReferences)
              .length,
          },
          'All credential references created/updated successfully'
        );
      }

      // Step 2: Create/update tools (agents depend on them)
      const toolPromises = Object.entries(typedGraphDefinition.tools || {}).map(
        async ([toolId, toolData]) => {
          try {
            logger.info({ toolId }, 'Processing tool');
            await upsertTool(db)({
              data: {
                tenantId,
                projectId,
                ...toolData,
              },
            });
            logger.info({ toolId }, 'Tool processed successfully');
          } catch (error) {
            logger.error({ toolId, error }, 'Failed to create/update tool');
            throw error;
          }
        }
      );

      await Promise.all(toolPromises);
      logger.info(
        { toolCount: Object.keys(typedGraphDefinition.tools || {}).length },
        'All tools created/updated successfully'
      );

      // Step 3: create/update context config
      let contextConfigId: string | undefined;
      if (typedGraphDefinition.contextConfig) {
        try {
          logger.info(
            { contextConfigId: typedGraphDefinition.contextConfig.id },
            'Processing context config'
          );
          const contextConfig = await upsertContextConfig(db)({
            data: {
              ...typedGraphDefinition.contextConfig,
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

      // Step 4: Create/update dataComponents (agents depend on them)
      if (
        typedGraphDefinition.dataComponents &&
        Object.keys(typedGraphDefinition.dataComponents).length > 0
      ) {
        const dataComponentPromises = Object.entries(typedGraphDefinition.dataComponents).map(
          async ([dataComponentId, dataComponentData]) => {
            try {
              logger.info({ dataComponentId }, 'Processing data component');
              await upsertDataComponent(db)({
                data: {
                  id: dataComponentId,
                  tenantId,
                  projectId,
                  name: dataComponentData.name,
                  description: dataComponentData.description || '',
                  props: dataComponentData.props || {},
                },
              });
              logger.info({ dataComponentId }, 'Data component processed successfully');
            } catch (error) {
              logger.error({ dataComponentId, error }, 'Failed to create/update dataComponent');
              throw error;
            }
          }
        );

        await Promise.all(dataComponentPromises);
        logger.info(
          { dataComponentCount: Object.keys(typedGraphDefinition.dataComponents).length },
          'All dataComponents created/updated successfully'
        );
      }
      // Step 5: Create/update artifactComponents (agents depend on them)
      if (
        typedGraphDefinition.artifactComponents &&
        Object.keys(typedGraphDefinition.artifactComponents).length > 0
      ) {
        const artifactComponentPromises = Object.entries(
          typedGraphDefinition.artifactComponents
        ).map(async ([artifactComponentId, artifactComponentData]) => {
          try {
            logger.info({ artifactComponentId }, 'Processing artifact component');
            await upsertArtifactComponent(db)({
              data: {
                id: artifactComponentId,
                tenantId,
                projectId,
                name: artifactComponentData.name,
                description: artifactComponentData.description || '',
                summaryProps: artifactComponentData.summaryProps || {},
                fullProps: artifactComponentData.fullProps || {},
              },
            });
            logger.info({ artifactComponentId }, 'Artifact component processed successfully');
          } catch (error) {
            logger.error(
              { artifactComponentId, error },
              'Failed to create/update artifactComponent'
            );
            throw error;
          }
        });

        await Promise.all(artifactComponentPromises);
        logger.info(
          { artifactComponentCount: Object.keys(typedGraphDefinition.artifactComponents).length },
          'All artifactComponents created/updated successfully'
        );
      }

      // Step 6: Create/update internal agents with model cascade logic
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
              // and the graph model has changed, cascade the change
              if (
                agentModels[modelType]?.model &&
                existingGraphModels?.[modelType]?.model &&
                agentModels[modelType].model === existingGraphModels[modelType].model &&
                graphModels[modelType]?.model &&
                graphModels[modelType].model !== existingGraphModels[modelType].model
              ) {
                // Agent was inheriting from graph, cascade the new value
                cascadedModels[modelType] = {
                  ...cascadedModels[modelType],
                  model: graphModels[modelType].model,
                };
                logger.info(
                  {
                    agentId,
                    modelType,
                    oldModel: agentModels[modelType].model,
                    newModel: graphModels[modelType].model,
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

      // Step 7: Create/update external agents
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

      // Step 8: Update the graph metadata
      await updateAgentGraph(db)({
        scopes: { tenantId, projectId },
        graphId: typedGraphDefinition.id,
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

      // Step 9: Clear and recreate agent-tool relationships
      // First, delete existing relationships for all agents in this graph
      for (const agentId of Object.keys(typedGraphDefinition.agents)) {
        await deleteAgentToolRelationByAgent(db)({
          scopes: { tenantId, projectId },
          agentId,
        });
      }

      // Then create new relationships
      const agentToolPromises: Promise<void>[] = [];

      for (const [agentId, agentData] of Object.entries(typedGraphDefinition.agents)) {
        if (isInternalAgent(agentData) && agentData.tools && Array.isArray(agentData.tools)) {
          for (const toolId of agentData.tools) {
            agentToolPromises.push(
              (async () => {
                try {
                  const selectedTools = agentData.selectedTools?.[toolId];
                  await createAgentToolRelation(db)({
                    scopes: { tenantId, projectId },
                    data: {
                      agentId,
                      toolId,
                      selectedTools,
                    },
                  });

                  logger.info({ agentId, toolId }, 'Agent-tool relation created');
                } catch (error) {
                  logger.error({ agentId, toolId, error }, 'Failed to create agent-tool relation');
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
          scopes: { tenantId, projectId },
          agentId,
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
                    scopes: { tenantId, projectId },
                    agentId,
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
          scopes: { tenantId, projectId },
          agentId,
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
                    scopes: { tenantId, projectId },
                    agentId,
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
        scopes: { tenantId, projectId },
        graphId: typedGraphDefinition.id,
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
        scopes: { tenantId, projectId },
        graphId: typedGraphDefinition.id,
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
  async (params: { scopes: ScopeConfig; graphId: string }): Promise<FullGraphDefinition | null> => {
    const { scopes, graphId } = params;
    const { tenantId, projectId } = scopes;

    logger.info({ tenantId, graphId }, 'Retrieving full graph definition');

    try {
      const graph = await getFullGraphDefinition(db)({
        scopes: { tenantId, projectId },
        graphId,
      });

      if (!graph) {
        logger.info({ tenantId, graphId }, 'Graph not found');
        return null;
      }

      logger.info(
        {
          tenantId,
          graphId,
          agentCount: Object.keys(graph.agents).length,
        },
        'Full graph retrieved successfully'
      );

      return graph;
    } catch (error) {
      logger.error(
        {
          tenantId,
          graphId,
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
  async (params: { scopes: ScopeConfig; graphId: string }): Promise<boolean> => {
    const { scopes, graphId } = params;
    const { tenantId, projectId } = scopes;

    logger.info({ tenantId, graphId }, 'Deleting full graph and related entities');

    try {
      // Get the graph first to ensure it exists
      const graph = await getFullGraphDefinition(db)({
        scopes: { tenantId, projectId },
        graphId,
      });

      if (!graph) {
        logger.info({ tenantId, graphId }, 'Graph not found for deletion');
        return false;
      }

      // Step 1: Delete all agent relations for this graph
      await deleteAgentRelationsByGraph(db)({
        scopes: { tenantId, projectId },
        graphId,
      });
      logger.info({ tenantId, graphId }, 'Agent relations deleted');

      // Step 2: Delete agent-tool relations for agents in this graph
      const agentIds = Object.keys(graph.agents);
      if (agentIds.length > 0) {
        // Delete agent-tool relations for all agents in this graph
        for (const agentId of agentIds) {
          await deleteAgentToolRelationByAgent(db)({
            scopes: { tenantId, projectId },
            agentId,
          });
        }

        logger.info(
          { tenantId, graphId, agentCount: agentIds.length },
          'Agent-tool relations deleted'
        );
      }

      // Step 3: Delete the graph metadata
      await deleteAgentGraph(db)({
        scopes: { tenantId, projectId },
        graphId,
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
