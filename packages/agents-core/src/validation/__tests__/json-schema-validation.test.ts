import { validateJsonSchemaForLlm } from '../json-schema-validation';
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

describe('validateJsonSchemaForLlm', () => {
  test('returns invalid when top-level type is not object', () => {
    const result = validateJsonSchemaForLlm({
      ...createValidSchema(),
      type: 'array',
    });

    expect(result.isValid).toBe(false);
    expect(
      findError(result.errors, 'type', 'Schema must have type: "object" for LLM compatibility')
    ).toBeDefined();
  });

  test('returns invalid when properties is missing', () => {
    const result = validateJsonSchemaForLlm({
      type: 'object',
      required: ['name'],
    });

    expect(result.isValid).toBe(false);
    expect(
      findError(result.errors, 'properties', 'Schema must have a "properties" object')
    ).toBeDefined();
  });

  test('returns invalid when required is not an array', () => {
    const result = validateJsonSchemaForLlm({
      ...createValidSchema(),
      // @ts-expect-error
      required: 'name',
    });

    expect(result.isValid).toBe(false);
    expect(
      findError(result.errors, 'required', 'Schema must have a "required" array (can be empty)')
    ).toBeDefined();
  });

  test('returns custom property description error when property description is missing', () => {
    const result = validateJsonSchemaForLlm({
      type: 'object',
      properties: {
        name: {
          type: 'string',
        },
      },
      required: ['name'],
    });

    expect(result.isValid).toBe(false);
    expect(
      findError(
        result.errors,
        'properties.name/description',
        'Each property must have a "description" for LLM compatibility'
      )
    ).toBeDefined();
  });

  test('returns custom property type error when property type is invalid', () => {
    const result = validateJsonSchemaForLlm({
      type: 'object',
      properties: {
        name: {
          // @ts-expect-error
          type: 'unsupported-type',
          description: 'A name',
        },
      },
      required: ['name'],
    });

    expect(result.isValid).toBe(false);
    expect(
      findError(result.errors, 'properties.name/type', 'Each property must have a valid "type"')
    ).toBeDefined();
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

  test('returns error when required property is not present in properties', () => {
    const result = validateJsonSchemaForLlm({
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'A name',
        },
      },
      required: ['missing'],
    });

    expect(result.isValid).toBe(false);
    expect(
      findError(result.errors, 'required', 'Required property "missing" must exist in properties')
    ).toBeDefined();
  });

  test('returns error when property description is blank after trimming', () => {
    const result = validateJsonSchemaForLlm({
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '   ',
        },
      },
      required: ['name'],
    });

    expect(result.isValid).toBe(false);
    expect(
      findError(
        result.errors,
        'properties.name.description',
        'Each property must have a non-empty description for LLM compatibility'
      )
    ).toBeDefined();
  });
});
