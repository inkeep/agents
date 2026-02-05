import { createCustomHeadersSchema } from '@/lib/validation';
import { z } from 'zod';

describe('validation', () => {
  describe('createCustomHeadersSchema', () => {
    test('should throw when not object', () => {
      const schema = createCustomHeadersSchema('');
      expect(getErrorObject(schema, 'null')).toMatchObject([
        {
          path: [],
          message: 'Must be valid JSON object',
        },
      ]);
    });

    test('should throw when invalid syntax', () => {
      const schema = createCustomHeadersSchema('');
      expect(getErrorObject(schema, '#')).toMatchObject([
        {
          path: [],
          message: 'Invalid JSON syntax',
        },
      ]);
    });

    test('should throw nested keys', () => {
      const schema = createCustomHeadersSchema('');
      const str = JSON.stringify({
        foo: { bar: 'baz' },
      });

      expect(getErrorObject(schema, str)).toMatchObject([
        {
          path: [],
          message: 'All header values must be strings\n  → at foo',
        },
      ]);
    });

    test('should throw when key is not object', () => {
      const schema = createCustomHeadersSchema('');
      const str = JSON.stringify({ foo: null });

      expect(getErrorObject(schema, str)).toMatchObject([
        {
          path: [],
          message: 'All header values must be strings\n  → at foo',
        },
      ]);
    });

    test.only('should validate custom schema', () => {
      const jsonSchema = z.object({ foo: z.string() }).toJSONSchema();
      const error = getErrorObject({
        headersJsonSchema: JSON.stringify(jsonSchema),
        headersString: JSON.stringify({}),
      });
      expect(error).toMatchObject([
        {
          path: [],
          message: 'Invalid input: expected string, received undefined\n  → at foo',
        },
      ]);
    });

    test.only("should have object validation even json schema doesn't allow it", () => {
      const jsonSchema = z.string().toJSONSchema();
      const error = getErrorObject({
        headersJsonSchema: JSON.stringify(jsonSchema),
        headersString: '"bar"',
      });
      expect(error).toMatchObject([
        {
          path: [],
          message: 'Must be valid JSON object',
        },
      ]);
    });

    test.only('should throw on invalid json schemas', () => {
      const error = getErrorObject({ headersJsonSchema: 'null', headersString: '' });
      expect(error).toMatchObject([
        {
          path: [],
          message:
            "Error during parsing JSON schema headers: Cannot read properties of null (reading 'const')",
        },
      ]);

      const error2 = getErrorObject({ headersJsonSchema: '#', headersString: '' });

      expect(error2).toMatchObject([
        {
          path: [],
          message: `Error during parsing JSON schema headers: Unexpected token '#', "#" is not valid JSON`,
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
  return JSON.parse(result.error.message);
}
