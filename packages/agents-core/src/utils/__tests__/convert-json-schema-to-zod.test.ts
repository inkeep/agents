import { z } from 'zod';
import type { JSONSchema } from 'zod/v4/core';

const jsonSchema: JSONSchema.BaseSchema = {
  type: 'object',
  required: [],
  properties: {
    tz: {
      type: 'string',
    },
  },
  additionalProperties: false,
};

describe('jsonSchemaToZod', () => {
  test('should return json schema', () => {
    const zodSchema = z.fromJSONSchema(jsonSchema);
    expect(zodSchema.toJSONSchema()).toStrictEqual({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        tz: {
          type: 'string',
        },
      },
      additionalProperties: false,
    });
  });
});
