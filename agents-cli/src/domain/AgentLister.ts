import { ManagementApiClient } from '../api';
import type { ValidatedConfiguration } from '../utils/config';
import { AgentOperationError } from './errors';

/**
 * Agent information returned from the API
 */
export interface AgentInfo {
  id: string;
  name?: string;
  defaultSubAgentId?: string | null;
  createdAt?: string;
}

/**
 * Options for listing agents
 */
export interface ListAgentsOptions {
  /**
   * Project ID to list agents from
   */
  projectId: string;

  /**
   * Optional config file path (for API client creation)
   */
  configPath?: string;
}

/**
 * AgentLister handles fetching and processing agent lists
 *
 * This class contains pure business logic for agent listing operations,
 * with minimal infrastructure dependencies.
 */
export class AgentLister {
  /**
   * List all agents for a given project
   *
   * @param config - Validated configuration
   * @param options - List options
   * @returns Array of agent information
   * @throws {AgentOperationError} If the agent list cannot be fetched
   */
  async list(config: ValidatedConfiguration, options: ListAgentsOptions): Promise<AgentInfo[]> {
    try {
      const api = await ManagementApiClient.create(
        config.agentsManageApiUrl,
        options.configPath,
        config.tenantId,
        options.projectId // pass project ID as projectIdOverride
      );

      const agents = await api.listAgents();
      return agents;
    } catch (error) {
      throw new AgentOperationError(
        'list',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get the count of agents for a project
   */
  async count(config: ValidatedConfiguration, options: ListAgentsOptions): Promise<number> {
    const agents = await this.list(config, options);
    return agents.length;
  }
}
