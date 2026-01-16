import { parseMetadataField, SkillSchema } from '../validation';

describe('skillSchema', () => {
  it('validates required fields', () => {
    const result = SkillSchema.safeParse({
      name: 'name',
      description: 'Desc',
      content: 'Content',
    });
    expect(result.success).toBe(true);
  });

  it('rejects', () => {
    expect(() =>
      SkillSchema.parse({
        name: '',
        description: '',
        content: '',
      })
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "origin": "string",
          "code": "too_small",
          "minimum": 1,
          "inclusive": true,
          "path": [
            "name"
          ],
          "message": "Too small: expected string to have >=1 characters"
        },
        {
          "origin": "string",
          "code": "invalid_format",
          "format": "regex",
          "pattern": "/^[a-z0-9-]+$/",
          "path": [
            "name"
          ],
          "message": "May only contain lowercase alphanumeric characters and hyphens (a-z, 0-9, -)"
        },
        {
          "origin": "string",
          "code": "too_small",
          "minimum": 1,
          "inclusive": true,
          "path": [
            "description"
          ],
          "message": "Too small: expected string to have >=1 characters"
        },
        {
          "origin": "string",
          "code": "too_small",
          "minimum": 1,
          "inclusive": true,
          "path": [
            "content"
          ],
          "message": "Too small: expected string to have >=1 characters"
        }
      ]]
    `);
  });
});

describe('parseMetadataField', () => {
  it('returns null for empty metadata', () => {
    expect(parseMetadataField(' ')).toBeNull();
    expect(parseMetadataField()).toBeNull();
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
