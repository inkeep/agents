import {
  type ArtifactComponentInsert as ArtifactComponentType,
  generateIdFromName,
  getLogger,
} from '@inkeep/agents-core';

const logger = getLogger('artifactComponent');

export interface ArtifactComponentInterface {
  config: Omit<ArtifactComponentType, 'id' | 'tenantId' | 'projectId'>;
  init(): Promise<void>;
  getId(): ArtifactComponentType['id'];
  getName(): ArtifactComponentType['name'];
  getDescription(): ArtifactComponentType['description'];
  getSummaryProps(): ArtifactComponentType['summaryProps'];
  getFullProps(): ArtifactComponentType['fullProps'];
  setContext(tenantId: string, projectId: string): void;
}

export class ArtifactComponent implements ArtifactComponentInterface {
  public config: Omit<ArtifactComponentType, 'tenantId' | 'projectId'>;
  private baseURL: string;
  private tenantId: string;
  private projectId: string;
  private initialized = false;
  private id: ArtifactComponentType['id'];

  constructor(config: Omit<ArtifactComponentType, 'id' | 'tenantId' | 'projectId'>) {
    this.id = generateIdFromName(config.name);

    this.config = {
      ...config,
      id: this.id,
    };
    this.baseURL = process.env.INKEEP_API_URL || 'http://localhost:3002';
    // tenantId and projectId will be set by setContext method
    this.tenantId = 'default';
    this.projectId = 'default';
    logger.info(
      {
        artifactComponentId: this.getId(),
        artifactComponentName: config.name,
      },
      'ArtifactComponent constructor initialized'
    );
  }

  // Set context (tenantId and projectId) from external source (agent, graph, CLI, etc)
  setContext(tenantId: string, projectId: string): void {
    this.tenantId = tenantId;
    this.projectId = projectId;
  }

  // Compute ID from name using same slug transformation as agents
  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.config.name;
  }

  getDescription(): string {
    return this.config.description;
  }

  getSummaryProps(): ArtifactComponentType['summaryProps'] {
    return this.config.summaryProps;
  }

  getFullProps(): ArtifactComponentType['fullProps'] {
    return this.config.fullProps;
  }

  // Public method to ensure artifact component exists in backend (with upsert behavior)
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Always attempt to upsert the artifact component
      await this.upsertArtifactComponent();

      logger.info(
        {
          artifactComponentId: this.getId(),
        },
        'ArtifactComponent initialized successfully'
      );

      this.initialized = true;
    } catch (error) {
      logger.error(
        {
          artifactComponentId: this.getId(),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to initialize artifact component'
      );
      throw error;
    }
  }

  // Private method to upsert artifact component (create or update)
  private async upsertArtifactComponent(): Promise<void> {
    const artifactComponentData = {
      id: this.getId(),
      name: this.config.name,
      description: this.config.description,
      summaryProps: this.config.summaryProps,
      fullProps: this.config.fullProps,
    };

    logger.info({ artifactComponentData }, 'artifactComponentData for create/update');

    // First try to update (in case artifact component exists)
    const updateResponse = await fetch(
      `${this.baseURL}/tenants/${this.tenantId}/projects/${this.projectId}/artifact-components/${this.getId()}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(artifactComponentData),
      }
    );

    logger.info(
      {
        status: updateResponse.status,
        artifactComponentId: this.getId(),
      },
      'artifact component updateResponse'
    );

    if (updateResponse.ok) {
      logger.info(
        {
          artifactComponentId: this.getId(),
        },
        'ArtifactComponent updated successfully'
      );
      return;
    }

    // If update failed with 404, artifact component doesn't exist - create it
    if (updateResponse.status === 404) {
      logger.info(
        {
          artifactComponentId: this.getId(),
        },
        'ArtifactComponent not found, creating new artifact component'
      );

      const createResponse = await fetch(
        `${this.baseURL}/tenants/${this.tenantId}/projects/${this.projectId}/artifact-components`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(artifactComponentData),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text().catch(() => 'Unknown error');
        throw new Error(
          `Failed to create artifact component: ${createResponse.status} ${createResponse.statusText} - ${errorText}`
        );
      }

      logger.info(
        {
          artifactComponentId: this.getId(),
        },
        'ArtifactComponent created successfully'
      );
      return;
    }

    // If we get here, the update failed for some other reason
    const errorText = await updateResponse.text().catch(() => 'Unknown error');
    throw new Error(
      `Failed to update artifact component: ${updateResponse.status} ${updateResponse.statusText} - ${errorText}`
    );
  }
}
