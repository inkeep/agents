/**
 * Server-side data access layer for Full Project operations.
 * This module provides functions for creating, retrieving, updating, and deleting
 * complete project definitions with all nested resources (Agents, Sub Agents, tools, etc.).
 */

import type { DatabaseClient } from '../db/client';
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
import {
  deleteArtifactComponent,
  listArtifactComponents,
  upsertArtifactComponent,
} from './artifactComponents';
import {
  deleteCredentialReference,
  listCredentialReferences,
  upsertCredentialReference,
} from './credentialReferences';
import { deleteDataComponent, listDataComponents, upsertDataComponent } from './dataComponents';
import { deleteExternalAgent, listExternalAgents, upsertExternalAgent } from './externalAgents';
import { deleteFunction, listFunctions, upsertFunction } from './functions';
import { createProject, deleteProject, getProject, updateProject } from './projects';
import { deleteTool, listTools, upsertTool } from './tools';

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

    try {
      const projectPayload = {
        id: typed.id,
        name: typed.name,
        description: typed.description || '',
        models: typed.models,
        stopWhen: typed.stopWhen,
        tenantId,
      };

      await createProject(db)(projectPayload);

      if (typed.credentialReferences && Object.keys(typed.credentialReferences).length > 0) {
        const credentialPromises = Object.entries(typed.credentialReferences).map(
          async ([_credId, credData]) => {
            try {
              await upsertCredentialReference(db)({
                data: {
                  ...credData,
                  tenantId,
                  projectId: typed.id,
                },
              });
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
      }

      if (typed.functions && Object.keys(typed.functions).length > 0) {
        const functionPromises = Object.entries(typed.functions).map(
          async ([functionId, functionData]) => {
            try {
              await upsertFunction(db)({
                data: {
                  ...functionData,
                },
                scopes: { tenantId, projectId: typed.id },
              });
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
      }

      if (typed.tools && Object.keys(typed.tools).length > 0) {
        const toolPromises = Object.entries(typed.tools).map(async ([toolId, toolData]) => {
          try {
            await upsertTool(db)({
              data: {
                tenantId,
                projectId: typed.id,
                ...toolData,
              },
            });
          } catch (error) {
            logger.error(
              { projectId: typed.id, toolId, error },
              'Failed to create tool in project'
            );
            throw error;
          }
        });
        await Promise.all(toolPromises);
      }

      if (typed.externalAgents && Object.keys(typed.externalAgents).length > 0) {
        const externalAgentPromises = Object.entries(typed.externalAgents).map(
          async ([externalAgentId, externalAgentData]) => {
            try {
              await upsertExternalAgent(db)({
                data: {
                  ...externalAgentData,
                  tenantId,
                  projectId: typed.id,
                },
              });
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
      }

      if (typed.dataComponents && Object.keys(typed.dataComponents).length > 0) {
        const dataComponentPromises = Object.entries(typed.dataComponents).map(
          async ([componentId, componentData]) => {
            try {
              await upsertDataComponent(db)({
                data: {
                  ...componentData,
                  tenantId,
                  projectId: typed.id,
                },
              });
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
      }

      if (typed.artifactComponents && Object.keys(typed.artifactComponents).length > 0) {
        const artifactComponentPromises = Object.entries(typed.artifactComponents).map(
          async ([componentId, componentData]) => {
            try {
              await upsertArtifactComponent(db)({
                data: {
                  ...componentData,
                  tenantId,
                  projectId: typed.id,
                },
              });
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
      }

      if (typed.agents && Object.keys(typed.agents).length > 0) {
        // Phase 1: Create all agents without sub-agents to avoid circular dependency issues
        const agentPromises = Object.entries(typed.agents).map(async ([agentId, agentData]) => {
          try {
            const agentDataWithoutSubAgents = {
              ...agentData,
              subAgents: {},
              defaultSubAgentId: undefined,
              tools: typed.tools || {},
              functions: typed.functions || {},
              dataComponents: typed.dataComponents || {},
              artifactComponents: typed.artifactComponents || {},
              externalAgents: typed.externalAgents || {},
              credentialReferences: typed.credentialReferences || {},
              statusUpdates: agentData.statusUpdates === null ? undefined : agentData.statusUpdates,
            };
            await createFullAgentServerSide(db, logger)(
              { tenantId, projectId: typed.id },
              agentDataWithoutSubAgents
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

        // Phase 2: Add all sub-agents with their relationships
        const updatePromises = Object.entries(typed.agents)
          .filter(([_, agentData]) => Object.keys(agentData.subAgents).length > 0)
          .map(async ([agentId, agentData]) => {
            try {
              const updateData = {
                ...agentData,
                subAgents: agentData.subAgents,
              };
              await updateFullAgentServerSide(db, logger)(
                { tenantId, projectId: typed.id },
                updateData as any
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
      }

      logger.info(
        {
          projectId: typed.id,
          agents: Object.keys(typed.agents || {}).length,
          tools: Object.keys(typed.tools || {}).length,
          functions: Object.keys(typed.functions || {}).length,
        },
        'Project created'
      );

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

    try {
      const existingProject = await getProject(db)({
        scopes: { tenantId, projectId: typed.id },
      });

      if (!existingProject) {
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

      await updateProject(db)({
        scopes: { tenantId, projectId: typed.id },
        data: projectUpdatePayload,
      });

      if (typed.credentialReferences && Object.keys(typed.credentialReferences).length > 0) {
        const credentialPromises = Object.entries(typed.credentialReferences).map(
          async ([_credId, credData]) => {
            try {
              await upsertCredentialReference(db)({
                data: {
                  ...credData,
                  tenantId,
                  projectId: typed.id,
                },
              });
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
      }

      if (typed.functions && Object.keys(typed.functions).length > 0) {
        const functionPromises = Object.entries(typed.functions).map(
          async ([functionId, functionData]) => {
            try {
              await upsertFunction(db)({
                data: {
                  ...functionData,
                },
                scopes: { tenantId, projectId: typed.id },
              });
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
      }

      if (typed.tools && Object.keys(typed.tools).length > 0) {
        const toolPromises = Object.entries(typed.tools).map(async ([toolId, toolData]) => {
          try {
            await upsertTool(db)({
              data: {
                tenantId,
                projectId: typed.id,
                ...toolData,
              },
            });
          } catch (error) {
            logger.error(
              { projectId: typed.id, toolId, error },
              'Failed to update tool in project'
            );
            throw error;
          }
        });
        await Promise.all(toolPromises);
      }

      if (typed.externalAgents && Object.keys(typed.externalAgents).length > 0) {
        const externalAgentPromises = Object.entries(typed.externalAgents).map(
          async ([externalAgentId, externalAgentData]) => {
            try {
              await upsertExternalAgent(db)({
                data: {
                  ...externalAgentData,
                  tenantId,
                  projectId: typed.id,
                },
              });
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
      }

      if (typed.dataComponents && Object.keys(typed.dataComponents).length > 0) {
        const dataComponentPromises = Object.entries(typed.dataComponents).map(
          async ([componentId, componentData]) => {
            try {
              await upsertDataComponent(db)({
                data: {
                  ...componentData,
                  tenantId,
                  projectId: typed.id,
                },
              });
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
      }

      if (typed.artifactComponents && Object.keys(typed.artifactComponents).length > 0) {
        const artifactComponentPromises = Object.entries(typed.artifactComponents).map(
          async ([componentId, componentData]) => {
            try {
              await upsertArtifactComponent(db)({
                data: {
                  ...componentData,
                  tenantId,
                  projectId: typed.id,
                },
              });
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
      }

      // Delete orphaned tools
      const incomingToolIds = new Set(Object.keys(typed.tools || {}));
      const existingToolsResult = await listTools(db)({
        scopes: { tenantId, projectId: typed.id },
        pagination: { page: 1, limit: 1000 },
      });
      const existingTools = existingToolsResult.data;

      for (const tool of existingTools) {
        if (!incomingToolIds.has(tool.id)) {
          try {
            await deleteTool(db)({
              toolId: tool.id,
              scopes: { tenantId, projectId: typed.id },
            });
          } catch (error) {
            logger.error({ toolId: tool.id, error }, 'Failed to delete orphaned tool from project');
          }
        }
      }

      // Delete orphaned functions
      const incomingFunctionIds = new Set(Object.keys(typed.functions || {}));
      const existingFunctions = await listFunctions(db)({
        scopes: { tenantId, projectId: typed.id },
      });

      for (const func of existingFunctions) {
        if (!incomingFunctionIds.has(func.id)) {
          try {
            await deleteFunction(db)({
              functionId: func.id,
              scopes: { tenantId, projectId: typed.id },
            });
          } catch (error) {
            logger.error(
              { functionId: func.id, error },
              'Failed to delete orphaned function from project'
            );
          }
        }
      }

      // Delete orphaned credential references
      const incomingCredentialReferenceIds = new Set(Object.keys(typed.credentialReferences || {}));
      const existingCredentialReferences = await listCredentialReferences(db)({
        scopes: { tenantId, projectId: typed.id },
      });

      for (const credRef of existingCredentialReferences) {
        if (!incomingCredentialReferenceIds.has(credRef.id)) {
          try {
            await deleteCredentialReference(db)({
              id: credRef.id,
              scopes: { tenantId, projectId: typed.id },
            });
          } catch (error) {
            logger.error(
              { credentialReferenceId: credRef.id, error },
              'Failed to delete orphaned credentialReference from project'
            );
          }
        }
      }

      // Delete orphaned external agents
      const incomingExternalAgentIds = new Set(Object.keys(typed.externalAgents || {}));
      const existingExternalAgents = await listExternalAgents(db)({
        scopes: { tenantId, projectId: typed.id },
      });

      for (const extAgent of existingExternalAgents) {
        if (!incomingExternalAgentIds.has(extAgent.id)) {
          try {
            await deleteExternalAgent(db)({
              externalAgentId: extAgent.id,
              scopes: { tenantId, projectId: typed.id },
            });
          } catch (error) {
            logger.error(
              { externalAgentId: extAgent.id, error },
              'Failed to delete orphaned externalAgent from project'
            );
          }
        }
      }

      // Delete orphaned data components
      const incomingDataComponentIds = new Set(Object.keys(typed.dataComponents || {}));
      const existingDataComponents = await listDataComponents(db)({
        scopes: { tenantId, projectId: typed.id },
      });

      for (const dc of existingDataComponents) {
        if (!incomingDataComponentIds.has(dc.id)) {
          try {
            await deleteDataComponent(db)({
              dataComponentId: dc.id,
              scopes: { tenantId, projectId: typed.id },
            });
          } catch (error) {
            logger.error(
              { dataComponentId: dc.id, error },
              'Failed to delete orphaned dataComponent from project'
            );
          }
        }
      }

      // Delete orphaned artifact components
      const incomingArtifactComponentIds = new Set(Object.keys(typed.artifactComponents || {}));
      const existingArtifactComponents = await listArtifactComponents(db)({
        scopes: { tenantId, projectId: typed.id },
      });

      for (const ac of existingArtifactComponents) {
        if (!incomingArtifactComponentIds.has(ac.id)) {
          try {
            await deleteArtifactComponent(db)({
              artifactComponentId: ac.id,
              scopes: { tenantId, projectId: typed.id },
            });
          } catch (error) {
            logger.error(
              { artifactComponentId: ac.id, error },
              'Failed to delete orphaned artifactComponent from project'
            );
          }
        }
      }

      // Delete orphaned agents
      const incomingAgentIds = new Set(Object.keys(typed.agents || {}));
      const existingAgents = await listAgents(db)({
        scopes: { tenantId, projectId: typed.id },
      });

      for (const agent of existingAgents) {
        if (!incomingAgentIds.has(agent.id)) {
          try {
            await deleteFullAgent(
              db,
              logger
            )({
              scopes: { tenantId, projectId: typed.id, agentId: agent.id },
            });
          } catch (error) {
            logger.error(
              { agentId: agent.id, error },
              'Failed to delete orphaned agent from project'
            );
          }
        }
      }

      // Update agents
      if (typed.agents && Object.keys(typed.agents).length > 0) {
        const agentPromises = Object.entries(typed.agents).map(async ([agentId, agentData]) => {
          try {
            const updateData = {
              ...agentData,
              tools: typed.tools || {},
              functions: typed.functions || {},
              dataComponents: typed.dataComponents || {},
              artifactComponents: typed.artifactComponents || {},
              externalAgents: typed.externalAgents || {},
              credentialReferences: typed.credentialReferences || {},
            };
            await updateFullAgentServerSide(db, logger)(
              { tenantId, projectId: typed.id },
              updateData as any
            );
          } catch (error) {
            logger.error(
              { projectId: typed.id, agentId, error },
              'Failed to update agent in project'
            );
            throw error;
          }
        });

        await Promise.all(agentPromises);
      }

      logger.info(
        {
          projectId: typed.id,
          agents: Object.keys(typed.agents || {}).length,
          tools: Object.keys(typed.tools || {}).length,
          functions: Object.keys(typed.functions || {}).length,
        },
        'Project updated'
      );

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
 * Server-side implementation of getFullProject
 */
export const getFullProject =
  (db: DatabaseClient, logger: ProjectLogger = defaultLogger) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<FullProjectDefinition | null> => {
    const { scopes } = params;
    const { tenantId, projectId } = scopes;

    try {
      const project = await getProject(db)({
        scopes: { tenantId, projectId },
      });

      if (!project) {
        return null;
      }

      const [
        agents,
        tools,
        functions,
        credentialReferences,
        externalAgents,
        dataComponents,
        artifactComponents,
      ] = await Promise.all([
        listAgents(db)({ scopes: { tenantId, projectId } }),
        listTools(db)({ scopes: { tenantId, projectId }, pagination: { page: 1, limit: 1000 } }),
        listFunctions(db)({ scopes: { tenantId, projectId } }),
        listCredentialReferences(db)({ scopes: { tenantId, projectId } }),
        listExternalAgents(db)({ scopes: { tenantId, projectId } }),
        listDataComponents(db)({ scopes: { tenantId, projectId } }),
        listArtifactComponents(db)({ scopes: { tenantId, projectId } }),
      ]);

      const agentsMap: Record<string, any> = {};
      for (const agent of agents) {
        const fullAgent = await getFullAgent(
          db,
          logger
        )({
          scopes: { tenantId, projectId, agentId: agent.id },
        });
        if (fullAgent) {
          agentsMap[agent.id] = fullAgent;
        }
      }

      const toolsMap: Record<string, ToolApiInsert> = {};
      for (const tool of tools.data) {
        toolsMap[tool.id] = tool as ToolApiInsert;
      }

      const functionsMap: Record<string, any> = {};
      for (const func of functions) {
        functionsMap[func.id] = func;
      }

      const credentialReferencesMap: Record<string, any> = {};
      for (const credRef of credentialReferences) {
        credentialReferencesMap[credRef.id] = credRef;
      }

      const externalAgentsMap: Record<string, any> = {};
      for (const extAgent of externalAgents) {
        externalAgentsMap[extAgent.id] = extAgent;
      }

      const dataComponentsMap: Record<string, any> = {};
      for (const dc of dataComponents) {
        dataComponentsMap[dc.id] = dc;
      }

      const artifactComponentsMap: Record<string, any> = {};
      for (const ac of artifactComponents) {
        artifactComponentsMap[ac.id] = ac;
      }

      const fullProject: FullProjectDefinition = {
        ...project,
        agents: agentsMap,
        tools: toolsMap,
        functions: functionsMap,
        credentialReferences: credentialReferencesMap,
        externalAgents: externalAgentsMap,
        dataComponents: dataComponentsMap,
        artifactComponents: artifactComponentsMap,
      };

      return fullProject;
    } catch (error) {
      logger.error(
        {
          tenantId,
          projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
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
    const { tenantId, projectId } = params.scopes;

    try {
      const project = await getProject(db)({
        scopes: { tenantId, projectId },
      });

      if (!project) {
        return false;
      }

      // Delete all agents first (they have cascading deletes)
      const agents = await listAgents(db)({
        scopes: { tenantId, projectId },
      });

      for (const agent of agents) {
        try {
          await deleteFullAgent(
            db,
            logger
          )({
            scopes: { tenantId, projectId, agentId: agent.id },
          });
        } catch (error) {
          logger.error({ agentId: agent.id, error }, 'Failed to delete agent from project');
        }
      }

      // Delete tools
      const toolsResult = await listTools(db)({
        scopes: { tenantId, projectId },
        pagination: { page: 1, limit: 1000 },
      });

      for (const tool of toolsResult.data) {
        try {
          await deleteTool(db)({
            toolId: tool.id,
            scopes: { tenantId, projectId },
          });
        } catch (error) {
          logger.error({ toolId: tool.id, error }, 'Failed to delete tool from project');
        }
      }

      // Delete functions
      const functions = await listFunctions(db)({
        scopes: { tenantId, projectId },
      });

      for (const func of functions) {
        try {
          await deleteFunction(db)({
            functionId: func.id,
            scopes: { tenantId, projectId },
          });
        } catch (error) {
          logger.error({ functionId: func.id, error }, 'Failed to delete function from project');
        }
      }

      // Delete credential references
      const credentialReferences = await listCredentialReferences(db)({
        scopes: { tenantId, projectId },
      });

      for (const credRef of credentialReferences) {
        try {
          await deleteCredentialReference(db)({
            id: credRef.id,
            scopes: { tenantId, projectId },
          });
        } catch (error) {
          logger.error(
            { credentialReferenceId: credRef.id, error },
            'Failed to delete credentialReference from project'
          );
        }
      }

      // Delete external agents
      const externalAgents = await listExternalAgents(db)({
        scopes: { tenantId, projectId },
      });

      for (const extAgent of externalAgents) {
        try {
          await deleteExternalAgent(db)({
            externalAgentId: extAgent.id,
            scopes: { tenantId, projectId },
          });
        } catch (error) {
          logger.error(
            { externalAgentId: extAgent.id, error },
            'Failed to delete externalAgent from project'
          );
        }
      }

      // Delete data components
      const dataComponents = await listDataComponents(db)({
        scopes: { tenantId, projectId },
      });

      for (const dc of dataComponents) {
        try {
          await deleteDataComponent(db)({
            dataComponentId: dc.id,
            scopes: { tenantId, projectId },
          });
        } catch (error) {
          logger.error(
            { dataComponentId: dc.id, error },
            'Failed to delete dataComponent from project'
          );
        }
      }

      // Delete artifact components
      const artifactComponents = await listArtifactComponents(db)({
        scopes: { tenantId, projectId },
      });

      for (const ac of artifactComponents) {
        try {
          await deleteArtifactComponent(db)({
            artifactComponentId: ac.id,
            scopes: { tenantId, projectId },
          });
        } catch (error) {
          logger.error(
            { artifactComponentId: ac.id, error },
            'Failed to delete artifactComponent from project'
          );
        }
      }

      // Finally delete the project itself
      await deleteProject(db)({
        scopes: { tenantId, projectId },
      });

      logger.info({ projectId }, 'Project deleted');

      return true;
    } catch (error) {
      logger.error(
        {
          tenantId,
          projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to delete full project'
      );
      throw error;
    }
  };
