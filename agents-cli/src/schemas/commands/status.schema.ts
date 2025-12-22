import { z } from 'zod';
import type { Command } from '../types.js';

/**
 * Zod schema for status command options
 */
export const statusOptionsSchema = z.object({
  profile: z.string().optional(),
});

export type StatusOptions = z.infer<typeof statusOptionsSchema>;

/**
 * Status command schema
 */
export const statusCommand: Command = {
  name: 'status',
  description: 'Show current profile, authentication state, and remote URLs',
  longDescription: `Display the current profile configuration including authentication state, remote API URLs, and tenant information.`,
  arguments: [],
  options: [
    {
      name: 'profile',
      flags: '--profile <name>',
      description: 'Profile to show status for (defaults to active profile)',
      type: 'string',
      required: false,
    },
  ],
  examples: [
    {
      description: 'Show status for active profile',
      command: 'inkeep status',
    },
    {
      description: 'Show status for specific profile',
      command: 'inkeep status --profile staging',
    },
  ],
  aliases: [],
  hidden: false,
  deprecated: false,
  seeAlso: ['login', 'logout', 'profile', 'whoami'],
};
