import { createCustomHeadersSchema } from '@/lib/validation';

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
      expect(() =>
        schema.parse(
          JSON.stringify({
            foo: {
              bar: 'baz',
            },
          })
        )
      ).toThrowError('All header values must be strings\\n  → at foo');
    });
    test('should throw when key is not object', () => {
      const schema = createCustomHeadersSchema('');
      expect(() =>
        schema.parse(
          JSON.stringify({
            foo: null,
          })
        )
      ).toThrowError('All header values must be strings\\n  → at foo');
    });
  });
});
