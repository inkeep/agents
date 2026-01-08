import { describe, expect, it } from 'vitest';
import {
  defaultValues,
  parseAllowedToolsField,
  parseMetadataField,
  skillSchema,
} from '../validation';

describe('skillSchema', () => {
  it('validates required fields', () => {
    const result = skillSchema.safeParse({
      id: 'skill-1',
      name: 'Name',
      description: 'Desc',
      content: 'Content',
      metadata: '',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing id', () => {
    const result = skillSchema.safeParse({
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

describe('parseAllowedToolsField', () => {
  it('returns null for empty input', () => {
    expect(parseAllowedToolsField('')).toBeNull();
    expect(parseAllowedToolsField(undefined)).toBeNull();
  });

  it('splits on whitespace', () => {
    expect(parseAllowedToolsField('tool-a tool-b  tool-c')).toEqual([
      'tool-a',
      'tool-b',
      'tool-c',
    ]);
  });
});

describe('defaultValues', () => {
  it('provides empty defaults', () => {
    expect(defaultValues).toMatchObject({
      id: '',
      name: '',
      description: '',
      content: '',
      license: '',
      compatibility: '',
      allowedTools: '',
    });
  });
});
