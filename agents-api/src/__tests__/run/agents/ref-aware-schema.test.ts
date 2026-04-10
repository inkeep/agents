import { describe, expect, it } from 'vitest';
import {
  buildRefAwareSchemas,
  makeBaseInputSchema,
  makeRefAwareJsonSchema,
  REFS_KEY,
} from '../../../domains/run/agents/tools/ref-aware-schema';
import { SENTINEL_KEY } from '../../../domains/run/constants/artifact-syntax';

describe('makeRefAwareJsonSchema', () => {
  it('should make properties nullable instead of wrapping with anyOf', () => {
    const schema = {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to measure' },
      },
      required: ['text'],
    };

    const result = makeRefAwareJsonSchema(schema);

    expect(result.required).toEqual(['text']);
    const textProp = (result.properties as any).text;
    expect(textProp.type).toEqual(['string', 'null']);
    expect(textProp.description).toBe('The text to measure');
    expect(textProp.anyOf).toBeUndefined();
  });

  it('should add $refs property at root level', () => {
    const schema = {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
    };

    const result = makeRefAwareJsonSchema(schema);
    const refsSchema = (result.properties as any)[REFS_KEY];

    expect(refsSchema).toBeDefined();
    expect(refsSchema.type).toBe('object');
    expect(refsSchema.additionalProperties).toBeDefined();

    const entrySchema = refsSchema.additionalProperties;
    expect(entrySchema.anyOf).toHaveLength(2);

    const artifactRef = entrySchema.anyOf[0];
    expect(artifactRef.required).toContain(SENTINEL_KEY.ARTIFACT);
    expect(artifactRef.required).toContain(SENTINEL_KEY.TOOL);
    expect(artifactRef.additionalProperties).toBe(false);

    const toolRef = entrySchema.anyOf[1];
    expect(toolRef.required).toContain(SENTINEL_KEY.TOOL);
    expect(toolRef.additionalProperties).toBe(false);
  });

  it('should handle number and boolean types', () => {
    const schema = {
      type: 'object',
      properties: {
        count: { type: 'number' },
        enabled: { type: 'boolean' },
      },
    };

    const result = makeRefAwareJsonSchema(schema);

    expect((result.properties as any).count.type).toEqual(['number', 'null']);
    expect((result.properties as any).enabled.type).toEqual(['boolean', 'null']);
  });

  it('should handle object-typed properties', () => {
    const schema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      },
    };

    const result = makeRefAwareJsonSchema(schema);
    const configProp = (result.properties as any).config;
    expect(configProp.type).toEqual(['object', 'null']);
    expect(configProp.properties.name).toBeDefined();
  });

  it('should handle properties with existing anyOf', () => {
    const schema = {
      type: 'object',
      properties: {
        value: {
          anyOf: [{ type: 'string' }, { type: 'number' }],
        },
      },
    };

    const result = makeRefAwareJsonSchema(schema);
    const valueProp = (result.properties as any).value;
    expect(valueProp.anyOf).toHaveLength(3);
    expect(valueProp.anyOf[2]).toEqual({ type: 'null' });
  });

  it('should not double-add null to already-nullable types', () => {
    const schema = {
      type: 'object',
      properties: {
        text: { type: ['string', 'null'] },
      },
    };

    const result = makeRefAwareJsonSchema(schema);
    const textProp = (result.properties as any).text;
    expect(textProp.type).toEqual(['string', 'null']);
  });

  it('should not transform the root schema itself', () => {
    const schema = {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
    };

    const result = makeRefAwareJsonSchema(schema);
    expect(result.type).toBe('object');
    expect(result.anyOf).toBeUndefined();
  });

  it('should handle empty schema gracefully', () => {
    const schema = { type: 'object' };
    const result = makeRefAwareJsonSchema(schema);
    expect(result.type).toBe('object');
    expect((result.properties as any)[REFS_KEY]).toBeDefined();
  });

  it('should add tool chaining description to root', () => {
    const schema = { type: 'object', description: 'Original description' };
    const result = makeRefAwareJsonSchema(schema);
    expect(result.description).toContain('Original description');
    expect(result.description).toContain('TOOL CHAINING');
  });
});

describe('makeBaseInputSchema', () => {
  it('should return a zod schema from JSON schema', () => {
    const schema = {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      required: ['text'],
    };

    const zodSchema = makeBaseInputSchema(schema);
    expect(zodSchema.safeParse).toBeDefined();

    const valid = zodSchema.safeParse({ text: 'hello' });
    expect(valid.success).toBe(true);

    const invalid = zodSchema.safeParse({ text: 123 });
    expect(invalid.success).toBe(false);
  });
});

describe('buildRefAwareSchemas', () => {
  it('should return a jsonSchema wrapper and a zod baseInputSchema', () => {
    const schema = {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Some text' },
        count: { type: 'number' },
      },
      required: ['text'],
    };

    const { refAwareInputSchema, baseInputSchema } = buildRefAwareSchemas(schema);

    expect(refAwareInputSchema).toBeDefined();
    expect((refAwareInputSchema as any).jsonSchema).toBeDefined();

    expect(baseInputSchema).toBeDefined();
    expect(baseInputSchema!.safeParse).toBeDefined();
    expect(baseInputSchema!.safeParse({ text: 'hello' }).success).toBe(true);
    expect(baseInputSchema!.safeParse({ text: 123 }).success).toBe(false);
  });

  it('should produce schema with $refs and nullable properties', () => {
    const schema = {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
    };

    const { refAwareInputSchema } = buildRefAwareSchemas(schema);
    const jsonSchemaDef = (refAwareInputSchema as any).jsonSchema;

    expect(jsonSchemaDef.properties.query.type).toEqual(['string', 'null']);
    expect(jsonSchemaDef.properties[REFS_KEY]).toBeDefined();
  });

  it('should return undefined baseInputSchema when z.fromJSONSchema fails', () => {
    const schema = { type: 'not_a_real_type' } as any;

    const { refAwareInputSchema, baseInputSchema } = buildRefAwareSchemas(schema);

    expect(refAwareInputSchema).toBeDefined();
    expect(baseInputSchema).toBeUndefined();
  });

  it('should accept a Zod schema and convert it', () => {
    const { z } = require('@hono/zod-openapi');
    const zodSchema = z.object({
      name: z.string(),
      age: z.number().optional(),
    });

    const { refAwareInputSchema, baseInputSchema } = buildRefAwareSchemas(zodSchema);

    expect(refAwareInputSchema).toBeDefined();
    expect((refAwareInputSchema as any).jsonSchema).toBeDefined();
    expect((refAwareInputSchema as any).jsonSchema.properties.name.type).toContain('null');
    expect((refAwareInputSchema as any).jsonSchema.properties[REFS_KEY]).toBeDefined();

    expect(baseInputSchema).toBeDefined();
    expect(baseInputSchema!.safeParse({ name: 'test' }).success).toBe(true);
  });

  it('should produce dramatically smaller schemas than per-property anyOf', () => {
    const schema = {
      type: 'object',
      properties: Object.fromEntries(
        Array.from({ length: 15 }, (_, i) => [
          `param${i}`,
          { type: 'string', description: `Parameter ${i}` },
        ])
      ),
    };

    const { refAwareInputSchema } = buildRefAwareSchemas(schema);
    const json = JSON.stringify((refAwareInputSchema as any).jsonSchema);
    expect(json.length).toBeLessThan(10000);
  });
});
