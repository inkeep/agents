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

// Import command implementations
import { addCommand, type AddOptions } from './commands/add';
import { configGetCommand, configListCommand, configSetCommand } from './commands/config';
import { devCommand, type DevOptions } from './commands/dev';
import { initCommand, type InitOptions } from './commands/init';
import { listAgentsCommand, type ListAgentsOptions } from './commands/list-agents';
import { loginCommand, type LoginOptions } from './commands/login';
import { logoutCommand, type LogoutOptions } from './commands/logout';
import {
  profileAddCommand,
  profileCurrentCommand,
  profileListCommand,
  profileRemoveCommand,
  profileUseCommand,
} from './commands/profile';
import { pullV3Command, type PullV3Options } from './commands/pull-v3/index';
import { pushCommand, type PushOptions } from './commands/push';
import { statusCommand, type StatusOptions } from './commands/status';
import { updateCommand, type UpdateOptions } from './commands/update';
import { whoamiCommand } from './commands/whoami';

// Import command schemas for building CLI
import { registerCommand, registerParentCommand } from './schemas/commander-builder.js';
import {
  addCommand as addSchema,
  devCommand as devSchema,
  initCommand as initSchema,
  listAgentsCommand as listAgentsSchema,
  loginCommand as loginSchema,
  logoutCommand as logoutSchema,
  pullCommand as pullSchema,
  pushCommand as pushSchema,
  statusCommand as statusSchema,
  updateCommand as updateSchema,
  whoamiCommand as whoamiSchema,
  configCommand as configSchema,
  profileCommand as profileSchema,
} from './schemas/commands/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

const program = new Command();

program
  .name('inkeep')
  .description('CLI tool for Inkeep Agent Framework')
  .version(packageJson.version);

// Register commands using schemas
// Each command uses the schema for definition but custom action handlers for implementation

// add command
registerCommand<AddOptions>(program, addSchema, async (options) => {
  await addCommand(options);
});

// init command
registerCommand<InitOptions>(program, initSchema, async (options) => {
  await initCommand(options);
});

// push command
registerCommand<PushOptions>(program, pushSchema, async (options) => {
  await pushCommand(options);
});

// pull command
registerCommand<PullV3Options>(program, pullSchema, async (options) => {
  await pullV3Command(options);
});

// list-agent command
registerCommand<ListAgentsOptions & { configFilePath?: string }>(
  program,
  listAgentsSchema,
  async (options) => {
    // Handle deprecated option
    const config = options.config || options.configFilePath;
    await listAgentsCommand({ ...options, config });
  }
);

// dev command - needs special handling for port parsing
registerCommand<DevOptions & { port?: string | number }>(program, devSchema, async (options) => {
  await devCommand({
    port: typeof options.port === 'string' ? parseInt(options.port, 10) : (options.port ?? 3000),
    host: options.host ?? 'localhost',
    build: options.build ?? false,
    outputDir: options.outputDir ?? './inkeep-dev',
    path: options.path ?? false,
    export: options.export ?? false,
    openBrowser: options.openBrowser ?? false,
  });
});

// update command
registerCommand<UpdateOptions>(program, updateSchema, async (options) => {
  await updateCommand(options);
});

// login command
registerCommand<LoginOptions>(program, loginSchema, async (options) => {
  await loginCommand(options);
});

// logout command
registerCommand<LogoutOptions>(program, logoutSchema, async (options) => {
  await logoutCommand(options);
});

// status command
registerCommand<StatusOptions>(program, statusSchema, async (options) => {
  await statusCommand(options);
});

// whoami command
registerCommand(program, whoamiSchema, async () => {
  await whoamiCommand();
});

// config command (parent with subcommands)
// Need to handle deprecated --config-file-path option
const configCmd = program.command('config').description(configSchema.description);

configCmd
  .command('get [key]')
  .description(configSchema.subcommands.get.description)
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (key: string | undefined, options: { config?: string; configFilePath?: string }) => {
    const config = options.config || options.configFilePath;
    await configGetCommand(key, { config });
  });

configCmd
  .command('set <key> <value>')
  .description(configSchema.subcommands.set.description)
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (key: string, value: string, options: { config?: string; configFilePath?: string }) => {
    const config = options.config || options.configFilePath;
    await configSetCommand(key, value, { config });
  });

configCmd
  .command('list')
  .description(configSchema.subcommands.list.description)
  .option('--config <path>', 'Path to configuration file')
  .option('--config-file-path <path>', 'Path to configuration file (deprecated, use --config)')
  .action(async (options: { config?: string; configFilePath?: string }) => {
    const config = options.config || options.configFilePath;
    await configListCommand({ config });
  });

// profile command (parent with subcommands)
registerParentCommand(program, profileSchema, {
  list: async () => {
    await profileListCommand();
  },
  add: async (name: unknown) => {
    await profileAddCommand(name as string | undefined);
  },
  use: async (name: unknown) => {
    await profileUseCommand(name as string);
  },
  current: async () => {
    await profileCurrentCommand();
  },
  remove: async (name: unknown) => {
    await profileRemoveCommand(name as string);
  },
});

program.parse();
