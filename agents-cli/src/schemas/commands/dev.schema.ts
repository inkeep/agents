import { z } from 'zod';
import type { Command } from '../types.js';

/**
 * Zod schema for dev command options
 */
export const devOptionsSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('localhost'),
  build: z.boolean().default(false),
  export: z.boolean().default(false),
  outputDir: z.string().default('./inkeep-dev'),
  path: z.boolean().default(false),
  openBrowser: z.boolean().default(false),
});

export type DevOptions = z.infer<typeof devOptionsSchema>;

/**
 * Dev command schema
 */
export const devCommand: Command = {
  name: 'dev',
  description: 'Start the Inkeep dashboard server',
  longDescription: `Start the Inkeep dashboard server for local development. The dashboard provides a visual interface for testing and debugging your agents.`,
  arguments: [],
  options: [
    {
      name: 'port',
      flags: '--port <port>',
      description: 'Port to run the server on',
      type: 'string',
      defaultValue: '3000',
    },
    {
      name: 'host',
      flags: '--host <host>',
      description: 'Host to bind the server to',
      type: 'string',
      defaultValue: 'localhost',
    },
    {
      name: 'build',
      flags: '--build',
      description: 'Build the Dashboard UI for production',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'export',
      flags: '--export',
      description: 'Export the Next.js project source files',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'outputDir',
      flags: '--output-dir <dir>',
      description: 'Output directory for build files',
      type: 'string',
      defaultValue: './inkeep-dev',
    },
    {
      name: 'path',
      flags: '--path',
      description: 'Output the path to the Dashboard UI',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'openBrowser',
      flags: '--open-browser',
      description: 'Open the browser',
      type: 'boolean',
      defaultValue: false,
    },
  ],
  examples: [
    {
      description: 'Start dashboard on default port',
      command: 'inkeep dev',
    },
    {
      description: 'Start on custom port',
      command: 'inkeep dev --port 8080',
    },
    {
      description: 'Build for production',
      command: 'inkeep dev --build',
    },
    {
      description: 'Start and open browser',
      command: 'inkeep dev --open-browser',
    },
  ],
  aliases: [],
  hidden: false,
  deprecated: false,
  seeAlso: ['push', 'pull'],
};
