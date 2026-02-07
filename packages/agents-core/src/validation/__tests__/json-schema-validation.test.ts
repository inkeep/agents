import { JsonSchemaForLlmSchema } from '../json-schema-validation';
import type { JSONSchema } from 'zod/v4/core';

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

function findError(
  errors: { path: string; message: string; type: 'syntax' | 'schema' | 'llm_requirement' }[],
  path: string,
  message?: string
) {
  return errors.find(
    (error) => error.path === path && (message ? error.message === message : true)
  );
}

describe('JsonSchemaForLlmSchema', () => {
  test('returns invalid when top-level type is not object', () => {
    const result = JsonSchemaForLlmSchema.safeParse({
      ...createValidSchema(),
      type: 'array',
    });

    expect(JSON.parse((result as any).error)).toEqual([
      {
        code: 'invalid_value',
        path: ['type'],
        message: 'Schema must have type: "object" for LLM compatibility',
        values: ['object'],
      },
    ]);
  });

  test('returns invalid when properties is missing', () => {
    const result = JsonSchemaForLlmSchema.safeParse({
      type: 'object',
      required: ['name'],
    });

    expect(JSON.parse((result as any).error)).toEqual([
      {
        code: 'invalid_type',
        expected: 'record',
        path: ['properties'],
        message: 'Schema must have a "properties" object',
      },
    ]);
  });

  test('returns invalid when required is not an array', () => {
    const result = JsonSchemaForLlmSchema.safeParse({
      ...createValidSchema(),
      required: 'name',
    });

    expect(JSON.parse((result as any).error)).toEqual([
      {
        code: 'invalid_type',
        expected: 'array',
        path: ['required'],
        message: 'Schema must have a "required" array',
      },
    ]);
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

    expect(JSON.parse((result as any).error)).toEqual([
      {
        code: 'invalid_type',
        expected: 'string',
        path: ['properties', 'name', 'description'],
        message: 'Each property must have a "description" for LLM compatibility',
      },
    ]);
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

    expect(JSON.parse((result as any).error)).toEqual([
      {
        code: 'invalid_value',
        path: ['properties', 'name', 'type'],
        message: 'Each property must have a valid "type"',
        values: ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'],
      },
    ]);
  });

  test('returns schema error for other invalid property fields', () => {
    const result = validateJsonSchemaForLlm({
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'A name',
          // @ts-expect-error
          minimum: '0',
        },
      },
      required: ['name'],
    });

    const minimumError = findError(result.errors, 'properties.name/minimum');

    expect(result.isValid).toBe(false);
    expect(minimumError).toBeDefined();
    expect(minimumError?.type).toBe('schema');
    expect(minimumError?.message.length).toBeGreaterThan(0);
  });

  test.only('returns error when required property is not present in properties', () => {
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

    expect(JSON.parse((result as any).error)).toEqual([
      {
        code: 'custom',
        path: ['required'],
        message: 'Required property "missing" must exist in properties',
      },
    ]);
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

    expect(JSON.parse((result as any).error)).toEqual([
      {
        code: 'too_small',
        minimum: 1,
        inclusive: true,
        origin: 'string',
        path: ['properties', 'name', 'description'],
        message: 'Each property must have a non-empty description for LLM compatibility',
      },
    ]);
  });
});
