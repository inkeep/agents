import { z } from 'zod';
import type { ParentCommand } from '../types.js';

/**
 * Zod schema for profile add options
 */
export const profileAddOptionsSchema = z.object({
  name: z.string().optional(),
});

export type ProfileAddOptions = z.infer<typeof profileAddOptionsSchema>;

/**
 * Zod schema for profile use options
 */
export const profileUseOptionsSchema = z.object({
  name: z.string(),
});

export type ProfileUseOptions = z.infer<typeof profileUseOptionsSchema>;

/**
 * Zod schema for profile remove options
 */
export const profileRemoveOptionsSchema = z.object({
  name: z.string(),
});

export type ProfileRemoveOptions = z.infer<typeof profileRemoveOptionsSchema>;

/**
 * Profile command schema (parent with subcommands)
 */
export const profileCommand: ParentCommand = {
  name: 'profile',
  description: 'Manage CLI profiles for connecting to different remotes',
  longDescription: `Manage named CLI profiles for multiple remotes, credentials, and environments. Profiles are stored in ~/.inkeep/profiles.yaml. A default 'cloud' profile points to hosted endpoints.`,
  arguments: [],
  options: [],
  examples: [
    {
      description: 'Create a local profile and switch to it',
      command: 'inkeep profile add local && inkeep profile use local',
    },
  ],
  aliases: [],
  hidden: false,
  deprecated: false,
  seeAlso: ['login', 'logout', 'status'],
  subcommands: {
    list: {
      name: 'list',
      description: 'List all profiles',
      longDescription: `Display all configured profiles and indicate the currently active profile.`,
      arguments: [],
      options: [],
      examples: [
        {
          description: 'List all profiles',
          command: 'inkeep profile list',
        },
      ],
      aliases: [],
      hidden: false,
      deprecated: false,
      seeAlso: [],
    },
    add: {
      name: 'add',
      description: 'Add a new profile',
      longDescription: `Add a new named profile. If no name is provided, you will be prompted to enter one.`,
      arguments: [
        {
          name: 'name',
          description: 'Name for the new profile',
          required: false,
        },
      ],
      options: [],
      examples: [
        {
          description: 'Add a new profile interactively',
          command: 'inkeep profile add',
        },
        {
          description: 'Add a named profile',
          command: 'inkeep profile add staging',
        },
      ],
      aliases: [],
      hidden: false,
      deprecated: false,
      seeAlso: [],
    },
    use: {
      name: 'use',
      description: 'Set the active profile',
      longDescription: `Set a profile as the currently active profile. All subsequent commands will use this profile.`,
      arguments: [
        {
          name: 'name',
          description: 'Profile name to activate',
          required: true,
        },
      ],
      options: [],
      examples: [
        {
          description: 'Switch to staging profile',
          command: 'inkeep profile use staging',
        },
      ],
      aliases: [],
      hidden: false,
      deprecated: false,
      seeAlso: [],
    },
    current: {
      name: 'current',
      description: 'Display the active profile details',
      longDescription: `Display detailed information about the currently active profile including remote URLs and authentication state.`,
      arguments: [],
      options: [],
      examples: [
        {
          description: 'Show current profile',
          command: 'inkeep profile current',
        },
      ],
      aliases: [],
      hidden: false,
      deprecated: false,
      seeAlso: [],
    },
    remove: {
      name: 'remove',
      description: 'Remove a profile',
      longDescription: `Remove a named profile. Cannot remove the currently active profile.`,
      arguments: [
        {
          name: 'name',
          description: 'Profile name to remove',
          required: true,
        },
      ],
      options: [],
      examples: [
        {
          description: 'Remove staging profile',
          command: 'inkeep profile remove staging',
        },
      ],
      aliases: [],
      hidden: false,
      deprecated: false,
      seeAlso: [],
    },
  },
};
