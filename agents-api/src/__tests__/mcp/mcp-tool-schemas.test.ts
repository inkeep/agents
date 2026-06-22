import { createConsoleLogger, createMCPServer } from '@inkeep/agents-mcp';
import { describe, expect, it } from 'vitest';
import { INKEEP_MCP_ALLOWED_TOOLS } from '../../domains/mcp/mcpAllowedTools';
import { getRequestHandlers } from '../../domains/mcp/mcpServerInternals';
import { compactInputSchema, compactToolInputSchemas } from '../../domains/mcp/mcpToolSchemas';

type ToolDef = { name: string; inputSchema?: Record<string, unknown> };

function buildServer() {
  return createMCPServer({
    logger: createConsoleLogger('error'),
    serverURL: 'http://localhost:3002',
    allowedTools: [...INKEEP_MCP_ALLOWED_TOOLS],
  });
}

async function listTools(server: unknown): Promise<ToolDef[]> {
  const handler = getRequestHandlers(server)?.get('tools/list');
  if (!handler) throw new Error('tools/list handler not found');
  const result = (await handler({ method: 'tools/list' }, {})) as { tools: ToolDef[] };
  return result.tools;
}

const bytes = (tools: ToolDef[]) =>
  tools.reduce((sum, t) => sum + JSON.stringify(t.inputSchema ?? {}).length, 0);
const find = (tools: ToolDef[], name: string) =>
  JSON.stringify(tools.find((t) => t.name === name)?.inputSchema ?? {});

// The recursive JSON-Schema meta-schema emits this distinctive enum at every level.
const META_SCHEMA_MARKER = '"integer","boolean","null"';

describe('compactInputSchema (pure transform)', () => {
  const sample = {
    type: 'object',
    properties: {
      subAgents: { type: 'object', properties: { canUse: { type: 'array' } } },
      models: { type: 'object', properties: { base: { type: 'object' } } },
      triggers: {
        anyOf: [{ type: 'array', items: { $ref: '#/definitions/__schema0' } }, { type: 'null' }],
      },
      props: { $ref: '#/definitions/__schema0' },
    },
    definitions: { __schema0: { type: 'object', properties: { big: { type: 'string' } } } },
  };

  it('keeps non-opaque fields (subAgents, models) fully structured', () => {
    const out = compactInputSchema(sample) as typeof sample;
    expect(out.properties.subAgents).toEqual(sample.properties.subAgents);
    // models is intentionally NOT opaqued — agents edit it routinely.
    expect(out.properties.models).toEqual(sample.properties.models);
  });

  it('opaques array-typed fields as arrays and object-typed fields as objects', () => {
    const out = compactInputSchema(sample) as any;
    expect(out.properties.triggers.type).toBe('array');
    expect(out.properties.triggers.items).toEqual({ type: 'object', additionalProperties: true });
    expect(out.properties.props.type).toBe('object');
    expect(out.properties.props.additionalProperties).toBe(true);
  });

  it('prunes definitions left unreferenced after compaction', () => {
    const out = compactInputSchema(sample) as any;
    expect(out.definitions).toBeUndefined();
  });

  it('is a no-op for non-object input', () => {
    expect(compactInputSchema(undefined)).toBeUndefined();
    expect(compactInputSchema('x')).toBe('x');
  });

  it('keeps transitively-referenced defs (a kept def $refs another def)', () => {
    const transitive = {
      type: 'object',
      properties: { thing: { $ref: '#/definitions/A' } },
      definitions: {
        A: { type: 'object', properties: { nested: { $ref: '#/definitions/B' } } },
        B: { type: 'object', properties: { x: { type: 'string' } } },
        Unused: { type: 'object' },
      },
    };
    const out = compactInputSchema(transitive) as any;
    expect(out.definitions.A).toBeDefined(); // referenced by body
    expect(out.definitions.B).toBeDefined(); // referenced only by A (transitive) — must survive
    expect(out.definitions.Unused).toBeUndefined(); // truly orphaned — pruned
  });
});

describe('compactToolInputSchemas (real generated server)', () => {
  it('shrinks the overall tools/list payload without dropping tools', async () => {
    const server = buildServer();
    const before = await listTools(server);
    compactToolInputSchemas(server);
    const after = await listTools(server);

    expect(after.length).toBe(before.length);
    expect(bytes(after)).toBeLessThan(bytes(before) * 0.8); // >= 20% smaller overall
  });

  it('eliminates the recursive props meta-schema from every tool', async () => {
    const server = buildServer();
    compactToolInputSchemas(server);
    const after = await listTools(server);
    const offenders = after.filter((t) =>
      JSON.stringify(t.inputSchema ?? {}).includes(META_SCHEMA_MARKER)
    );
    expect(offenders.map((t) => t.name)).toEqual([]);
  });

  it('collapses the data-component tool but keeps models structured in full-agent', async () => {
    const server = buildServer();
    const before = await listTools(server);
    compactToolInputSchemas(server);
    const after = await listTools(server);

    // data-component: dominated by props -> should shrink hard.
    const dcBefore = find(before, 'data-components-create-data-component').length;
    const dcAfter = find(after, 'data-components-create-data-component').length;
    expect(dcAfter).toBeLessThan(dcBefore * 0.4);

    // full-agent: triggers opaqued (marker present), models + subAgents still structured.
    const fa = find(after, 'agents-create-full-agent');
    expect(fa).toContain('provide the'); // opaque-stub description marker (triggers etc.)
    expect(fa).toContain('"models"');
    expect(fa).toContain('"subAgents"');
    expect(fa.length).toBeLessThan(find(before, 'agents-create-full-agent').length);
  });
});
