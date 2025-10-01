import {
  type ArtifactComponentApiInsert,
  // getDataComponentsForAgent,
  // getArtifactComponentsForAgent,
  type DataComponentApiInsert,
  getLogger,
} from '@inkeep/agents-core';
import { ArtifactComponent } from './artifact-component';
import { DataComponent } from './data-component';
import { Tool } from './tool';
import type {
  AgentCanUseType,
  AgentConfig,
  AgentInterface,
  AgentTool,
  AllAgentInterface,
} from './types';
import { isAgentMcpConfig, normalizeAgentCanUseType } from './utils/tool-normalization';

const logger = getLogger('agent');

// Helper function to resolve getter functions
function resolveGetter<T>(value: T | (() => T) | undefined): T | undefined {
  if (typeof value === 'function') {
    return (value as () => T)();
  }
  return value as T | undefined;
}

export class Agent implements AgentInterface {
  public config: AgentConfig;
  public readonly type = 'internal' as const;
  private baseURL: string;
  private tenantId: string;
  private projectId: string;
  private initialized = false;
  constructor(config: AgentConfig) {
    this.config = { ...config, type: 'internal' };
    this.baseURL = process.env.INKEEP_API_URL || 'http://localhost:3002';
    // tenantId and projectId will be set later by the graph or CLI
    this.tenantId = 'default';
    this.projectId = 'default';

    logger.info(
      {
        tenantId: this.tenantId,
        agentId: this.config.id,
        agentName: config.name,
      },
      'Agent constructor initialized'
    );
  }

  // Set context (tenantId, projectId, and baseURL) from external source (graph, CLI, etc)
  setContext(tenantId: string, projectId: string, baseURL?: string): void {
    this.tenantId = tenantId;
    this.projectId = projectId;
    if (baseURL) {
      this.baseURL = baseURL;
    }
  }

  // Return the configured ID
  getId(): string {
    return this.config.id;
  }

  // Agent introspection methods
  getName(): string {
    return this.config.name;
  }

  getInstructions(): string {
    return this.config.prompt;
  }

  /**
   * Get the agent's description (the human-readable description field)
   */
  getDescription(): string {
    return this.config.description || '';
  }

  getTools(): Record<string, AgentTool> {
    const tools = resolveGetter(this.config.canUse);
    if (!tools) {
      return {};
    }
    // Tools must be an array from the getter function
    if (!Array.isArray(tools)) {
      throw new Error('tools getter must return an array');
    }
    // Convert array to record using tool id or name as key
    const toolRecord: Record<string, AgentTool> = {};
    for (const tool of tools) {
      if (tool && typeof tool === 'object') {
        let id: string;
        let toolInstance: AgentTool;

        // Check if this is an AgentMcpConfig using type guard
        if (isAgentMcpConfig(tool)) {
          id = tool.server.getId();
          toolInstance = tool.server;
          // Add selectedTools metadata to the tool instance
          toolInstance.selectedTools = tool.selectedTools;
          // Add headers metadata to the tool instance if present
          toolInstance.headers = tool.headers;
        } else {
          // Regular tool instance
          toolInstance = tool;
          id = toolInstance.getId();
        }

        if (id) {
          toolRecord[id] = toolInstance;
        }
      }
    }
    return toolRecord;
  }

  getModels(): typeof this.config.models {
    return this.config.models;
  }

  setModels(models: typeof this.config.models): void {
    this.config.models = models;
  }

  getTransfers(): AgentInterface[] {
    return typeof this.config.canTransferTo === 'function' ? this.config.canTransferTo() : [];
  }

  getDelegates(): AllAgentInterface[] {
    return typeof this.config.canDelegateTo === 'function' ? this.config.canDelegateTo() : [];
  }

  getDataComponents(): DataComponentApiInsert[] {
    const components = resolveGetter(this.config.dataComponents) || [];
    // Handle both DataComponent instances and plain objects
    return components.map((comp: any) => {
      // If it's a DataComponent instance with methods
      if (comp && typeof comp.getId === 'function') {
        return {
          id: comp.getId(),
          name: comp.getName(),
          description: comp.getDescription(),
          props: comp.getProps(),
        };
      }
      // Otherwise assume it's already a plain object
      return comp;
    });
  }

  getArtifactComponents(): ArtifactComponentApiInsert[] {
    const components = resolveGetter(this.config.artifactComponents) || [];
    // Handle both ArtifactComponent instances and plain objects
    return components.map((comp: any) => {
      // If it's an ArtifactComponent instance with methods
      if (comp && typeof comp.getId === 'function') {
        return {
          id: comp.getId(),
          name: comp.getName(),
          description: comp.getDescription(),
          summaryProps: comp.getSummaryProps?.() || comp.summaryProps,
          fullProps: comp.getFullProps?.() || comp.fullProps,
        };
      }
      // Otherwise assume it's already a plain object
      return comp;
    });
  }

  // adjust
  addTool(_name: string, tool: Tool): void {
    // Tools must now be a getter function returning an array
    const existingTools = this.config.canUse ? this.config.canUse() : [];
    this.config.canUse = () => [...existingTools, tool];
  }

  addTransfer(...agents: AgentInterface[]): void {
    if (typeof this.config.canTransferTo === 'function') {
      // If already a function, we need to combine the results
      const existingTransfers = this.config.canTransferTo;
      this.config.canTransferTo = () => [...existingTransfers(), ...agents];
    } else {
      // Convert to function-based transfers
      this.config.canTransferTo = () => agents;
    }
  }

  addDelegate(...agents: AllAgentInterface[]): void {
    if (typeof this.config.canDelegateTo === 'function') {
      const existingDelegates = this.config.canDelegateTo;
      this.config.canDelegateTo = () => [...existingDelegates(), ...agents];
    } else {
      this.config.canDelegateTo = () => agents;
    }
  }

  // Public method to ensure agent exists in backend (with upsert behavior)
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Always attempt to upsert the agent
      await this.upsertAgent();

      // Load existing data components from database and merge with config
      await this.loadDataComponents();

      // Load existing artifact components from database and merge with config
      await this.loadArtifactComponents();

      // Setup tools and relations
      await this.saveToolsAndRelations();

      await this.saveDataComponents();

      await this.saveArtifactComponents();

      logger.info(
        {
          agentId: this.getId(),
        },
        'Agent initialized successfully'
      );

      this.initialized = true;
    } catch (error) {
      logger.error(
        {
          agentId: this.getId(),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to initialize agent'
      );
      throw error;
    }
  }

  // Private method to upsert agent (create or update)
  private async upsertAgent(): Promise<void> {
    const agentData = {
      id: this.getId(),
      name: this.config.name,
      description: this.config.description || '',
      prompt: this.config.prompt,
      conversationHistoryConfig: this.config.conversationHistoryConfig,
      models: this.config.models,
      stopWhen: this.config.stopWhen,
    };

    // First try to update (in case agent exists)
    const updateResponse = await fetch(
      `${this.baseURL}/tenants/${this.tenantId}/agents/${this.getId()}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(agentData),
      }
    );

    if (updateResponse.ok) {
      logger.info(
        {
          agentId: this.getId(),
        },
        'Agent updated successfully'
      );
      return;
    }

    // If update failed with 404, agent doesn't exist - create it
    if (updateResponse.status === 404) {
      logger.info(
        {
          agentId: this.getId(),
        },
        'Agent not found, creating new agent'
      );

      const createResponse = await fetch(`${this.baseURL}/tenants/${this.tenantId}/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(agentData),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text().catch(() => 'Unknown error');
        throw new Error(
          `Failed to create agent: ${createResponse.status} ${createResponse.statusText} - ${errorText}`
        );
      }

      logger.info(
        {
          agentId: this.getId(),
        },
        'Agent created successfully'
      );
      return;
    }

    // Update failed for some other reason
    const errorText = await updateResponse.text().catch(() => 'Unknown error');
    throw new Error(
      `Failed to update agent: ${updateResponse.status} ${updateResponse.statusText} - ${errorText}`
    );
  }

  private async saveToolsAndRelations(): Promise<void> {
    // Setup tools using your existing SDK
    if (this.config.canUse) {
      const tools = resolveGetter(this.config.canUse);

      if (tools && Array.isArray(tools)) {
        for (let i = 0; i < tools.length; i++) {
          const toolConfig = tools[i];

          try {
            // Use normalization utility to get tool info
            const normalizedTool = normalizeAgentCanUseType(toolConfig, `tool-${i}`);
            await this.createTool(normalizedTool.toolId, toolConfig);
          } catch (error) {
            logger.error(
              {
                toolId: isAgentMcpConfig(toolConfig)
                  ? toolConfig.server.getId()
                  : toolConfig.getId?.(),
                error: error instanceof Error ? error.message : 'Unknown error',
              },
              'Tool creation failed'
            );
            throw error;
          }
        }
      }
    }

    // Note: Transfer and delegate relations are managed by the AgentGraph, not individual agents
  }

  private async saveDataComponents(): Promise<void> {
    logger.info({ dataComponents: this.config.dataComponents }, 'dataComponents and config');
    const components = resolveGetter(this.config.dataComponents);
    if (components) {
      for (const dataComponent of components) {
        // Convert DataComponent instances to plain objects
        const plainComponent =
          dataComponent && typeof (dataComponent as any).getId === 'function'
            ? {
                id: (dataComponent as any).getId(),
                name: (dataComponent as any).getName(),
                description: (dataComponent as any).getDescription(),
                props: (dataComponent as any).getProps(),
              }
            : dataComponent;
        await this.createDataComponent(plainComponent as DataComponentApiInsert);
      }
    }
  }

  private async saveArtifactComponents(): Promise<void> {
    logger.info(
      { artifactComponents: this.config.artifactComponents },
      'artifactComponents and config'
    );
    const components = resolveGetter(this.config.artifactComponents);
    if (components) {
      for (const artifactComponent of components) {
        // Convert ArtifactComponent instances to plain objects
        const plainComponent =
          artifactComponent && typeof (artifactComponent as any).getId === 'function'
            ? {
                id: (artifactComponent as any).getId(),
                name: (artifactComponent as any).getName(),
                description: (artifactComponent as any).getDescription(),
                summaryProps:
                  (artifactComponent as any).getSummaryProps?.() ||
                  (artifactComponent as any).summaryProps,
                fullProps:
                  (artifactComponent as any).getFullProps?.() ||
                  (artifactComponent as any).fullProps,
              }
            : artifactComponent;
        await this.createArtifactComponent(plainComponent as ArtifactComponentApiInsert);
      }
    }
  }

  private async loadDataComponents(): Promise<void> {
    try {
      // Import the getDataComponentsForAgent function

      // TODO: Load data components from database for this agent
      // This needs to be replaced with an HTTP API call
      const existingComponents: DataComponentApiInsert[] = [];
      // const existingComponents = await getDataComponentsForAgent(dbClient)({
      //   scopes: { tenantId: this.tenantId, projectId: this.projectId },
      //   agentId: this.getId(),
      // });

      // Convert database format to config format
      const dbDataComponents = existingComponents.map((component: any) => ({
        id: component.id,
        name: component.name,
        description: component.description,
        props: component.props,
        createdAt: component.createdAt,
        updatedAt: component.updatedAt,
      }));

      // Merge with existing config data components (config takes precedence)
      const configComponents = resolveGetter(this.config.dataComponents) || [];
      // Convert any DataComponentInterface instances to plain objects
      const normalizedConfigComponents = configComponents.map((comp: any) => {
        if (comp && typeof comp.getId === 'function') {
          return {
            id: comp.getId(),
            name: comp.getName(),
            description: comp.getDescription(),
            props: comp.getProps(),
          };
        }
        return comp;
      });

      const allComponents = [...dbDataComponents, ...normalizedConfigComponents];

      // Remove duplicates (config components override database ones with same id)
      const uniqueComponents = allComponents.reduce((acc, component) => {
        const componentId =
          typeof component.getId === 'function' ? component.getId() : component.id;
        const existingIndex = acc.findIndex((c: any) => {
          const cId = typeof c.getId === 'function' ? c.getId() : c.id;
          return cId === componentId;
        });
        if (existingIndex >= 0) {
          // Replace with the later one (config takes precedence)
          acc[existingIndex] = component;
        } else {
          acc.push(component);
        }
        return acc;
      }, [] as any[]);

      // Update the config with merged components
      this.config.dataComponents = () => uniqueComponents;

      logger.info(
        {
          agentId: this.getId(),
          dbComponentCount: dbDataComponents.length,
          configComponentCount: configComponents.length,
          totalComponentCount: uniqueComponents.length,
        },
        'Loaded and merged data components'
      );
    } catch (error) {
      logger.error(
        {
          agentId: this.getId(),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to load data components from database'
      );
      // Don't throw - continue with just config components
    }
  }

  private async loadArtifactComponents(): Promise<void> {
    try {
      // TODO: Load artifact components from database for this agent
      // This needs to be replaced with an HTTP API call
      const existingComponents: ArtifactComponentApiInsert[] = [];
      // const existingComponents = await getArtifactComponentsForAgent(dbClient)({
      //   scopes: { tenantId: this.tenantId, projectId: this.projectId },
      //   agentId: this.getId(),
      // });

      // Convert database format to config format
      const dbArtifactComponents = existingComponents.map((component: any) => ({
        id: component.id,
        name: component.name,
        description: component.description,
        summaryProps: component.summaryProps,
        fullProps: component.fullProps,
        createdAt: component.createdAt,
        updatedAt: component.updatedAt,
      }));

      // Merge with existing config artifact components (config takes precedence)
      const configComponents = resolveGetter(this.config.artifactComponents) || [];
      // Convert any ArtifactComponentInterface instances to plain objects
      const normalizedConfigComponents = configComponents.map((comp: any) => {
        if (comp && typeof comp.getId === 'function') {
          return {
            id: comp.getId(),
            name: comp.getName(),
            description: comp.getDescription(),
            summaryProps: comp.getSummaryProps?.() || comp.summaryProps,
            fullProps: comp.getFullProps?.() || comp.fullProps,
          };
        }
        return comp;
      });

      const allComponents = [...dbArtifactComponents, ...normalizedConfigComponents];

      // Remove duplicates (config components override database ones with same id)
      const uniqueComponents = allComponents.reduce((acc, component) => {
        const componentId =
          typeof component.getId === 'function' ? component.getId() : component.id;
        const existingIndex = acc.findIndex((c: any) => {
          const cId = typeof c.getId === 'function' ? c.getId() : c.id;
          return cId === componentId;
        });
        if (existingIndex >= 0) {
          // Replace with the later one (config takes precedence)
          acc[existingIndex] = component;
        } else {
          acc.push(component);
        }
        return acc;
      }, [] as any[]);

      // Update the config with merged components
      this.config.artifactComponents = () => uniqueComponents;

      logger.info(
        {
          agentId: this.getId(),
          dbComponentCount: dbArtifactComponents.length,
          configComponentCount: configComponents.length,
          totalComponentCount: uniqueComponents.length,
        },
        'Loaded and merged artifact components'
      );
    } catch (error) {
      logger.error(
        {
          agentId: this.getId(),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to load artifact components from database'
      );
      // Don't throw - continue with just config components
    }
  }

  private async createTool(toolId: string, toolConfig: AgentCanUseType): Promise<void> {
    try {
      // Check if this is a function tool (has type: 'function')
      if ((toolConfig as any).type === 'function') {
        logger.info(
          {
            agentId: this.getId(),
            toolId,
          },
          'Skipping function tool creation - will be handled at runtime'
        );
        return;
      }

      let tool: Tool;
      let selectedTools: string[] | undefined;
      let headers: Record<string, string> | undefined;

      try {
        const normalizedTool = normalizeAgentCanUseType(toolConfig, toolId);
        tool = normalizedTool.tool;
        selectedTools = normalizedTool.selectedTools;
        headers = normalizedTool.headers;

        tool.setContext(this.tenantId, this.projectId);
        await tool.init();
      } catch (_) {
        // Fall back to legacy handling for non-standard tool configs
        tool = new Tool({
          id: toolId,
          name: (toolConfig as any).name || toolId,
          description: (toolConfig as any).description || `MCP tool: ${toolId}`,
          serverUrl:
            (toolConfig as any).config?.serverUrl ||
            (toolConfig as any).serverUrl ||
            'http://localhost:3000',
          activeTools: (toolConfig as any).config?.mcp?.activeTools,
          credential: (toolConfig as any).credential,
        });
        tool.setContext(this.tenantId, this.projectId);
        await tool.init();
      }

      // Create the agent-tool relation with selected tools, and headers
      await this.createAgentToolRelation(tool.getId(), selectedTools, headers);

      logger.info(
        {
          agentId: this.getId(),
          toolId: tool.getId(),
        },
        'Tool created and linked to agent'
      );
    } catch (error) {
      logger.error(
        {
          agentId: this.getId(),
          toolId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to create tool'
      );
      throw error;
    }
  }

  private async createDataComponent(dataComponent: DataComponentApiInsert): Promise<void> {
    try {
      // Create a DataComponent instance from the config
      const dc = new DataComponent({
        id: dataComponent.id,
        name: dataComponent.name,
        description: dataComponent.description,
        props: dataComponent.props,
      });

      // Set the context from the agent
      dc.setContext(this.tenantId, this.projectId);

      // Initialize the data component (this handles creation/update)
      await dc.init();

      // Create the agent-dataComponent association
      await this.createAgentDataComponentRelation(dc.getId());

      logger.info(
        {
          agentId: this.getId(),
          dataComponentId: dc.getId(),
        },
        'DataComponent created and linked to agent'
      );
    } catch (error) {
      logger.error(
        {
          agentId: this.getId(),
          dataComponentName: dataComponent.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to create data component'
      );
      // Re-throw the error so tests can catch it
      throw error;
    }
  }

  private async createArtifactComponent(
    artifactComponent: ArtifactComponentApiInsert
  ): Promise<void> {
    try {
      // Create an ArtifactComponent instance from the config
      const ac = new ArtifactComponent({
        id: artifactComponent.id,
        name: artifactComponent.name,
        description: artifactComponent.description,
        summaryProps: artifactComponent.summaryProps,
        fullProps: artifactComponent.fullProps,
      });

      // Set the context from the agent
      ac.setContext(this.tenantId, this.projectId);

      // Initialize the artifact component (this handles creation/update)
      await ac.init();

      // Create the agent-artifactComponent association
      await this.createAgentArtifactComponentRelation(ac.getId());

      logger.info(
        {
          agentId: this.getId(),
          artifactComponentId: ac.getId(),
        },
        'ArtifactComponent created and linked to agent'
      );
    } catch (error) {
      logger.error(
        {
          agentId: this.getId(),
          artifactComponentName: artifactComponent.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to create artifact component'
      );
      // Re-throw the error so tests can catch it
      throw error;
    }
  }

  private async createAgentDataComponentRelation(dataComponentId: string): Promise<void> {
    const relationResponse = await fetch(
      `${this.baseURL}/tenants/${this.tenantId}/agent-data-components`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: `${this.getId()}-dc-${dataComponentId}`,
          tenantId: this.tenantId,
          agentId: this.getId(),
          dataComponentId: dataComponentId,
        }),
      }
    );

    if (!relationResponse.ok) {
      throw new Error(
        `Failed to create agent-dataComponent relation: ${relationResponse.status} ${relationResponse.statusText}`
      );
    }

    logger.info(
      {
        agentId: this.getId(),
        dataComponentId,
      },
      'Created agent-dataComponent relation'
    );
  }

  private async createAgentArtifactComponentRelation(artifactComponentId: string): Promise<void> {
    const relationResponse = await fetch(
      `${this.baseURL}/tenants/${this.tenantId}/agent-artifact-components`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          tenantId: this.tenantId,
          agentId: this.getId(),
          artifactComponentId: artifactComponentId,
        }),
      }
    );

    if (!relationResponse.ok) {
      throw new Error(
        `Failed to create agent-artifactComponent relation: ${relationResponse.status} ${relationResponse.statusText}`
      );
    }

    logger.info(
      {
        agentId: this.getId(),
        artifactComponentId,
      },
      'Created agent-artifactComponent relation'
    );
  }

  private async createAgentToolRelation(
    toolId: string,
    selectedTools?: string[],
    headers?: Record<string, string>
  ): Promise<void> {
    const relationData: {
      id: string;
      tenantId: string;
      projectId: string;
      agentId: string;
      toolId: string;
      selectedTools?: string[];
      headers?: Record<string, string>;
    } = {
      id: `${this.getId()}-tool-${toolId}`,
      tenantId: this.tenantId,
      projectId: this.projectId,
      agentId: this.getId(),
      toolId: toolId,
    };

    // Add selectedTools if provided (including empty arrays)
    if (selectedTools !== undefined) {
      relationData.selectedTools = selectedTools;
    }

    // Add headers if provided
    if (headers !== undefined) {
      relationData.headers = headers;
    }

    const relationResponse = await fetch(
      `${this.baseURL}/tenants/${this.tenantId}/projects/${this.projectId}/agent-tool-relations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(relationData),
      }
    );

    if (!relationResponse.ok) {
      const errorBody = await relationResponse.text().catch(() => 'Unknown error');
      throw new Error(
        `Failed to create agent-tool relation: ${relationResponse.status} - ${errorBody}`
      );
    }
  }
}

// Factory function for creating agents - similar to contextConfig() pattern
export function agent(config: AgentConfig): Agent {
  return new Agent(config);
}
