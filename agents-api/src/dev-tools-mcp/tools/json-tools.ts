import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import jmespath from 'jmespath';
import { z } from 'zod';

function parseJsonArg(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    if (
      override[key] !== null &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object' &&
      base[key] !== null &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(
        base[key] as Record<string, unknown>,
        override[key] as Record<string, unknown>
      );
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

export function registerJsonTools(server: McpServer): void {
  server.registerTool(
    'json_format',
    {
      description:
        'Pretty-print a JSON string or object. Pass {"$tool":"toolu_01..."} to reference a previous tool result, or {"$artifact":"art_01...","$tool":"toolu_01..."} (both fields required) to reference an artifact.',
      inputSchema: z.object({
        input: z
          .unknown()
          .describe(
            'JSON string, object, {"$tool":"id"} tool result reference, or {"$artifact":"id","$tool":"id"} artifact reference'
          ),
        indent: z.number().optional().describe('Indentation spaces (default: 2)'),
      }),
    },
    async ({ input, indent = 2 }): Promise<CallToolResult> => {
      try {
        const parsed = parseJsonArg(input);
        return { content: [{ type: 'text', text: JSON.stringify(parsed, null, indent) }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'json_query',
    {
      description:
        'Extract a value from a JSON object using a JMESPath expression. Pass {"$tool":"id"} to reference a previous tool result, or {"$artifact":"id","$tool":"id"} to reference an artifact.',
      inputSchema: z.object({
        data: z
          .unknown()
          .describe(
            'JSON string, object, {"$tool":"id"} tool result reference, or {"$artifact":"id","$tool":"id"} artifact reference'
          ),
        query: z
          .string()
          .describe('JMESPath expression (e.g. "items[0].name", "*.id", "length(items)")'),
      }),
    },
    async ({ data, query }): Promise<CallToolResult> => {
      try {
        const parsed = parseJsonArg(data);
        const result = jmespath.search(parsed, query);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Query failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'json_merge',
    {
      description:
        'Merge two JSON objects. By default performs a deep merge. Each argument accepts {"$tool":"id"} or {"$artifact":"id","$tool":"id"} references.',
      inputSchema: z.object({
        base: z
          .unknown()
          .describe(
            'Base JSON object — string, object, {"$tool":"id"}, or {"$artifact":"id","$tool":"id"}'
          ),
        override: z
          .unknown()
          .describe(
            'Object to merge in — string, object, {"$tool":"id"}, or {"$artifact":"id","$tool":"id"} — its keys take precedence'
          ),
        deep: z
          .boolean()
          .optional()
          .describe('Deep merge nested objects (default: true). Set false for shallow merge.'),
      }),
    },
    async ({ base, override, deep = true }): Promise<CallToolResult> => {
      try {
        const baseObj = parseJsonArg(base);
        const overrideObj = parseJsonArg(override);

        if (typeof baseObj !== 'object' || baseObj === null || Array.isArray(baseObj)) {
          return {
            content: [{ type: 'text', text: 'base must be a JSON object.' }],
            isError: true,
          };
        }
        if (typeof overrideObj !== 'object' || overrideObj === null || Array.isArray(overrideObj)) {
          return {
            content: [{ type: 'text', text: 'override must be a JSON object.' }],
            isError: true,
          };
        }

        const merged = deep
          ? deepMerge(baseObj as Record<string, unknown>, overrideObj as Record<string, unknown>)
          : { ...(baseObj as object), ...(overrideObj as object) };

        return { content: [{ type: 'text', text: JSON.stringify(merged, null, 2) }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Merge failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'json_diff',
    {
      description:
        'Show the structural differences between two JSON values. Each argument accepts {"$tool":"id"} or {"$artifact":"id","$tool":"id"} references.',
      inputSchema: z.object({
        a: z
          .unknown()
          .describe(
            'Original JSON — string, object, {"$tool":"id"}, or {"$artifact":"id","$tool":"id"}'
          ),
        b: z
          .unknown()
          .describe(
            'New JSON — string, object, {"$tool":"id"}, or {"$artifact":"id","$tool":"id"}'
          ),
      }),
    },
    async ({ a, b }): Promise<CallToolResult> => {
      try {
        const objA = parseJsonArg(a);
        const objB = parseJsonArg(b);

        const diffs: string[] = [];

        function compare(pathA: unknown, pathB: unknown, path: string): void {
          if (pathA === pathB) return;

          if (typeof pathA !== typeof pathB || Array.isArray(pathA) !== Array.isArray(pathB)) {
            diffs.push(`~ ${path}: ${JSON.stringify(pathA)} → ${JSON.stringify(pathB)}`);
            return;
          }

          if (Array.isArray(pathA) && Array.isArray(pathB)) {
            const maxLen = Math.max(pathA.length, pathB.length);
            for (let i = 0; i < maxLen; i++) {
              if (i >= pathA.length) {
                diffs.push(`+ ${path}[${i}]: ${JSON.stringify(pathB[i])}`);
              } else if (i >= pathB.length) {
                diffs.push(`- ${path}[${i}]: ${JSON.stringify(pathA[i])}`);
              } else {
                compare(pathA[i], pathB[i], `${path}[${i}]`);
              }
            }
            return;
          }

          if (
            typeof pathA === 'object' &&
            pathA !== null &&
            typeof pathB === 'object' &&
            pathB !== null
          ) {
            const keysA = Object.keys(pathA as object);
            const keysB = Object.keys(pathB as object);
            const allKeys = new Set([...keysA, ...keysB]);
            for (const key of allKeys) {
              const subPath = path ? `${path}.${key}` : key;
              if (!(key in (pathA as object))) {
                diffs.push(
                  `+ ${subPath}: ${JSON.stringify((pathB as Record<string, unknown>)[key])}`
                );
              } else if (!(key in (pathB as object))) {
                diffs.push(
                  `- ${subPath}: ${JSON.stringify((pathA as Record<string, unknown>)[key])}`
                );
              } else {
                compare(
                  (pathA as Record<string, unknown>)[key],
                  (pathB as Record<string, unknown>)[key],
                  subPath
                );
              }
            }
            return;
          }

          diffs.push(`~ ${path}: ${JSON.stringify(pathA)} → ${JSON.stringify(pathB)}`);
        }

        compare(objA, objB, '');

        if (diffs.length === 0)
          return { content: [{ type: 'text', text: 'No differences found.' }] };
        return { content: [{ type: 'text', text: diffs.join('\n') }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Diff failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
