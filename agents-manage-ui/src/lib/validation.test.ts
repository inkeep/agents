import { createCustomHeadersSchema } from '@/lib/validation';
import { z } from 'zod';

describe('validation', () => {
  describe('createCustomHeadersSchema', () => {
    test('should throw when not object', () => {
      const error = getErrorObject({
        headersJsonSchema: '',
        headersString: 'null',
      });
      expect(error).toMatchObject([
        {
          path: [],
          message: 'Must be valid JSON object',
        },
      ]);
    });

    test('should throw when invalid syntax', () => {
      const error = getErrorObject({
        headersJsonSchema: '',
        headersString: '#',
      });
      expect(error).toMatchObject([
        {
          path: [],
          message: 'Invalid JSON syntax',
        },
      ]);
    });

    test('should throw nested keys', () => {
      const error = getErrorObject({
        headersJsonSchema: '',
        headersString: JSON.stringify({
          foo: { bar: 'baz' },
        }),
      });
      expect(error).toMatchObject([
        {
          path: [],
          message: 'All header values must be strings\n  → at foo',
        },
      ]);
    });

    test('should throw when key is not object', () => {
      const error = getErrorObject({
        headersJsonSchema: '',
        headersString: JSON.stringify({ foo: null }),
      });
      expect(error).toMatchObject([
        {
          path: [],
          message: 'All header values must be strings\n  → at foo',
        },
      ]);
    });

    test('should validate custom schema', () => {
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

    test("should have object validation even json schema doesn't allow it", () => {
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

    test('should throw on invalid json schemas', () => {
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
