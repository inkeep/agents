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

    test('should validate custom schema', () => {
      const jsonSchema = z.object({ foo: z.string() }).toJSONSchema();
      const schema = createCustomHeadersSchema(JSON.stringify(jsonSchema));
      const str = JSON.stringify({ bar: null });
      expect(getErrorObject(schema, str)).toMatchObject([
        {
          path: [],
          message: 'All header values must be strings\n  → at bar',
        },
      ]);
    });

    test("should have object validation even json schema doesn't allow it", () => {
      const jsonSchema = z.string().toJSONSchema();
      const schema = createCustomHeadersSchema(JSON.stringify(jsonSchema));

      expect(getErrorObject(schema, '"bar"')).toMatchObject([
        {
          path: [],
          message: 'Must be valid JSON object',
        },
      ]);
    });
  });
});

function getErrorObject(schema: z.Schema, str: string) {
  const result = schema.safeParse(str);

  if (result.success) {
    throw new Error('Must throw zod error');
  }
  return JSON.parse(result.error.message);
}
