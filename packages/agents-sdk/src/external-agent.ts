import type { CredentialReferenceSelect } from '@inkeep/agents-core';
import { getLogger } from '@inkeep/agents-core';
import type { ExternalAgentInterface } from './types';

const logger = getLogger('external-agent-builder');

export type ExternalAgentConfig = {
  type?: 'external'; // Discriminator for external agents
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  credentialReference?: CredentialReferenceSelect;
  headers?: Record<string, string>;
};

export class ExternalAgent implements ExternalAgentInterface {
  public config: ExternalAgentConfig;
  public readonly type = 'external' as const;
  private initialized = false;
  private tenantId: string;
  private projectId: string;
  private baseURL: string;

  constructor(config: ExternalAgentConfig) {
    this.config = { ...config, type: 'external' };
    // tenantId will be set by setContext method from external source
    this.tenantId = 'default';
    this.projectId = 'default';
    this.baseURL = this.config.baseUrl;

    logger.debug(
      {
        externalAgentName: this.config.name,
        baseUrl: this.config.baseUrl,
        tenantId: this.tenantId,
      },
      'External Agent constructor initialized'
    );
  }

  /**
   * Initialize the external agent by upserting it in the database
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Always attempt to upsert the external agent
      await this.upsertExternalAgent();

      logger.info(
        {
          externalSubAgentId: this.getId(),
        },
        'External agent initialized successfully'
      );

      this.initialized = true;
    } catch (error) {
      logger.error(
        {
          externalSubAgentId: this.getId(),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to initialize external agent'
      );
      throw error;
    }
  }

  // Set context (tenantId and baseURL) from external source (agent, CLI, etc)
  setContext(tenantId: string, projectId: string): void {
    this.tenantId = tenantId;
    this.projectId = projectId;
  }

  // Compute ID from name using a simple slug transformation
  getId(): string {
    return this.config.id;
  }

  // Private method to upsert external agent (create or update)
  private async upsertExternalAgent(): Promise<void> {
    const externalAgentData = {
      id: this.getId(),
      name: this.config.name,
      description: this.config.description,
      baseUrl: this.config.baseUrl,
      credentialReferenceId: this.config.credentialReference?.id || undefined,
      headers: this.config.headers || undefined,
    };

    // First try to update (in case external agent exists)
    const updateResponse = await fetch(
      `${this.baseURL}/tenants/${this.tenantId}/projects/${this.projectId}/external-agents/${this.getId()}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(externalAgentData),
      }
    );

    if (updateResponse.ok) {
      logger.info(
        {
          externalSubAgentId: this.getId(),
        },
        'External agent updated successfully'
      );
      return;
    }

    // If update failed with 404, external agent doesn't exist - create it
    if (updateResponse.status === 404) {
      logger.info(
        {
          externalSubAgentId: this.getId(),
        },
        'External agent not found, creating new external agent'
      );

      const createResponse = await fetch(
        `${this.baseURL}/tenants/${this.tenantId}/projects/${this.projectId}/external-agents`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(externalAgentData),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text().catch(() => 'Unknown error');
        throw new Error(
          `Failed to create external agent: ${createResponse.status} ${createResponse.statusText} - ${errorText}`
        );
      }

      logger.info(
        {
          externalSubAgentId: this.getId(),
        },
        'External agent created successfully'
      );
      return;
    }

    // Update failed for some other reason
    const errorText = await updateResponse.text().catch(() => 'Unknown error');
    throw new Error(
      `Failed to update external agent: ${updateResponse.status} ${updateResponse.statusText} - ${errorText}`
    );
  }

  /**
   * Get the external agent configuration
   */
  getConfig(): ExternalAgentConfig {
    return { ...this.config };
  }

  /**
   * Get the external agent name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Get the external agent base URL
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Get the tenant ID
   */
  getTenantId(): string {
    return this.tenantId;
  }

  getDescription(): string {
    return this.config.description || '';
  }

  getCredentialReferenceId(): string | undefined {
    return this.config.credentialReference?.id || undefined;
  }

  getHeaders(): Record<string, string> | undefined {
    return this.config.headers;
  }
}

/**
 * Factory function to create external agents - follows the same pattern as agent()
 */
export function externalAgent(config: ExternalAgentConfig): ExternalAgent {
  return new ExternalAgent(config);
}

/**
 * Helper function to create multiple external agents
 */
export function externalAgents(
  configs: Record<string, ExternalAgentConfig>
): Record<string, ExternalAgent> {
  const builders: Record<string, ExternalAgent> = {};

  for (const [name, config] of Object.entries(configs)) {
    builders[name] = externalAgent(config);
  }

  return builders;
}

/**
 * Helper to batch initialize external agents
 */
export async function initializeExternalAgents(builders: ExternalAgent[]): Promise<void> {
  logger.info({ count: builders.length }, 'Batch initializing external agents');

  const initPromises = builders.map(async (builder) => {
    return await builder.init();
  });

  try {
    await Promise.all(initPromises);

    logger.info({ count: builders.length }, 'All external agents initialized successfully');
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      'Failed to initialize some external agents'
    );
    throw error;
  }
}
