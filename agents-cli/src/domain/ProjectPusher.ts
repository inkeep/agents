import type { Project } from '@inkeep/agents-sdk';
import type { ValidatedConfiguration } from '../utils/config';
import { loadEnvironmentCredentials } from '../utils/environment-loader';
import { ProjectInitializationError, CredentialsLoadError } from './errors';

/**
 * Options for pushing a project
 */
export interface ProjectPushOptions {
  /**
   * Optional environment name for loading credentials
   */
  environment?: string;

  /**
   * Project directory path (for loading environment credentials)
   */
  projectDir: string;
}

/**
 * Result from pushing a project
 */
export interface ProjectPushResult {
  /**
   * The project ID
   */
  projectId: string;

  /**
   * The project name
   */
  projectName: string;

  /**
   * Project statistics
   */
  stats: {
    agentCount: number;
    tenantId: string;
  };

  /**
   * Credential tracking information (if available)
   */
  credentialTracking?: {
    credentials: Record<string, { type?: string; credentialStoreId?: string }>;
    usage: Record<string, Array<{ type: string; id: string }>>;
  };
}

/**
 * ProjectPusher handles pushing projects to the backend
 *
 * This class contains pure business logic for project initialization,
 * with no UI or direct infrastructure dependencies.
 */
export class ProjectPusher {
  /**
   * Configure a project with tenant and API information
   */
  private configureProject(project: Project, config: ValidatedConfiguration): void {
    if (typeof project.setConfig === 'function') {
      project.setConfig(
        config.tenantId,
        config.agentsManageApiUrl,
        undefined, // models - not needed here as they come from the project definition
        config.agentsManageApiKey
      );
    }
  }

  /**
   * Set environment credentials on the project
   */
  private async setEnvironmentCredentials(
    project: Project,
    environment: string,
    projectDir: string
  ): Promise<number> {
    if (typeof project.setCredentials !== 'function') {
      throw new CredentialsLoadError(environment, 'Project does not support credentials');
    }

    try {
      const credentials = await loadEnvironmentCredentials(projectDir, environment);
      project.setCredentials(credentials);
      return Object.keys(credentials).length;
    } catch (error) {
      throw new CredentialsLoadError(
        environment,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get credential tracking information from the project
   */
  private async getCredentialTracking(
    project: Project
  ): Promise<ProjectPushResult['credentialTracking']> {
    try {
      const credentialTracking = await project.getCredentialTracking();
      const credentialCount = Object.keys(credentialTracking.credentials).length;

      if (credentialCount > 0) {
        return credentialTracking;
      }
    } catch (_error) {
      // Silently fail if credential tracking is not available
    }
    return undefined;
  }

  /**
   * Push a project to the backend
   *
   * @param project - The project to push
   * @param config - Validated configuration
   * @param options - Push options
   * @returns Push result with project information
   * @throws {CredentialsLoadError} If credentials cannot be loaded
   * @throws {ProjectInitializationError} If project initialization fails
   */
  async push(
    project: Project,
    config: ValidatedConfiguration,
    options: ProjectPushOptions
  ): Promise<ProjectPushResult> {
    // Configure the project with tenant and API information
    this.configureProject(project, config);

    // Load environment credentials if requested
    if (options.environment) {
      await this.setEnvironmentCredentials(project, options.environment, options.projectDir);
    }

    // Initialize the project (this pushes to the backend)
    try {
      await project.init();
    } catch (error) {
      throw new ProjectInitializationError(
        project.getId() || 'unknown',
        error instanceof Error ? error.message : String(error)
      );
    }

    // Get project details
    const projectId = project.getId();
    const projectName = project.getName();
    const stats = project.getStats();

    // Get credential tracking information
    const credentialTracking = await this.getCredentialTracking(project);

    return {
      projectId,
      projectName,
      stats,
      credentialTracking,
    };
  }

  /**
   * Generate project JSON definition without pushing
   */
  async generateJson(project: Project, config: ValidatedConfiguration): Promise<unknown> {
    // Configure the project
    this.configureProject(project, config);

    // Generate the project definition without initializing
    return await project.getFullDefinition();
  }
}
