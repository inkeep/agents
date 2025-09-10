import { and, eq } from 'drizzle-orm';
import type { DatabaseClient } from '../db/client';
import {
  agentDataComponents,
  agentGraph,
  agentArtifactComponents,
  agents,
  apiKeys,
  artifactComponents,
  contextConfigs,
  dataComponents,
  externalAgents,
  projects,
  tools,
} from '../db/schema';
import type { FullProjectDefinition, ScopeConfig } from '../types';
import { getFullGraphDefinition } from './agentGraphs';

// Logger interface for dependency injection (same as graphFull)
export interface ProjectLogger {
  info(obj: Record<string, any>, msg?: string): void;
  error(obj: Record<string, any>, msg?: string): void;
}

// Default no-op logger
const defaultLogger: ProjectLogger = {
  info: () => {},
  error: () => {},
};

/**
 * Get a complete project definition with all related entities
 * Similar to getFullGraph but at the project level
 */
export const getFullProject =
  (db: DatabaseClient, logger: ProjectLogger = defaultLogger) =>
  async (params: { tenantId: string; projectId: string }): Promise<FullProjectDefinition | null> => {
    const { tenantId, projectId } = params;

    logger.info({ tenantId, projectId }, 'Retrieving full project definition');

    try {
      // Step 1: Get the project
      const project = await db.query.projects.findFirst({
        where: and(eq(projects.tenantId, tenantId), eq(projects.id, projectId)),
      });

      if (!project) {
        logger.info({ tenantId, projectId }, 'Project not found');
        return null;
      }

      // Step 2: Get all agent graphs in the project with their full definitions
      const graphsList = await db.query.agentGraph.findMany({
        where: and(eq(agentGraph.tenantId, tenantId), eq(agentGraph.projectId, projectId)),
      });

      const agentGraphsObject: Record<string, any> = {};
      const allAgentsObject: Record<string, any> = {};
      const allToolsObject: Record<string, any> = {};
      const allDataComponentsObject: Record<string, any> = {};
      const allArtifactComponentsObject: Record<string, any> = {};

      // Fetch full definition for each graph
      for (const graph of graphsList) {
        const fullGraph = await getFullGraphDefinition(db)({
          scopes: { tenantId, projectId },
          graphId: graph.id,
        });

        if (fullGraph) {
          agentGraphsObject[graph.id] = fullGraph;

          // Aggregate agents from all graphs
          if (fullGraph.agents) {
            Object.assign(allAgentsObject, fullGraph.agents);
          }

          // Aggregate tools from all graphs
          if (fullGraph.tools) {
            Object.assign(allToolsObject, fullGraph.tools);
          }

          // Aggregate data components from all graphs
          if (fullGraph.dataComponents) {
            Object.assign(allDataComponentsObject, fullGraph.dataComponents);
          }

          // Aggregate artifact components from all graphs
          if (fullGraph.artifactComponents) {
            Object.assign(allArtifactComponentsObject, fullGraph.artifactComponents);
          }
        }
      }

      // Step 3: Get all context configs in the project
      const contextConfigsList = await db.query.contextConfigs.findMany({
        where: and(eq(contextConfigs.tenantId, tenantId), eq(contextConfigs.projectId, projectId)),
      });

      const contextConfigsObject: Record<string, any> = {};
      for (const config of contextConfigsList) {
        contextConfigsObject[config.id] = {
          id: config.id,
          name: config.name,
          description: config.description,
          requestContextSchema: config.requestContextSchema,
          contextVariables: config.contextVariables,
        };
      }

      // Step 4: Get all external agents in the project
      const externalAgentsList = await db.query.externalAgents.findMany({
        where: and(eq(externalAgents.tenantId, tenantId), eq(externalAgents.projectId, projectId)),
      });

      const externalAgentsObject: Record<string, any> = {};
      for (const extAgent of externalAgentsList) {
        externalAgentsObject[extAgent.id] = {
          id: extAgent.id,
          name: extAgent.name,
          description: extAgent.description,
          baseUrl: extAgent.baseUrl,
          credentialReferenceId: extAgent.credentialReferenceId,
          headers: extAgent.headers,
        };
      }

      // Step 5: Get API keys for the project (masked for security)
      const apiKeysList = await db.query.apiKeys.findMany({
        where: and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.projectId, projectId)),
      });

      const maskedApiKeys = apiKeysList.map((key) => ({
        id: key.id,
        name: key.publicId, // Use publicId as name since there's no name field
        keyPrefix: key.keyPrefix, // Already masked in database
        graphId: key.graphId,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
      }));

      // Step 6: Build the full project definition
      const result: FullProjectDefinition = {
        // Base project fields
        id: project.id,
        name: project.name,
        description: project.description,
        models: project.models,
        stopWhen: project.stopWhen,
        createdAt:
          project.createdAt && !Number.isNaN(new Date(project.createdAt).getTime())
            ? new Date(project.createdAt).toISOString()
            : new Date().toISOString(),
        updatedAt:
          project.updatedAt && !Number.isNaN(new Date(project.updatedAt).getTime())
            ? new Date(project.updatedAt).toISOString()
            : new Date().toISOString(),

        // Related entities
        agentGraphs: agentGraphsObject,
        agents: allAgentsObject,
        tools: allToolsObject,
        contextConfigs: contextConfigsObject,
        externalAgents: externalAgentsObject,
      };

      // Add optional fields if they have content
      if (Object.keys(allDataComponentsObject).length > 0) {
        result.dataComponents = allDataComponentsObject;
      }

      if (Object.keys(allArtifactComponentsObject).length > 0) {
        result.artifactComponents = allArtifactComponentsObject;
      }

      if (maskedApiKeys.length > 0) {
        result.apiKeys = maskedApiKeys;
      }

      logger.info(
        {
          tenantId,
          projectId,
          graphCount: Object.keys(agentGraphsObject).length,
          agentCount: Object.keys(allAgentsObject).length,
          toolCount: Object.keys(allToolsObject).length,
        },
        'Full project retrieved successfully'
      );

      return result;
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