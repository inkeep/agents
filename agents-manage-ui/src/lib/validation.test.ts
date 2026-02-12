import { z } from 'zod';
import { FullAgentUpdateSchema } from '@/lib/types/agent-full';
import { createCustomHeadersSchema } from '@/lib/validation';

describe('validation', () => {
  describe('createCustomHeadersSchema', () => {
    test('returns error when JSON is not an object', () => {
      const error = getErrorObject({
        headersJsonSchema: '',
        headersString: 'null',
      });
      expect(error).toStrictEqual([
        {
          code: 'invalid_type',
          expected: 'record',
          path: [],
          message: 'Must be valid JSON object',
        },
      ]);
    });

    test('returns error on invalid JSON syntax', () => {
      const error = getErrorObject({
        headersJsonSchema: '',
        headersString: '#',
      });
      expect(error).toStrictEqual([
        {
          code: 'custom',
          path: [],
          message: 'Invalid JSON syntax',
        },
      ]);
    });

    test('returns error when header value is an object', () => {
      const error = getErrorObject({
        headersJsonSchema: '',
        headersString: JSON.stringify({
          foo: { bar: 'baz' },
        }),
      });
      expect(error).toStrictEqual([
        {
          code: 'invalid_type',
          expected: 'string',
          path: ['foo'],
          message: 'All object values must be strings',
        },
      ]);
    });

    test('returns error when header value is not string', () => {
      const error = getErrorObject({
        headersJsonSchema: '',
        headersString: JSON.stringify({ foo: null }),
      });
      expect(error).toStrictEqual([
        {
          code: 'invalid_type',
          expected: 'string',
          path: ['foo'],
          message: 'All object values must be strings',
        },
      ]);
    });

    test('validates against a custom JSON schema', () => {
      const jsonSchema = z.object({ foo: z.string() }).toJSONSchema();
      const error = getErrorObject({
        headersJsonSchema: JSON.stringify(jsonSchema),
        headersString: JSON.stringify({}),
      });
      expect(error).toStrictEqual([
        {
          code: 'invalid_type',
          expected: 'string',
          path: ['foo'],
          message: 'Invalid input: expected string, received undefined',
        },
      ]);
    });

    test('enforces object input even if schema allows non-objects', () => {
      const jsonSchema = z.string().toJSONSchema();
      const error = getErrorObject({
        headersJsonSchema: JSON.stringify(jsonSchema),
        headersString: '"bar"',
      });
      expect(error).toStrictEqual([
        {
          code: 'invalid_type',
          expected: 'record',
          path: [],
          message: 'Must be valid JSON object',
        },
      ]);
    });

    test('returns error for invalid JSON schemas syntax', () => {
      const error = getErrorObject({ headersJsonSchema: '#', headersString: '' });

      expect(error).toStrictEqual([
        {
          code: 'custom',
          path: [],
          message: `Error during parsing JSON schema headers: Unexpected token '#', "#" is not valid JSON`,
        },
      ]);
    });

    test('returns error for invalid JSON schemas', () => {
      const error = getErrorObject({ headersJsonSchema: 'null', headersString: '' });
      expect(error).toStrictEqual([
        {
          code: 'custom',
          path: [],
          message:
            "Error during parsing JSON schema headers: Cannot read properties of null (reading '$schema')",
        },
      ]);
    });
  });
});

function getErrorObject({
  headersJsonSchema,
  headersString,
}: {
  headersJsonSchema: string;
  headersString: string;
}) {
  const schema = createCustomHeadersSchema(headersJsonSchema);
  const result = schema.safeParse(headersString);

  if (result.success) {
    throw new Error('Must throw zod error');
  }
  return result.error.issues;
}
