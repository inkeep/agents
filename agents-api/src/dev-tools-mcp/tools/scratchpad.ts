import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export type ScratchpadStore = Map<string, string>;

export function registerScratchpadTools(server: McpServer, pad: ScratchpadStore): void {
  server.registerTool(
    'scratch_write',
    {
      description:
        'Write a note to the scratchpad under a named key. Overwrites any existing value at that key.',
      inputSchema: z.object({
        key: z.string().describe('Note key (name)'),
        content: z.string().describe('Note content'),
      }),
    },
    async ({ key, content }): Promise<CallToolResult> => {
      pad.set(key, content);
      return {
        content: [{ type: 'text', text: `Saved note '${key}' (${content.length} chars).` }],
      };
    }
  );

  server.registerTool(
    'scratch_read',
    {
      description: 'Read a note from the scratchpad by key.',
      inputSchema: z.object({
        key: z.string().describe('Note key to read'),
      }),
    },
    async ({ key }): Promise<CallToolResult> => {
      const value = pad.get(key);
      if (value === undefined) {
        return { content: [{ type: 'text', text: `No note found for key '${key}'.` }] };
      }
      return { content: [{ type: 'text', text: value }] };
    }
  );

  server.registerTool(
    'scratch_append',
    {
      description:
        'Append text to an existing scratchpad note. Creates the note if it does not exist.',
      inputSchema: z.object({
        key: z.string().describe('Note key'),
        content: z.string().describe('Text to append'),
        separator: z
          .string()
          .optional()
          .describe('Separator between existing content and new content (default: newline)'),
      }),
    },
    async ({ key, content, separator = '\n' }): Promise<CallToolResult> => {
      const existing = pad.get(key);
      const updated = existing !== undefined ? `${existing}${separator}${content}` : content;
      pad.set(key, updated);
      return {
        content: [{ type: 'text', text: `Appended to '${key}' (now ${updated.length} chars).` }],
      };
    }
  );

  server.registerTool(
    'scratch_list',
    { description: 'List all note keys currently in the scratchpad.' },
    async (): Promise<CallToolResult> => {
      const keys = [...pad.keys()];
      if (keys.length === 0) return { content: [{ type: 'text', text: 'Scratchpad is empty.' }] };
      const summary = keys.map((k) => `- ${k} (${pad.get(k)!.length} chars)`).join('\n');
      return { content: [{ type: 'text', text: summary }] };
    }
  );

  server.registerTool(
    'scratch_delete',
    {
      description: 'Delete a note from the scratchpad.',
      inputSchema: z.object({
        key: z.string().describe('Note key to delete'),
      }),
    },
    async ({ key }): Promise<CallToolResult> => {
      if (!pad.has(key)) {
        return { content: [{ type: 'text', text: `No note found for key '${key}'.` }] };
      }
      pad.delete(key);
      return { content: [{ type: 'text', text: `Deleted note '${key}'.` }] };
    }
  );
}
