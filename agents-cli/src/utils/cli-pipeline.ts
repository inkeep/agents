import * as p from '@clack/prompts';
import chalk from 'chalk';
import type { ValidatedConfiguration } from './config';
import { validateConfiguration } from './config';

/**
 * Options for initializing a CLI command
 */
export interface CommandInitOptions {
  /** Path to config file (from --config flag) */
  configPath?: string;
  /** Whether to show a spinner during initialization */
  showSpinner?: boolean;
  /** Custom spinner text */
  spinnerText?: string;
  /** Whether to log configuration sources */
  logConfig?: boolean;
}

/**
 * Result from CLI command initialization
 */
export interface CommandInitResult {
  /** Validated configuration */
  config: ValidatedConfiguration;
}

/**
 * Standard pipeline for initializing CLI commands
 *
 * This function provides a consistent way to:
 * 1. Load and validate configuration from inkeep.config.ts
 * 2. Handle errors with user-friendly messages
 * 3. Optionally display progress with spinners
 * 4. Log configuration sources for debugging
 *
 * @example
 * ```ts
 * export async function myCommand(options: MyOptions) {
 *   const { config, spinner } = await initializeCommand({
 *     configPath: options.config,
 *     showSpinner: true,
 *     spinnerText: 'Loading configuration...',
 *     logConfig: true
 *   });
 *
 *   spinner?.succeed('Configuration loaded');
 *
 *   // Your command logic here...
 * }
 * ```
 */
export async function initializeCommand(
  options: CommandInitOptions = {}
): Promise<CommandInitResult> {
  const {
    configPath,
    showSpinner = false,
    spinnerText = 'Loading configuration...',
    logConfig = true,
  } = options;

  // Start spinner if requested
  const s = showSpinner ? p.spinner() : undefined;
  if (s) {
    s.start(spinnerText);
  }

  try {
    // Load and validate configuration
    const config = await validateConfiguration(configPath);

    if (s) {
      s.stop('Configuration loaded');
    }

    // Log configuration sources for debugging
    if (logConfig) {
      console.log(chalk.gray('Configuration:'));
      console.log(chalk.gray(`  • Tenant ID: ${config.tenantId}`));
      console.log(chalk.gray(`  • Manage API URL: ${config.agentsManageApiUrl}`));
      console.log(chalk.gray(`  • Run API URL: ${config.agentsRunApiUrl}`));
      if (config.sources.configFile) {
        console.log(chalk.gray(`  • Config file: ${config.sources.configFile}`));
      }
    }

    return { config };
  } catch (error: any) {
    if (s) {
      s.stop('Configuration failed');
    }
    console.error(chalk.red('Error:'), error.message);

    // Provide helpful hints for common errors
    if (error.message.includes('No configuration found')) {
      console.log(chalk.yellow('\nHint: Create a configuration file by running:'));
      console.log(chalk.gray('  inkeep init'));
    } else if (error.message.includes('Config file not found')) {
      console.log(chalk.yellow('\nHint: Check that your config file path is correct'));
    } else if (error.message.includes('tenantId') || error.message.includes('API URL')) {
      console.log(chalk.yellow('\nHint: Ensure your inkeep.config.ts has all required fields:'));
      console.log(chalk.gray('  - tenantId'));
      console.log(chalk.gray('  - agentsManageApiUrl (or agentsManageApi.url)'));
      console.log(chalk.gray('  - agentsRunApiUrl (or agentsRunApi.url)'));
    }

    process.exit(1);
  }
}

/**
 * Lightweight config loader without spinners or logging
 * Useful for commands that need config but handle their own UI
 */
export async function loadCommandConfig(configPath?: string): Promise<ValidatedConfiguration> {
  try {
    return await validateConfiguration(configPath);
  } catch (error: any) {
    console.error(chalk.red('Configuration error:'), error.message);
    process.exit(1);
  }
}
