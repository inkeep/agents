import { SkillSchema } from '../validation';

describe('SkillSchema', () => {
  test('validates required fields', () => {
    const result = SkillSchema.safeParse({
      name: 'name',
      description: 'Desc',
      content: 'Content',
    });
    expect(result.success).toBe(true);
  });

  test('rejects', () => {
    const result = SkillSchema.safeParse({
      name: '',
      description: '',
      content: '',
    });
    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.issues).toStrictEqual([
        {
          origin: 'string',
          code: 'too_small',
          minimum: 1,
          inclusive: true,
          path: ['name'],
          message: 'Too small: expected string to have >=1 characters',
        },
        {
          origin: 'string',
          code: 'invalid_format',
          format: 'regex',
          pattern: '/^[a-z0-9-]+$/',
          path: ['name'],
          message: 'May only contain lowercase alphanumeric characters and hyphens (a-z, 0-9, -)',
        },
        {
          origin: 'string',
          code: 'too_small',
          minimum: 1,
          inclusive: true,
          path: ['description'],
          message: 'Too small: expected string to have >=1 characters',
        },
        {
          origin: 'string',
          code: 'too_small',
          minimum: 1,
          inclusive: true,
          path: ['content'],
          message: 'Too small: expected string to have >=1 characters',
        },
      ]);
    }
  });
  describe('metadata', () => {
    const defaultValues = {
      name: 'a',
      description: 'a',
      content: 'a',
    };

    test('returns null for empty metadata', () => {
      const result = SkillSchema.safeParse({
        ...defaultValues,
        metadata: ' ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata).toBeNull();
      }
    });

    test('parses valid JSON object', () => {
      const result = SkillSchema.safeParse({
        ...defaultValues,
        metadata: '{"key":"value"}',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.metadata).toStrictEqual({ key: 'value' });
      }
    });

    describe('throws for non-object JSON', () => {
      test('when input is not object', () => {
        const result = SkillSchema.safeParse({
          ...defaultValues,
          metadata: '"text"',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues).toStrictEqual([
            {
              code: 'invalid_type',
              expected: 'record',
              message: 'Must be valid JSON object',
              path: ['metadata'],
            },
          ]);
        }
      });
      test('when input object value is not string', () => {
        const result = SkillSchema.safeParse({
          ...defaultValues,
          metadata: '{"key":0}',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues).toStrictEqual([
            {
              code: 'invalid_type',
              expected: 'string',
              message: 'All object values must be strings',
              path: ['metadata', 'key'],
            },
          ]);
        }
      });
    });
  });
});
