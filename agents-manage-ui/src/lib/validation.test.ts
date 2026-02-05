import { createCustomHeadersSchema } from '@/lib/validation';
import { z } from 'zod';

describe('validation', () => {
  describe('createCustomHeadersSchema', () => {
    test('should throw when not object', () => {
      const schema = createCustomHeadersSchema('');
      expect(() => schema.parse('null')).toThrowError('Must be valid JSON object');
    });

    test('should throw when invalid syntax', () => {
      const schema = createCustomHeadersSchema('');
      expect(() => schema.parse('#')).toThrowError('Invalid JSON syntax');
    });

    test('should throw nested keys', () => {
      const schema = createCustomHeadersSchema('');
      const str = JSON.stringify({
        foo: { bar: 'baz' },
      });

      expect(() => schema.parse(str)).toThrowError(
        'All header values must be strings\\n  → at foo'
      );
    });

    test('should throw when key is not object', () => {
      const schema = createCustomHeadersSchema('');
      const str = JSON.stringify({ foo: null });

      expect(() => schema.parse(str)).toThrowError(
        'All header values must be strings\\n  → at foo'
      );
    });

    test('should validate custom schema', () => {
      const jsonSchema = z.object({ foo: z.string() }).toJSONSchema();
      const str = JSON.stringify({ bar: null });

      const schema = createCustomHeadersSchema(JSON.stringify(jsonSchema));
      expect(() => schema.parse(str)).toThrowError(
        'Invalid input: expected string, received undefined\\n  → at foo'
      );
    });

    test("should have object validation even json schema doesn't allow it", () => {
      const jsonSchema = z.string().toJSONSchema();
      const str = JSON.stringify({ foo: 'bar' });

      const schema = createCustomHeadersSchema(JSON.stringify(jsonSchema));
      expect(() => schema.parse(str)).toThrowError(
        'Invalid input: expected string, received undefined\\n  → at foo'
      );
    });
  });
});
