import { z } from 'zod';
import type { Command } from '../types.js';

/**
 * Zod schema for pull command options
 */
export const pullOptionsSchema = z.object({
  project: z.string().optional(),
  config: z.string().optional(),
  profile: z.string().optional(),
  env: z.string().optional(),
  json: z.boolean().default(false),
  debug: z.boolean().default(false),
  verbose: z.boolean().default(false),
  force: z.boolean().default(false),
  introspect: z.boolean().default(false),
  all: z.boolean().default(false),
  tag: z.string().optional(),
  quiet: z.boolean().default(false),
});

export type PullOptions = z.infer<typeof pullOptionsSchema>;

/**
 * Pull command schema
 */
export const pullCommand: Command = {
  name: 'pull',
  description: 'Pull project configuration with clean, efficient code generation',
  longDescription: `Pull project configuration from the server and generate local TypeScript files. This command fetches your Agent configurations and creates well-structured code that can be edited and pushed back.`,
  arguments: [],
  options: [
    {
      name: 'project',
      flags: '--project <project-id>',
      description: 'Project ID to pull (or path to project directory). If in project directory, validates against local project ID.',
      type: 'string',
      required: false,
    },
    {
      name: 'config',
      flags: '--config <path>',
      description: 'Path to configuration file',
      type: 'string',
      required: false,
    },
    {
      name: 'profile',
      flags: '--profile <name>',
      description: 'Profile to use for remote URLs and authentication',
      type: 'string',
      required: false,
    },
    {
      name: 'env',
      flags: '--env <environment>',
      description: 'Environment file to generate (development, staging, production). Defaults to development',
      type: 'string',
      required: false,
    },
    {
      name: 'json',
      flags: '--json',
      description: 'Output project data as JSON instead of generating files',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'debug',
      flags: '--debug',
      description: 'Enable debug logging',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'verbose',
      flags: '--verbose',
      description: 'Enable verbose logging',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'force',
      flags: '--force',
      description: 'Force regeneration even if no changes detected',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'introspect',
      flags: '--introspect',
      description: 'Completely regenerate all files from scratch (no comparison needed)',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'all',
      flags: '--all',
      description: 'Pull all projects for current tenant',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'tag',
      flags: '--tag <tag>',
      description: 'Use tagged config file (e.g., --tag prod loads prod.__inkeep.config.ts__)',
      type: 'string',
      required: false,
    },
    {
      name: 'quiet',
      flags: '--quiet',
      description: 'Suppress profile/config logging',
      type: 'boolean',
      defaultValue: false,
    },
  ],
  examples: [
    {
      description: 'Pull current project',
      command: 'inkeep pull',
    },
    {
      description: 'Pull specific project',
      command: 'inkeep pull --project my-project-id',
    },
    {
      description: 'Pull all projects for tenant',
      command: 'inkeep pull --all',
    },
    {
      description: 'Force regeneration of all files',
      command: 'inkeep pull --force',
    },
    {
      description: 'Output as JSON',
      command: 'inkeep pull --json',
    },
  ],
  aliases: [],
  hidden: false,
  deprecated: false,
  seeAlso: ['push', 'init'],
};
