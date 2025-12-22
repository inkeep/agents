import { z } from 'zod';
import type { Command } from '../types.js';

/**
 * Zod schema for init command options
 */
export const initOptionsSchema = z.object({
  path: z.string().optional(),
  local: z.boolean().default(false),
  interactive: z.boolean().default(true),
  config: z.string().optional(),
});

export type InitOptions = z.infer<typeof initOptionsSchema>;

/**
 * Init command schema
 */
export const initCommand: Command = {
  name: 'init',
  description: 'Initialize a new Inkeep project (runs cloud onboarding wizard by default)',
  longDescription: `Initialize a new Inkeep configuration file in your project. By default, runs the cloud onboarding wizard. Use --local for self-hosted mode.`,
  arguments: [
    {
      name: 'path',
      description: 'Directory path to initialize the project in',
      required: false,
    },
  ],
  options: [
    {
      name: 'local',
      flags: '--local',
      description: 'Use local/self-hosted mode instead of cloud onboarding',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'interactive',
      flags: '--no-interactive',
      description: 'Skip interactive prompts',
      type: 'boolean',
      defaultValue: true,
    },
    {
      name: 'config',
      flags: '--config <path>',
      description: 'Path to use as template for new configuration',
      type: 'string',
      required: false,
    },
  ],
  examples: [
    {
      description: 'Interactive initialization',
      command: 'inkeep init',
    },
    {
      description: 'Initialize in specific directory',
      command: 'inkeep init ./my-project',
    },
    {
      description: 'Non-interactive mode',
      command: 'inkeep init --no-interactive',
    },
    {
      description: 'Use specific config as template',
      command: 'inkeep init --config ./template-config.ts',
    },
    {
      description: 'Local/self-hosted mode',
      command: 'inkeep init --local',
    },
  ],
  aliases: [],
  hidden: false,
  deprecated: false,
  seeAlso: ['push', 'pull', 'config'],
};
