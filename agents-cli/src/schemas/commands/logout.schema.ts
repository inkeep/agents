import { z } from 'zod';
import type { Command } from '../types.js';

/**
 * Zod schema for logout command options
 */
export const logoutOptionsSchema = z.object({
  profile: z.string().optional(),
});

export type LogoutOptions = z.infer<typeof logoutOptionsSchema>;

/**
 * Logout command schema
 */
export const logoutCommand: Command = {
  name: 'logout',
  description: 'Log out of Inkeep Cloud',
  longDescription: `Log out of Inkeep Cloud and remove stored credentials from your profile.`,
  arguments: [],
  options: [
    {
      name: 'profile',
      flags: '--profile <name>',
      description: 'Profile to log out (defaults to active profile)',
      type: 'string',
      required: false,
    },
  ],
  examples: [
    {
      description: 'Logout from active profile',
      command: 'inkeep logout',
    },
    {
      description: 'Logout from specific profile',
      command: 'inkeep logout --profile staging',
    },
  ],
  aliases: [],
  hidden: false,
  deprecated: false,
  seeAlso: ['login', 'status', 'profile'],
};
