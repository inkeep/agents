/**
 * Compact oversized tool input schemas at the MCP boundary.
 *
 * A handful of management tools (create/update-full-project, create/update-full-agent,
 * create/update-trigger, the data/artifact-component tools) ship enormous `tools/list`
 * input schemas — the whole nested config tree is inlined, so one tool can run 8K+
 * tokens. The dominant offenders are a few deeply-nested *advisory* config blocks
 * (and the recursive JSON-Schema "props" meta-schema) that an agent rarely hand-edits.
 *
 * For those fields we serve a compact `{type:object|array + key summary}` placeholder
 * in the menu instead of the full inline structure, and drop the now-orphaned `$defs`.
 * This is the interim runtime lever; the production home is a Speakeasy overlay that
 * rewrites the same component schemas at generation time (mirrors mcpToolDescriptions /
 * mcpToolTitles). See reports/mcp-schema-payload-size-research.md.
 *
 * IMPORTANT — this only changes what the agent READS:
 *   - The MCP SDK still validates `tools/call` args against the original strict Zod.
 *   - The downstream API still validates again.
 * So correctness is unchanged; we only shrink the menu. KEEP fields an agent edits
 * constantly (subAgents, agents, tools, models, ids, names) fully structured.
 *
 * Best-effort: silently no-ops if the pinned SDK's handler-registry shape changes;
 * the mcp/* tests exercise it against the real generated server so drift fails CI.
 */

import { getLogger } from '../../logger';
import { getRequestHandlers } from './mcpServerInternals';

const logger = getLogger('mcp');

/**
 * Field names whose nested schema is collapsed to a compact placeholder. These are
 * the advisory/occasional config blocks; intentionally NOT listed: subAgents, agents,
 * tools, models, canUse, dataComponents/artifactComponents (id arrays), and scalars.
 */
const OPAQUE_SCHEMA_FIELDS: readonly string[] = [
  'props', // the recursive JSON-Schema meta-schema (data/artifact component props)
  'triggers',
  'statusUpdates',
  'signatureVerification',
  'contextConfig',
  'stopWhen',
  'functions',
  'functionTools',
  'credentialReferences',
];

const TOOLS_LIST_METHOD = 'tools/list';

type Json = Record<string, unknown>;

/** Does this JSON-schema node describe an array (possibly via a nullable anyOf)? */
function isArrayNode(node: Json): boolean {
  if (node.type === 'array') return true;
  const variants = (node.anyOf ?? node.oneOf) as Json[] | undefined;
  return Array.isArray(variants) && variants.some((v) => v && v.type === 'array');
}

/** Pull the object-property node out of a value that may be array/nullable-wrapped. */
function unwrapObjectShape(node: Json): Json | undefined {
  if (node.type === 'object' && node.properties) return node;
  if (node.type === 'array' && node.items && typeof node.items === 'object') {
    return unwrapObjectShape(node.items as Json);
  }
  const variants = (node.anyOf ?? node.oneOf) as Json[] | undefined;
  if (Array.isArray(variants)) {
    for (const v of variants) {
      const found = v && typeof v === 'object' ? unwrapObjectShape(v as Json) : undefined;
      if (found) return found;
    }
  }
  return undefined;
}

/** Short, truthful hint listing the block's own top-level keys (no hand-written guesses). */
function summarizeKeys(node: Json): string {
  const shape = unwrapObjectShape(node);
  const props = shape?.properties as Json | undefined;
  if (!props) return '';
  const keys = Object.keys(props).slice(0, 12);
  if (keys.length === 0) return '';
  return ` Keys: ${keys.join(', ')}.`;
}

/** Build the compact replacement for an opaque field, preserving object-vs-array. */
function opaqueStub(field: string, original: Json): Json {
  const summary = summarizeKeys(original);
  const description = `${field}: nested config — provide the ${isArrayNode(original) ? 'array' : 'object'} as documented; validated server-side.${summary}`;
  return isArrayNode(original)
    ? { type: 'array', items: { type: 'object', additionalProperties: true }, description }
    : { type: 'object', additionalProperties: true, description };
}

/** Replace opaque fields wherever they appear (recursively), preserving everything else. */
function replaceOpaqueFields(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(replaceOpaqueFields);
  if (node && typeof node === 'object') {
    const obj = node as Json;
    const out: Json = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'properties' && value && typeof value === 'object') {
        const props = value as Json;
        const nextProps: Json = {};
        for (const [propName, propSchema] of Object.entries(props)) {
          nextProps[propName] = OPAQUE_SCHEMA_FIELDS.includes(propName)
            ? opaqueStub(propName, (propSchema ?? {}) as Json)
            : replaceOpaqueFields(propSchema);
        }
        out[key] = nextProps;
      } else {
        out[key] = replaceOpaqueFields(value);
      }
    }
    return out;
  }
  return node;
}

/** Drop `$defs`/`definitions` entries no longer referenced by any `$ref` after compaction. */
function pruneUnusedDefs(schema: Json): Json {
  const defsKey = schema.$defs ? '$defs' : schema.definitions ? 'definitions' : undefined;
  if (!defsKey) return schema;
  const defs = schema[defsKey] as Json;
  const referenced = new Set<string>();
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Json)) {
        if (k === '$ref' && typeof v === 'string') referenced.add(v.split('/').pop() as string);
        else collect(v);
      }
    }
  };
  const body = { ...schema };
  delete body[defsKey];
  collect(body);

  // Saturate: a kept def may itself $ref another def. Keep traversing referenced defs
  // until the set stops growing, so we never prune a def that a kept def still points to.
  let prevSize = -1;
  while (referenced.size !== prevSize) {
    prevSize = referenced.size;
    for (const [name, def] of Object.entries(defs)) if (referenced.has(name)) collect(def);
  }

  const kept: Json = {};
  for (const [name, def] of Object.entries(defs)) if (referenced.has(name)) kept[name] = def;
  const next = { ...schema };
  if (Object.keys(kept).length === 0) delete next[defsKey];
  else next[defsKey] = kept;
  return next;
}

/** Pure transform: compact a single tool's input schema. Exported for tests. */
export function compactInputSchema(inputSchema: unknown): unknown {
  if (!inputSchema || typeof inputSchema !== 'object') return inputSchema;
  return pruneUnusedDefs(replaceOpaqueFields(inputSchema) as Json);
}

/**
 * Wrap the server's `tools/list` handler so every emitted tool's `inputSchema` is
 * compacted before it goes on the wire. Best-effort: if compaction throws on an
 * unexpected schema shape, fall back to the uncompacted result so `tools/list` never
 * fails for the whole session. Call once per server (the route builds a fresh server
 * per request).
 */
export function compactToolInputSchemas(mcpServer: unknown): void {
  const handlers = getRequestHandlers(mcpServer);
  const original = handlers?.get(TOOLS_LIST_METHOD);
  if (!handlers || !original) return;

  handlers.set(TOOLS_LIST_METHOD, async (request, extra) => {
    const result = (await original(request, extra)) as { tools?: Array<{ inputSchema?: unknown }> };
    try {
      if (result && Array.isArray(result.tools)) {
        result.tools = result.tools.map((tool) =>
          tool?.inputSchema ? { ...tool, inputSchema: compactInputSchema(tool.inputSchema) } : tool
        );
      }
    } catch (error) {
      // best-effort: return the uncompacted tool list rather than failing tools/list
      logger.warn({ error }, 'MCP: tool input-schema compaction failed; serving uncompacted');
    }
    return result;
  });
}
