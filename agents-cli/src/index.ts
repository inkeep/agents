import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { configGetCommand, configListCommand, configSetCommand } from './commands/config.js';
import { initCommand } from './commands/init.js';
import { listGraphsCommand } from './commands/list-graphs.js';
import { pullCommand } from './commands/pull.js';
import { pushCommand } from './commands/push.js';

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
  .command('push <graph-path>')
  .description('Push a graph configuration to the backend')
  .option('--tenant-id <tenant-id>', 'Tenant ID (use with --api-url)')
  .option('--api-url <api-url>', 'API URL (use with --tenant-id or alone to override config)')
  .option(
    '--config-file-path <path>',
    'Path to configuration file (alternative to --tenant-id/--api-url)'
  )
  .action(async (graphPath, options) => {
    await pushCommand(graphPath, options);
  });

// Pull command
program
  .command('pull <graph-id>')
  .description('Pull a graph configuration from the backend and generate TypeScript file')
  .option('--tenant-id <tenant-id>', 'Tenant ID (use with --api-url)')
  .option('--api-url <api-url>', 'API URL (use with --tenant-id or alone to override config)')
  .option(
    '--config-file-path <path>',
    'Path to configuration file (alternative to --tenant-id/--api-url)'
  )
  .option('--output-path <path>', 'Output directory for the generated file (overrides config)')
  .option('--json', 'Output as JSON file instead of TypeScript')
  .action(async (graphId, options) => {
    await pullCommand(graphId, options);
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

// Parse command line arguments
program.parse();
