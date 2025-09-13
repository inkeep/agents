/**
 * Server-side data access layer for Full Project operations.
 * This module provides functions for creating, retrieving, updating, and deleting
 * complete project definitions with all nested resources (graphs, agents, tools, etc.).
 */

import type { DatabaseClient } from '../db/client';
import type { FullProjectDefinition, ProjectSelect } from '../types/entities';
import type { ScopeConfig } from '../types/utility';
import { getLogger } from '../utils/logger';
import { listAgentGraphs } from './agentGraphs';
import { listArtifactComponents, upsertArtifactComponent } from './artifactComponents';
import { listContextConfigs, upsertContextConfig } from './contextConfigs';
import { listCredentialReferences, upsertCredentialReference } from './credentialReferences';
import { listDataComponents, upsertDataComponent } from './dataComponents';
import {
  createFullGraphServerSide,
  deleteFullGraph,
  getFullGraph,
  updateFullGraphServerSide,
} from './graphFull';
import { createProject, deleteProject, getProject, updateProject } from './projects';
import { listTools, upsertTool } from './tools';

const defaultLogger = getLogger('projectFull');

export type ProjectLogger = ReturnType<typeof getLogger>;

export interface ProjectScopeConfig {
  tenantId: string;
  projectId?: string;
}

/**
 * Validate and type the project data
 */
function validateAndTypeProjectData(projectData: any): FullProjectDefinition {
  // The validation should already be done at the API layer
  return projectData as FullProjectDefinition;
}

/**
 * Server-side implementation of createFullProject that performs actual database operations.
 * This function creates a complete project with all graphs and their nested resources.
 */
export const createFullProjectServerSide =
  (db: DatabaseClient, logger: ProjectLogger = defaultLogger) =>
  async (
    scopes: ScopeConfig,
    projectData: FullProjectDefinition
  ): Promise<FullProjectDefinition> => {
    const { tenantId } = scopes;
    const typed = validateAndTypeProjectData(projectData);

    logger.info(
      {
        tenantId,
        projectId: typed.id,
        graphCount: Object.keys(typed.graphs || {}).length,
      },
      'Creating full project in database'
    );

    try {
      // Step 1: Create the project itself
      const projectPayload = {
        id: typed.id,
        name: typed.name,
        description: typed.description || '',
        models: typed.models,
        stopWhen: typed.stopWhen,
        tenantId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      logger.info({ projectId: typed.id }, 'Creating project metadata');
      await createProject(db)(projectPayload);
      logger.info({ projectId: typed.id }, 'Project metadata created successfully');

      // Step 2: Create credentialReferences at project level if they exist
      if (typed.credentialReferences && Object.keys(typed.credentialReferences).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.credentialReferences).length,
          },
          'Creating project credentialReferences'
        );

        const credentialPromises = Object.entries(typed.credentialReferences).map(
          async ([_credId, credData]) => {
            try {
              logger.info(
                { projectId: typed.id, credId: credData.id },
                'Creating credentialReference in project'
              );
              await upsertCredentialReference(db)({
                data: {
                  ...credData,
                  tenantId,
                  projectId: typed.id,
                },
              });
              logger.info(
                { projectId: typed.id, credId: credData.id },
                'CredentialReference created successfully'
              );
            } catch (error) {
              logger.error(
                { projectId: typed.id, credId: credData.id, error },
                'Failed to create credentialReference in project'
              );
              throw error;
            }
          }
        );

        await Promise.all(credentialPromises);
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.credentialReferences).length,
          },
          'All project credentialReferences created successfully'
        );
      }

      // Step 3: Create tools at project level if they exist
      if (typed.tools && Object.keys(typed.tools).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            toolCount: Object.keys(typed.tools).length,
          },
          'Creating project tools'
        );

        const toolPromises = Object.entries(typed.tools).map(async ([toolId, toolData]) => {
          try {
            logger.info({ projectId: typed.id, toolId }, 'Creating tool in project');
            await upsertTool(db)({
              data: {
                tenantId,
                projectId: typed.id,
                ...toolData,
              },
            });
            logger.info({ projectId: typed.id, toolId }, 'Tool created successfully');
          } catch (error) {
            logger.error(
              { projectId: typed.id, toolId, error },
              'Failed to create tool in project'
            );
            throw error;
          }
        });

        await Promise.all(toolPromises);
        logger.info(
          {
            projectId: typed.id,
            toolCount: Object.keys(typed.tools).length,
          },
          'All project tools created successfully'
        );
      }

      // Step 4: Create contextConfigs at project level if they exist
      if (typed.contextConfig && Object.keys(typed.contextConfig).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.contextConfig).length,
          },
          'Creating project contextConfigs'
        );

        const contextConfigPromises = Object.entries(typed.contextConfig).map(
          async ([configId, configData]) => {
            try {
              logger.info({ projectId: typed.id, configId }, 'Creating contextConfig in project');
              await upsertContextConfig(db)({
                data: {
                  ...configData,
                  tenantId,
                  projectId: typed.id,
                },
              });
              logger.info({ projectId: typed.id, configId }, 'ContextConfig created successfully');
            } catch (error) {
              logger.error(
                { projectId: typed.id, configId, error },
                'Failed to create contextConfig in project'
              );
              throw error;
            }
          }
        );

        await Promise.all(contextConfigPromises);
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.contextConfig).length,
          },
          'All project contextConfigs created successfully'
        );
      }

      // Step 5: Create dataComponents at project level if they exist
      if (typed.dataComponents && Object.keys(typed.dataComponents).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.dataComponents).length,
          },
          'Creating project dataComponents'
        );

        const dataComponentPromises = Object.entries(typed.dataComponents).map(
          async ([componentId, componentData]) => {
            try {
              logger.info(
                { projectId: typed.id, componentId },
                'Creating dataComponent in project'
              );
              await upsertDataComponent(db)({
                data: {
                  ...componentData,
                  tenantId,
                  projectId: typed.id,
                },
              });
              logger.info(
                { projectId: typed.id, componentId },
                'DataComponent created successfully'
              );
            } catch (error) {
              logger.error(
                { projectId: typed.id, componentId, error },
                'Failed to create dataComponent in project'
              );
              throw error;
            }
          }
        );

        await Promise.all(dataComponentPromises);
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.dataComponents).length,
          },
          'All project dataComponents created successfully'
        );
      }

      // Step 6: Create artifactComponents at project level if they exist
      if (typed.artifactComponents && Object.keys(typed.artifactComponents).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.artifactComponents).length,
          },
          'Creating project artifactComponents'
        );

        const artifactComponentPromises = Object.entries(typed.artifactComponents).map(
          async ([componentId, componentData]) => {
            try {
              logger.info(
                { projectId: typed.id, componentId },
                'Creating artifactComponent in project'
              );
              await upsertArtifactComponent(db)({
                data: {
                  id: componentId,
                  ...componentData,
                  tenantId,
                  projectId: typed.id,
                },
              });
              logger.info(
                { projectId: typed.id, componentId },
                'ArtifactComponent created successfully'
              );
            } catch (error) {
              logger.error(
                { projectId: typed.id, componentId, error },
                'Failed to create artifactComponent in project'
              );
              throw error;
            }
          }
        );

        await Promise.all(artifactComponentPromises);
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.artifactComponents).length,
          },
          'All project artifactComponents created successfully'
        );
      }

      // Step 7: Create all graphs if they exist
      if (typed.graphs && Object.keys(typed.graphs).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            graphCount: Object.keys(typed.graphs).length,
          },
          'Creating project graphs'
        );

        const graphPromises = Object.entries(typed.graphs).map(async ([graphId, graphData]) => {
          try {
            logger.info({ projectId: typed.id, graphId }, 'Creating graph in project');

            // Create the full graph with project scoping
            // When creating graphs within a project context, we need to pass the project-level resources
            // for validation, even though they're stored at the project level
            const graphDataWithProjectResources = {
              ...graphData,
              tools: typed.tools || {}, // Pass project-level resources for validation
              dataComponents: typed.dataComponents || {},
              artifactComponents: typed.artifactComponents || {},
              contextConfig: typed.contextConfig?.[graphId] || undefined,
              credentialReferences: typed.credentialReferences || {},
              statusUpdates: graphData.statusUpdates === null ? undefined : graphData.statusUpdates,
            };
            await createFullGraphServerSide(db, logger)(
              { tenantId, projectId: typed.id },
              graphDataWithProjectResources
            );

            logger.info({ projectId: typed.id, graphId }, 'Graph created successfully in project');
          } catch (error) {
            logger.error(
              { projectId: typed.id, graphId, error },
              'Failed to create graph in project'
            );
            throw error;
          }
        });

        await Promise.all(graphPromises);
        logger.info(
          {
            projectId: typed.id,
            graphCount: Object.keys(typed.graphs).length,
          },
          'All project graphs created successfully'
        );
      }

      logger.info({ projectId: typed.id }, 'Full project created successfully');

      // Return the complete project definition
      return (await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId: typed.id },
        projectId: typed.id,
      })) as FullProjectDefinition;
    } catch (error) {
      logger.error(
        {
          tenantId,
          projectId: typed.id,
          error,
        },
        'Failed to create full project'
      );
      throw error;
    }
  };

/**
 * Server-side implementation of updateFullProject that performs actual database operations.
 * This function updates a complete project with all graphs and their nested resources.
 */
export const updateFullProjectServerSide =
  (db: DatabaseClient, logger: ProjectLogger = defaultLogger) =>
  async (
    scopes: ScopeConfig,
    projectData: FullProjectDefinition
  ): Promise<FullProjectDefinition> => {
    const { tenantId } = scopes;
    const typed = validateAndTypeProjectData(projectData);

    if (!typed.id) {
      throw new Error('Project ID is required');
    }

    logger.info(
      {
        tenantId,
        projectId: typed.id,
        graphCount: Object.keys(typed.graphs || {}).length,
      },
      'Updating full project in database'
    );

    try {
      // Check if project exists first
      const existingProject = await getProject(db)({
        scopes: { tenantId, projectId: typed.id },
      });

      if (!existingProject) {
        // Project doesn't exist, create it instead
        logger.info({ projectId: typed.id }, 'Project not found, creating new project');
        return await createFullProjectServerSide(db, logger)(
          { tenantId, projectId: typed.id },
          projectData
        );
      }

      // Step 1: Update the project itself
      const projectUpdatePayload = {
        name: typed.name,
        description: typed.description || '',
        models: typed.models,
        stopWhen: typed.stopWhen,
      };

      logger.info({ projectId: typed.id }, 'Updating project metadata');
      await updateProject(db)({
        scopes: { tenantId, projectId: typed.id },
        data: projectUpdatePayload,
      });
      logger.info({ projectId: typed.id }, 'Project metadata updated successfully');

      // Step 2: Update credentialReferences at project level if they exist
      if (typed.credentialReferences && Object.keys(typed.credentialReferences).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.credentialReferences).length,
          },
          'Updating project credentialReferences'
        );

        const credentialPromises = Object.entries(typed.credentialReferences).map(
          async ([_credId, credData]) => {
            try {
              logger.info(
                { projectId: typed.id, credId: credData.id },
                'Updating credentialReference in project'
              );
              await upsertCredentialReference(db)({
                data: {
                  ...credData,
                  tenantId,
                  projectId: typed.id,
                },
              });
              logger.info(
                { projectId: typed.id, credId: credData.id },
                'CredentialReference updated successfully'
              );
            } catch (error) {
              logger.error(
                { projectId: typed.id, credId: credData.id, error },
                'Failed to update credentialReference in project'
              );
              throw error;
            }
          }
        );

        await Promise.all(credentialPromises);
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.credentialReferences).length,
          },
          'All project credentialReferences updated successfully'
        );
      }

      // Step 3: Update tools at project level if they exist
      if (typed.tools && Object.keys(typed.tools).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            toolCount: Object.keys(typed.tools).length,
          },
          'Updating project tools'
        );

        const toolPromises = Object.entries(typed.tools).map(async ([toolId, toolData]) => {
          try {
            logger.info({ projectId: typed.id, toolId }, 'Updating tool in project');
            await upsertTool(db)({
              data: {
                tenantId,
                projectId: typed.id,
                ...toolData,
              },
            });
            logger.info({ projectId: typed.id, toolId }, 'Tool updated successfully');
          } catch (error) {
            logger.error(
              { projectId: typed.id, toolId, error },
              'Failed to update tool in project'
            );
            throw error;
          }
        });

        await Promise.all(toolPromises);
        logger.info(
          {
            projectId: typed.id,
            toolCount: Object.keys(typed.tools).length,
          },
          'All project tools updated successfully'
        );
      }

      // Step 4: Update contextConfigs at project level if they exist
      if (typed.contextConfig && Object.keys(typed.contextConfig).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.contextConfig).length,
          },
          'Updating project contextConfigs'
        );

        const contextConfigPromises = Object.entries(typed.contextConfig).map(
          async ([configId, configData]) => {
            try {
              logger.info({ projectId: typed.id, configId }, 'Updating contextConfig in project');
              await upsertContextConfig(db)({
                data: {
                  ...configData,
                  tenantId,
                  projectId: typed.id,
                },
              });
              logger.info({ projectId: typed.id, configId }, 'ContextConfig updated successfully');
            } catch (error) {
              logger.error(
                { projectId: typed.id, configId, error },
                'Failed to update contextConfig in project'
              );
              throw error;
            }
          }
        );

        await Promise.all(contextConfigPromises);
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.contextConfig).length,
          },
          'All project contextConfigs updated successfully'
        );
      }

      // Step 5: Update dataComponents at project level if they exist
      if (typed.dataComponents && Object.keys(typed.dataComponents).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.dataComponents).length,
          },
          'Updating project dataComponents'
        );

        const dataComponentPromises = Object.entries(typed.dataComponents).map(
          async ([componentId, componentData]) => {
            try {
              logger.info(
                { projectId: typed.id, componentId },
                'Updating dataComponent in project'
              );
              await upsertDataComponent(db)({
                data: {
                  ...componentData,
                  tenantId,
                  projectId: typed.id,
                },
              });
              logger.info(
                { projectId: typed.id, componentId },
                'DataComponent updated successfully'
              );
            } catch (error) {
              logger.error(
                { projectId: typed.id, componentId, error },
                'Failed to update dataComponent in project'
              );
              throw error;
            }
          }
        );

        await Promise.all(dataComponentPromises);
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.dataComponents).length,
          },
          'All project dataComponents updated successfully'
        );
      }

      // Step 6: Update artifactComponents at project level if they exist
      if (typed.artifactComponents && Object.keys(typed.artifactComponents).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.artifactComponents).length,
          },
          'Updating project artifactComponents'
        );

        const artifactComponentPromises = Object.entries(typed.artifactComponents).map(
          async ([componentId, componentData]) => {
            try {
              logger.info(
                { projectId: typed.id, componentId },
                'Updating artifactComponent in project'
              );
              await upsertArtifactComponent(db)({
                data: {
                  id: componentId,
                  ...componentData,
                  tenantId,
                  projectId: typed.id,
                },
              });
              logger.info(
                { projectId: typed.id, componentId },
                'ArtifactComponent updated successfully'
              );
            } catch (error) {
              logger.error(
                { projectId: typed.id, componentId, error },
                'Failed to update artifactComponent in project'
              );
              throw error;
            }
          }
        );

        await Promise.all(artifactComponentPromises);
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.artifactComponents).length,
          },
          'All project artifactComponents updated successfully'
        );
      }

      // Step 7: Update all graphs if they exist
      if (typed.graphs && Object.keys(typed.graphs).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            graphCount: Object.keys(typed.graphs).length,
          },
          'Updating project graphs'
        );

        const graphPromises = Object.entries(typed.graphs).map(async ([graphId, graphData]) => {
          try {
            logger.info({ projectId: typed.id, graphId }, 'Updating graph in project');

            // Update/create the full graph with project scoping
            // When updating graphs within a project context, we need to pass the project-level resources
            // for validation, even though they're stored at the project level
            const graphDataWithProjectResources = {
              ...graphData,
              tools: typed.tools || {}, // Pass project-level resources for validation
              dataComponents: typed.dataComponents || {},
              artifactComponents: typed.artifactComponents || {},
              contextConfig: typed.contextConfig?.[graphId] || undefined,
              credentialReferences: typed.credentialReferences || {},
              statusUpdates: graphData.statusUpdates === null ? undefined : graphData.statusUpdates,
            };
            await updateFullGraphServerSide(db, logger)(
              { tenantId, projectId: typed.id },
              graphDataWithProjectResources
            );

            logger.info({ projectId: typed.id, graphId }, 'Graph updated successfully in project');
          } catch (error) {
            logger.error(
              { projectId: typed.id, graphId, error },
              'Failed to update graph in project'
            );
            throw error;
          }
        });

        await Promise.all(graphPromises);
        logger.info(
          {
            projectId: typed.id,
            graphCount: Object.keys(typed.graphs).length,
          },
          'All project graphs updated successfully'
        );
      }

      logger.info({ projectId: typed.id }, 'Full project updated successfully');

      // Return the complete updated project definition
      return (await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId: typed.id },
        projectId: typed.id,
      })) as FullProjectDefinition;
    } catch (error) {
      logger.error(
        {
          tenantId,
          projectId: typed.id,
          error,
        },
        'Failed to update full project'
      );
      throw error;
    }
  };

/**
 * Get a complete project definition with all nested resources
 */
export const getFullProject =
  (db: DatabaseClient, logger: ProjectLogger = defaultLogger) =>
  async (params: {
    scopes: ScopeConfig;
    projectId: string;
  }): Promise<FullProjectDefinition | null> => {
    const { scopes, projectId } = params;
    const { tenantId } = scopes;

    logger.info({ tenantId, projectId }, 'Retrieving full project definition');

    try {
      // Step 1: Get the project metadata
      const project: ProjectSelect | null = await getProject(db)({
        scopes: { tenantId, projectId },
      });

      if (!project) {
        logger.info({ tenantId, projectId }, 'Project not found');
        return null;
      }

      logger.info({ tenantId, projectId }, 'Project metadata retrieved');

      // Step 2: Get all graphs for this project
      const graphList = await listAgentGraphs(db)({
        scopes: { tenantId, projectId },
      });

      logger.info(
        {
          tenantId,
          projectId,
          graphCount: graphList.length,
        },
        'Found graphs for project'
      );

      // Step 3: Get all tools for this project
      const projectTools: Record<string, any> = {};
      try {
        const toolsList = await listTools(db)({
          scopes: { tenantId, projectId },
          pagination: { page: 1, limit: 1000 }, // Get all tools
        });

        for (const tool of toolsList.data) {
          projectTools[tool.id] = {
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
          };
        }
        logger.info(
          { tenantId, projectId, toolCount: Object.keys(projectTools).length },
          'Tools retrieved for project'
        );
      } catch (error) {
        logger.warn({ tenantId, projectId, error }, 'Failed to retrieve tools for project');
      }

      // Step 4: Get all dataComponents for this project
      const projectDataComponents: Record<string, any> = {};
      try {
        const dataComponentsList = await listDataComponents(db)({
          scopes: { tenantId, projectId },
        });

        for (const component of dataComponentsList) {
          projectDataComponents[component.id] = {
            id: component.id,
            name: component.name,
            description: component.description,
            props: component.props,
          };
        }
        logger.info(
          { tenantId, projectId, count: Object.keys(projectDataComponents).length },
          'DataComponents retrieved for project'
        );
      } catch (error) {
        logger.warn(
          { tenantId, projectId, error },
          'Failed to retrieve dataComponents for project'
        );
      }

      // Step 5: Get all artifactComponents for this project
      const projectArtifactComponents: Record<string, any> = {};
      try {
        const artifactComponentsList = await listArtifactComponents(db)({
          scopes: { tenantId, projectId },
        });

        for (const component of artifactComponentsList) {
          projectArtifactComponents[component.id] = {
            id: component.id,
            name: component.name,
            description: component.description,
            summaryProps: component.summaryProps,
            fullProps: component.fullProps,
          };
        }
        logger.info(
          { tenantId, projectId, count: Object.keys(projectArtifactComponents).length },
          'ArtifactComponents retrieved for project'
        );
      } catch (error) {
        logger.warn(
          { tenantId, projectId, error },
          'Failed to retrieve artifactComponents for project'
        );
      }

      // Step 6: Get all contextConfigs for this project
      const projectContextConfigs: Record<string, any> = {};
      try {
        const contextConfigsList = await listContextConfigs(db)({
          scopes: { tenantId, projectId },
        });

        for (const config of contextConfigsList) {
          projectContextConfigs[config.id] = {
            id: config.id,
            name: config.name,
            description: config.description,
            requestContextSchema: config.requestContextSchema,
            contextVariables: config.contextVariables,
          };
        }
        logger.info(
          { tenantId, projectId, count: Object.keys(projectContextConfigs).length },
          'ContextConfigs retrieved for project'
        );
      } catch (error) {
        logger.warn(
          { tenantId, projectId, error },
          'Failed to retrieve contextConfigs for project'
        );
      }

      // Step 7: Get all credentialReferences for this project
      const projectCredentialReferences: Record<string, any> = {};
      try {
        const credentialReferencesList = await listCredentialReferences(db)({
          scopes: { tenantId, projectId },
        });

        for (const credential of credentialReferencesList) {
          projectCredentialReferences[credential.id] = {
            id: credential.id,
            type: credential.type,
            credentialStoreId: credential.credentialStoreId,
            retrievalParams: credential.retrievalParams,
          };
        }
        logger.info(
          { tenantId, projectId, count: Object.keys(projectCredentialReferences).length },
          'CredentialReferences retrieved for project'
        );
      } catch (error) {
        logger.warn(
          { tenantId, projectId, error },
          'Failed to retrieve credentialReferences for project'
        );
      }

      // Step 8: Get full definitions for each graph
      const graphs: Record<string, any> = {};

      if (graphList.length > 0) {
        const graphPromises = graphList.map(async (graph) => {
          try {
            logger.info(
              { tenantId, projectId, graphId: graph.id },
              'Retrieving full graph definition'
            );

            const fullGraph = await getFullGraph(db)({
              scopes: { tenantId, projectId },
              graphId: graph.id,
            });

            if (fullGraph) {
              // Remove project-level resources from graph as they should be at project level
              const {
                tools: _tools,
                dataComponents: _dataComponents,
                artifactComponents: _artifactComponents,
                contextConfig: _contextConfig,
                credentialReferences: _credentialReferences,
                ...graphWithoutProjectResources
              } = fullGraph;
              graphs[graph.id] = graphWithoutProjectResources;
              logger.info(
                { tenantId, projectId, graphId: graph.id },
                'Full graph definition retrieved'
              );
            } else {
              logger.warn({ tenantId, projectId, graphId: graph.id }, 'Graph definition not found');
            }
          } catch (error) {
            logger.error(
              { tenantId, projectId, graphId: graph.id, error },
              'Failed to retrieve full graph definition'
            );
            // Don't throw - continue with other graphs
          }
        });

        await Promise.all(graphPromises);
      }

      const fullProjectDefinition: FullProjectDefinition = {
        id: project.id,
        name: project.name,
        description: project.description,
        models: project.models || undefined,
        stopWhen: project.stopWhen || undefined,
        graphs,
        tools: projectTools,
        dataComponents: projectDataComponents,
        artifactComponents: projectArtifactComponents,
        contextConfig: projectContextConfigs,
        credentialReferences: projectCredentialReferences,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };

      logger.info(
        {
          tenantId,
          projectId,
          graphCount: Object.keys(fullProjectDefinition.graphs).length,
        },
        'Full project definition retrieved'
      );

      return fullProjectDefinition;
    } catch (error) {
      logger.error(
        {
          tenantId,
          projectId,
          error,
        },
        'Failed to retrieve full project'
      );
      throw error;
    }
  };

/**
 * Delete a complete project and cascade to all related entities
 */
export const deleteFullProject =
  (db: DatabaseClient, logger: ProjectLogger = defaultLogger) =>
  async (params: { scopes: ScopeConfig; projectId: string }): Promise<boolean> => {
    const { scopes, projectId } = params;
    const { tenantId } = scopes;

    logger.info({ tenantId, projectId }, 'Deleting full project and related entities');

    try {
      // Step 1: Get the project first to ensure it exists and get its graphs
      const project = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
        projectId,
      });

      if (!project) {
        logger.info({ tenantId, projectId }, 'Project not found for deletion');
        return false;
      }

      // Step 2: Delete all graphs in the project
      if (project.graphs && Object.keys(project.graphs).length > 0) {
        logger.info(
          {
            tenantId,
            projectId,
            graphCount: Object.keys(project.graphs).length,
          },
          'Deleting project graphs'
        );

        const graphPromises = Object.keys(project.graphs).map(async (graphId) => {
          try {
            logger.info({ tenantId, projectId, graphId }, 'Deleting graph from project');

            await deleteFullGraph(
              db,
              logger
            )({
              scopes: { tenantId, projectId },
              graphId,
            });

            logger.info(
              { tenantId, projectId, graphId },
              'Graph deleted successfully from project'
            );
          } catch (error) {
            logger.error(
              { tenantId, projectId, graphId, error },
              'Failed to delete graph from project'
            );
            throw error;
          }
        });

        await Promise.all(graphPromises);
        logger.info(
          {
            tenantId,
            projectId,
            graphCount: Object.keys(project.graphs).length,
          },
          'All project graphs deleted successfully'
        );
      }

      // Step 3: Delete the project itself
      const deleted = await deleteProject(db)({
        scopes: { tenantId, projectId },
      });

      if (!deleted) {
        logger.warn({ tenantId, projectId }, 'Project deletion returned false');
        return false;
      }

      logger.info({ tenantId, projectId }, 'Full project deleted successfully');
      return true;
    } catch (error) {
      logger.error(
        {
          tenantId,
          projectId,
          error,
        },
        'Failed to delete full project'
      );
      throw error;
    }
  };
