import type { ProjectApiInsert, ProjectModels } from '@inkeep/agents-core';
import { getLogger } from '@inkeep/agents-core';

const logger = getLogger('project');

import type { AgentGraph } from './graph';
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
  stopWhen?: {
    transferCountIs?: number;
    stepCountIs?: number;
  };
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
  private stopWhen?: {
    transferCountIs?: number;
    stepCountIs?: number;
  };
  private graphs: AgentGraph[] = [];
  private graphMap: Map<string, AgentGraph> = new Map();

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
  setConfig(tenantId: string, apiUrl: string): void {
    if (this.initialized) {
      throw new Error('Cannot set config after project has been initialized');
    }

    this.tenantId = tenantId;
    this.baseURL = apiUrl;

    // Update all graphs with new config
    for (const graph of this.graphs) {
      graph.setConfig(tenantId, this.projectId, apiUrl);
    }

    logger.info(
      {
        projectId: this.projectId,
        tenantId: this.tenantId,
        apiUrl: this.baseURL,
      },
      'Project configuration updated'
    );
  }

  /**
   * Initialize the project and create/update it in the backend
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
      'Initializing project'
    );

    try {
      // Create or update project in backend
      await this.saveToDatabase();

      // Initialize all graphs
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

      this.initialized = true;

      logger.info(
        {
          projectId: this.projectId,
          tenantId: this.tenantId,
          graphCount: this.graphs.length,
        },
        'Project initialized successfully'
      );
    } catch (error) {
      logger.error(
        {
          projectId: this.projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to initialize project'
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

  /**
   * Save project to database via API
   */
  private async saveToDatabase(): Promise<void> {
    try {
      // Check if project already exists
      const getUrl = `${this.baseURL}/tenants/${this.tenantId}/crud/projects/${this.projectId}`;

      try {
        const getResponse = await fetch(getUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (getResponse.ok) {
          logger.info({ projectId: this.projectId }, 'Project already exists in backend, updating');

          // Update existing project
          const updateUrl = `${this.baseURL}/tenants/${this.tenantId}/crud/projects/${this.projectId}`;
          const updateResponse = await fetch(updateUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(this.toApiFormat()),
          });

          if (!updateResponse.ok) {
            throw new Error(`HTTP ${updateResponse.status}: ${updateResponse.statusText}`);
          }

          logger.info({ projectId: this.projectId }, 'Project updated in backend');
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

      // Project doesn't exist, create it
      logger.info({ projectId: this.projectId }, 'Creating project in backend');

      const createUrl = `${this.baseURL}/tenants/${this.tenantId}/crud/projects`;
      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.toApiFormat()),
      });

      if (!createResponse.ok) {
        throw new Error(`HTTP ${createResponse.status}: ${createResponse.statusText}`);
      }

      const createData = (await createResponse.json()) as { data: { id: string } };
      logger.info({ project: createData.data }, 'Project created in backend');
    } catch (error) {
      throw new Error(
        `Failed to save project to database: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}
