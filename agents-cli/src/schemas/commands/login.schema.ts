import { z } from 'zod';
import type { Command } from '../types.js';

/**
 * Zod schema for login command options
 */
export const loginOptionsSchema = z.object({
  profile: z.string().optional(),
});

export type LoginOptions = z.infer<typeof loginOptionsSchema>;

/**
 * Login command schema
 */
export const loginCommand: Command = {
  name: 'login',
  description: 'Authenticate with Inkeep Cloud',
  longDescription: `Authenticate with Inkeep Cloud using browser-based OAuth. Credentials are stored securely in your profile.`,
  arguments: [],
  options: [
    {
      name: 'profile',
      flags: '--profile <name>',
      description: 'Profile to authenticate (defaults to active profile)',
      type: 'string',
      required: false,
    },
  ],
  examples: [
    {
      description: 'Login to active profile',
      command: 'inkeep login',
    },
    {
      description: 'Login to specific profile',
      command: 'inkeep login --profile staging',
    },
  ],
  aliases: [],
  hidden: false,
  deprecated: false,
  seeAlso: ['logout', 'status', 'profile'],
};
