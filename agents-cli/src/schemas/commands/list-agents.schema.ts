import { z } from 'zod';
import type { Command } from '../types.js';

/**
 * Zod schema for list-agent command options
 */
export const listAgentsOptionsSchema = z.object({
  project: z.string(),
  tenantId: z.string().optional(),
  agentsManageApiUrl: z.string().optional(),
  config: z.string().optional(),
});

export type ListAgentsOptions = z.infer<typeof listAgentsOptionsSchema>;

/**
 * List-agent command schema
 */
export const listAgentsCommand: Command = {
  name: 'list-agent',
  description: 'List all available agents for a specific project',
  longDescription: `List all agents configured for a specific project. Requires a project ID to be specified.`,
  arguments: [],
  options: [
    {
      name: 'project',
      flags: '--project <project-id>',
      description: 'Project ID to list agents for',
      type: 'string',
      required: true,
    },
    {
      name: 'tenantId',
      flags: '--tenant-id <tenant-id>',
      description: 'Tenant ID',
      type: 'string',
      required: false,
    },
    {
      name: 'agentsManageApiUrl',
      flags: '--agents-manage-api-url <url>',
      description: 'Agents manage API URL',
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
      description: 'List agents for a project',
      command: 'inkeep list-agent --project my-project-id',
    },
  ],
  aliases: [],
  hidden: false,
  deprecated: false,
  seeAlso: ['push', 'pull'],
};
