import { z } from 'zod';
import type { Command } from '../types.js';

/**
 * Zod schema for update command options
 */
export const updateOptionsSchema = z.object({
  check: z.boolean().default(false),
  force: z.boolean().default(false),
});

export type UpdateOptions = z.infer<typeof updateOptionsSchema>;

/**
 * Update command schema
 */
export const updateCommand: Command = {
  name: 'update',
  description: 'Update @inkeep/agents-cli to the latest version',
  longDescription: `Check for and install updates to the Inkeep CLI. Use --check to see if updates are available without installing.`,
  arguments: [],
  options: [
    {
      name: 'check',
      flags: '--check',
      description: 'Check for updates without installing',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'force',
      flags: '--force',
      description: 'Force update even if already on latest version',
      type: 'boolean',
      defaultValue: false,
    },
  ],
  examples: [
    {
      description: 'Update to latest version',
      command: 'inkeep update',
    },
    {
      description: 'Check for updates',
      command: 'inkeep update --check',
    },
    {
      description: 'Force reinstall',
      command: 'inkeep update --force',
    },
  ],
  aliases: [],
  hidden: false,
  deprecated: false,
  seeAlso: [],
};
