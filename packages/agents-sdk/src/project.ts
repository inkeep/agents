import type {
  CredentialReferenceApiInsert,
  ExternalAgentApiInsert,
  FullProjectDefinition,
  ProjectModels,
  StopWhen,
  ToolApiInsert,
} from '@inkeep/agents-core';
import { getLogger } from '@inkeep/agents-core';

const logger = getLogger('project');

import type { Agent } from './agent';
import type { ArtifactComponent } from './artifact-component';
import type { DataComponent } from './data-component';
import type { ExternalAgent } from './external-agent';
import { FunctionTool } from './function-tool';
import { updateFullProjectViaAPI } from './projectFullClient';
import type { Tool } from './tool';
import type { AgentTool, ModelSettings } from './types';

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
  agents?: () => Agent[];
  tools?: () => Tool[];
  externalAgents?: () => ExternalAgent[];
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
  getAgents(): Agent[];
  addAgent(agent: Agent): void;
  removeAgent(id: string): boolean;
  getStats(): {
    projectId: string;
    tenantId: string;
    agentCount: number;
    initialized: boolean;
  };
  validate(): { valid: boolean; errors: string[] };
}

/**
 * Project class for managing agent projects
 *
 * Projects are the top-level organizational unit that contains Agents, Sub Agents, and shared configurations.
 * They provide model inheritance and execution limits that cascade down to Agents and Sub Agents.
 *
 * @example
 * ```typescript
 * const myProject = new Project({
 *   id: 'customer-support-project',
 *   name: 'Customer Support System',
 *   description: 'Multi-agent customer support system',
 *   models: {
 *     base: { model: 'gpt-4.1-mini' },
 *     structuredOutput: { model: 'gpt-4.1' }
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
  private agents: Agent[] = [];
  private agentMap: Map<string, Agent> = new Map();
  private credentialReferences?: Array<CredentialReferenceApiInsert> = [];
  private projectTools: Tool[] = [];
  private projectDataComponents: DataComponent[] = [];
  private projectArtifactComponents: ArtifactComponent[] = [];
  private projectExternalAgents: ExternalAgent[] = [];
  private externalAgentMap: Map<string, ExternalAgent> = new Map();

  constructor(config: ProjectConfig) {
    this.projectId = config.id;
    this.projectName = config.name;
    this.projectDescription = config.description;
    // Check environment variable first, fallback to default
    this.tenantId = process.env.INKEEP_TENANT_ID || 'default';
    this.baseURL = process.env.INKEEP_API_URL || 'http://localhost:3002';
    this.models = config.models;
    this.stopWhen = config.stopWhen;

    // Initialize agent if provided
    if (config.agents) {
      this.agents = config.agents();
      this.agentMap = new Map(this.agents.map((agent) => [agent.getId(), agent]));

      // Set project context on agent
      for (const agent of this.agents) {
        agent.setConfig(this.tenantId, this.projectId, this.baseURL);
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

    // Initialize project-level externalAgents if provided
    if (config.externalAgents) {
      this.projectExternalAgents = config.externalAgents();
      this.externalAgentMap = new Map(
        this.projectExternalAgents.map((externalAgent) => [externalAgent.getId(), externalAgent])
      );
    }

    logger.info(
      {
        projectId: this.projectId,
        tenantId: this.tenantId,
        agentCount: this.agents.length,
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

    // Update all agent with new config
    for (const agent of this.agents) {
      agent.setConfig(tenantId, this.projectId, apiUrl);
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
        agentCount: this.agents.length,
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
          agentCount: Object.keys((createdProject as any).agent || {}).length,
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
    usage: Record<string, Array<{ type: string; id: string; agentId?: string }>>;
  }> {
    const fullDef = await this.toFullProjectDefinition();
    const credentials = fullDef.credentialReferences || {};
    const usage: Record<string, Array<{ type: string; id: string; agentId?: string }>> = {};

    // Extract usage information from credentials
    for (const [credId, credData] of Object.entries(credentials)) {
      if ((credData as any).usedBy) {
        usage[credId] = (credData as any).usedBy;
      }
    }

    return { credentials, usage };
  }

  async getFullDefinition(): Promise<FullProjectDefinition> {
    return await this.toFullProjectDefinition();
  }

  /**
   * Get all agent in the project
   */
  getAgents(): Agent[] {
    return this.agents;
  }

  /**
   * Get all external agents in the project
   */
  getExternalAgents(): ExternalAgent[] {
    return this.projectExternalAgents;
  }

  /**
   * Get an external agent by ID
   */
  getExternalAgent(id: string): ExternalAgent | undefined {
    return this.externalAgentMap.get(id);
  }

  /**
   * Add an external agent to the project
   */
  addExternalAgent(externalAgent: ExternalAgent): void {
    this.projectExternalAgents.push(externalAgent);
    this.externalAgentMap.set(externalAgent.getId(), externalAgent);
  }

  /**
   * Remove an external agent from the project
   */
  removeExternalAgent(id: string): boolean {
    const externalAgentToRemove = this.externalAgentMap.get(id);
    if (externalAgentToRemove) {
      this.externalAgentMap.delete(id);
      this.projectExternalAgents = this.projectExternalAgents.filter(
        (externalAgent) => externalAgent.getId() !== id
      );
      logger.info(
        {
          projectId: this.projectId,
          externalAgentId: id,
        },
        'External agent removed from project'
      );
      return true;
    }
    return false;
  }

  /**
   * Get an agent by ID
   */
  getAgent(id: string): Agent | undefined {
    return this.agentMap.get(id);
  }

  /**
   * Add an agent to the project
   */
  addAgent(agent: Agent): void {
    this.agents.push(agent);
    this.agentMap.set(agent.getId(), agent);

    // Set project context on the agent
    agent.setConfig(this.tenantId, this.projectId, this.baseURL);

    logger.info(
      {
        projectId: this.projectId,
        agentId: agent.getId(),
      },
      'Agent added to project'
    );
  }

  /**
   * Remove an agent from the project
   */
  removeAgent(id: string): boolean {
    const agentToRemove = this.agentMap.get(id);
    if (agentToRemove) {
      this.agentMap.delete(id);
      this.agents = this.agents.filter((agent) => agent.getId() !== id);

      logger.info(
        {
          projectId: this.projectId,
          agentId: id,
        },
        'Agent removed from project'
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
    agentCount: number;
    initialized: boolean;
  } {
    return {
      projectId: this.projectId,
      tenantId: this.tenantId,
      agentCount: this.agents.length,
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

    // Validate agent IDs are unique
    const agentIds = new Set<string>();
    for (const agent of this.agents) {
      const id = agent.getId();
      if (agentIds.has(id)) {
        errors.push(`Duplicate agent ID: ${id}`);
      }
      agentIds.add(id);
    }

    // Validate individual agent
    for (const agent of this.agents) {
      const agentValidation = agent.validate();
      if (!agentValidation.valid) {
        errors.push(...agentValidation.errors.map((error) => `Agent '${agent.getId()}': ${error}`));
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
    const agentsObject: Record<string, any> = {};
    const toolsObject: Record<string, ToolApiInsert> = {};
    const functionToolsObject: Record<string, any> = {};
    const functionsObject: Record<string, any> = {};
    const dataComponentsObject: Record<string, any> = {};
    const artifactComponentsObject: Record<string, any> = {};
    const credentialReferencesObject: Record<string, any> = {};
    const externalAgentsObject: Record<string, ExternalAgentApiInsert> = {};
    // Track which resources use each credential
    const credentialUsageMap: Record<
      string,
      Array<{ type: string; id: string; agentId?: string }>
    > = {};

    // Convert all agent to FullAgentDefinition format and collect components
    for (const agent of this.agents) {
      // Get the agent's full definition
      logger.info({ agentId: agent.getId() }, 'Agent id');
      const agentDefinition = await agent.toFullAgentDefinition();
      agentsObject[agent.getId()] = agentDefinition;

      // Collect credentials from this agent
      const agentCredentials = (agent as any).credentials;
      if (agentCredentials && Array.isArray(agentCredentials)) {
        for (const credential of agentCredentials) {
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
            // Track that this agent uses this credential
            credentialUsageMap[credential.id].push({
              type: 'agent',
              id: agent.getId(),
            });
          }
        }
      }

      // Check context config for credentials
      const agentContextConfig = (agent as any).contextConfig;
      if (agentContextConfig) {
        const contextVariables =
          agentContextConfig.getContextVariables?.() || agentContextConfig.contextVariables;
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
                  agentId: agent.getId(),
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
                agentId: agent.getId(),
              });
            }
          }
        }
      }

      // Collect project-level resources from all sub-agents in this agent
      for (const subAgent of agent.getSubAgents()) {
        const agentTools = subAgent.getTools();
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

            // Add to functionTools object (function tools are now separate)
            if (!functionToolsObject[toolId]) {
              const toolData = actualTool.serializeTool();

              functionToolsObject[toolId] = {
                id: toolData.id,
                name: toolData.name,
                description: toolData.description,
                functionId: toolData.functionId,
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

                // Extract inline credential from tool if present
                if ('credential' in mcpTool.config && mcpTool.config.credential) {
                  const credential = mcpTool.config.credential;
                  if (credential && credential.id && credential.__type !== 'credential-ref') {
                    // Add credential to project-level credentials if not already present
                    if (!credentialReferencesObject[credential.id]) {
                      credentialReferencesObject[credential.id] = {
                        id: credential.id,
                        type: credential.type,
                        credentialStoreId: credential.credentialStoreId,
                        retrievalParams: credential.retrievalParams,
                      };
                      credentialUsageMap[credential.id] = [];
                    }
                    // Track that this tool uses this credential
                    credentialUsageMap[credential.id].push({
                      type: 'tool',
                      id: toolId,
                    });
                  }
                }

                toolsObject[toolId] = toolData;
              }
            }
          }
        }

        // Collect data components from this agent
        const subAgentDataComponents = (subAgent as any).getDataComponents?.();
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
        const subAgentArtifactComponents = subAgent.getArtifactComponents();
        if (subAgentArtifactComponents) {
          for (const artifactComponent of subAgentArtifactComponents) {
            // Handle both ArtifactComponent instances and plain objects
            let artifactComponentId: string;
            let artifactComponentName: string;
            let artifactComponentDescription: string;
            let artifactComponentProps: any;

            if ('getId' in artifactComponent && typeof artifactComponent.getId === 'function') {
              // ArtifactComponent instance - cast to access methods
              const component = artifactComponent as any;
              artifactComponentId = component.getId();
              artifactComponentName = component.getName();
              artifactComponentDescription = component.getDescription() || '';
              artifactComponentProps = component.getProps() || {};
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

        // Collect external agents from this agent
        const subAgentExternalAgents = subAgent.getExternalAgentDelegates();
        if (subAgentExternalAgents) {
          for (const externalAgentDelegate of subAgentExternalAgents) {
            const externalAgent = externalAgentDelegate.externalAgent;
            const credential = externalAgent.getCredentialReference();
            if (credential) {
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
              // Track that this external agent uses this credential
              logger.info({ credentialId: credential.id }, 'Credential id in external agent');
              credentialUsageMap[credential.id].push({
                type: 'externalAgent',
                id: externalAgent.getId(),
              });
            }
            logger.info({ externalAgentId: externalAgent.getId() }, 'External agent id');
            externalAgentsObject[externalAgent.getId()] = {
              id: externalAgent.getId(),
              name: externalAgent.getName(),
              description: externalAgent.getDescription(),
              baseUrl: externalAgent.getBaseUrl(),
              credentialReferenceId: externalAgent.getCredentialReferenceId(),
            };
          }
        }
      }
    }
    logger.info({ externalAgentsObject }, 'External agents object');
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
      agents: agentsObject,
      tools: toolsObject,
      functions: Object.keys(functionsObject).length > 0 ? functionsObject : undefined,
      dataComponents:
        Object.keys(dataComponentsObject).length > 0 ? dataComponentsObject : undefined,
      artifactComponents:
        Object.keys(artifactComponentsObject).length > 0 ? artifactComponentsObject : undefined,
      externalAgents:
        Object.keys(externalAgentsObject).length > 0 ? externalAgentsObject : undefined,
      credentialReferences:
        Object.keys(credentialReferencesObject).length > 0 ? credentialReferencesObject : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
