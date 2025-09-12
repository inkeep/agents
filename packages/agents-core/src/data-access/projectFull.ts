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
import {
  createFullGraphServerSide,
  deleteFullGraph,
  getFullGraph,
  updateFullGraphServerSide,
} from './graphFull';
import { createProject, deleteProject, getProject, updateProject } from './projects';

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

      // Step 2: Create all graphs if they exist
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
            await createFullGraphServerSide(db, logger)(
              { tenantId, projectId: typed.id },
              graphData
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

      // Step 2: Update all graphs if they exist
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
            await updateFullGraphServerSide(db, logger)(
              { tenantId, projectId: typed.id },
              graphData
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

      // Step 3: Get full definitions for each graph
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
              graphs[graph.id] = fullGraph;
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
