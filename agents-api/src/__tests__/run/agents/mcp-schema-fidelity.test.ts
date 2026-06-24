import { z } from '@hono/zod-openapi';
import { normalizeJsonSchemaProperties } from '@inkeep/agents-core/utils/json-schema-walk';
import { jsonSchema } from 'ai';
import { describe, expect, test } from 'vitest';
import { SystemPromptBuilder } from '../../../domains/run/agents/SystemPromptBuilder';
import { buildRefAwareSchemas } from '../../../domains/run/agents/tools/ref-aware-schema';
import type { McpServerGroupData, SystemPromptV1 } from '../../../domains/run/agents/types';
import { PromptConfig } from '../../../domains/run/agents/versions/v1/PromptConfig';
import {
  allOfSchema,
  arrayItemDataComponentSchema,
  definitionsKeywordSchema,
  multiBranchUnionSchema,
  nestedDataComponentSchema,
  nullableRefSchema,
  recallGetInfoSchema,
  recursiveTreeSchema,
} from '../../fixtures/mcp-schemas';

describe('MCP tool-schema fidelity', () => {
  describe('ingestion + provider/validation (z.fromJSONSchema -> buildRefAwareSchemas)', () => {
    test('preserves nested $ref structure and validates the required nested field', () => {
      const zodSchema = z.fromJSONSchema(
        recallGetInfoSchema as Parameters<typeof z.fromJSONSchema>[0]
      );
      const { refAwareInputSchema, baseInputSchema } = buildRefAwareSchemas(zodSchema);

      const providerJson = (refAwareInputSchema as { jsonSchema: Record<string, any> }).jsonSchema;
      expect(JSON.stringify(providerJson.properties.telemetry)).toContain('intent');

      expect(baseInputSchema).toBeDefined();
      expect(baseInputSchema?.safeParse({ telemetry: {} }).success).toBe(false);
      expect(baseInputSchema?.safeParse({ telemetry: { intent: 'confirm account' } }).success).toBe(
        true
      );
    });

    test('unwraps an AI SDK jsonSchema() wrapper from the ingestion fallback path', () => {
      const wrapped = jsonSchema({
        type: 'object',
        properties: { a: { type: 'string' } },
        required: ['a'],
      });
      const { refAwareInputSchema, baseInputSchema } = buildRefAwareSchemas(
        wrapped as unknown as Record<string, unknown>
      );
      const providerJson = (refAwareInputSchema as { jsonSchema: Record<string, any> }).jsonSchema;
      expect(providerJson.properties.a).toBeDefined();
      expect(baseInputSchema?.safeParse({ a: 'x' }).success).toBe(true);
    });

    test('handles recursive schemas without throwing', () => {
      expect(() => {
        const zodSchema = z.fromJSONSchema(
          recursiveTreeSchema as Parameters<typeof z.fromJSONSchema>[0]
        );
        buildRefAwareSchemas(zodSchema);
      }).not.toThrow();
    });
  });

  describe('json-schema-walk (reusable walker)', () => {
    test('resolves $ref, unwraps nullable, surfaces enums, recurses objects', () => {
      const nodes = normalizeJsonSchemaProperties(recallGetInfoSchema);
      const byName = Object.fromEntries(nodes.map((n) => [n.name, n]));

      expect(byName.workspace_id.nullable).toBe(true);
      expect(byName.workspace_id.type).toBe('string');
      expect(byName.api_version.enumValues).toEqual(['v1.10', 'v1.11']);
      expect(byName.telemetry.type).toBe('object');
      expect(byName.telemetry.required).toBe(true);
      expect(byName.telemetry.properties?.[0]).toMatchObject({ name: 'intent', required: true });
    });

    test('stops at the cycle instead of recursing forever', () => {
      const nodes = normalizeJsonSchemaProperties(recursiveTreeSchema);
      const children = nodes.find((n) => n.name === 'children');
      expect(children?.type).toBe('array');
      // children.items -> root (object) -> children -> root again => recursive cutoff
      const inner = children?.items?.properties?.find((n) => n.name === 'children');
      expect(inner?.items?.recursive).toBe(true);
    });

    test('merges allOf compositions into the referenced object', () => {
      const nodes = normalizeJsonSchemaProperties(allOfSchema);
      const config = nodes.find((n) => n.name === 'config');
      expect(config?.type).toBe('object');
      expect(config?.description).toBe('Composed config.');
      const mode = config?.properties?.find((n) => n.name === 'mode');
      expect(mode?.required).toBe(true);
      expect(mode?.enumValues).toEqual(['fast', 'safe']);
    });

    test('resolves $ref against the legacy definitions keyword', () => {
      const nodes = normalizeJsonSchemaProperties(definitionsKeywordSchema);
      const telemetry = nodes.find((n) => n.name === 'telemetry');
      expect(telemetry?.type).toBe('object');
      expect(telemetry?.properties?.[0]).toMatchObject({ name: 'intent', required: true });
    });

    test('walks multi-branch unions into variants', () => {
      const nodes = normalizeJsonSchemaProperties(multiBranchUnionSchema);
      const target = nodes.find((n) => n.name === 'target');
      expect(target?.type).toBe('union');
      expect(target?.variants).toHaveLength(2);
      expect(target?.variants?.map((v) => v.type)).toEqual(['string', 'object']);
      const objectVariant = target?.variants?.find((v) => v.type === 'object');
      expect(objectVariant?.properties?.[0]).toMatchObject({ name: 'id' });
    });

    test('collapses a single-branch anyOf to its branch (not an opaque union)', () => {
      const nodes = normalizeJsonSchemaProperties({
        type: 'object',
        properties: { id: { anyOf: [{ type: 'string', description: 'UUID' }] } },
      });
      const id = nodes.find((n) => n.name === 'id');
      expect(id?.type).toBe('string');
      expect(id?.variants).toBeUndefined();
    });

    test('resolves a nullable $ref (Optional[Model]) to its referenced structure', () => {
      const nodes = normalizeJsonSchemaProperties(nullableRefSchema);
      const config = nodes.find((n) => n.name === 'config');
      expect(config?.type).toBe('object');
      expect(config?.nullable).toBe(true);
      expect(config?.properties?.find((p) => p.name === 'mode')?.required).toBe(true);
    });

    test('unwraps the type-array nullable form', () => {
      const nodes = normalizeJsonSchemaProperties({
        type: 'object',
        properties: { id: { type: ['string', 'null'] } },
      });
      expect(nodes[0]?.nullable).toBe(true);
      expect(nodes[0]?.type).toBe('string');
    });

    test('honors a non-cyclic depth cap', () => {
      const deep = {
        type: 'object',
        properties: {
          a: {
            type: 'object',
            properties: { b: { type: 'object', properties: { c: { type: 'string' } } } },
          },
        },
      };
      const nodes = normalizeJsonSchemaProperties(deep, { maxDepth: 1 });
      const a = nodes.find((n) => n.name === 'a');
      expect(a?.type).toBe('object');
      const b = a?.properties?.find((n) => n.name === 'b');
      expect(b?.recursive).toBe(true);
      expect(b?.properties).toBeUndefined();
    });
  });

  describe('prompt rendering (<available_tools>)', () => {
    function renderWithTool(inputSchema: Record<string, unknown>): string {
      const builder = new SystemPromptBuilder('v1', new PromptConfig());
      const group: McpServerGroupData = {
        serverName: 'recall',
        tools: [{ name: 'get_info', description: 'Return account/workspace info', inputSchema }],
      };
      const config: SystemPromptV1 = {
        corePrompt: 'x',
        tools: [],
        mcpServerGroups: [group],
        dataComponents: [],
        artifacts: [],
      };
      return builder.buildSystemPrompt(config).prompt;
    }

    test('renders $ref-resolved nested object, nullable, and enum', () => {
      const prompt = renderWithTool(recallGetInfoSchema);
      expect(prompt).toContain('name="telemetry" type="object"');
      expect(prompt).toContain('name="intent" type="string"');
      expect(prompt).toContain('nullable="true"');
      expect(prompt).toContain('v1.10');
    });

    test('renders a recursive schema without stack overflow', () => {
      expect(() => renderWithTool(recursiveTreeSchema)).not.toThrow();
      expect(renderWithTool(recursiveTreeSchema)).toContain('name="children" type="array"');
    });

    test('renders a fallback jsonSchema()-wrapped inputSchema (unwraps the wrapper)', () => {
      const wrapped = jsonSchema({
        type: 'object',
        properties: { q: { type: 'string', description: 'query' } },
        required: ['q'],
      });
      const prompt = renderWithTool(wrapped as unknown as Record<string, unknown>);
      expect(prompt).toContain('name="q" type="string"');
      expect(prompt).toContain('query');
    });

    test('renders multi-branch union variants instead of an opaque union', () => {
      const prompt = renderWithTool(multiBranchUnionSchema);
      expect(prompt).toContain('name="target" type="union"');
      expect(prompt).toContain('<variants>');
      // The object variant's nested field is surfaced, not collapsed.
      expect(prompt).toContain('name="id"');
    });
  });

  describe('data component rendering', () => {
    function dcParams(schema: Record<string, unknown>): string {
      const cfg = new PromptConfig() as unknown as {
        generateDataComponentParametersXml: (s: Record<string, unknown>) => string;
      };
      return cfg.generateDataComponentParametersXml(schema);
    }

    test('renders nested object structure and enums (not flattened)', () => {
      const xml = dcParams(nestedDataComponentSchema);
      expect(xml).toContain('author');
      expect(xml).toContain('"properties"');
      expect(xml).toContain('"enum"');
    });

    test('recurses array item structure instead of truncating to type-only', () => {
      const xml = dcParams(arrayItemDataComponentSchema);
      expect(xml).toContain('"items"');
      expect(xml).toContain('label');
      expect(xml).toContain('priority');
      expect(xml).toContain('high');
      // Not the truncated form.
      expect(xml).not.toContain('"items": { "type": "object" }');
    });

    test('JSON-escapes descriptions from untrusted schemas', () => {
      const xml = dcParams({
        type: 'object',
        properties: { note: { type: 'string', description: 'has "quotes" inside' } },
      });
      expect(xml).toContain('\\"quotes\\"');
    });
  });

  describe('escaping (untrusted MCP input)', () => {
    function renderTool(inputSchema: Record<string, unknown>): string {
      const builder = new SystemPromptBuilder('v1', new PromptConfig());
      const group: McpServerGroupData = {
        serverName: 's',
        tools: [{ name: 't', description: 'd', inputSchema }],
      };
      return builder.buildSystemPrompt({
        corePrompt: 'x',
        tools: [],
        mcpServerGroups: [group],
        dataComponents: [],
        artifacts: [],
      } as SystemPromptV1).prompt;
    }

    test('XML-escapes property names and descriptions', () => {
      const prompt = renderTool({
        type: 'object',
        properties: { 'a&b': { type: 'string', description: 'has "quotes" and <tags>' } },
      });
      expect(prompt).toContain('a&amp;b');
      expect(prompt).toContain('&quot;quotes&quot;');
      expect(prompt).toContain('&lt;tags&gt;');
    });

    test('XML-escapes tool name, tool description, and server name', () => {
      const builder = new SystemPromptBuilder('v1', new PromptConfig());
      const group: McpServerGroupData = {
        serverName: 'srv<&>',
        tools: [
          {
            name: 'tool"x',
            description: 'desc <b> & "q"',
            inputSchema: { type: 'object', properties: { a: { type: 'string' } } },
          },
        ],
      };
      const prompt = builder.buildSystemPrompt({
        corePrompt: 'x',
        tools: [],
        mcpServerGroups: [group],
        dataComponents: [],
        artifacts: [],
      } as SystemPromptV1).prompt;
      expect(prompt).toContain('&lt;b&gt;');
      expect(prompt).toContain('&quot;');
      expect(prompt).not.toContain('tool"x');
      expect(prompt).not.toContain('srv<&>');
    });
  });
});
