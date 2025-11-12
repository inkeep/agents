import {
  type AgentStopWhen,
  type CredentialReferenceApiInsert,
  type FullAgentDefinition,
  getLogger,
  type StatusUpdateSettings,
} from '@inkeep/agents-core';
import { convertZodToJsonSchema, isZodSchema } from '@inkeep/agents-core/utils/schema-conversion';
import { updateFullAgentViaAPI } from './agentFullClient';
import { FunctionTool } from './function-tool';
import { getFullProjectViaAPI } from './projectFullClient';
import type {
  AgentConfig,
  AgentInterface,
  AllDelegateInputInterface,
  GenerateOptions,
  MessageInput,
  ModelSettings,
  RunResult,
  StreamResponse,
  SubAgentInterface,
  subAgentTeamAgentInterface,
} from './types';

const logger = getLogger('agent');

// Helper function to resolve getter functions
function resolveGetter<T>(value: T | (() => T) | undefined): T | undefined {
  if (typeof value === 'function') {
    return (value as () => T)();
  }
  return value as T | undefined;
}

export class Agent implements AgentInterface {
  private subAgents: SubAgentInterface[] = [];
  private agentMap: Map<string, SubAgentInterface> = new Map();
  private defaultSubAgent?: SubAgentInterface;
  private baseURL: string;
  private tenantId: string;
  private projectId: string;
  private agentId: string;
  private agentName: string;
  private agentDescription?: string;
  private initialized = false;
  private contextConfig?: any; // ContextConfigBuilder
  private credentials?: CredentialReferenceApiInsert[];
  private models?: {
    base?: ModelSettings;
    structuredOutput?: ModelSettings;
    summarizer?: ModelSettings;
  };
  private statusUpdateSettings?: StatusUpdateSettings;
  private prompt?: string;
  private stopWhen?: AgentStopWhen;

  constructor(config: AgentConfig) {
    this.defaultSubAgent = config.defaultSubAgent;
    // tenantId and projectId will be set by setConfig method from CLI or other sources
    this.tenantId = 'default';
    this.projectId = 'default'; // Default project ID, will be overridden by setConfig
    this.agentId = config.id;
    this.agentName = config.name || this.agentId;
    this.agentDescription = config.description;
    this.baseURL = process.env.INKEEP_API_URL || 'http://localhost:3002';
    this.contextConfig = config.contextConfig;
    this.credentials = resolveGetter(config.credentials);
    this.models = config.models;

    this.statusUpdateSettings = config.statusUpdates;
    this.prompt = config.prompt;
    // Set stopWhen - preserve original config or set default during inheritance
    this.stopWhen = config.stopWhen
      ? {
          transferCountIs: config.stopWhen.transferCountIs,
        }
      : undefined;
    this.subAgents = resolveGetter(config.subAgents) || [];
    this.agentMap = new Map(this.subAgents.map((agent) => [agent.getId(), agent]));

    // Add default agent to map if not already present
    if (this.defaultSubAgent) {
      const isAlreadyPresent = this.subAgents.some(
        (agent) => agent.getId() === this.defaultSubAgent?.getId()
      );
      if (!isAlreadyPresent) {
        this.subAgents.push(this.defaultSubAgent);
      }
      this.agentMap.set(this.defaultSubAgent.getId(), this.defaultSubAgent);
    }

    // Propagate agent-level models to agents immediately (if agent has models)
    if (this.models) {
      this.propagateImmediateModelSettings();
    }

    logger.info(
      {
        agentId: this.agentId,
        tenantId: this.tenantId,
        agentCount: this.subAgents.length,
        defaultSubAgent: this.defaultSubAgent?.getName(),
      },
      'Agent created'
    );
  }

  /**
   * Set or update the configuration (tenantId, projectId and apiUrl)
   * This is used by the CLI to inject configuration from inkeep.config.ts
   */
  setConfig(tenantId: string, projectId: string, apiUrl: string): void {
    if (this.initialized) {
      throw new Error('Cannot set config after agent has been initialized');
    }

    this.tenantId = tenantId;
    this.projectId = projectId;
    this.baseURL = apiUrl;

    // Propagate tenantId, projectId, and apiUrl to all agents and their tools
    for (const subAgent of this.subAgents) {
      // Set the context on the agent
      if (subAgent.setContext) {
        subAgent.setContext(tenantId, projectId, apiUrl);
      }

      // Also update tools in this agent
      const tools = subAgent.getTools();
      for (const [_, toolInstance] of Object.entries(tools)) {
        if (toolInstance && typeof toolInstance === 'object') {
          // Set context on the tool if it has the method
          if ('setContext' in toolInstance && typeof toolInstance.setContext === 'function') {
            toolInstance.setContext(tenantId, projectId, apiUrl);
          }
        }
      }
    }

    // Update context config tenant ID, project ID, and agent ID if present
    if (this.contextConfig?.setContext) {
      this.contextConfig.setContext(tenantId, projectId, this.agentId, this.baseURL);
    }

    logger.info(
      {
        agentId: this.agentId,
        tenantId: this.tenantId,
        projectId: this.projectId,
        apiUrl: this.baseURL,
      },
      'Agent configuration updated'
    );
  }

  /**
   * Convert the Agent to FullAgentDefinition format for the new agent endpoint
   */
  async toFullAgentDefinition(): Promise<FullAgentDefinition> {
    const subAgentsObject: Record<string, any> = {};
    const externalAgentsObject: Record<string, any> = {};
    const functionToolsObject: Record<string, any> = {};
    const functionsObject: Record<string, any> = {};

    for (const subAgent of this.subAgents) {
      // Get agent relationships
      const transfers = subAgent.getTransfers();
      const delegates = subAgent.getDelegates();

      // Convert tools to the expected format (agent.tools should be an array of tool IDs)
      const tools: string[] = [];
      const selectedToolsMapping: Record<string, string[]> = {};
      const headersMapping: Record<string, Record<string, string>> = {};
      const subAgentTools = subAgent.getTools();

      for (const [_toolName, toolInstance] of Object.entries(subAgentTools)) {
        const toolId = toolInstance.getId();

        if (toolInstance.selectedTools) {
          selectedToolsMapping[toolId] = toolInstance.selectedTools;
        }

        if (toolInstance.headers) {
          headersMapping[toolId] = toolInstance.headers;
        }

        tools.push(toolId);

        // Handle function tools - collect them for agent-level functionTools and functions
        if (
          toolInstance.constructor.name === 'FunctionTool' &&
          toolInstance instanceof FunctionTool
        ) {
          // Add to functions object (global entity)
          if (!functionsObject[toolId]) {
            const functionData = toolInstance.serializeFunction();
            functionsObject[toolId] = functionData;
          }

          // Add to functionTools object (agent-scoped)
          if (!functionToolsObject[toolId]) {
            const toolData = toolInstance.serializeTool();
            functionToolsObject[toolId] = {
              id: toolData.id,
              name: toolData.name,
              description: toolData.description,
              functionId: toolData.functionId,
              agentId: this.agentId, // Include agentId for agent-scoped function tools
            };
          }
        }
      }

      const subAgentExternalAgents = subAgent.getExternalAgentDelegates();
      for (const externalAgentDelegate of subAgentExternalAgents) {
        const externalAgent = externalAgentDelegate.externalAgent;
        externalAgentsObject[externalAgent.getId()] = {
          id: externalAgent.getId(),
          name: externalAgent.getName(),
          description: externalAgent.getDescription(),
          baseUrl: externalAgent.getBaseUrl(),
          credentialReferenceId: externalAgent.getCredentialReferenceId(),
          type: 'external',
        };
      }

      // Convert dataComponents to the expected format (agent.dataComponents should be an array of dataComponent IDs)
      const dataComponents: string[] = [];
      const subAgentDataComponents = subAgent.getDataComponents();
      if (subAgentDataComponents) {
        for (const dataComponent of subAgentDataComponents) {
          const dataComponentId =
            dataComponent.id || dataComponent.name.toLowerCase().replace(/\s+/g, '-');
          dataComponents.push(dataComponentId);
        }
      }

      // Convert artifactComponents to the expected format (agent.artifactComponents should be an array of artifactComponent IDs)
      const artifactComponents: string[] = [];
      const subAgentArtifactComponents = subAgent.getArtifactComponents();
      if (subAgentArtifactComponents) {
        for (const artifactComponent of subAgentArtifactComponents) {
          const artifactComponentId =
            artifactComponent.id || artifactComponent.name.toLowerCase().replace(/\s+/g, '-');
          artifactComponents.push(artifactComponentId);
        }
      }

      // Convert tools and selectedTools to canUse array
      // Always include canUse for internal agents (even if empty) as it's required by the API
      const canUse = tools.map((toolId) => ({
        toolId,
        toolSelection: selectedToolsMapping[toolId] || null,
        headers: headersMapping[toolId] || null,
      }));

      subAgentsObject[subAgent.getId()] = {
        id: subAgent.getId(),
        name: subAgent.getName(),
        description: subAgent.config.description || `Agent ${subAgent.getName()}`,
        prompt: subAgent.getInstructions(),
        models: subAgent.config.models,
        stopWhen: subAgent.config.stopWhen,
        canTransferTo: transfers.map((h) => h.getId()),
        canDelegateTo: delegates.map((d) => {
          if (typeof d === 'object' && 'externalAgent' in d) {
            return {
              externalAgentId: d.externalAgent.getId(),
              ...(d.headers && { headers: d.headers }),
            };
          }
          if (typeof d === 'object' && 'agent' in d) {
            return {
              agentId: d.agent.getId(),
              ...(d.headers && { headers: d.headers }),
            };
          }
          return d.getId();
        }),
        canUse,
        dataComponents: dataComponents.length > 0 ? dataComponents : undefined,
        artifactComponents: artifactComponents.length > 0 ? artifactComponents : undefined,
        type: 'internal',
      };
    }

    // Note: Tools are now managed at the PROJECT level, not agent level
    // This agent only stores agent definitions with tool ID references
    // The actual tool definitions are stored in the project's tools object

    // Note: DataComponents and ArtifactComponents are also managed at PROJECT level
    // Agent definitions only reference their IDs, actual definitions are in project

    const processedStatusUpdates = this.statusUpdateSettings
      ? {
          ...this.statusUpdateSettings,
          statusComponents: this.statusUpdateSettings.statusComponents?.map((comp: any) => {
            if (comp && typeof comp.getType === 'function') {
              return {
                type: comp.getType(),
                description: comp.getDescription(),
                detailsSchema: comp.getDetailsSchema(),
              };
            }
            if (
              comp &&
              typeof comp === 'object' &&
              comp.detailsSchema &&
              isZodSchema(comp.detailsSchema)
            ) {
              const jsonSchema = convertZodToJsonSchema(comp.detailsSchema);
              return {
                type: comp.type,
                description: comp.description,
                detailsSchema: {
                  type: 'object',
                  properties: (jsonSchema.properties as Record<string, any>) || {},
                  required: (jsonSchema.required as string[]) || undefined,
                },
              };
            }
            return comp;
          }),
        }
      : undefined;

    // Collect tools used by this agent's subAgents for agent-level tools field
    const agentToolsObject: Record<string, any> = {};
    for (const subAgent of this.subAgents) {
      const subAgentTools = subAgent.getTools();
      for (const [_toolName, toolInstance] of Object.entries(subAgentTools)) {
        const toolId = toolInstance.getId();
        // Only include MCP tools, not function tools (function tools go to project level)
        if (toolInstance.constructor.name !== 'FunctionTool') {
          if (!agentToolsObject[toolId]) {
            // This should match the project-level tool format
            if ('config' in toolInstance && 'serverUrl' in toolInstance.config) {
              const mcpTool = toolInstance as any;
              agentToolsObject[toolId] = {
                id: toolId,
                name: toolInstance.getName(),
                description: null,
                config: {
                  type: 'mcp',
                  mcp: {
                    server: {
                      url: mcpTool.config.serverUrl,
                    },
                    transport: mcpTool.config.transport,
                    activeTools: mcpTool.config.activeTools,
                  },
                },
                credentialReferenceId: null,
              };
            }
          }
        }
      }
    }

    return {
      id: this.agentId,
      name: this.agentName,
      description: this.agentDescription,
      defaultSubAgentId: this.defaultSubAgent?.getId() || '',
      subAgents: subAgentsObject,
      externalAgents: externalAgentsObject,
      contextConfig: this.contextConfig?.toObject(),
      // Include tools used by subAgents at agent level (MCP tools only)
      ...(Object.keys(agentToolsObject).length > 0 && { tools: agentToolsObject }),
      // Include function tools at agent level
      ...(Object.keys(functionToolsObject).length > 0 && { functionTools: functionToolsObject }),
      ...(Object.keys(functionsObject).length > 0 && { functions: functionsObject }),
      models: this.models,
      stopWhen: this.stopWhen,
      statusUpdates: processedStatusUpdates,
      prompt: this.prompt,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Initialize all tools in all agents (especially IPCTools that need MCP server URLs)
   */
  private async initializeAllTools(): Promise<void> {
    logger.info({ agentId: this.agentId }, 'Initializing all tools in agent');

    const toolInitPromises: Promise<void>[] = [];

    for (const subAgent of this.subAgents) {
      const agentTools = subAgent.getTools();

      for (const [toolName, toolInstance] of Object.entries(agentTools)) {
        if (toolInstance && typeof toolInstance === 'object') {
          // Check if this is a tool that needs initialization
          if (typeof (toolInstance as any).init === 'function') {
            toolInitPromises.push(
              (async () => {
                try {
                  // Skip database registration for all tools since agentFull will handle it
                  const skipDbRegistration =
                    toolInstance.constructor.name === 'IPCTool' ||
                    toolInstance.constructor.name === 'HostedTool' ||
                    toolInstance.constructor.name === 'Tool';
                  if (typeof (toolInstance as any).init === 'function') {
                    if (skipDbRegistration) {
                      await (toolInstance as any).init({
                        skipDatabaseRegistration: true,
                      });
                    } else {
                      await (toolInstance as any).init();
                    }
                  }
                  logger.debug(
                    {
                      subAgentId: subAgent.getId(),
                      toolName,
                      toolType: toolInstance.constructor.name,
                      skipDbRegistration,
                    },
                    'Tool initialized successfully'
                  );
                } catch (error) {
                  logger.error(
                    {
                      subAgentId: subAgent.getId(),
                      toolName,
                      error: error instanceof Error ? error.message : 'Unknown error',
                    },
                    'Failed to initialize tool'
                  );
                  throw error;
                }
              })()
            );
          }
        }
      }
    }

    await Promise.all(toolInitPromises);
    logger.info(
      { agentId: this.agentId, toolCount: toolInitPromises.length },
      'All tools initialized successfully'
    );
  }

  /**
   * Initialize the agent and all agents in the backend using the new agent endpoint
   */
  async init(): Promise<void> {
    if (this.initialized) {
      logger.info({ agentId: this.agentId }, 'Agent already initialized');
      return;
    }

    logger.info(
      {
        agentId: this.agentId,
        agentCount: this.subAgents.length,
      },
      'Initializing agent using new agent endpoint'
    );

    try {
      // Initialize all tools first (especially IPCTools that need MCP server URLs)
      await this.initializeAllTools();

      // Apply model inheritance hierarchy (Project -> Agent -> Agent)
      await this.applyModelInheritance();

      // Convert to FullAgentDefinition format
      const agentDefinition = await this.toFullAgentDefinition();

      // Always use API mode (baseURL is always set)
      logger.info(
        {
          agentId: this.agentId,
          mode: 'api-client',
          apiUrl: this.baseURL,
        },
        'Using API client to create/update agent'
      );

      // Try update first (upsert behavior)
      const createdAgent = await updateFullAgentViaAPI(
        this.tenantId,
        this.projectId,
        this.baseURL,
        this.agentId,
        agentDefinition
      );

      logger.info(
        {
          agentId: this.agentId,
          agentCount: Object.keys(createdAgent.subAgents || {}).length,
        },
        'Agent initialized successfully using agent endpoint'
      );

      this.initialized = true;
    } catch (error) {
      logger.error(
        {
          agentId: this.agentId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to initialize agent using agent endpoint'
      );
      throw error;
    }
  }

  /**
   * Generate a response using the default agent
   */
  async generate(input: MessageInput, options?: GenerateOptions): Promise<string> {
    await this._init();

    if (!this.defaultSubAgent) {
      throw new Error('No default agent configured for this agent');
    }

    logger.info(
      {
        agentId: this.agentId,
        defaultSubAgent: this.defaultSubAgent.getName(),
        conversationId: options?.conversationId,
      },
      'Generating response with default agent'
    );

    // Use the proper backend execution instead of the local runner
    const response = await this.executeWithBackend(input, options);
    return response;
  }

  /**
   * Stream a response using the default agent
   */
  async stream(input: MessageInput, options?: GenerateOptions): Promise<StreamResponse> {
    await this._init();

    if (!this.defaultSubAgent) {
      throw new Error('No default agent configured for this agent');
    }

    logger.info(
      {
        agentId: this.agentId,
        defaultSubAgent: this.defaultSubAgent.getName(),
        conversationId: options?.conversationId,
      },
      'Streaming response with default agent'
    );

    // Delegate to the agent's stream method with backend
    // For now, create a simple async generator that yields the response
    const textStream = async function* (agent: Agent) {
      const response = await agent.executeWithBackend(input, options);
      // Simulate streaming by yielding chunks
      const words = response.split(' ');
      for (const word of words) {
        yield `${word} `;
      }
    };

    return {
      textStream: textStream(this),
    };
  }

  /**
   * Alias for stream() method for consistency with naming patterns
   */
  async generateStream(input: MessageInput, options?: GenerateOptions): Promise<StreamResponse> {
    return await this.stream(input, options);
  }

  /**
   * Run with a specific agent from the agent
   */
  async runWith(
    subAgentId: string,
    input: MessageInput,
    options?: GenerateOptions
  ): Promise<RunResult> {
    await this._init();

    const agent = this.getSubAgent(subAgentId);
    if (!agent) {
      throw new Error(`Agent '${subAgentId}' not found in agent`);
    }

    logger.info(
      {
        agentId: this.agentId,
        subAgentId,
        conversationId: options?.conversationId,
      },
      'Running with specific agent'
    );

    // Use backend execution and wrap result in RunResult format
    const response = await this.executeWithBackend(input, options);

    return {
      finalOutput: response,
      agent: agent,
      turnCount: 1,
      usage: { inputTokens: 0, outputTokens: 0 },
      metadata: {
        toolCalls: [],
        transfers: [],
      },
    };
  }

  /**
   * Get an agent by name (unified method for all agent types)
   */
  getSubAgent(name: string): SubAgentInterface | undefined {
    return this.agentMap.get(name);
  }

  /**
   * Add an agent to the agent
   */
  addSubAgent(agent: SubAgentInterface): void {
    this.subAgents.push(agent);
    this.agentMap.set(agent.getId(), agent);

    // Apply immediate model inheritance if agent has models
    if (this.models) {
      this.propagateModelSettingsToAgent(agent);
    }

    logger.info(
      {
        agentId: this.agentId,
        subAgentId: agent.getId(),
      },
      'SubAgent added to agent'
    );
  }

  /**
   * Remove an agent from the agent
   */
  removeSubAgent(id: string): boolean {
    const agentToRemove = this.agentMap.get(id);
    if (agentToRemove) {
      this.agentMap.delete(agentToRemove.getId());
      this.subAgents = this.subAgents.filter((agent) => agent.getId() !== agentToRemove.getId());

      logger.info(
        {
          agentId: this.agentId,
          subAgentId: agentToRemove.getId(),
        },
        'Agent removed from agent'
      );

      return true;
    }

    return false;
  }

  /**
   * Get all agents in the agent
   */
  getSubAgents(): SubAgentInterface[] {
    return this.subAgents;
  }

  /**
   * Get all agent ids (unified method for all agent types)
   */
  getSubAgentIds(): string[] {
    return Array.from(this.agentMap.keys());
  }

  /**
   * Set the default agent
   */
  setDefaultSubAgent(agent: SubAgentInterface): void {
    this.defaultSubAgent = agent;
    this.addSubAgent(agent); // Ensure it's in the agent

    logger.info(
      {
        agentId: this.agentId,
        defaultSubAgent: agent.getId(),
      },
      'Default agent updated'
    );
  }

  /**
   * Get the default agent
   */
  getDefaultSubAgent(): SubAgentInterface | undefined {
    return this.defaultSubAgent;
  }

  /**
   * Get the agent ID
   */
  getId(): string {
    return this.agentId;
  }

  getName(): string {
    return this.agentName;
  }

  getDescription(): string | undefined {
    return this.agentDescription;
  }

  getTenantId(): string {
    return this.tenantId;
  }

  /**
   * Get the agent's model settingsuration
   */
  getModels(): typeof this.models {
    return this.models;
  }

  /**
   * Set the agent's model settingsuration
   */
  setModels(models: typeof this.models): void {
    this.models = models;
  }

  /**
   * Get the agent's prompt configuration
   */
  getPrompt(): string | undefined {
    return this.prompt;
  }

  /**
   * Get the agent's stopWhen configuration
   */
  getStopWhen(): AgentStopWhen {
    return this.stopWhen || { transferCountIs: 10 };
  }

  /**
   * Get the agent's status updates configuration
   */
  getStatusUpdateSettings(): StatusUpdateSettings | undefined {
    return this.statusUpdateSettings;
  }

  /**
   * Get the summarizer model from the agent's model settings
   */
  getSummarizerModel(): ModelSettings | undefined {
    return this.models?.summarizer;
  }

  /**
   * Get agent statistics
   */
  getStats(): {
    agentCount: number;
    defaultSubAgent: string | null;
    initialized: boolean;
    agentId: string;
    tenantId: string;
  } {
    return {
      agentCount: this.subAgents.length,
      defaultSubAgent: this.defaultSubAgent?.getName() || null,
      initialized: this.initialized,
      agentId: this.agentId,
      tenantId: this.tenantId,
    };
  }

  with(options: { headers?: Record<string, string> }): subAgentTeamAgentInterface {
    return {
      agent: this,
      headers: options.headers,
    };
  }

  /**
   * Validate the agent configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.subAgents.length === 0) {
      errors.push('Agent must contain at least one agent');
    }

    if (!this.defaultSubAgent) {
      errors.push('Agent must have a default agent');
    }

    // Validate agent names are unique
    const names = new Set<string>();
    for (const subAgent of this.subAgents) {
      const name = subAgent.getName();
      if (names.has(name)) {
        errors.push(`Duplicate agent name: ${name}`);
      }
      names.add(name);
    }

    // Validate agent relationships (transfer and delegation)
    for (const subAgent of this.subAgents) {
      // Validate transfer relationships
      const transfers = subAgent.getTransfers();
      for (const transferAgent of transfers) {
        if (!this.agentMap.has(transferAgent.getName())) {
          errors.push(
            `Agent '${subAgent.getName()}' has transfer to '${transferAgent.getName()}' which is not in the agent`
          );
        }
      }

      // Validate delegation relationships
      const delegates = subAgent.getDelegates();
      for (const delegateAgent of delegates) {
        if (this.isInternalAgent(delegateAgent)) {
          if (!this.agentMap.has(delegateAgent.getName())) {
            errors.push(
              `Agent '${subAgent.getName()}' has delegation to '${delegateAgent.getName()}' which is not in the agent`
            );
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Private helper methods
  private async _init(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Type guard to check if an agent is an internal AgentInterface
   */
  isInternalAgent(agent: AllDelegateInputInterface): agent is SubAgentInterface {
    // Internal agents have getTransfers, getDelegates, and other AgentInterface methods
    // External agents only have basic identification methods
    return 'getTransfers' in agent && typeof (agent as any).getTransfers === 'function';
  }

  /**
   * Get project-level model settingsuration defaults
   */
  private async getProjectModelDefaults(): Promise<typeof this.models | undefined> {
    try {
      const project = await getFullProjectViaAPI(this.tenantId, this.projectId, this.baseURL);

      return (project as any)?.models;
    } catch (error) {
      logger.warn(
        {
          tenantId: this.tenantId,
          projectId: this.projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get project model defaults'
      );
      return undefined;
    }
  }

  /**
   * Get project-level stopWhen configuration defaults
   */
  private async getProjectStopWhenDefaults(): Promise<
    { transferCountIs?: number; stepCountIs?: number } | undefined
  > {
    try {
      const project = await getFullProjectViaAPI(this.tenantId, this.projectId, this.baseURL);

      return (project as any)?.stopWhen;
    } catch (error) {
      logger.warn(
        {
          tenantId: this.tenantId,
          projectId: this.projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get project stopWhen defaults'
      );
      return undefined;
    }
  }

  /**
   * Apply model inheritance hierarchy: Project -> Agent -> Agent
   */
  private async applyModelInheritance(): Promise<void> {
    // Always get project defaults to check for partial inheritance
    const projectModels = await this.getProjectModelDefaults();

    if (projectModels) {
      // Initialize models object if it doesn't exist
      if (!this.models) {
        this.models = {};
      }

      // Inherit individual model types from project if not set at agent level
      if (!this.models.base && projectModels.base) {
        this.models.base = projectModels.base;
      }
      if (!this.models.structuredOutput && projectModels.structuredOutput) {
        this.models.structuredOutput = projectModels.structuredOutput;
      }
      if (!this.models.summarizer && projectModels.summarizer) {
        this.models.summarizer = projectModels.summarizer;
      }
    }

    // Apply stopWhen inheritance: Project -> Agent -> Agent
    await this.applyStopWhenInheritance();

    // Propagate to agents
    for (const subAgent of this.subAgents) {
      this.propagateModelSettingsToAgent(subAgent as SubAgentInterface);
    }
  }

  /**
   * Apply stopWhen inheritance hierarchy: Project -> Agent -> Agent
   */
  private async applyStopWhenInheritance(): Promise<void> {
    // Get project stopWhen defaults
    const projectStopWhen = await this.getProjectStopWhenDefaults();

    // Initialize stopWhen if it doesn't exist (agent had no stopWhen config)
    if (!this.stopWhen) {
      this.stopWhen = {};
    }

    // Inherit transferCountIs from project if agent doesn't have it explicitly set
    if (
      this.stopWhen.transferCountIs === undefined &&
      projectStopWhen?.transferCountIs !== undefined
    ) {
      this.stopWhen.transferCountIs = projectStopWhen.transferCountIs;
    }

    // Set default transferCountIs if still not set
    if (this.stopWhen.transferCountIs === undefined) {
      this.stopWhen.transferCountIs = 10;
    }

    // Propagate stepCountIs from project to agents
    if (projectStopWhen?.stepCountIs !== undefined) {
      for (const subAgent of this.subAgents) {
        // Initialize agent stopWhen if it doesn't exist
        if (!subAgent.config.stopWhen) {
          subAgent.config.stopWhen = {};
        }

        // Inherit stepCountIs from project if not set at agent level
        if (subAgent.config.stopWhen.stepCountIs === undefined) {
          subAgent.config.stopWhen.stepCountIs = projectStopWhen.stepCountIs;
        }
      }
    }

    logger.debug(
      {
        agentId: this.agentId,
        agentStopWhen: this.stopWhen,
        projectStopWhen,
      },
      'Applied stopWhen inheritance from project to agent'
    );
  }

  /**
   * Propagate agent-level model settings to agents (supporting partial inheritance)
   */
  private propagateModelSettingsToAgent(agent: SubAgentInterface): void {
    if (this.models) {
      // Initialize agent models if they don't exist
      if (!agent.config.models) {
        agent.config.models = {};
      }

      // Inherit individual model types from agent if not set at agent level
      if (!agent.config.models.base && this.models.base) {
        agent.config.models.base = this.models.base;
      }
      if (!agent.config.models.structuredOutput && this.models.structuredOutput) {
        agent.config.models.structuredOutput = this.models.structuredOutput;
      }
      if (!agent.config.models.summarizer && this.models.summarizer) {
        agent.config.models.summarizer = this.models.summarizer;
      }
    }
  }

  /**
   * Immediately propagate agent-level models to all agents during construction
   */
  private propagateImmediateModelSettings(): void {
    for (const subAgent of this.subAgents) {
      this.propagateModelSettingsToAgent(subAgent as SubAgentInterface);
    }
  }

  /**
   * Execute agent using the backend system instead of local runner
   */
  private async executeWithBackend(
    input: MessageInput,
    options?: GenerateOptions
  ): Promise<string> {
    const normalizedMessages = this.normalizeMessages(input);

    const url = `${this.baseURL}/tenants/${this.tenantId}/agent/${this.agentId}/v1/chat/completions`;

    logger.info({ url }, 'Executing with backend');
    const requestBody = {
      model: 'gpt-4o-mini',
      messages: normalizedMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      ...options,
      // Include conversationId for multi-turn support
      ...(options?.conversationId && {
        conversationId: options.conversationId,
      }),
      // Include context data if available
      ...(options?.customBodyParams && { ...options.customBodyParams }),
      stream: false, // Explicitly disable streaming - must come after options to override
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();

      // Check if response is SSE format (starts with "data:")
      if (responseText.startsWith('data:')) {
        // Parse SSE response
        return this.parseStreamingResponse(responseText);
      }

      // Parse regular JSON response
      const data = JSON.parse(responseText);
      return data.result || data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      throw new Error(`Agent execution failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Parse streaming response in SSE format
   */
  private parseStreamingResponse(text: string): string {
    const lines = text.split('\n');
    let content = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6); // Remove 'data: ' prefix
        if (dataStr === '[DONE]') break;

        try {
          const data = JSON.parse(dataStr);
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            content += delta;
          }
        } catch (_e) {
          // Skip invalid JSON lines
        }
      }
    }

    return content;
  }

  /**
   * Normalize input messages to the expected format
   */
  private normalizeMessages(input: MessageInput): Array<{ role: string; content: string }> {
    if (typeof input === 'string') {
      return [{ role: 'user', content: input }];
    }
    if (Array.isArray(input)) {
      return input.map((msg) => (typeof msg === 'string' ? { role: 'user', content: msg } : msg));
    }
    return [input];
  }

  private async saveToDatabase(): Promise<void> {
    try {
      // Check if agent already exists
      const getUrl = `${this.baseURL}/tenants/${this.tenantId}/agents/${this.agentId}`;

      try {
        const getResponse = await fetch(getUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (getResponse.ok) {
          logger.info({ agentId: this.agentId }, 'Agent already exists in backend');
          return;
        }

        if (getResponse.status !== 404) {
          throw new Error(`HTTP ${getResponse.status}: ${getResponse.statusText}`);
        }
      } catch (error: any) {
        if (!error.message.includes('404')) {
          throw error;
        }
      }

      // Agent doesn't exist, create it
      logger.info({ agentId: this.agentId }, 'Creating agent in backend');

      const createUrl = `${this.baseURL}/tenants/${this.tenantId}/agents`;
      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: this.agentId,
          name: this.agentName,
          defaultSubAgentId: this.defaultSubAgent?.getId() || '',
          contextConfigId: this.contextConfig?.getId(),
          models: this.models,
        }),
      });

      if (!createResponse.ok) {
        throw new Error(`HTTP ${createResponse.status}: ${createResponse.statusText}`);
      }

      const createData = (await createResponse.json()) as {
        data: { id: string };
      };
      this.agentId = createData.data.id;
      logger.info({ agent: createData.data }, 'Agent created in backend');
    } catch (error) {
      throw new Error(
        `Failed to save agent to database: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async saveRelations(): Promise<void> {
    if (this.defaultSubAgent) {
      try {
        const updateUrl = `${this.baseURL}/tenants/${this.tenantId}/agents/${this.agentId}`;
        const updateResponse = await fetch(updateUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: this.agentId,
            defaultSubAgentId: this.defaultSubAgent.getId(),
            contextConfigId: this.contextConfig?.getId(),
          }),
        });

        if (!updateResponse.ok) {
          throw new Error(`HTTP ${updateResponse.status}: ${updateResponse.statusText}`);
        }

        logger.debug(
          {
            agentId: this.agentId,
            defaultSubAgent: this.defaultSubAgent.getName(),
          },
          'Agent relationships configured'
        );
      } catch (error) {
        logger.error(
          {
            agentId: this.agentId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to update agent relationships'
        );
        throw error;
      }
    }
  }

  private async createSubAgentRelations(): Promise<void> {
    // Create both transfer and delegation relations for all agents now that they have agentId
    const allSubAgentRelationPromises: Promise<void>[] = [];

    // Collect all relation creation promises from all agents
    for (const subAgent of this.subAgents) {
      // Create internal transfer relations
      const transfers = subAgent.getTransfers();
      for (const transferAgent of transfers) {
        allSubAgentRelationPromises.push(
          this.createSubAgentRelation(subAgent, transferAgent, 'transfer')
        );
      }

      // Create internal delegation relations
      const delegates = subAgent.getSubAgentDelegates();
      for (const delegate of delegates) {
        // Must be an internal agent (AgentInterface)
        if (this.isInternalAgent(delegate)) {
          allSubAgentRelationPromises.push(
            this.createSubAgentRelation(subAgent, delegate as SubAgentInterface, 'delegate')
          );
        }
      }
    }

    // Use Promise.allSettled for better error handling - allows all operations to complete
    const results = await Promise.allSettled(allSubAgentRelationPromises);

    // Log and collect errors without failing the entire operation
    const errors: Error[] = [];
    let successCount = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        errors.push(result.reason);
        logger.error(
          {
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
            agentId: this.agentId,
          },
          'Failed to create agent relation'
        );
      }
    }

    logger.info(
      {
        agentId: this.agentId,
        totalRelations: allSubAgentRelationPromises.length,
        successCount,
        errorCount: errors.length,
      },
      'Completed agent relation creation batch'
    );

    // Only throw if ALL relations failed, allowing partial success
    if (errors.length > 0 && successCount === 0) {
      throw new Error(`All ${errors.length} agent relation creations failed`);
    }
  }

  private async createSubAgentRelation(
    sourceAgent: SubAgentInterface,
    targetAgent: SubAgentInterface,
    relationType: 'transfer' | 'delegate'
  ): Promise<void> {
    try {
      const response = await fetch(`${this.baseURL}/tenants/${this.tenantId}/agent-relations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId: this.agentId,
          sourceSubAgentId: sourceAgent.getId(),
          targetSubAgentId: targetAgent.getId(),
          relationType,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');

        // Check if this is a duplicate relation (which is acceptable)
        if (response.status === 422 && errorText.includes('already exists')) {
          logger.info(
            {
              sourceSubAgentId: sourceAgent.getId(),
              targetSubAgentId: targetAgent.getId(),
              agentId: this.agentId,
              relationType,
            },
            `${relationType} relation already exists, skipping creation`
          );
          return;
        }

        throw new Error(`Failed to create subAgent relation: ${response.status} - ${errorText}`);
      }

      logger.info(
        {
          sourceSubAgentId: sourceAgent.getId(),
          targetSubAgentId: targetAgent.getId(),
          agentId: this.agentId,
          relationType,
        },
        `${relationType} subAgent relation created successfully`
      );
    } catch (error) {
      logger.error(
        {
          sourceSubAgentId: sourceAgent.getId(),
          targetSubAgentId: targetAgent.getId(),
          agentId: this.agentId,
          relationType,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `Failed to create ${relationType} subAgent relation`
      );
      throw error;
    }
  }
}

/**
 * Helper function to create agent - OpenAI style
 */
export function agent(config: AgentConfig): Agent {
  return new Agent(config);
}

/**
 * Factory function to create agent from configuration file
 */
export async function generateAgent(configPath: string): Promise<Agent> {
  logger.info({ configPath }, 'Loading agent configuration');

  try {
    const config = await import(configPath);
    const agentConfig = config.default || config;

    const agentObject = agent(agentConfig);
    await agentObject.init();

    logger.info(
      {
        configPath,
        agentId: agentObject.getStats().agentId,
        agentCount: agentObject.getStats().agentCount,
      },
      'Agent generated successfully'
    );

    return agentObject;
  } catch (error) {
    logger.error(
      {
        configPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to generate agent from configuration'
    );
    throw error;
  }
}
