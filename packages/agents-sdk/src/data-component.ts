import { type DataComponentInsert as DataComponentType, getLogger } from '@inkeep/agents-core';
import { generateIdFromName } from './utils/generateIdFromName';

const logger = getLogger('dataComponent');

export interface DataComponentInterface {
  config: Omit<DataComponentType, 'tenantId' | 'projectId'>;
  init(): Promise<void>;
  getId(): DataComponentType['id'];
  getName(): DataComponentType['name'];
  getDescription(): DataComponentType['description'];
  getProps(): DataComponentType['props'];
  setContext(tenantId: string, projectId: string): void;
}

export class DataComponent implements DataComponentInterface {
  public config: Omit<DataComponentType, 'tenantId' | 'projectId'>;
  private baseURL: string;
  private tenantId: string;
  private projectId: string;
  private initialized = false;
  private id: DataComponentType['id'];

  constructor(config: Omit<DataComponentType, 'tenantId' | 'projectId'>) {
    this.id = config.id || generateIdFromName(config.name);

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
        dataComponentId: this.getId(),
        dataComponentName: config.name,
      },
      'DataComponent constructor initialized'
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

  getProps(): DataComponentType['props'] {
    return this.config.props;
  }

  // Public method to ensure data component exists in backend (with upsert behavior)
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Always attempt to upsert the data component
      await this.upsertDataComponent();

      logger.info(
        {
          dataComponentId: this.getId(),
        },
        'DataComponent initialized successfully'
      );

      this.initialized = true;
    } catch (error) {
      logger.error(
        {
          dataComponentId: this.getId(),
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to initialize data component'
      );
      throw error;
    }
  }

  // Private method to upsert data component (create or update)
  private async upsertDataComponent(): Promise<void> {
    const dataComponentData = {
      id: this.getId(),
      name: this.config.name,
      description: this.config.description,
      props: this.config.props,
    };

    logger.info({ dataComponentData }, 'dataComponentData for create/update');

    // First try to update (in case data component exists)
    const updateResponse = await fetch(
      `${this.baseURL}/tenants/${this.tenantId}/projects/${this.projectId}/data-components/${this.getId()}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataComponentData),
      }
    );

    logger.info(
      {
        status: updateResponse.status,
        dataComponentId: this.getId(),
      },
      'data component updateResponse'
    );

    if (updateResponse.ok) {
      logger.info(
        {
          dataComponentId: this.getId(),
        },
        'DataComponent updated successfully'
      );
      return;
    }

    // If update failed with 404, data component doesn't exist - create it
    if (updateResponse.status === 404) {
      logger.info(
        {
          dataComponentId: this.getId(),
        },
        'DataComponent not found, creating new data component'
      );

      const createResponse = await fetch(
        `${this.baseURL}/tenants/${this.tenantId}/projects/${this.projectId}/data-components`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(dataComponentData),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text().catch(() => 'Unknown error');
        throw new Error(
          `Failed to create data component: ${createResponse.status} ${createResponse.statusText} - ${errorText}`
        );
      }

      logger.info(
        {
          dataComponentId: this.getId(),
        },
        'DataComponent created successfully'
      );
      return;
    }

    // If we get here, the update failed for some other reason
    const errorText = await updateResponse.text().catch(() => 'Unknown error');
    throw new Error(
      `Failed to update data component: ${updateResponse.status} ${updateResponse.statusText} - ${errorText}`
    );
  }
}
