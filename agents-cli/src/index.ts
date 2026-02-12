#!/usr/bin/env node
import './env'; // Load environment files first (needed by instrumentation)
import './instrumentation'; // Initialize Langfuse tracing second

// Silence config loading logs for cleaner CLI output
import { getLogger } from '@inkeep/agents-core';

const configLogger = getLogger('config');
configLogger.updateOptions({ level: 'silent' });

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { addCommand } from './commands/add';
import { configGetCommand, configListCommand, configSetCommand } from './commands/config';
import { devCommand } from './commands/dev';
import { initCommand } from './commands/init';
import { listAgentsCommand } from './commands/list-agents';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import {
  profileAddCommand,
  profileCurrentCommand,
  profileListCommand,
  profileRemoveCommand,
  profileUseCommand,
} from './commands/profile';
import { pullV3Command } from './commands/pull-v3/index';
import { pushCommand } from './commands/push';
import { statusCommand } from './commands/status';
import { updateCommand } from './commands/update';
import { whoamiCommand } from './commands/whoami';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

const program = new Command();

program
  .name('inkeep')
  .description('CLI tool for Inkeep Agent Framework')
  .version(packageJson.version);

program
  .command('add [template]')
  .description('Add a new template to the project')
  .option('--project <template>', 'Project template to add')
  .option('--mcp <template>', 'MCP template to add')
  .option(
    '--ui [component-id]',
    'Add UI component(s) to apps/agents-ui/src/ui (omit id to add all)'
  )
  .option('--list', 'List available UI components (use with --ui)')
  .option('--target-path <path>', 'Target path to add the template to')
  .option('--local-prefix <path_prefix>', 'Use local templates from the given path prefix')
  .option('--config <path>', 'Path to configuration file')
  .option('--profile <name>', 'Profile to use for authentication')
  .option('--quiet', 'Suppress profile/config logging')
  .action(async (template, options) => {
    await addCommand({ template, ...options });
  });

program
  .command('init [path]')
  .description('Initialize a new Inkeep project (runs cloud onboarding wizard by default)')
  .option('--local', 'Use local/self-hosted mode instead of cloud onboarding')
  .option('--no-interactive', 'Skip interactive prompts')
  .option('--config <path>', 'Path to use as template for new configuration')
  .action(async (path, options) => {
    await initCommand({ path, ...options });
  });

const configCommand = program.command('config').description('Manage Inkeep configuration');

configCommand
  .command('get [key]')
  .description('Get configuration value(s)')
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (key, options) => {
    const config = options.config || options.configFilePath;
    await configGetCommand(key, { config });
  });

configCommand
  .command('set <key> <value>')
  .description('Set a configuration value')
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (key, value, options) => {
    const config = options.config || options.configFilePath;
    await configSetCommand(key, value, { config });
  });

configCommand
  .command('list')
  .description('List all configuration values')
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (options) => {
    const config = options.config || options.configFilePath;
    await configListCommand({ config });
  });

program
  .command('push')
  .description('Push a project configuration to the backend')
  .option('--project <project-id>', 'Project ID or path to project directory')
  .option('--config <path>', 'Path to configuration file')
  .option('--profile <name>', 'Profile to use for remote URLs and authentication')
  .option('--tenant-id <id>', 'Override tenant ID')
  .option('--agents-api-url <url>', 'Override agents API URL')
  .option(
    '--env <environment>',
    'Environment to use for credential resolution (e.g., development, production)'
  )
  .option('--json', 'Generate project data JSON file instead of pushing to backend')
  .option('--all', 'Push all projects found in current directory tree')
  .option(
    '--tag <tag>',
    'Use tagged config file (e.g., --tag prod loads prod.__inkeep.config.ts__)'
  )
  .option('--quiet', 'Suppress profile/config logging')
  .action(async (options) => {
    await pushCommand(options);
  });

program
  .command('pull')
  .description('Pull project configuration with clean, efficient code generation')
  .option(
    '--project <project-id>',
    'Project ID to pull (or path to project directory). If in project directory, validates against local project ID.'
  )
  .option('--config <path>', 'Path to configuration file')
  .option('--profile <name>', 'Profile to use for remote URLs and authentication')
  .option(
    '--env <environment>',
    'Environment file to generate (development, staging, production). Defaults to development'
  )
  .option('--json', 'Output project data as JSON instead of generating files')
  .option('--debug', 'Enable debug logging')
  .option('--verbose', 'Enable verbose logging')
  .option('--force', 'Force regeneration even if no changes detected')
  .option('--introspect', 'Completely regenerate all files from scratch (no comparison needed)')
  .option('--all', 'Pull all projects for current tenant')
  .option(
    '--tag <tag>',
    'Use tagged config file (e.g., --tag prod loads prod.__inkeep.config.ts__)'
  )
  .option('--quiet', 'Suppress profile/config logging')
  .action(async (options) => {
    await pullV3Command(options);
  });

program
  .command('list-agent')
  .description('List all available agents for a specific project')
  .requiredOption('--project <project-id>', 'Project ID to list agent for')
  .option('--tenant-id <tenant-id>', 'Tenant ID')
  .option('--agents-api-url <url>', 'Agents API URL')
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (options) => {
    const config = options.config || options.configFilePath;
    await listAgentsCommand({ ...options, config });
  });

program
  .command('dev')
  .description('Start the Inkeep dashboard server')
  .option('--port <port>', 'Port to run the server on', '3000')
  .option('--host <host>', 'Host to bind the server to', 'localhost')
  .option('--build', 'Build the Dashboard UI for production', false)
  .option('--export', 'Export the Next.js project source files', false)
  .option('--output-dir <dir>', 'Output directory for build files', './inkeep-dev')
  .option('--path', 'Output the path to the Dashboard UI', false)
  .option('--open-browser', 'Open the browser', false)
  .action(async (options) => {
    await devCommand({
      port: parseInt(options.port, 10),
      host: options.host,
      build: options.build,
      outputDir: options.outputDir,
      path: options.path,
      export: options.export,
      openBrowser: options.openBrowser,
    });
  });

program
  .command('update')
  .description('Update @inkeep/agents-cli to the latest version')
  .option('--check', 'Check for updates without installing')
  .option('--force', 'Force update even if already on latest version')
  .action(async (options) => {
    await updateCommand(options);
  });

// Authentication commands
program
  .command('login')
  .description('Authenticate with Inkeep Cloud')
  .option('--profile <name>', 'Profile to authenticate (defaults to active profile)')
  .action(async (options) => {
    await loginCommand(options);
  });

program
  .command('logout')
  .description('Log out of Inkeep Cloud')
  .option('--profile <name>', 'Profile to log out (defaults to active profile)')
  .action(async (options) => {
    await logoutCommand(options);
  });

program
  .command('status')
  .description('Show current profile, authentication state, and remote URLs')
  .option('--profile <name>', 'Profile to show status for (defaults to active profile)')
  .action(async (options) => {
    await statusCommand(options);
  });

program
  .command('whoami')
  .description('Display current authentication status (alias for status)')
  .action(async () => {
    await whoamiCommand();
  });

// Profile management commands
const profileCommand = program
  .command('profile')
  .description('Manage CLI profiles for connecting to different remotes');

profileCommand
  .command('list')
  .description('List all profiles')
  .action(async () => {
    await profileListCommand();
  });

profileCommand
  .command('add [name]')
  .description('Add a new profile')
  .action(async (name) => {
    await profileAddCommand(name);
  });

profileCommand
  .command('use <name>')
  .description('Set the active profile')
  .action(async (name) => {
    await profileUseCommand(name);
  });

profileCommand
  .command('current')
  .description('Display the active profile details')
  .action(async () => {
    await profileCurrentCommand();
  });

profileCommand
  .command('remove <name>')
  .description('Remove a profile')
  .action(async (name) => {
    await profileRemoveCommand(name);
  });

program.parse();
