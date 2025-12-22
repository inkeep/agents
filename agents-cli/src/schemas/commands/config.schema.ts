import { z } from 'zod';
import type { ParentCommand } from '../types.js';

/**
 * Zod schema for config get options
 */
export const configGetOptionsSchema = z.object({
  key: z.string().optional(),
  config: z.string().optional(),
});

export type ConfigGetOptions = z.infer<typeof configGetOptionsSchema>;

/**
 * Zod schema for config set options
 */
export const configSetOptionsSchema = z.object({
  key: z.string(),
  value: z.string(),
  config: z.string().optional(),
});

export type ConfigSetOptions = z.infer<typeof configSetOptionsSchema>;

/**
 * Zod schema for config list options
 */
export const configListOptionsSchema = z.object({
  config: z.string().optional(),
});

export type ConfigListOptions = z.infer<typeof configListOptionsSchema>;

/**
 * Config command schema (parent with subcommands)
 */
export const configCommand: ParentCommand = {
  name: 'config',
  description: 'Manage Inkeep configuration',
  longDescription: `Manage your Inkeep configuration file. Get, set, or list configuration values.`,
  arguments: [],
  options: [],
  examples: [],
  aliases: [],
  hidden: false,
  deprecated: false,
  seeAlso: ['init', 'profile'],
  subcommands: {
    get: {
      name: 'get',
      description: 'Get configuration value(s)',
      longDescription: `Get a specific configuration value or all values if no key is provided.`,
      arguments: [
        {
          name: 'key',
          description: 'Configuration key to get (optional, shows all if omitted)',
          required: false,
        },
      ],
      options: [
        {
          name: 'config',
          flags: '--config <path>',
          description: 'Path to configuration file',
          type: 'string',
          required: false,
        },
      ],
      examples: [
        {
          description: 'Get all config values',
          command: 'inkeep config get',
        },
        {
          description: 'Get specific config value',
          command: 'inkeep config get tenantId',
        },
      ],
      aliases: [],
      hidden: false,
      deprecated: false,
      seeAlso: [],
    },
    set: {
      name: 'set',
      description: 'Set a configuration value',
      longDescription: `Set a configuration value in the config file.`,
      arguments: [
        {
          name: 'key',
          description: 'Configuration key to set',
          required: true,
        },
        {
          name: 'value',
          description: 'Value to set',
          required: true,
        },
      ],
      options: [
        {
          name: 'config',
          flags: '--config <path>',
          description: 'Path to configuration file',
          type: 'string',
          required: false,
        },
      ],
      examples: [
        {
          description: 'Set tenant ID',
          command: 'inkeep config set tenantId my-tenant-id',
        },
      ],
      aliases: [],
      hidden: false,
      deprecated: false,
      seeAlso: [],
    },
    list: {
      name: 'list',
      description: 'List all configuration values',
      longDescription: `Display all configuration values from the config file.`,
      arguments: [],
      options: [
        {
          name: 'config',
          flags: '--config <path>',
          description: 'Path to configuration file',
          type: 'string',
          required: false,
        },
      ],
      examples: [
        {
          description: 'List all config values',
          command: 'inkeep config list',
        },
      ],
      aliases: [],
      hidden: false,
      deprecated: false,
      seeAlso: [],
    },
  },
};
