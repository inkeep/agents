import './env'; // Load environment files first (needed by instrumentation)
import './instrumentation'; // Initialize Langfuse tracing second
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
import { pullV2Command } from './commands/pull-v2';
import { pushCommand } from './commands/push';
import { updateCommand } from './commands/update';

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
  .option('--target-path <path>', 'Target path to add the template to')
  .option('--config <path>', 'Path to configuration file')
  .action(async (template, options) => {
    await addCommand({ template, ...options });
  });

program
  .command('init [path]')
  .description('Initialize a new Inkeep configuration file')
  .option('--no-interactive', 'Skip interactive path selection')
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

program
  .command('pull-v2')
  .description('Pull project configuration with deterministic code generation (no LLM required)')
  .option('--project <project-id>', 'Project ID to pull from backend')
  .option('--config <path>', 'Path to configuration file')
  .option(
    '--env <environment>',
    'Environment file to generate (development, staging, production). Defaults to development'
  )
  .option('--json', 'Output project data as JSON instead of generating files')
  .option('--debug', 'Enable debug logging')
  .option('--force', 'Force regeneration even if no changes detected')
  .action(async (options) => {
    await pullV2Command(options);
  });

program
  .command('list-agent')
  .description('List all available agents for a specific project')
  .requiredOption('--project <project-id>', 'Project ID to list agent for')
  .option('--tenant-id <tenant-id>', 'Tenant ID')
  .option('--agents-manage-api-url <url>', 'Agents manage API URL')
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

program
  .command('update')
  .description('Update @inkeep/agents-cli to the latest version')
  .option('--check', 'Check for updates without installing')
  .option('--force', 'Force update even if already on latest version')
  .action(async (options) => {
    await updateCommand(options);
  });

program.parse();
