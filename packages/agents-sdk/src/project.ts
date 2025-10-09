import type {
  CredentialReferenceApiInsert,
  FullProjectDefinition,
  ProjectModels,
  StopWhen,
  ToolApiInsert,
} from '@inkeep/agents-core';
import { getLogger } from '@inkeep/agents-core';

const logger = getLogger('project');

import type { ArtifactComponent } from './artifact-component';
import type { DataComponent } from './data-component';
import { FunctionTool } from './function-tool';
import type { AgentGraph } from './graph';
import { updateFullProjectViaAPI } from './projectFullClient';
import type { Tool } from './tool';
import type { AgentTool, ModelSettings, SandboxConfig } from './types';

/**
 * Project configuration interface for the SDK
 */
export interface ProjectConfig {
  id: string;
  name: string;
  description?: string;
  models?: {
    base?: ModelSettings;
    structuredOutput?: ModelSettings;
    summarizer?: ModelSettings;
  };
  stopWhen?: StopWhen;
  sandboxConfig?: SandboxConfig;
  graphs?: () => AgentGraph[];
  tools?: () => Tool[];
  dataComponents?: () => DataComponent[];
  artifactComponents?: () => ArtifactComponent[];
  credentialReferences?: () => CredentialReferenceApiInsert[];
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
  private apiKey?: string;
  private initialized = false;
  private models?: {
    base?: ModelSettings;
    structuredOutput?: ModelSettings;
    summarizer?: ModelSettings;
  };
  private stopWhen?: StopWhen;
  private sandboxConfig?: SandboxConfig;
  private graphs: AgentGraph[] = [];
  private graphMap: Map<string, AgentGraph> = new Map();
  private credentialReferences?: Array<CredentialReferenceApiInsert> = [];
  private projectTools: Tool[] = [];
  private projectDataComponents: DataComponent[] = [];
  private projectArtifactComponents: ArtifactComponent[] = [];

  constructor(config: ProjectConfig) {
    this.projectId = config.id;
    this.projectName = config.name;
    this.projectDescription = config.description;
    // Check environment variable first, fallback to default
    this.tenantId = process.env.INKEEP_TENANT_ID || 'default';
    this.baseURL = process.env.INKEEP_API_URL || 'http://localhost:3002';
    this.models = config.models;
    this.stopWhen = config.stopWhen;
    this.sandboxConfig = config.sandboxConfig;

    // Initialize graphs if provided
    if (config.graphs) {
      this.graphs = config.graphs();
      this.graphMap = new Map(this.graphs.map((graph) => [graph.getId(), graph]));

      // Set project context on graphs
      for (const graph of this.graphs) {
        graph.setConfig(this.tenantId, this.projectId, this.baseURL);
      }
    }

    // Initialize project-level tools if provided
    if (config.tools) {
      this.projectTools = config.tools();
    }

    // Initialize project-level dataComponents if provided
    if (config.dataComponents) {
      this.projectDataComponents = config.dataComponents();
    }

    // Initialize project-level artifactComponents if provided
    if (config.artifactComponents) {
      this.projectArtifactComponents = config.artifactComponents();
    }

    // Initialize project-level credentialReferences if provided
    if (config.credentialReferences) {
      this.credentialReferences = config.credentialReferences();
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
  setConfig(
    tenantId: string,
    apiUrl: string,
    models?: ProjectConfig['models'],
    apiKey?: string
  ): void {
    if (this.initialized) {
      throw new Error('Cannot set config after project has been initialized');
    }

    this.tenantId = tenantId;
    this.baseURL = apiUrl;
    this.apiKey = apiKey;

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
        hasApiKey: !!this.apiKey,
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
        projectDefinition,
        this.apiKey
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
   * Get credential tracking information
   */
  async getCredentialTracking(): Promise<{
    credentials: Record<string, any>;
    usage: Record<string, Array<{ type: string; id: string; graphId?: string }>>;
  }> {
    const fullDef = await this.toFullProjectDefinition();
    const credentials = fullDef.credentialReferences || {};
    const usage: Record<string, Array<{ type: string; id: string; graphId?: string }>> = {};

    // Extract usage information from credentials
    for (const [credId, credData] of Object.entries(credentials)) {
      if ((credData as any).usedBy) {
        usage[credId] = (credData as any).usedBy;
      }
    }

    return { credentials, usage };
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
    const toolsObject: Record<string, ToolApiInsert> = {};
    const functionsObject: Record<string, any> = {};
    const dataComponentsObject: Record<string, any> = {};
    const artifactComponentsObject: Record<string, any> = {};
    const credentialReferencesObject: Record<string, any> = {};
    // Track which resources use each credential
    const credentialUsageMap: Record<
      string,
      Array<{ type: string; id: string; graphId?: string }>
    > = {};

    // Convert all graphs to FullGraphDefinition format and collect components
    for (const graph of this.graphs) {
      // Get the graph's full definition
      const graphDefinition = await graph.toFullGraphDefinition();
      graphsObject[graph.getId()] = graphDefinition;

      // Collect credentials from this graph
      const graphCredentials = (graph as any).credentials;
      if (graphCredentials && Array.isArray(graphCredentials)) {
        for (const credential of graphCredentials) {
          // Skip credential references - they don't define credentials
          if (credential?.__type === 'credential-ref') {
            continue;
          }

          if (credential?.id) {
            // Add credential to project-level credentials
            if (!credentialReferencesObject[credential.id]) {
              credentialReferencesObject[credential.id] = {
                id: credential.id,
                type: credential.type,
                credentialStoreId: credential.credentialStoreId,
                retrievalParams: credential.retrievalParams,
              };
              credentialUsageMap[credential.id] = [];
            }
            // Track that this graph uses this credential
            credentialUsageMap[credential.id].push({
              type: 'graph',
              id: graph.getId(),
            });
          }
        }
      }

      // Check context config for credentials
      const graphContextConfig = (graph as any).contextConfig;
      if (graphContextConfig) {
        const contextVariables =
          graphContextConfig.getContextVariables?.() || graphContextConfig.contextVariables;
        if (contextVariables) {
          for (const [key, variable] of Object.entries(contextVariables)) {
            // Check for credential references in fetch definitions
            if ((variable as any)?.credential) {
              const credential = (variable as any).credential;
              let credId: string | undefined;

              // Check if it's a credential reference
              if (credential.__type === 'credential-ref') {
                credId = credential.id;
                // Resolve from injected credentials if available
                if (credId && this.credentialReferences) {
                  const resolvedCred = this.credentialReferences.find((c) => c.id === credId);
                  if (resolvedCred && !credentialReferencesObject[credId]) {
                    credentialReferencesObject[credId] = resolvedCred;
                    credentialUsageMap[credId] = [];
                  }
                }
              } else if (credential.id) {
                // Direct credential object
                credId = credential.id;
                if (credId && !credentialReferencesObject[credId]) {
                  credentialReferencesObject[credId] = credential;
                  credentialUsageMap[credId] = [];
                }
              }

              if (credId) {
                if (!credentialUsageMap[credId]) {
                  credentialUsageMap[credId] = [];
                }
                credentialUsageMap[credId].push({
                  type: 'contextVariable',
                  id: key,
                  graphId: graph.getId(),
                });
              }
            }
            // Also check legacy credentialReferenceId field
            else if ((variable as any)?.credentialReferenceId) {
              const credId = (variable as any).credentialReferenceId;
              if (!credentialUsageMap[credId]) {
                credentialUsageMap[credId] = [];
              }
              credentialUsageMap[credId].push({
                type: 'contextVariable',
                id: key,
                graphId: graph.getId(),
              });
            }
          }
        }
      }

      // Collect tools from all agents in this graph
      for (const agent of graph.getAgents()) {
        if (agent.type === 'external') {
          continue; // Skip external agents
        }

        const agentTools = agent.getTools();
        for (const [, toolInstance] of Object.entries(agentTools)) {
          // toolInstance is now properly typed as AgentTool from getTools()
          const actualTool: AgentTool | FunctionTool = toolInstance;
          const toolId = actualTool.getId();

          // Handle function tools and MCP tools
          if (
            actualTool.constructor.name === 'FunctionTool' &&
            actualTool instanceof FunctionTool
          ) {
            // Add to functions object (global entity)
            if (!functionsObject[toolId]) {
              const functionData = actualTool.serializeFunction();
              functionsObject[toolId] = functionData;
            }

            // Also add to tools object with type 'function' (reference-only, no duplication)
            if (!toolsObject[toolId]) {
              const toolData = actualTool.serializeTool();

              const toolConfig: ToolApiInsert['config'] = {
                type: 'function',
                // No inline function details - they're in the functions table via functionId
              };

              toolsObject[toolId] = {
                id: toolData.id,
                name: toolData.name,
                description: toolData.description,
                functionId: toolData.functionId,
                config: toolConfig,
              };
            }
          } else {
            // Add to tools object (MCP tools)
            if (!toolsObject[toolId]) {
              // Type guard to ensure this is a Tool (MCP tool)
              if ('config' in actualTool && 'serverUrl' in actualTool.config) {
                const mcpTool = actualTool as any; // Cast to access MCP-specific properties
                const toolConfig: ToolApiInsert['config'] = {
                  type: 'mcp',
                  mcp: {
                    server: {
                      url: mcpTool.config.serverUrl,
                    },
                    transport: mcpTool.config.transport,
                    activeTools: mcpTool.config.activeTools,
                  },
                };

                const toolData: ToolApiInsert = {
                  id: toolId,
                  name: actualTool.getName(),
                  config: toolConfig,
                };

                // Add additional fields if available
                if (mcpTool.config?.imageUrl) {
                  toolData.imageUrl = mcpTool.config.imageUrl;
                }
                if (mcpTool.config?.headers) {
                  toolData.headers = mcpTool.config.headers;
                }
                if ('getCredentialReferenceId' in actualTool) {
                  const credentialId = (actualTool as any).getCredentialReferenceId();
                  if (credentialId) {
                    toolData.credentialReferenceId = credentialId;
                  }
                }

                toolsObject[toolId] = toolData;
              }
            }
          }
        }

        // Collect data components from this agent
        const subAgentDataComponents = (agent as any).getDataComponents?.();
        if (subAgentDataComponents) {
          for (const dataComponent of subAgentDataComponents) {
            // Handle both DataComponent instances and plain objects
            let dataComponentId: string;
            let dataComponentName: string;
            let dataComponentDescription: string;
            let dataComponentProps: any;

            if (dataComponent.getId) {
              // DataComponent instance
              dataComponentId = dataComponent.getId();
              dataComponentName = dataComponent.getName();
              dataComponentDescription = dataComponent.getDescription() || '';
              dataComponentProps = dataComponent.getProps() || {};
            } else {
              // Plain object from agent config
              dataComponentId =
                dataComponent.id ||
                (dataComponent.name ? dataComponent.name.toLowerCase().replace(/\s+/g, '-') : '');
              dataComponentName = dataComponent.name || '';
              dataComponentDescription = dataComponent.description || '';
              dataComponentProps = dataComponent.props || {};
            }

            // Only add if not already added (avoid duplicates)
            if (!dataComponentsObject[dataComponentId] && dataComponentName) {
              dataComponentsObject[dataComponentId] = {
                id: dataComponentId,
                name: dataComponentName,
                description: dataComponentDescription,
                props: dataComponentProps,
              };
            }
          }
        }

        // Collect artifact components from this agent
        const subAgentArtifactComponents = (agent as any).getArtifactComponents?.();
        if (subAgentArtifactComponents) {
          for (const artifactComponent of subAgentArtifactComponents) {
            // Handle both ArtifactComponent instances and plain objects
            let artifactComponentId: string;
            let artifactComponentName: string;
            let artifactComponentDescription: string;
            let artifactComponentProps: any;

            if (artifactComponent.getId) {
              // ArtifactComponent instance
              artifactComponentId = artifactComponent.getId();
              artifactComponentName = artifactComponent.getName();
              artifactComponentDescription = artifactComponent.getDescription() || '';
              artifactComponentProps = artifactComponent.getProps() || {};
            } else {
              // Plain object from agent config
              artifactComponentId =
                artifactComponent.id ||
                (artifactComponent.name
                  ? artifactComponent.name.toLowerCase().replace(/\s+/g, '-')
                  : '');
              artifactComponentName = artifactComponent.name || '';
              artifactComponentDescription = artifactComponent.description || '';
              artifactComponentProps = artifactComponent.props || {};
            }

            // Only add if not already added (avoid duplicates)
            if (!artifactComponentsObject[artifactComponentId] && artifactComponentName) {
              artifactComponentsObject[artifactComponentId] = {
                id: artifactComponentId,
                name: artifactComponentName,
                description: artifactComponentDescription,
                props: artifactComponentProps,
              };
            }
          }
        }
      }
    }

    // Add project-level tools, dataComponents, and artifactComponents
    for (const tool of this.projectTools) {
      const toolId = tool.getId();
      if (!toolsObject[toolId]) {
        const toolConfig: ToolApiInsert['config'] = {
          type: 'mcp',
          mcp: {
            server: {
              url: tool.config.serverUrl,
            },
            transport: tool.config.transport,
            activeTools: tool.config.activeTools,
          },
        };

        const toolData: ToolApiInsert = {
          id: toolId,
          name: tool.getName(),
          config: toolConfig,
        };

        if (tool.config?.imageUrl) {
          toolData.imageUrl = tool.config.imageUrl;
        }
        if (tool.config?.headers) {
          toolData.headers = tool.config.headers;
        }
        const credentialId = tool.getCredentialReferenceId();
        if (credentialId) {
          toolData.credentialReferenceId = credentialId;
        }

        toolsObject[toolId] = toolData;
      }
    }

    // Add project-level data components
    for (const dataComponent of this.projectDataComponents) {
      const dataComponentId = dataComponent.getId();
      const dataComponentName = dataComponent.getName();
      const dataComponentDescription = dataComponent.getDescription() || '';
      const dataComponentProps = dataComponent.getProps() || {};

      if (!dataComponentsObject[dataComponentId] && dataComponentName) {
        dataComponentsObject[dataComponentId] = {
          id: dataComponentId,
          name: dataComponentName,
          description: dataComponentDescription,
          props: dataComponentProps,
        };
      }
    }

    // Add project-level artifact components
    for (const artifactComponent of this.projectArtifactComponents) {
      const artifactComponentId = artifactComponent.getId();
      const artifactComponentName = artifactComponent.getName();
      const artifactComponentDescription = artifactComponent.getDescription() || '';
      const artifactComponentProps = artifactComponent.getProps() || {};

      if (!artifactComponentsObject[artifactComponentId] && artifactComponentName) {
        artifactComponentsObject[artifactComponentId] = {
          id: artifactComponentId,
          name: artifactComponentName,
          description: artifactComponentDescription,
          props: artifactComponentProps,
        };
      }
    }

    // Merge in any credentials set via setCredentials() method
    if (this.credentialReferences && this.credentialReferences.length > 0) {
      for (const credential of this.credentialReferences) {
        if (credential.id) {
          // Only add if not already present
          if (!credentialReferencesObject[credential.id]) {
            credentialReferencesObject[credential.id] = credential;
            credentialUsageMap[credential.id] = [];
          }
        }
      }
    }

    // Add usedBy information to credentials
    for (const [credId, usages] of Object.entries(credentialUsageMap)) {
      if (credentialReferencesObject[credId]) {
        credentialReferencesObject[credId].usedBy = usages;
      }
    }

    return {
      id: this.projectId,
      name: this.projectName,
      description: this.projectDescription || '',
      models: this.models as ProjectModels,
      stopWhen: this.stopWhen,
      sandboxConfig: this.sandboxConfig,
      graphs: graphsObject,
      tools: toolsObject,
      functions: Object.keys(functionsObject).length > 0 ? functionsObject : undefined,
      dataComponents:
        Object.keys(dataComponentsObject).length > 0 ? dataComponentsObject : undefined,
      artifactComponents:
        Object.keys(artifactComponentsObject).length > 0 ? artifactComponentsObject : undefined,
      credentialReferences:
        Object.keys(credentialReferencesObject).length > 0 ? credentialReferencesObject : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
