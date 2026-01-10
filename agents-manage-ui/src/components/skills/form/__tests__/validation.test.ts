import { defaultValues, parseMetadataField, SkillSchema } from '../validation';

describe('skillSchema', () => {
  it('validates required fields', () => {
    const result = SkillSchema.safeParse({
      id: 'skill-1',
      name: 'Name',
      description: 'Desc',
      content: 'Content',
      metadata: '',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing id', () => {
    const result = SkillSchema.safeParse({
      id: '',
      name: 'Name',
      description: 'Desc',
      content: 'Content',
    });
    expect(result.success).toBe(false);
  });
});

describe('parseMetadataField', () => {
  it('returns null for empty metadata', () => {
    expect(parseMetadataField('')).toBeNull();
    expect(parseMetadataField(undefined)).toBeNull();
  });

  it('parses valid JSON object', () => {
    const parsed = parseMetadataField('{"key":"value"}');
    expect(parsed).toEqual({ key: 'value' });
  });

  it('throws for non-object JSON', () => {
    expect(() => parseMetadataField('"text"')).toThrow();
    expect(() => parseMetadataField('[]')).toThrow();
  });
});

describe('defaultValues', () => {
  it('provides empty defaults', () => {
    expect(defaultValues).toMatchObject({
      id: '',
      name: '',
      description: '',
      content: '',
    });
  });
});
