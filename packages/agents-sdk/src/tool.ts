import type { MCPToolConfig, ToolApiInsert } from '@inkeep/agents-core';
import { getLogger } from '@inkeep/agents-core';
import type { AgentMcpConfig, AgentMcpConfigInput } from './builders';

const logger = getLogger('tool');

export interface ToolInterface {
  config: MCPToolConfig;
  init(): Promise<void>;
  getId(): string;
  getName(): string;
  getDescription(): string;
  getServerUrl(): string;
  getActiveTools(): string[] | undefined;
  getCredentialReferenceId(): string | null | undefined;
  with(config: AgentMcpConfigInput): AgentMcpConfig;
}

export class Tool implements ToolInterface {
  public config: MCPToolConfig;
  private baseURL: string;
  private tenantId: string;
  private initialized = false;
  private projectId: string;

  constructor(config: Omit<MCPToolConfig, 'tenantId' | 'projectId'>) {
    this.config = config as MCPToolConfig;
    this.baseURL = process.env.INKEEP_API_URL || 'http://localhost:3002';
    // tenantId and projectId will be set by setContext method
    this.tenantId = 'default';
    this.projectId = 'default';
    logger.info(
      {
        Id: this.getId(),
        Name: config.name,
      },
      'Tool constructor initialized'
    );
  }

  // Set context (tenantId, projectId, and baseURL) from external source (agent, agent, CLI, etc)
  setContext(tenantId: string, projectId: string, baseURL?: string): void {
    this.tenantId = tenantId;
    this.projectId = projectId;
    if (baseURL) {
      this.baseURL = baseURL;
    }
  }

  // Compute ID from name using same slug transformation as agents
  getId(): string {
    return this.config.id;
  }

  getName(): string {
    return this.config.name;
  }

  getDescription(): string {
    return this.config.description || '';
  }

  getServerUrl(): string {
    return this.config.serverUrl;
  }

  getActiveTools(): string[] | undefined {
    return this.config.activeTools;
  }

  getCredentialReferenceId(): string | null | undefined {
    return this.config.credential?.id;
  }

  // Public method to ensure tool exists in backend (with upsert behavior)
  async init(options?: { skipDatabaseRegistration?: boolean }): Promise<void> {
    if (this.initialized) return;

    try {
      // Only upsert the tool if not skipping database registration
      if (!options?.skipDatabaseRegistration) {
        await this.upsertTool();
      }

      logger.info(
        {
          toolId: this.getId(),
        },
        'Tool initialized successfully'
      );

      this.initialized = true;
    } catch (error) {
      logger.error(
        {
          toolId: this.getId(),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to initialize tool'
      );
      throw error;
    }
  }

  // Private method to upsert tool (create or update)
  private async upsertTool(): Promise<void> {
    const toolDataForUpdate: Omit<ToolApiInsert, 'id'> & { id?: string } = {
      id: this.getId(),
      name: this.config.name,
      credentialReferenceId: this.config.credential?.id ?? null,
      headers: this.config.headers ?? null,
      imageUrl: this.config.imageUrl,
      config: {
        type: 'mcp' as const,
        mcp: {
          server: {
            url: this.config.serverUrl,
          },
          transport: this.config.transport,
          activeTools: this.config.activeTools,
        },
      },
    };

    const toolDataForCreate = {
      ...toolDataForUpdate,
    };

    logger.info({ toolDataForCreate }, 'toolDataForCreate');

    // First try to update (in case tool exists)
    const updateResponse = await fetch(
      `${this.baseURL}/tenants/${this.tenantId}/projects/${this.projectId}/tools/${this.getId()}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toolDataForUpdate),
      }
    );

    logger.info({ updateResponse }, 'tool updateResponse');

    if (updateResponse.ok) {
      logger.info(
        {
          toolId: this.getId(),
        },
        'Tool updated successfully'
      );
      return;
    }

    // If update failed with 404, tool doesn't exist - create it
    if (updateResponse.status === 404) {
      logger.info(
        {
          toolId: this.getId(),
        },
        'Tool not found, creating new tool'
      );

      const createResponse = await fetch(
        `${this.baseURL}/tenants/${this.tenantId}/projects/${this.projectId}/tools`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(toolDataForCreate),
        }
      );

      if (!createResponse.ok) {
        throw new Error(`Failed to create tool: ${createResponse.status}`);
      }

      logger.info(
        {
          toolId: this.getId(),
        },
        'Tool created successfully'
      );
      return;
    }

    // If we get here, the update failed for some other reason
    throw new Error(`Failed to update tool: ${updateResponse.status}`);
  }

  with(config: AgentMcpConfigInput): AgentMcpConfig {
    return {
      server: this,
      selectedTools: config.selectedTools,
      headers: config.headers,
    };
  }
}
