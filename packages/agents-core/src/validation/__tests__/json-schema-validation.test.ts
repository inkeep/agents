import type { JSONSchema } from 'zod/v4/core';
import { JsonSchemaForLlmSchema } from '../json-schemas';

function createValidSchema(): JSONSchema.BaseSchema {
  return {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'A name',
      },
    },
    required: ['name'],
  };
}

describe('JsonSchemaForLlmSchema', () => {
  test('returns invalid when top-level type is not object', () => {
    const result = JsonSchemaForLlmSchema.safeParse({
      ...createValidSchema(),
      type: 'array',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toStrictEqual([
        {
          code: 'invalid_value',
          path: ['type'],
          message: 'Schema must have type: "object" for LLM compatibility',
          values: ['object'],
        },
      ]);
    }
  });

  test('returns invalid when properties is missing', () => {
    const result = JsonSchemaForLlmSchema.safeParse({
      type: 'object',
      required: ['name'],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toStrictEqual([
        {
          code: 'invalid_type',
          expected: 'record',
          path: ['properties'],
          message: 'Schema must have a "properties" object',
        },
      ]);
    }
  });

  test('returns invalid when required is not an array', () => {
    const result = JsonSchemaForLlmSchema.safeParse({
      ...createValidSchema(),
      required: 'name',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toStrictEqual([
        {
          code: 'invalid_type',
          expected: 'array',
          path: ['required'],
          message: 'Schema must have a "required" array',
        },
      ]);
    }
  });

  test('returns custom property description error when property description is missing', () => {
    const result = JsonSchemaForLlmSchema.safeParse({
      type: 'object',
      properties: {
        name: {
          type: 'string',
        },
      },
      required: ['name'],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toStrictEqual([
        {
          code: 'invalid_type',
          expected: 'string',
          path: ['properties', 'name', 'description'],
          message: 'Each property must have a "description" for LLM compatibility',
        },
      ]);
    }
  });

  test('returns custom property type error when property type is invalid', () => {
    const result = JsonSchemaForLlmSchema.safeParse({
      type: 'object',
      properties: {
        name: {
          type: 'unsupported-type',
          description: 'A name',
        },
      },
      required: ['name'],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toStrictEqual([
        {
          code: 'invalid_union',
          discriminator: 'type',
          errors: [],
          note: 'No matching discriminator',
          path: ['properties', 'name', 'type'],
          message: 'Each property must have a valid "type"',
        },
      ]);
    }
  });

  test('returns error when required property is not present in properties', () => {
    const result = JsonSchemaForLlmSchema.safeParse({
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'A name',
        },
      },
      required: ['missing'],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toStrictEqual([
        {
          code: 'custom',
          path: ['required'],
          message: 'Required property "missing" must exist in properties',
        },
      ]);
    }
  });

  test('returns error when property description is blank after trimming', () => {
    const result = JsonSchemaForLlmSchema.safeParse({
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '   ',
        },
      },
      required: ['name'],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toStrictEqual([
        {
          code: 'too_small',
          minimum: 1,
          inclusive: true,
          origin: 'string',
          path: ['properties', 'name', 'description'],
          message: 'Each property must have a non-empty description for LLM compatibility',
        },
      ]);
    }
  });

  test('should not remove custom fields', () => {
    const schema: JSONSchema.BaseSchema = {
      type: 'object',
      properties: {
        foo: {
          type: 'string',
          description: 'test',
          inPreview: true,
        },
      },
      additionalProperties: false,
      required: ['foo'],
      testField: null,
    };
    const result = JsonSchemaForLlmSchema.safeParse(schema);

    expect(result.success).toBe(true);
    expect(result.data).toStrictEqual(schema);
  });
});
