import { env } from '../env';
import { OutputService } from '../presentation/OutputService';
import { SpinnerService } from '../presentation/SpinnerService';
import { CLIPresenter } from '../presentation/CLIPresenter';
import { validateConfiguration, type ValidatedConfiguration } from '../utils/config';
import {
  DomainError,
  ProjectNotFoundError,
  InvalidProjectError,
  CredentialsLoadError,
  ProjectInitializationError,
  AgentOperationError,
} from '../domain/errors';

/**
 * Base class for command handlers
 *
 * Provides common functionality for all command handlers including:
 * - Configuration loading
 * - Error handling with user-friendly messages
 * - Access to presentation services
 */
export abstract class CommandHandler<TOptions = unknown, TResult = void> {
  constructor(
    protected readonly output: OutputService,
    protected readonly spinner: SpinnerService,
    protected readonly presenter: CLIPresenter
  ) {}

  /**
   * Load and validate configuration
   */
  protected async loadConfig(configPath?: string): Promise<ValidatedConfiguration> {
    try {
      return await validateConfiguration(configPath);
    } catch (error: unknown) {
      this.handleConfigError(error as Error);
      // Process will exit in handleConfigError
      throw error;
    }
  }

  /**
   * Handle configuration loading errors
   */
  private handleConfigError(error: Error): never {
    this.output.error(`Error: ${error.message}`);

    // Provide helpful hints for common errors
    if (error.message.includes('No configuration found')) {
      this.presenter.displayHint(
        'Create a configuration file by running:',
        ['inkeep init']
      );
    } else if (error.message.includes('Config file not found')) {
      this.presenter.displayHint('Check that your config file path is correct');
    } else if (error.message.includes('tenantId') || error.message.includes('API URL')) {
      this.presenter.displayHint(
        'Ensure your inkeep.config.ts has all required fields:',
        ['- tenantId', '- agentsManageApiUrl (or agentsManageApi.url)', '- agentsRunApiUrl (or agentsRunApi.url)']
      );
    }

    process.exit(1);
  }

  /**
   * Handle domain errors with appropriate user feedback
   */
  protected handleDomainError(error: DomainError): never {
    this.output.error(`Error: ${error.message}`);

    // Provide contextual hints based on error type
    if (error instanceof ProjectNotFoundError) {
      this.presenter.displayHint(
        'Please run this command from a directory containing index.ts or use --project <path>'
      );
    } else if (error instanceof InvalidProjectError) {
      this.presenter.displayHint(
        'Ensure your index.ts exports a project created with the agent() builder function'
      );
    } else if (error instanceof CredentialsLoadError) {
      this.presenter.displayHint(
        `Check that the environment file '.env.${error.environment}' exists and is valid`
      );
    } else if (error instanceof ProjectInitializationError) {
      this.presenter.displayHint(
        'Check your network connection and API configuration'
      );
    } else if (error instanceof AgentOperationError) {
      this.presenter.displayHint(
        'Verify the project ID is correct and you have access to it'
      );
    }

    if (error.stack && env.DEBUG) {
      this.output.secondary(error.stack);
    }

    process.exit(1);
  }

  /**
   * Handle general errors with user feedback
   */
  protected handleError(error: unknown): never {
    // Handle domain errors specially
    if (error instanceof DomainError) {
      return this.handleDomainError(error);
    }

    // Handle general errors
    const err = error as Error;
    this.output.error(`Error: ${err.message}`);

    if (err.stack && env.DEBUG) {
      this.output.secondary(err.stack);
    }

    process.exit(1);
  }

  /**
   * Execute the command
   * Subclasses must implement this method
   */
  abstract execute(options: TOptions): Promise<TResult>;
}
