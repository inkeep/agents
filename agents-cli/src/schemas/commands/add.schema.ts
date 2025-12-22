import { z } from 'zod';
import type { Command } from '../types.js';

/**
 * Zod schema for add command options
 */
export const addOptionsSchema = z.object({
  template: z.string().optional(),
  project: z.string().optional(),
  mcp: z.string().optional(),
  targetPath: z.string().optional(),
  localPrefix: z.string().optional(),
  config: z.string().optional(),
});

export type AddOptions = z.infer<typeof addOptionsSchema>;

/**
 * Add command schema
 */
export const addCommand: Command = {
  name: 'add',
  description: 'Add a new template to the project',
  longDescription: `Add project templates or MCP server templates to your Inkeep project. Templates provide pre-configured setups for common use cases.`,
  arguments: [
    {
      name: 'template',
      description: 'Template name to add',
      required: false,
    },
  ],
  options: [
    {
      name: 'project',
      flags: '--project <template>',
      description: 'Project template to add',
      type: 'string',
      required: false,
    },
    {
      name: 'mcp',
      flags: '--mcp <template>',
      description: 'MCP template to add',
      type: 'string',
      required: false,
    },
    {
      name: 'targetPath',
      flags: '--target-path <path>',
      description: 'Target path to add the template to',
      type: 'string',
      required: false,
    },
    {
      name: 'localPrefix',
      flags: '--local-prefix <path_prefix>',
      description: 'Use local templates from the given path prefix',
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
  ],
  examples: [
    {
      description: 'Add a project template',
      command: 'inkeep add --project docs-assistant',
    },
    {
      description: 'Add an MCP server template',
      command: 'inkeep add --mcp filesystem',
    },
    {
      description: 'Add template to specific path',
      command: 'inkeep add --project docs-assistant --target-path ./agents',
    },
  ],
  aliases: [],
  hidden: false,
  deprecated: false,
  seeAlso: ['init'],
};
