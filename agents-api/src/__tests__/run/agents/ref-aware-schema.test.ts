import { describe, expect, it } from 'vitest';
import {
  makeBaseInputSchema,
  makeRefAwareJsonSchema,
} from '../../../domains/run/agents/tools/ref-aware-schema';
import { SENTINEL_KEY } from '../../../domains/run/constants/artifact-syntax';

describe('makeRefAwareJsonSchema', () => {
  it('should transform string properties to accept tool refs', () => {
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
    expect(textProp.anyOf).toBeDefined();
    expect(textProp.anyOf).toHaveLength(2);
    expect(textProp.anyOf[0]).toEqual({ type: 'string', description: 'The text to measure' });

    const refOption = textProp.anyOf[1];
    expect(refOption.anyOf).toHaveLength(2);
    expect(refOption.anyOf[0].required).toContain(SENTINEL_KEY.ARTIFACT);
    expect(refOption.anyOf[0].required).toContain(SENTINEL_KEY.TOOL);
    expect(refOption.anyOf[1].required).toContain(SENTINEL_KEY.TOOL);
  });

  it('should transform nested object properties', () => {
    const schema = {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            count: { type: 'number' },
          },
        },
      },
    };

    const result = makeRefAwareJsonSchema(schema);

    const configProp = (result.properties as any).config;
    expect(configProp.anyOf).toBeDefined();

    const configObj = configProp.anyOf[0];
    expect((configObj.properties as any).name.anyOf).toBeDefined();
    expect((configObj.properties as any).count.anyOf).toBeDefined();
  });

  it('should transform array item types', () => {
    const schema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    };

    const result = makeRefAwareJsonSchema(schema);

    const itemsProp = (result.properties as any).items;
    expect(itemsProp.anyOf).toBeDefined();
    const arraySchema = itemsProp.anyOf[0];
    expect(arraySchema.items.anyOf).toBeDefined();
  });

  it('should include $tool, $select, and $artifact in ref schema', () => {
    const schema = {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
    };

    const result = makeRefAwareJsonSchema(schema);
    const textProp = (result.properties as any).text;
    const refSchema = textProp.anyOf[1];

    const toolOnlyRef = refSchema.anyOf[1];
    expect(toolOnlyRef.properties).toHaveProperty(SENTINEL_KEY.TOOL);
    expect(toolOnlyRef.properties).toHaveProperty(SENTINEL_KEY.SELECT);

    const artifactRef = refSchema.anyOf[0];
    expect(artifactRef.properties).toHaveProperty(SENTINEL_KEY.ARTIFACT);
    expect(artifactRef.properties).toHaveProperty(SENTINEL_KEY.TOOL);
    expect(artifactRef.properties).toHaveProperty(SENTINEL_KEY.SELECT);
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

  it('should handle anyOf/oneOf variants without adding refs', () => {
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
    expect(valueProp.anyOf).toBeDefined();
  });

  it('should handle empty schema gracefully', () => {
    const schema = { type: 'object' };
    const result = makeRefAwareJsonSchema(schema);
    expect(result.type).toBe('object');
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
