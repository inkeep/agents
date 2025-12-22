import { z } from 'zod';
import type { Command } from '../types.js';

/**
 * Zod schema for whoami command options (none)
 */
export const whoamiOptionsSchema = z.object({});

export type WhoamiOptions = z.infer<typeof whoamiOptionsSchema>;

/**
 * Whoami command schema
 */
export const whoamiCommand: Command = {
  name: 'whoami',
  description: 'Display current authentication status (alias for status)',
  longDescription: `Display current authentication status. This is an alias for the status command.`,
  arguments: [],
  options: [],
  examples: [
    {
      description: 'Show current auth status',
      command: 'inkeep whoami',
    },
  ],
  aliases: [],
  hidden: false,
  deprecated: false,
  seeAlso: ['status', 'login', 'profile'],
};
