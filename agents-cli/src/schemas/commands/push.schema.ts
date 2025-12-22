import { z } from 'zod';
import type { Command } from '../types.js';

/**
 * Zod schema for push command options - used for validation and type inference
 */
export const pushOptionsSchema = z.object({
  project: z.string().optional(),
  config: z.string().optional(),
  profile: z.string().optional(),
  tenantId: z.string().optional(),
  agentsManageApiUrl: z.string().url().optional(),
  agentsRunApiUrl: z.string().url().optional(),
  env: z.string().optional(),
  json: z.boolean().default(false),
  all: z.boolean().default(false),
  tag: z.string().optional(),
  quiet: z.boolean().default(false),
});

export type PushOptions = z.infer<typeof pushOptionsSchema>;

/**
 * Push command schema - source of truth for CLI definition and documentation
 */
export const pushCommand: Command = {
  name: 'push',
  description: 'Push a project configuration to the backend',
  longDescription: `Push a project containing Agent configurations to your server. This command deploys your entire multi-agent project, including all Agents, Sub Agents, and tools.

The most common workflow is to run \`inkeep push\` from inside a project directory. A project directory is identified by having an \`index.ts\` file that exports a project object (with \`__type = "project"\`).`,
  arguments: [],
  options: [
    {
      name: 'project',
      flags: '--project <project-id>',
      description: 'Project ID or path to project directory',
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
      name: 'tenantId',
      flags: '--tenant-id <id>',
      description: 'Override tenant ID',
      type: 'string',
      required: false,
    },
    {
      name: 'agentsManageApiUrl',
      flags: '--agents-manage-api-url <url>',
      description: 'Override agents manage API URL',
      type: 'string',
      required: false,
    },
    {
      name: 'agentsRunApiUrl',
      flags: '--agents-run-api-url <url>',
      description: 'Override agents run API URL',
      type: 'string',
      required: false,
    },
    {
      name: 'env',
      flags: '--env <environment>',
      description: 'Environment to use for credential resolution (e.g., development, production)',
      type: 'string',
      required: false,
    },
    {
      name: 'json',
      flags: '--json',
      description: 'Generate project data JSON file instead of pushing to backend',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'all',
      flags: '--all',
      description: 'Push all projects found in current directory tree',
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
      description: 'Push project from current directory',
      command: 'inkeep push',
    },
    {
      description: 'Push specific project directory',
      command: 'inkeep push --project ./my-project',
    },
    {
      description: 'Push all projects in current directory tree',
      command: 'inkeep push --all',
    },
    {
      description: 'Push with development environment credentials',
      command: 'inkeep push --env development',
    },
    {
      description: 'Generate project JSON without pushing',
      command: 'inkeep push --json',
    },
    {
      description: 'Use a named profile',
      command: 'inkeep push --profile staging',
    },
  ],
  aliases: [],
  hidden: false,
  deprecated: false,
  seeAlso: ['pull', 'init', 'config'],
};
