import './env'; // Load environment files first
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { addCommand } from './commands/add';
import { configGetCommand, configListCommand, configSetCommand } from './commands/config';
import { devCommand } from './commands/dev';
import { initCommand } from './commands/init';
import { listAgentsCommand } from './commands/list-agents';
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
  .option('--config <path>', 'Path to configuration file')
  .action(async (template, options) => {
    await addCommand({ template, ...options });
  });

// Init command
program
  .command('init [path]')
  .description('Initialize a new Inkeep configuration file')
  .option('--no-interactive', 'Skip interactive path selection')
  .option('--config <path>', 'Path to use as template for new configuration')
  .action(async (path, options) => {
    await initCommand({ path, ...options });
  });

// Config command with subcommands
const configCommand = program.command('config').description('Manage Inkeep configuration');

configCommand
  .command('get [key]')
  .description('Get configuration value(s)')
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (key, options) => {
    // Support both --config and --config-file-path for backward compatibility
    const config = options.config || options.configFilePath;
    await configGetCommand(key, { config });
  });

configCommand
  .command('set <key> <value>')
  .description('Set a configuration value')
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (key, value, options) => {
    // Support both --config and --config-file-path for backward compatibility
    const config = options.config || options.configFilePath;
    await configSetCommand(key, value, { config });
  });

configCommand
  .command('list')
  .description('List all configuration values')
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (options) => {
    // Support both --config and --config-file-path for backward compatibility
    const config = options.config || options.configFilePath;
    await configListCommand({ config });
  });

// Push command
program
  .command('push')
  .description('Push a project configuration to the backend')
  .option('--project <project-id>', 'Project ID or path to project directory')
  .option('--config <path>', 'Path to configuration file')
  .option('--tenant-id <id>', 'Override tenant ID')
  .option('--agents-manage-api-url <url>', 'Override agents manage API URL')
  .option('--agents-run-api-url <url>', 'Override agents run API URL')
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
  .option('--config <path>', 'Path to configuration file')
  .option('--agents-manage-api-url <url>', 'Override agents manage API URL')
  .option(
    '--env <environment>',
    'Environment file to generate (development, staging, production). Defaults to development'
  )
  .option('--json', 'Generate project data JSON file instead of updating files')
  .option('--debug', 'Enable debug logging for LLM generation')
  .action(async (options) => {
    await pullProjectCommand(options);
  });

// Chat command
program
  .command('chat [graph-id]')
  .description(
    'Start an interactive chat session with a graph (interactive selection if no ID provided)'
  )
  .option('--tenant-id <tenant-id>', 'Tenant ID')
  .option('--agents-manage-api-url <url>', 'Agents manage API URL')
  .option('--agents-run-api-url <url>', 'Agents run API URL')
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (agentId, options) => {
    // Import the enhanced version with autocomplete
    const { chatCommandEnhanced } = await import('./commands/chat-enhanced.js');
    // Support both --config and --config-file-path for backward compatibility
    const config = options.config || options.configFilePath;
    await chatCommandEnhanced(agentId, { ...options, config });
  });

// List graphs command
program
  .command('list-graphs')
  .description('List all available graphs for a specific project')
  .requiredOption('--project <project-id>', 'Project ID to list graphs for')
  .option('--tenant-id <tenant-id>', 'Tenant ID')
  .option('--agents-manage-api-url <url>', 'Agents manage API URL')
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (options) => {
    // Support both --config and --config-file-path for backward compatibility
    const config = options.config || options.configFilePath;
    await listAgentsCommand({ ...options, config });
  });

// Dev command
program
  .command('dev')
  .description('Start the Inkeep dashboard server')
  .option('--port <port>', 'Port to run the server on', '3000')
  .option('--host <host>', 'Host to bind the server to', 'localhost')
  .option('--build', 'Build the Dashboard UI for production', false)
  .option('--export', 'Export the Next.js project source files', false)
  .option('--output-dir <dir>', 'Output directory for build files', './inkeep-dev')
  .option('--path', 'Output the path to the Dashboard UI', false)
  .action(async (options) => {
    await devCommand({
      port: parseInt(options.port, 10),
      host: options.host,
      build: options.build,
      outputDir: options.outputDir,
      path: options.path,
      export: options.export,
    });
  });

// Parse command line arguments
program.parse();
