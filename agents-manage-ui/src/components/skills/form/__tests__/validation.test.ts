import { parseMetadataField, SkillSchema } from '../validation';

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
});

describe('parseMetadataField', () => {
  test('returns null for empty metadata', () => {
    expect(parseMetadataField(' ')).toBeNull();
    expect(parseMetadataField()).toBeNull();
  });

  test('parses valid JSON object', () => {
    const parsed = parseMetadataField('{"key":"value"}');
    expect(parsed).toEqual({ key: 'value' });
  });

  test('throws for non-object JSON', () => {
    expect(() => parseMetadataField('"text"')).toThrow();
    expect(() => parseMetadataField('[]')).toThrow();
  });
});
