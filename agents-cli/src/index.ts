import './env'; // Load environment files first
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { addCommand } from './commands/add';
import { configGetCommand, configListCommand, configSetCommand } from './commands/config';
import { devCommand } from './commands/dev';
import { initCommand } from './commands/init';
import { listGraphsCommand } from './commands/list-graphs';
import { pullProjectCommand } from './commands/pull';
import { pushCommand } from './commands/push';

// Get the current directory for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json to get version
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

const program = new Command();

program
  .name('inkeep')
  .description('CLI tool for Inkeep Agent Framework')
  .version(packageJson.version);

// Add command
program
  .command('add [template]')
  .description('Add a new template to the project')
  .option('--target-path <path>', 'Target path to add the template to')
  .action(async (template, options) => {
    await addCommand({ template, ...options });
  });

// Init command
program
  .command('init [path]')
  .description('Initialize a new Inkeep configuration file')
  .option('--no-interactive', 'Skip interactive path selection')
  .action(async (path, options) => {
    await initCommand({ path, ...options });
  });

// Config command with subcommands
const configCommand = program.command('config').description('Manage Inkeep configuration');

configCommand
  .command('get [key]')
  .description('Get configuration value(s)')
  .option('--config-file-path <path>', 'Path to configuration file')
  .action(async (key, options) => {
    await configGetCommand(key, options);
  });

configCommand
  .command('set <key> <value>')
  .description('Set a configuration value')
  .option('--config-file-path <path>', 'Path to configuration file')
  .action(async (key, value, options) => {
    await configSetCommand(key, value, options);
  });

configCommand
  .command('list')
  .description('List all configuration values')
  .option('--config-file-path <path>', 'Path to configuration file')
  .action(async (options) => {
    await configListCommand(options);
  });

// Push command
program
  .command('push')
  .description('Push a project configuration to the backend')
  .option('--project <project-id>', 'Project ID or path to project directory')
  .option('--agents-manage-api-url <url>', 'Override agents manage API URL')
  .option(
    '--env <environment>',
    'Environment to use for credential resolution (e.g., development, production)'
  )
  .option('--json', 'Generate project data JSON file instead of pushing to backend')
  .action(async (options) => {
    await pushCommand(options);
  });

// Pull command (project-based)
program
  .command('pull')
  .description('Pull entire project configuration from backend and update local files')
  .option('--project <project-id>', 'Project ID or path to project directory')
  .option('--agents-manage-api-url <url>', 'Override agents manage API URL')
  .option('--env <environment>', 'Environment to use for credential resolution')
  .option('--json', 'Generate project data JSON file instead of updating files')
  .action(async (options) => {
    await pullProjectCommand(options);
  });

// Chat command
program
  .command('chat [graph-id]')
  .description(
    'Start an interactive chat session with a graph (interactive selection if no ID provided)'
  )
  .option('--tenant-id <tenant-id>', 'Tenant ID (use with --api-url)')
  .option('--api-url <api-url>', 'API URL (use with --tenant-id or alone to override config)')
  .option(
    '--config-file-path <path>',
    'Path to configuration file (alternative to --tenant-id/--api-url)'
  )
  .action(async (graphId, options) => {
    // Import the enhanced version with autocomplete
    const { chatCommandEnhanced } = await import('./commands/chat-enhanced.js');
    await chatCommandEnhanced(graphId, options);
  });

// List graphs command
program
  .command('list-graphs')
  .description('List all available graphs for the current tenant')
  .option('--tenant-id <tenant-id>', 'Tenant ID (use with --api-url)')
  .option('--api-url <api-url>', 'API URL (use with --tenant-id or alone to override config)')
  .option(
    '--config-file-path <path>',
    'Path to configuration file (alternative to --tenant-id/--api-url)'
  )
  .action(async (options) => {
    await listGraphsCommand(options);
  });

// Dev command
program
  .command('dev')
  .description('Start the Inkeep dashboard server')
  .option('--port <port>', 'Port to run the server on', '3000')
  .option('--host <host>', 'Host to bind the server to', 'localhost')
  .option('--build', 'Create a Vercel-ready build and exit')
  .option('--output-dir <dir>', 'Output directory for build files', './vercel-build')
  .action(async (options) => {
    await devCommand({
      port: parseInt(options.port, 10),
      host: options.host,
      build: options.build,
      outputDir: options.outputDir,
    });
  });

// Parse command line arguments
program.parse();
