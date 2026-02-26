import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import jmespath from 'jmespath';
import { z } from 'zod';
import { getLogger } from '../../logger';

const logger = getLogger('dev-tools-mcp:json');

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
      description: `Extract a value from a JSON object using a JMESPath expression. Pass {"$tool":"id"} to reference a previous tool result, or {"$artifact":"id","$tool":"id"} to reference an artifact.

JMESPATH QUICK REFERENCE:
  field                          → top-level field
  a.b.c                          → nested field access
  items[?x=='val']               → filter array where x equals val (returns array)
  items[?x=='val'] | [0]         → filter then take first match
  items[?x=='val'] | [0].field   → filter, take first match, access field
  items[?contains(x, 'val')]     → filter using contains()
  items[*].name                  → pluck field from all array elements

PREFER FILTERS OVER POSITIONAL INDEXES:
  Use [?field=='value'] to target items by their content — not [0], [1], [2].
  Positional indexes are unreliable because you cannot know the exact position in advance.
  ✅ items[?type=='doc'] | [0].text   ← targets by property, takes first match
  ❌ items[2].text                    ← assumes position, will silently return wrong item or null

DEBUGGING — if the result is null:
  The path is wrong. Do NOT copy the value inline as a workaround.
  Debug step by step: run json_query with progressively deeper paths (e.g. start with "result",
  then "result.data", then "result.data.items") until you find where the path breaks.
  Use json_format on the full object first if the structure is unknown.

  After a filter like items[?x=='val'], you get an array — always pipe to | [0] to get one item:
    ✅ items[?type=='doc'] | [0].text
    ❌ items[?type=='doc'].text  ← does not extract .text from the first match`,
      inputSchema: z.object({
        data: z
          .unknown()
          .describe(
            'JSON string, object, {"$tool":"id"} tool result reference, or {"$artifact":"id","$tool":"id"} artifact reference'
          ),
        query: z
          .string()
          .describe(
            'JMESPath expression (e.g. "items[0].name", "items[?type==\'doc\'] | [0].text")'
          ),
      }),
    },
    async ({ data, query }): Promise<CallToolResult> => {
      try {
        const parsed = parseJsonArg(data);
        const result = jmespath.search(parsed, query);
        logger.info(
          { query, dataType: typeof parsed, dataKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed as object) : null, resultType: typeof result, resultIsNull: result === null, resultIsArray: Array.isArray(result) },
          'json_query executed'
        );
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        logger.error({ query, error: err instanceof Error ? err.message : String(err) }, 'json_query failed');
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
