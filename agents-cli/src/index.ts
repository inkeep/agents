/**
 * CLI entry point.
 *
 * IMPORTANT: Keep top-level imports minimal. Only `commander`, `node:fs`,
 * `node:path`, and `node:url` are imported eagerly so that `--version` and
 * `--help` work instantly — even when the dependency tree is broken (e.g.
 * pnpm global installs with a zod v3/v4 mismatch).
 *
 * All command implementations and @inkeep/agents-core imports are lazy-loaded
 * inside `.action()` callbacks via dynamic `import()`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

// ── Lazy initialisation ─────────────────────────────────────────────
// Deferred until the first command actually runs. This keeps
// `inkeep --version` and `inkeep --help` working even when heavy
// dependencies fail to load.

let _initialised = false;

async function ensureInit(): Promise<void> {
  if (_initialised) return;
  _initialised = true;

  // Load .env files (secrets, API keys)
  await import('./env');

  // Start Langfuse tracing (if configured)
  await import('./instrumentation');

  // Silence config-loading logs for cleaner CLI output
  const { getLogger } = await import('@inkeep/agents-core');
  const configLogger = getLogger('config');
  configLogger.updateOptions({ level: 'silent' });
}

// ── Program setup ───────────────────────────────────────────────────

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
  .option('--target-path <path>', 'Target path to add the template to')
  .option('--local-prefix <path_prefix>', 'Use local templates from the given path prefix')
  .option('--config <path>', 'Path to configuration file')
  .action(async (template, options) => {
    await ensureInit();
    const { addCommand } = await import('./commands/add');
    await addCommand({ template, ...options });
  });

program
  .command('init [path]')
  .description('Initialize a new Inkeep project (runs cloud onboarding wizard by default)')
  .option('--local', 'Use local/self-hosted mode instead of cloud onboarding')
  .option('--no-interactive', 'Skip interactive prompts')
  .option('--config <path>', 'Path to use as template for new configuration')
  .action(async (path, options) => {
    await ensureInit();
    const { initCommand } = await import('./commands/init');
    await initCommand({ path, ...options });
  });

const configCommand = program.command('config').description('Manage Inkeep configuration');

configCommand
  .command('get [key]')
  .description('Get configuration value(s)')
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (key, options) => {
    await ensureInit();
    const { configGetCommand } = await import('./commands/config');
    const config = options.config || options.configFilePath;
    await configGetCommand(key, { config });
  });

configCommand
  .command('set <key> <value>')
  .description('Set a configuration value')
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (key, value, options) => {
    await ensureInit();
    const { configSetCommand } = await import('./commands/config');
    const config = options.config || options.configFilePath;
    await configSetCommand(key, value, { config });
  });

configCommand
  .command('list')
  .description('List all configuration values')
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (options) => {
    await ensureInit();
    const { configListCommand } = await import('./commands/config');
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
    await ensureInit();
    const { pushCommand } = await import('./commands/push');
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
    await ensureInit();
    const { pullV3Command } = await import('./commands/pull-v3/index');
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
    await ensureInit();
    const { listAgentsCommand } = await import('./commands/list-agents');
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
    await ensureInit();
    const { devCommand } = await import('./commands/dev');
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
    // update command doesn't need the heavy init (no agents-core deps)
    const { updateCommand } = await import('./commands/update');
    await updateCommand(options);
  });

// Authentication commands
program
  .command('login')
  .description('Authenticate with Inkeep Cloud')
  .option('--profile <name>', 'Profile to authenticate (defaults to active profile)')
  .action(async (options) => {
    await ensureInit();
    const { loginCommand } = await import('./commands/login');
    await loginCommand(options);
  });

program
  .command('logout')
  .description('Log out of Inkeep Cloud')
  .option('--profile <name>', 'Profile to log out (defaults to active profile)')
  .action(async (options) => {
    await ensureInit();
    const { logoutCommand } = await import('./commands/logout');
    await logoutCommand(options);
  });

program
  .command('status')
  .description('Show current profile, authentication state, and remote URLs')
  .option('--profile <name>', 'Profile to show status for (defaults to active profile)')
  .action(async (options) => {
    await ensureInit();
    const { statusCommand } = await import('./commands/status');
    await statusCommand(options);
  });

program
  .command('whoami')
  .description('Display current authentication status (alias for status)')
  .action(async () => {
    await ensureInit();
    const { whoamiCommand } = await import('./commands/whoami');
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
    await ensureInit();
    const { profileListCommand } = await import('./commands/profile');
    await profileListCommand();
  });

profileCommand
  .command('add [name]')
  .description('Add a new profile')
  .action(async (name) => {
    await ensureInit();
    const { profileAddCommand } = await import('./commands/profile');
    await profileAddCommand(name);
  });

profileCommand
  .command('use <name>')
  .description('Set the active profile')
  .action(async (name) => {
    await ensureInit();
    const { profileUseCommand } = await import('./commands/profile');
    await profileUseCommand(name);
  });

profileCommand
  .command('current')
  .description('Display the active profile details')
  .action(async () => {
    await ensureInit();
    const { profileCurrentCommand } = await import('./commands/profile');
    await profileCurrentCommand();
  });

profileCommand
  .command('remove <name>')
  .description('Remove a profile')
  .action(async (name) => {
    await ensureInit();
    const { profileRemoveCommand } = await import('./commands/profile');
    await profileRemoveCommand(name);
  });

program.parse();
