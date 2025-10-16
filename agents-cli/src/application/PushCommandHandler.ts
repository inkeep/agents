import { join } from 'node:path';
import { CommandHandler } from './CommandHandler';
import { ProjectLoader } from '../domain/ProjectLoader';
import { ProjectPusher } from '../domain/ProjectPusher';
import { OutputService } from '../presentation/OutputService';
import { SpinnerService } from '../presentation/SpinnerService';
import { CLIPresenter } from '../presentation/CLIPresenter';
import { performBackgroundVersionCheck } from '../utils/background-version-check';

/**
 * Options for the push command
 */
export interface PushOptions {
  project?: string;
  config?: string;
  env?: string;
  json?: boolean;
}

/**
 * Handler for the push command
 *
 * Orchestrates the project push flow by coordinating domain services
 * and presentation layers.
 */
export class PushCommandHandler extends CommandHandler<PushOptions, void> {
  constructor(
    output: OutputService,
    spinner: SpinnerService,
    presenter: CLIPresenter,
    private readonly projectLoader: ProjectLoader,
    private readonly projectPusher: ProjectPusher
  ) {
    super(output, spinner, presenter);
  }

  async execute(options: PushOptions): Promise<void> {
    // Perform background version check (non-blocking)
    performBackgroundVersionCheck();

    // Load configuration
    const config = await this.loadConfig(options.config);

    // Display configuration
    this.presenter.displayConfig(config);
    this.output.newline();

    try {
      // Detect and load project
      const spinnerHandle = this.spinner.start('Detecting project...');

      const projectDir = this.projectLoader.getProjectDirectory({
        projectPath: options.project,
      });

      spinnerHandle.succeed(`Project found: ${projectDir}`);

      // Set environment if provided
      if (options.env) {
        // Note: Setting process.env directly here because it needs to be available for child processes
        process.env.INKEEP_ENV = options.env;
        this.output.secondary(`Setting environment to '${options.env}'...`);
      }

      // Set environment variables for the SDK to use during project construction
      const originalTenantId = process.env.INKEEP_TENANT_ID;
      const originalApiUrl = process.env.INKEEP_API_URL;

      process.env.INKEEP_TENANT_ID = config.tenantId;
      process.env.INKEEP_API_URL = config.agentsManageApiUrl;

      // Load project from index.ts
      const loadSpinner = this.spinner.start('Loading project from index.ts...');
      const project = await this.projectLoader.load({ projectPath: options.project });

      // Restore original environment variables
      if (originalTenantId !== undefined) {
        process.env.INKEEP_TENANT_ID = originalTenantId;
      } else {
        delete process.env.INKEEP_TENANT_ID;
      }
      if (originalApiUrl !== undefined) {
        process.env.INKEEP_API_URL = originalApiUrl;
      } else {
        delete process.env.INKEEP_API_URL;
      }

      loadSpinner.succeed('Project loaded successfully');

      // Handle JSON export mode
      if (options.json) {
        await this.handleJsonExport(project, projectDir, config);
        return;
      }

      // Handle credential loading if environment specified
      if (options.env) {
        const credSpinner = this.spinner.start(
          `Loading credentials for environment '${options.env}'...`
        );
        try {
          await this.loadCredentials(project, options.env, projectDir);
          credSpinner.succeed('Credentials loaded');
        } catch (error) {
          credSpinner.fail('Failed to load credentials');
          throw error;
        }
      }

      // Push the project
      const pushSpinner = this.spinner.start('Initializing project...');
      const result = await this.projectPusher.push(project, config, {
        environment: options.env,
        projectDir,
      });
      pushSpinner.succeed(`Project "${result.projectName}" (${result.projectId}) pushed successfully`);

      // Display success
      this.presenter.displayPushSuccess(project, result.credentialTracking);

      // Force exit to avoid hanging due to OpenTelemetry or other background tasks
      process.exit(0);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Handle JSON export mode
   */
  private async handleJsonExport(
    project: any,
    projectDir: string,
    config: any
  ): Promise<void> {
    const spinner = this.spinner.start('Generating project data JSON...');

    try {
      const projectDefinition = await this.projectPusher.generateJson(project, config);

      // Write the JSON file
      const jsonFilePath = join(projectDir, 'project.json');
      const fs = await import('node:fs/promises');
      await fs.writeFile(jsonFilePath, JSON.stringify(projectDefinition, null, 2));

      spinner.succeed(`Project data saved to ${jsonFilePath}`);

      // Display summary
      this.presenter.displayProjectJson(projectDefinition, projectDir);

      process.exit(0);
    } catch (error) {
      spinner.fail('Failed to generate JSON file');
      throw error;
    }
  }

  /**
   * Load credentials for the project
   */
  private async loadCredentials(
    project: any,
    environment: string,
    projectDir: string
  ): Promise<void> {
    if (typeof project.setCredentials !== 'function') {
      return;
    }

    const { loadEnvironmentCredentials } = await import('../utils/environment-loader');
    const credentials = await loadEnvironmentCredentials(projectDir, environment);
    project.setCredentials(credentials);

    this.presenter.displayCredentialsLoaded(environment, Object.keys(credentials).length);
  }
}
