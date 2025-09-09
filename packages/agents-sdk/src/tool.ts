import type { MCPToolConfig } from '@inkeep/agents-core';
import { getLogger } from '@inkeep/agents-core';

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
}

export class Tool implements ToolInterface {
  public config: MCPToolConfig;
  private baseURL: string;
  private tenantId: string;
  private initialized = false;

  constructor(config: MCPToolConfig) {
    this.config = config;
    this.baseURL = process.env.INKEEP_API_URL || 'http://localhost:3002';
    this.tenantId = config.tenantId || 'default';
    logger.info(
      {
        toolId: this.getId(),
        toolName: config.name,
      },
      'Tool constructor initialized'
    );
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
    const toolDataForUpdate = {
      id: this.getId(),
      name: this.config.name,
      // Don't send description as it's not in the database schema
      // Explicitly set to null when undefined to ensure removal
      credentialReferenceId: this.config.credential?.id ?? null,
      // Explicitly set headers to null when undefined to ensure removal
      headers: this.config.headers ?? null,
      imageUrl: this.config.imageUrl, // Include image URL
      config: {
        type: 'mcp' as const,
        mcp: {
          server: {
            url: this.config.serverUrl,
          },
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
      `${this.baseURL}/tenants/${this.tenantId}/crud/tools/${this.getId()}`,
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

      const createResponse = await fetch(`${this.baseURL}/tenants/${this.tenantId}/crud/tools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toolDataForCreate),
      });

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
}
