/**
 * Server-side data access layer for Full Project operations.
 * This module provides functions for creating, retrieving, updating, and deleting
 * complete project definitions with all nested resources (Agents, Sub Agents, tools, etc.).
 */

import { and, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import { functions, functionTools } from '../db/schema';
import type { FullProjectDefinition, ProjectSelect, ToolApiInsert } from '../types/entities';
import type { ProjectScopeConfig } from '../types/utility';
import { getLogger } from '../utils/logger';
import {
  createFullAgentServerSide,
  deleteFullAgent,
  getFullAgent,
  updateFullAgentServerSide,
} from './agentFull';
import { listAgents } from './agents';
import { listArtifactComponents, upsertArtifactComponent } from './artifactComponents';
import { listCredentialReferences, upsertCredentialReference } from './credentialReferences';
import { listDataComponents, upsertDataComponent } from './dataComponents';
import { listExternalAgents, upsertExternalAgent } from './externalAgents';
import { upsertFunction } from './functions';
import { createProject, deleteProject, getProject, updateProject } from './projects';
import { listTools, upsertTool } from './tools';

const defaultLogger = getLogger('projectFull');

export type ProjectLogger = ReturnType<typeof getLogger>;

/**
 * Validate and type the project data
 */
function validateAndTypeProjectData(projectData: any): FullProjectDefinition {
  return projectData as FullProjectDefinition;
}

/**
 * Server-side implementation of createFullProject that performs actual database operations.
 * This function creates a complete project with all agent and their nested resources.
 */
export const createFullProjectServerSide =
  (db: DatabaseClient, logger: ProjectLogger = defaultLogger) =>
  async (
    scopes: ProjectScopeConfig,
    projectData: FullProjectDefinition
  ): Promise<FullProjectDefinition> => {
    const { tenantId } = scopes;
    const typed = validateAndTypeProjectData(projectData);

    logger.info(
      {
        tenantId,
        projectId: typed.id,
        agentCount: Object.keys(typed.agents || {}).length,
      },
      'Creating full project in database'
    );

    try {
      const projectPayload = {
        id: typed.id,
        name: typed.name,
        description: typed.description || '',
        models: typed.models,
        stopWhen: typed.stopWhen,
        tenantId,
      };

      logger.info({ projectId: typed.id }, 'Creating project metadata');
      await createProject(db)(projectPayload);
      logger.info({ projectId: typed.id }, 'Project metadata created successfully');

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

      if (typed.functions && Object.keys(typed.functions).length > 0) {
        const functionPromises = Object.entries(typed.functions).map(
          async ([functionId, functionData]) => {
            try {
              logger.info({ projectId: typed.id, functionId }, 'Creating project function');
              await upsertFunction(db)({
                data: {
                  ...functionData,
                },
                scopes: { tenantId, projectId: typed.id },
              });
              logger.info(
                { projectId: typed.id, functionId },
                'Project function created successfully'
              );
            } catch (error) {
              logger.error(
                { projectId: typed.id, functionId, error },
                'Failed to create global function'
              );
              throw error;
            }
          }
        );

        await Promise.all(functionPromises);
        logger.info(
          {
            projectId: typed.id,
            functionCount: Object.keys(typed.functions).length,
          },
          'All project functions created successfully'
        );
      }

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

      if (typed.externalAgents && Object.keys(typed.externalAgents).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.externalAgents).length,
          },
          'Creating project externalAgents'
        );

        const externalAgentPromises = Object.entries(typed.externalAgents).map(
          async ([externalAgentId, externalAgentData]) => {
            try {
              logger.info(
                { projectId: typed.id, externalAgentId },
                'Creating externalAgent in project'
              );
              await upsertExternalAgent(db)({
                data: {
                  ...externalAgentData,
                  tenantId,
                  projectId: typed.id,
                },
              });
              logger.info(
                { projectId: typed.id, externalAgentId },
                'ExternalAgent created successfully'
              );
            } catch (error) {
              logger.error(
                { projectId: typed.id, externalAgentId, error },
                'Failed to create externalAgent in project'
              );
              throw error;
            }
          }
        );

        await Promise.all(externalAgentPromises);
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.externalAgents).length,
          },
          'All project externalAgents created successfully'
        );
      }

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

      if (typed.agents && Object.keys(typed.agents).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            agentCount: Object.keys(typed.agents).length,
          },
          'Creating project agent'
        );

        // Phase 1: Create all agents without sub-agents to avoid circular dependency issues
        logger.info(
          {
            projectId: typed.id,
            agentCount: Object.keys(typed.agents).length,
          },
          'Phase 1: Creating agents without sub-agents'
        );

        const agentPromises = Object.entries(typed.agents).map(async ([agentId, agentData]) => {
          try {
            logger.info({ projectId: typed.id, agentId }, 'Creating agent in project (phase 1)');

            // Create agent without sub-agents
            const agentDataWithoutSubAgents = {
              ...agentData,
              subAgents: {}, // No sub-agents in phase 1
              defaultSubAgentId: undefined, // Clear defaultSubAgentId since no sub-agents exist yet
              tools: typed.tools || {}, // Pass project-level MCP tools for validation
              functions: typed.functions || {}, // Pass project-level functions for validation
              dataComponents: typed.dataComponents || {},
              artifactComponents: typed.artifactComponents || {},
              externalAgents: typed.externalAgents || {}, // Pass project-level external agents
              credentialReferences: typed.credentialReferences || {},
              statusUpdates: agentData.statusUpdates === null ? undefined : agentData.statusUpdates,
            };
            await createFullAgentServerSide(db, logger)(
              { tenantId, projectId: typed.id },
              agentDataWithoutSubAgents
            );

            logger.info(
              { projectId: typed.id, agentId },
              'Agent created successfully in project (phase 1)'
            );
          } catch (error) {
            logger.error(
              { projectId: typed.id, agentId, error },
              'Failed to create agent in project (phase 1)'
            );
            throw error;
          }
        });

        await Promise.all(agentPromises);
        logger.info(
          {
            projectId: typed.id,
            agentCount: Object.keys(typed.agents).length,
          },
          'Phase 1 complete: All agents created without sub-agents'
        );

        // Phase 2: Add all sub-agents with their relationships
        logger.info(
          {
            projectId: typed.id,
            agentCount: Object.keys(typed.agents).length,
          },
          'Phase 2: Adding sub-agents with relationships'
        );

        const updatePromises = Object.entries(typed.agents)
          .filter(([_, agentData]) => Object.keys(agentData.subAgents).length > 0)
          .map(async ([agentId, agentData]) => {
            try {
              logger.info({ projectId: typed.id, agentId }, 'Adding sub-agents (phase 2)');

              // Add all sub-agents with their relationships
              const updateData = {
                ...agentData,
                subAgents: agentData.subAgents, // Include all sub-agents with their relationships
              };

              await updateFullAgentServerSide(db, logger)(
                { tenantId, projectId: typed.id },
                updateData as any
              );

              logger.info(
                { projectId: typed.id, agentId },
                'Sub-agents added successfully (phase 2)'
              );
            } catch (error) {
              logger.error(
                { projectId: typed.id, agentId, error },
                'Failed to add sub-agents (phase 2)'
              );
              throw error;
            }
          });

        await Promise.all(updatePromises);
        logger.info(
          {
            projectId: typed.id,
            agentCount: Object.keys(typed.agents).length,
          },
          'Phase 2 complete: All sub-agents added successfully'
        );
      }

      logger.info({ projectId: typed.id }, 'Full project created successfully');

      return (await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId: typed.id },
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
 * This function updates a complete project with all agent and their nested resources.
 */
export const updateFullProjectServerSide =
  (db: DatabaseClient, logger: ProjectLogger = defaultLogger) =>
  async (
    scopes: ProjectScopeConfig,
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
        agentCount: Object.keys(typed.agents || {}).length,
      },
      'Updating full project in database'
    );

    try {
      const existingProject = await getProject(db)({
        scopes: { tenantId, projectId: typed.id },
      });

      if (!existingProject) {
        logger.info({ projectId: typed.id }, 'Project not found, creating new project');
        return await createFullProjectServerSide(db, logger)(
          { tenantId, projectId: typed.id },
          projectData
        );
      }

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

      if (typed.functions && Object.keys(typed.functions).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            functionCount: Object.keys(typed.functions).length,
          },
          'Updating project functions'
        );

        const functionPromises = Object.entries(typed.functions).map(
          async ([functionId, functionData]) => {
            try {
              logger.info({ projectId: typed.id, functionId }, 'Updating project function');
              await upsertFunction(db)({
                data: {
                  ...functionData,
                },
                scopes: { tenantId, projectId: typed.id },
              });
              logger.info(
                { projectId: typed.id, functionId },
                'Project function updated successfully'
              );
            } catch (error) {
              logger.error(
                { projectId: typed.id, functionId, error },
                'Failed to update global function'
              );
              throw error;
            }
          }
        );

        await Promise.all(functionPromises);
        logger.info(
          {
            projectId: typed.id,
            functionCount: Object.keys(typed.functions).length,
          },
          'All project functions updated successfully'
        );
      }

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

      if (typed.externalAgents && Object.keys(typed.externalAgents).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.externalAgents).length,
          },
          'Updating project externalAgents'
        );

        const externalAgentPromises = Object.entries(typed.externalAgents).map(
          async ([externalAgentId, externalAgentData]) => {
            try {
              logger.info(
                { projectId: typed.id, externalAgentId },
                'Updating externalAgent in project'
              );
              await upsertExternalAgent(db)({
                data: {
                  ...externalAgentData,
                  tenantId,
                  projectId: typed.id,
                },
              });
              logger.info(
                { projectId: typed.id, externalAgentId },
                'ExternalAgent updated successfully'
              );
            } catch (error) {
              logger.error(
                { projectId: typed.id, externalAgentId, error },
                'Failed to update externalAgent in project'
              );
              throw error;
            }
          }
        );

        await Promise.all(externalAgentPromises);
        logger.info(
          {
            projectId: typed.id,
            count: Object.keys(typed.externalAgents).length,
          },
          'All project externalAgents updated successfully'
        );
      }

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

      const incomingAgentIds = new Set(Object.keys(typed.agents || {}));

      const existingAgents = await listAgents(db)({
        scopes: { tenantId, projectId: typed.id },
      });

      let deletedAgentCount = 0;
      for (const agent of existingAgents) {
        if (!incomingAgentIds.has(agent.id)) {
          try {
            await deleteFullAgent(
              db,
              logger
            )({
              scopes: { tenantId, projectId: typed.id, agentId: agent.id },
            });
            deletedAgentCount++;
            logger.info({ agentId: agent.id }, 'Deleted orphaned agent from project');
          } catch (error) {
            logger.error(
              { agentId: agent.id, error },
              'Failed to delete orphaned agent from project'
            );
          }
        }
      }

      if (deletedAgentCount > 0) {
        logger.info(
          {
            deletedAgentCount,
            projectId: typed.id,
          },
          'Deleted orphaned agent from project'
        );
      }

      if (typed.agents && Object.keys(typed.agents).length > 0) {
        logger.info(
          {
            projectId: typed.id,
            agentCount: Object.keys(typed.agents).length,
          },
          'Updating project agent'
        );

        const agentPromises = Object.entries(typed.agents).map(async ([agentId, agentData]) => {
          try {
            logger.info({ projectId: typed.id, agentId }, 'Updating agent in project');

            const agentDataWithProjectResources = {
              ...agentData,
              tools: typed.tools || {}, // Pass project-level MCP tools for validation
              functions: typed.functions || {}, // Pass project-level functions for validation
              dataComponents: typed.dataComponents || {},
              artifactComponents: typed.artifactComponents || {},
              externalAgents: typed.externalAgents || {}, // Pass project-level external agents
              credentialReferences: typed.credentialReferences || {},
              statusUpdates: agentData.statusUpdates === null ? undefined : agentData.statusUpdates,
            };
            await updateFullAgentServerSide(db, logger)(
              { tenantId, projectId: typed.id },
              agentDataWithProjectResources
            );

            logger.info({ projectId: typed.id, agentId }, 'Agent updated successfully in project');
          } catch (error) {
            logger.error(
              { projectId: typed.id, agentId, error },
              'Failed to update agent in project'
            );
            throw error;
          }
        });

        await Promise.all(agentPromises);
        logger.info(
          {
            projectId: typed.id,
            agentCount: Object.keys(typed.agents).length,
          },
          'All project agent updated successfully'
        );
      }

      logger.info({ projectId: typed.id }, 'Full project updated successfully');

      return (await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId: typed.id },
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
  async (params: { scopes: ProjectScopeConfig }): Promise<FullProjectDefinition | null> => {
    const { scopes } = params;
    const { tenantId, projectId } = scopes;

    logger.info({ tenantId, projectId }, 'Retrieving full project definition');

    try {
      const project: ProjectSelect | null = await getProject(db)({
        scopes: { tenantId, projectId },
      });

      if (!project) {
        logger.info({ tenantId, projectId }, 'Project not found');
        return null;
      }

      logger.info({ tenantId, projectId }, 'Project metadata retrieved');

      const agentList = await listAgents(db)({
        scopes: { tenantId, projectId },
      });

      logger.info(
        {
          tenantId,
          projectId,
          agentCount: agentList.length,
        },
        'Found agent for project'
      );

      const projectTools: Record<string, ToolApiInsert> = {};
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
            credentialReferenceId: tool.credentialReferenceId || undefined,
            imageUrl: tool.imageUrl || undefined,
            capabilities: tool.capabilities || undefined,
            lastError: tool.lastError || undefined,
          };
        }
        logger.info(
          { tenantId, projectId, toolCount: Object.keys(projectTools).length },
          'Tools retrieved for project'
        );
      } catch (error) {
        logger.warn({ tenantId, projectId, error }, 'Failed to retrieve tools for project');
      }

      const projectExternalAgents: Record<string, any> = {};
      try {
        const externalAgentsList = await listExternalAgents(db)({
          scopes: { tenantId, projectId },
        });

        for (const externalAgent of externalAgentsList) {
          projectExternalAgents[externalAgent.id] = {
            id: externalAgent.id,
            name: externalAgent.name,
            description: externalAgent.description,
            baseUrl: externalAgent.baseUrl,
            credentialReferenceId: externalAgent.credentialReferenceId || undefined,
          };
        }
        logger.info(
          { tenantId, projectId, count: Object.keys(projectExternalAgents).length },
          'ExternalAgents retrieved for project'
        );
      } catch (error) {
        logger.warn(
          { tenantId, projectId, error },
          'Failed to retrieve externalAgents for project'
        );
      }

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
            render: component.render,
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
            props: component.props,
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

      const projectCredentialReferences: Record<string, any> = {};
      try {
        const credentialReferencesList = await listCredentialReferences(db)({
          scopes: { tenantId, projectId },
        });

        for (const credential of credentialReferencesList) {
          projectCredentialReferences[credential.id] = {
            id: credential.id,
            name: credential.name,
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

      const projectFunctions: Record<string, any> = {};
      try {
        // Get all function tools with their associated function data by joining the tables
        const functionToolsWithFunctions = await db
          .select({
            functionToolId: functionTools.id,
            functionToolName: functionTools.name,
            functionToolDescription: functionTools.description,
            functionId: functions.id,
            inputSchema: functions.inputSchema,
            executeCode: functions.executeCode,
            dependencies: functions.dependencies,
          })
          .from(functionTools)
          .innerJoin(functions, eq(functionTools.functionId, functions.id))
          .where(and(eq(functionTools.tenantId, tenantId), eq(functionTools.projectId, projectId)));

        for (const item of functionToolsWithFunctions) {
          projectFunctions[item.functionToolId] = {
            id: item.functionId,
            name: item.functionToolName,
            description: item.functionToolDescription,
            inputSchema: item.inputSchema,
            executeCode: item.executeCode,
            dependencies: item.dependencies,
          };
        }
        logger.info(
          { tenantId, projectId, functionCount: Object.keys(projectFunctions).length },
          'Function tools with function data retrieved for project'
        );
      } catch (error) {
        logger.warn(
          { tenantId, projectId, error },
          'Failed to retrieve function tools for project'
        );
      }

      const agents: Record<string, any> = {};

      if (agentList.length > 0) {
        const agentPromises = agentList.map(async (agent) => {
          try {
            logger.info(
              { tenantId, projectId, agentId: agent.id },
              'Retrieving full agent definition'
            );

            const fullAgent = await getFullAgent(db)({
              scopes: { tenantId, projectId, agentId: agent.id },
            });

            if (fullAgent) {
              agents[agent.id] = fullAgent;
              logger.info(
                { tenantId, projectId, agentId: agent.id },
                'Full agent definition retrieved'
              );
            } else {
              logger.warn({ tenantId, projectId, agentId: agent.id }, 'Agent definition not found');
            }
          } catch (error) {
            logger.error(
              { tenantId, projectId, agentId: agent.id, error },
              'Failed to retrieve full agent definition'
            );
          }
        });

        await Promise.all(agentPromises);
      }

      // Ensure project has required models configuration
      if (!project.models) {
        throw new Error(
          `Project ${project.id} is missing required models configuration. Please update the project to include a base model.`
        );
      }

      const fullProjectDefinition: FullProjectDefinition = {
        id: project.id,
        name: project.name,
        description: project.description,
        models: project.models,
        stopWhen: project.stopWhen || undefined,
        agents,
        tools: projectTools,
        functions: projectFunctions,
        externalAgents: projectExternalAgents,
        dataComponents: projectDataComponents,
        artifactComponents: projectArtifactComponents,
        credentialReferences: projectCredentialReferences,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };

      logger.info(
        {
          tenantId,
          projectId,
          agentCount: Object.keys(fullProjectDefinition.agents).length,
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
  async (params: { scopes: ProjectScopeConfig }): Promise<boolean> => {
    const { scopes } = params;
    const { tenantId, projectId } = scopes;

    logger.info({ tenantId, projectId }, 'Deleting full project and related entities');

    try {
      const project = await getFullProject(
        db,
        logger
      )({
        scopes: { tenantId, projectId },
      });

      if (!project) {
        logger.info({ tenantId, projectId }, 'Project not found for deletion');
        return false;
      }

      if (project.agents && Object.keys(project.agents).length > 0) {
        logger.info(
          {
            tenantId,
            projectId,
            agentCount: Object.keys(project.agents).length,
          },
          'Deleting project agent'
        );

        const agentPromises = Object.keys(project.agents).map(async (agentId) => {
          try {
            logger.info({ tenantId, projectId, agentId }, 'Deleting agent from project');

            await deleteFullAgent(
              db,
              logger
            )({
              scopes: { tenantId, projectId, agentId },
            });

            logger.info(
              { tenantId, projectId, agentId },
              'Agent deleted successfully from project'
            );
          } catch (error) {
            logger.error(
              { tenantId, projectId, agentId, error },
              'Failed to delete agent from project'
            );
            throw error;
          }
        });

        await Promise.all(agentPromises);
        logger.info(
          {
            tenantId,
            projectId,
            agentCount: Object.keys(project.agents).length,
          },
          'All project agent deleted successfully'
        );
      }

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
