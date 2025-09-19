import type {
  CredentialReferenceApiInsert,
  FullProjectDefinition,
  ProjectApiInsert,
  ProjectModels,
  StopWhen,
} from '@inkeep/agents-core';
import { getLogger } from '@inkeep/agents-core';

const logger = getLogger('project');

import type { AgentGraph } from './graph';
import { updateFullProjectViaAPI } from './projectFullClient';
import type { ModelSettings } from './types';

/**
 * Project configuration interface for the SDK
 */
export interface ProjectConfig {
  id: string;
  name: string;
  description?: string;
  tenantId?: string;
  models?: {
    base?: ModelSettings;
    structuredOutput?: ModelSettings;
    summarizer?: ModelSettings;
  };
  stopWhen?: StopWhen;
  graphs?: () => AgentGraph[];
}

/**
 * Project interface for operations
 */
export interface ProjectInterface {
  init(): Promise<void>;
  setConfig(tenantId: string, apiUrl: string): void;
  getId(): string;
  getName(): string;
  getDescription(): string | undefined;
  getTenantId(): string;
  getModels(): ProjectConfig['models'];
  getStopWhen(): ProjectConfig['stopWhen'];
  getGraphs(): AgentGraph[];
  addGraph(graph: AgentGraph): void;
  removeGraph(id: string): boolean;
  getStats(): {
    projectId: string;
    tenantId: string;
    graphCount: number;
    initialized: boolean;
  };
  validate(): { valid: boolean; errors: string[] };
}

/**
 * Project class for managing agent projects
 *
 * Projects are the top-level organizational unit that contains graphs, agents, and shared configurations.
 * They provide model inheritance and execution limits that cascade down to graphs and agents.
 *
 * @example
 * ```typescript
 * const myProject = new Project({
 *   id: 'customer-support-project',
 *   name: 'Customer Support System',
 *   description: 'Multi-agent customer support system',
 *   models: {
 *     base: { model: 'gpt-4o-mini' },
 *     structuredOutput: { model: 'gpt-4o' }
 *   },
 *   stopWhen: {
 *     transferCountIs: 10,
 *     stepCountIs: 50
 *   }
 * });
 *
 * await myProject.init();
 * ```
 */
export class Project implements ProjectInterface {
  public readonly __type = 'project' as const;
  private projectId: string;
  private projectName: string;
  private projectDescription?: string;
  private tenantId: string;
  private baseURL: string;
  private initialized = false;
  private models?: {
    base?: ModelSettings;
    structuredOutput?: ModelSettings;
    summarizer?: ModelSettings;
  };
  private stopWhen?: StopWhen;
  private graphs: AgentGraph[] = [];
  private graphMap: Map<string, AgentGraph> = new Map();
  private credentialReferences?: Array<CredentialReferenceApiInsert> = [];

  constructor(config: ProjectConfig) {
    this.projectId = config.id;
    this.projectName = config.name;
    this.projectDescription = config.description;
    this.tenantId = config.tenantId || 'default';
    this.baseURL = process.env.INKEEP_API_URL || 'http://localhost:3002';
    this.models = config.models;
    this.stopWhen = config.stopWhen;

    // Initialize graphs if provided
    if (config.graphs) {
      this.graphs = config.graphs();
      this.graphMap = new Map(this.graphs.map((graph) => [graph.getId(), graph]));

      // Set project context on graphs
      for (const graph of this.graphs) {
        graph.setConfig(this.tenantId, this.projectId, this.baseURL);
      }
    }

    logger.info(
      {
        projectId: this.projectId,
        tenantId: this.tenantId,
        graphCount: this.graphs.length,
      },
      'Project created'
    );
  }

  /**
   * Set or update the configuration (tenantId and apiUrl)
   * This is used by the CLI to inject configuration from inkeep.config.ts
   */
  setConfig(tenantId: string, apiUrl: string, models?: ProjectConfig['models']): void {
    if (this.initialized) {
      throw new Error('Cannot set config after project has been initialized');
    }

    this.tenantId = tenantId;
    this.baseURL = apiUrl;

    // Update models if provided
    if (models) {
      this.models = models;
    }

    // Update all graphs with new config
    for (const graph of this.graphs) {
      graph.setConfig(tenantId, this.projectId, apiUrl);
    }

    logger.info(
      {
        projectId: this.projectId,
        tenantId: this.tenantId,
        apiUrl: this.baseURL,
        hasModels: !!this.models,
      },
      'Project configuration updated'
    );
  }

  /**
   * Set credential references for the project
   * This is used by the CLI to inject environment-specific credentials
   */
  setCredentials(credentials: Record<string, CredentialReferenceApiInsert>): void {
    this.credentialReferences = Object.values(credentials);

    logger.info(
      {
        projectId: this.projectId,
        credentialCount: this.credentialReferences?.length || 0,
      },
      'Project credentials updated'
    );
  }

  /**
   * Initialize the project and create/update it in the backend using full project approach
   */
  async init(): Promise<void> {
    if (this.initialized) {
      logger.info({ projectId: this.projectId }, 'Project already initialized');
      return;
    }

    logger.info(
      {
        projectId: this.projectId,
        tenantId: this.tenantId,
        graphCount: this.graphs.length,
      },
      'Initializing project using full project endpoint'
    );

    try {
      // First, create the project metadata without graphs to ensure it exists in the database
      const projectMetadata = {
        id: this.projectId,
        name: this.projectName,
        description: this.projectDescription || '',
        models: this.models as any,
        stopWhen: this.stopWhen,
        graphs: {}, // Empty graphs object for now
        tools: {}, // Empty tools object
        credentialReferences: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      logger.info(
        {
          projectId: this.projectId,
          mode: 'api-client',
          apiUrl: this.baseURL,
        },
        'Creating project metadata first'
      );

      // Create the project metadata first
      await updateFullProjectViaAPI(this.tenantId, this.baseURL, this.projectId, projectMetadata);

      logger.info(
        {
          projectId: this.projectId,
        },
        'Project metadata created successfully'
      );

      // Now initialize all graphs (they can now reference the existing project)
      const initPromises = this.graphs.map(async (graph) => {
        try {
          await graph.init();
          logger.debug(
            {
              projectId: this.projectId,
              graphId: graph.getId(),
            },
            'Graph initialized in project'
          );
        } catch (error) {
          logger.error(
            {
              projectId: this.projectId,
              graphId: graph.getId(),
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            'Failed to initialize graph in project'
          );
          throw error;
        }
      });

      await Promise.all(initPromises);

      // Convert to FullProjectDefinition format
      const projectDefinition = await this.toFullProjectDefinition();

      // Use the full project API endpoint
      logger.info(
        {
          projectId: this.projectId,
          mode: 'api-client',
          apiUrl: this.baseURL,
        },
        'Using API client to create/update full project'
      );

      // Try update first (upsert behavior)
      const createdProject = await updateFullProjectViaAPI(
        this.tenantId,
        this.baseURL,
        this.projectId,
        projectDefinition
      );

      this.initialized = true;

      logger.info(
        {
          projectId: this.projectId,
          tenantId: this.tenantId,
          graphCount: Object.keys((createdProject as any).graphs || {}).length,
        },
        'Project initialized successfully using full project endpoint'
      );
    } catch (error) {
      logger.error(
        {
          projectId: this.projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to initialize project using full project endpoint'
      );
      throw error;
    }
  }

  /**
   * Get the project ID
   */
  getId(): string {
    return this.projectId;
  }

  /**
   * Get the project name
   */
  getName(): string {
    return this.projectName;
  }

  /**
   * Get the project description
   */
  getDescription(): string | undefined {
    return this.projectDescription;
  }

  /**
   * Get the tenant ID
   */
  getTenantId(): string {
    return this.tenantId;
  }

  /**
   * Get the project's model configuration
   */
  getModels(): ProjectConfig['models'] {
    return this.models;
  }

  /**
   * Set the project's model configuration
   */
  setModels(models: ProjectConfig['models']): void {
    this.models = models;
  }

  /**
   * Get the project's stopWhen configuration
   */
  getStopWhen(): ProjectConfig['stopWhen'] {
    return this.stopWhen;
  }

  /**
   * Set the project's stopWhen configuration
   */
  setStopWhen(stopWhen: ProjectConfig['stopWhen']): void {
    this.stopWhen = stopWhen;
  }

  /**
   * Get all graphs in the project
   */
  getGraphs(): AgentGraph[] {
    return this.graphs;
  }

  /**
   * Get a graph by ID
   */
  getGraph(id: string): AgentGraph | undefined {
    return this.graphMap.get(id);
  }

  /**
   * Add a graph to the project
   */
  addGraph(graph: AgentGraph): void {
    this.graphs.push(graph);
    this.graphMap.set(graph.getId(), graph);

    // Set project context on the graph
    graph.setConfig(this.tenantId, this.projectId, this.baseURL);

    logger.info(
      {
        projectId: this.projectId,
        graphId: graph.getId(),
      },
      'Graph added to project'
    );
  }

  /**
   * Remove a graph from the project
   */
  removeGraph(id: string): boolean {
    const graphToRemove = this.graphMap.get(id);
    if (graphToRemove) {
      this.graphMap.delete(id);
      this.graphs = this.graphs.filter((graph) => graph.getId() !== id);

      logger.info(
        {
          projectId: this.projectId,
          graphId: id,
        },
        'Graph removed from project'
      );

      return true;
    }

    return false;
  }

  /**
   * Get project statistics
   */
  getStats(): {
    projectId: string;
    tenantId: string;
    graphCount: number;
    initialized: boolean;
  } {
    return {
      projectId: this.projectId,
      tenantId: this.tenantId,
      graphCount: this.graphs.length,
      initialized: this.initialized,
    };
  }

  /**
   * Validate the project configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.projectId) {
      errors.push('Project must have an ID');
    }

    if (!this.projectName) {
      errors.push('Project must have a name');
    }

    // Validate graph IDs are unique
    const graphIds = new Set<string>();
    for (const graph of this.graphs) {
      const id = graph.getId();
      if (graphIds.has(id)) {
        errors.push(`Duplicate graph ID: ${id}`);
      }
      graphIds.add(id);
    }

    // Validate individual graphs
    for (const graph of this.graphs) {
      const graphValidation = graph.validate();
      if (!graphValidation.valid) {
        errors.push(...graphValidation.errors.map((error) => `Graph '${graph.getId()}': ${error}`));
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Convert the Project to FullProjectDefinition format
   */
  private async toFullProjectDefinition(): Promise<FullProjectDefinition> {
    const graphsObject: Record<string, any> = {};
    const toolsObject: Record<string, any> = {};
    const dataComponentsObject: Record<string, any> = {};
    const artifactComponentsObject: Record<string, any> = {};

    // Convert all graphs to FullGraphDefinition format and collect components
    for (const graph of this.graphs) {
      // Get the graph's full definition
      const graphDefinition = await (graph as any).toFullGraphDefinition();
      graphsObject[graph.getId()] = graphDefinition;

      // Collect tools from all agents in this graph
      for (const agent of (graph as any).agents) {
        if (!(agent as any).getTools) {
          continue; // Skip external agents
        }

        const agentTools = (agent as any).getTools();
        for (const [toolName, toolInstance] of Object.entries(agentTools)) {
          if (toolInstance && typeof toolInstance === 'object') {
            let actualTool: any;
            let toolId: string;

            // Check if this is an AgentMcpConfig
            if ('server' in toolInstance && 'selectedTools' in toolInstance) {
              const mcpConfig = toolInstance as any;
              actualTool = mcpConfig.server;
              toolId = actualTool.getId();
            } else {
              // Regular tool instance
              actualTool = toolInstance;
              toolId = actualTool.getId?.() || actualTool.id || toolName;
            }

            // Only add if not already added (avoid duplicates across graphs)
            if (!toolsObject[toolId]) {
              let toolConfig: any;

              // Check if it's an IPCTool with MCP server configuration
              if (actualTool.config?.serverUrl) {
                toolConfig = {
                  type: 'mcp',
                  mcp: {
                    server: {
                      url: actualTool.config.serverUrl,
                    },
                  },
                };
              } else if (actualTool.config?.type === 'mcp') {
                // Already has proper MCP config
                toolConfig = actualTool.config;
              } else {
                // Fallback for function tools or uninitialized tools
                toolConfig = {
                  type: 'function',
                  parameters: actualTool.parameters || {},
                };
              }

              const toolData: any = {
                id: toolId,
                name: actualTool.config?.name || actualTool.name || toolName,
                config: toolConfig,
                status: actualTool.getStatus?.() || actualTool.status || 'unknown',
              };

              // Add additional fields if available
              if (actualTool.config?.imageUrl) {
                toolData.imageUrl = actualTool.config.imageUrl;
              }
              if (actualTool.config?.headers) {
                toolData.headers = actualTool.config.headers;
              }
              if (actualTool.capabilities) {
                toolData.capabilities = actualTool.capabilities;
              }
              if (actualTool.lastHealthCheck) {
                toolData.lastHealthCheck = actualTool.lastHealthCheck;
              }
              if (actualTool.availableTools) {
                toolData.availableTools = actualTool.availableTools;
              }
              if (actualTool.lastError) {
                toolData.lastError = actualTool.lastError;
              }
              if (actualTool.lastToolsSync) {
                toolData.lastToolsSync = actualTool.lastToolsSync;
              }
              // Add credential reference ID if available
              if (actualTool.getCredentialReferenceId?.()) {
                toolData.credentialReferenceId = actualTool.getCredentialReferenceId();
              }

              toolsObject[toolId] = toolData;
            }
          }
        }

        // Collect data components from this agent
        const agentDataComponents = (agent as any).getDataComponents?.();
        if (agentDataComponents) {
          for (const dataComponent of agentDataComponents) {
            const dataComponentId =
              dataComponent.id || dataComponent.name.toLowerCase().replace(/\s+/g, '-');

            // Only add if not already added (avoid duplicates)
            if (!dataComponentsObject[dataComponentId]) {
              dataComponentsObject[dataComponentId] = {
                id: dataComponentId,
                name: dataComponent.name,
                description: dataComponent.description || '',
                props: dataComponent.props || {},
              };
            }
          }
        }

        // Collect artifact components from this agent
        const agentArtifactComponents = (agent as any).getArtifactComponents?.();
        if (agentArtifactComponents) {
          for (const artifactComponent of agentArtifactComponents) {
            const artifactComponentId =
              artifactComponent.id || artifactComponent.name.toLowerCase().replace(/\s+/g, '-');

            // Only add if not already added (avoid duplicates)
            if (!artifactComponentsObject[artifactComponentId]) {
              artifactComponentsObject[artifactComponentId] = {
                id: artifactComponentId,
                name: artifactComponent.name,
                description: artifactComponent.description || '',
                summaryProps: artifactComponent.summaryProps || {},
                fullProps: artifactComponent.fullProps || {},
              };
            }
          }
        }
      }
    }

    return {
      id: this.projectId,
      name: this.projectName,
      description: this.projectDescription || '',
      models: this.models as ProjectModels,
      stopWhen: this.stopWhen,
      graphs: graphsObject,
      tools: toolsObject,
      dataComponents: Object.keys(dataComponentsObject).length > 0 ? dataComponentsObject : undefined,
      artifactComponents: Object.keys(artifactComponentsObject).length > 0 ? artifactComponentsObject : undefined,
      credentialReferences: undefined, // Projects don't directly hold credentials yet
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Convert project configuration to API format
   */
  private toApiFormat(): ProjectApiInsert {
    return {
      id: this.projectId,
      name: this.projectName,
      description: this.projectDescription || '',
      models: this.models as ProjectModels,
      stopWhen: this.stopWhen,
    };
  }
}
