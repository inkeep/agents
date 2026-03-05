import { describe, expect, it } from 'vitest';
import { buildSchemaShape, extractFullFields, extractPreviewFields } from '../schema-validation';

describe('schema-validation', () => {
  describe('buildSchemaShape', () => {
    it('should convert primitive types to their type string', () => {
      const result = buildSchemaShape({
        title: { type: 'string' },
        count: { type: 'number' },
        active: { type: 'boolean' },
      });
      expect(result).toEqual({ title: 'string', count: 'number', active: 'boolean' });
    });

    it('should convert array with object items to [{...}]', () => {
      const result = buildSchemaShape({
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, value: { type: 'number' } },
          },
        },
      });
      expect(result).toEqual({ items: [{ name: 'string', value: 'number' }] });
    });

    it('should convert array with primitive items to [type]', () => {
      const result = buildSchemaShape({
        tags: { type: 'array', items: { type: 'string' } },
      });
      expect(result).toEqual({ tags: ['string'] });
    });

    it('should convert array with no items definition to []', () => {
      const result = buildSchemaShape({
        data: { type: 'array' },
      });
      expect(result).toEqual({ data: [] });
    });

    it('should recursively handle nested objects', () => {
      const result = buildSchemaShape({
        meta: {
          type: 'object',
          properties: {
            author: { type: 'string' },
            date: { type: 'string' },
          },
        },
      });
      expect(result).toEqual({ meta: { author: 'string', date: 'string' } });
    });

    it('should fall back to "unknown" when type is missing', () => {
      const result = buildSchemaShape({ data: {} });
      expect(result).toEqual({ data: 'unknown' });
    });

    it('should return empty object for empty properties', () => {
      expect(buildSchemaShape({})).toEqual({});
    });

    it('should handle deeply nested object + array combination', () => {
      const result = buildSchemaShape({
        report: {
          type: 'object',
          properties: {
            sections: {
              type: 'array',
              items: {
                type: 'object',
                properties: { heading: { type: 'string' }, body: { type: 'string' } },
              },
            },
          },
        },
      });
      expect(result).toEqual({
        report: { sections: [{ heading: 'string', body: 'string' }] },
      });
    });
  });

  describe('extractPreviewFields', () => {
    it('should return only fields marked inPreview: true', () => {
      const schema = {
        type: 'object',
        properties: {
          title: { type: 'string', inPreview: true },
          summary: { type: 'string', inPreview: true },
          content: { type: 'string', inPreview: false },
          details: { type: 'object', inPreview: false },
        },
        required: ['title', 'content'],
      };
      const result = extractPreviewFields(schema);
      expect(result.properties).toHaveProperty('title');
      expect(result.properties).toHaveProperty('summary');
      expect(result.properties).not.toHaveProperty('content');
      expect(result.properties).not.toHaveProperty('details');
    });

    it('should strip the inPreview flag from returned properties', () => {
      const schema = {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A title', inPreview: true },
        },
      };
      const result = extractPreviewFields(schema);
      const titleProp = (result.properties as any)?.title;
      expect(titleProp?.inPreview).toBeUndefined();
      expect(titleProp?.type).toBe('string');
      expect(titleProp?.description).toBe('A title');
    });

    it('should filter required to only preview field names', () => {
      const schema = {
        type: 'object',
        properties: {
          title: { type: 'string', inPreview: true },
          content: { type: 'string', inPreview: false },
        },
        required: ['title', 'content'],
      };
      const result = extractPreviewFields(schema);
      expect(result.required).toEqual(['title']);
    });

    it('should return empty properties when no fields are inPreview', () => {
      const schema = {
        type: 'object',
        properties: {
          content: { type: 'string', inPreview: false },
        },
        required: ['content'],
      };
      const result = extractPreviewFields(schema);
      expect(result.properties).toEqual({});
      expect(result.required).toEqual([]);
    });

    it('should handle schema with no properties', () => {
      const result = extractPreviewFields({ type: 'object' });
      expect(result.properties).toEqual({});
    });
  });

  describe('extractFullFields', () => {
    it('should return all fields regardless of inPreview value', () => {
      const schema = {
        type: 'object',
        properties: {
          title: { type: 'string', inPreview: true },
          content: { type: 'string', inPreview: false },
        },
        required: ['title'],
      };
      const result = extractFullFields(schema);
      expect(result.properties).toHaveProperty('title');
      expect(result.properties).toHaveProperty('content');
    });

    it('should strip inPreview flag from all returned properties', () => {
      const schema = {
        type: 'object',
        properties: {
          title: { type: 'string', inPreview: true },
          content: { type: 'string', inPreview: false },
        },
      };
      const result = extractFullFields(schema);
      expect((result.properties as any)?.title?.inPreview).toBeUndefined();
      expect((result.properties as any)?.content?.inPreview).toBeUndefined();
    });

    it('should preserve the required array unchanged', () => {
      const schema = {
        type: 'object',
        properties: {
          title: { type: 'string', inPreview: true },
          content: { type: 'string', inPreview: false },
        },
        required: ['title', 'content'],
      };
      const result = extractFullFields(schema);
      expect(result.required).toEqual(['title', 'content']);
    });

    it('should handle schema with no properties', () => {
      const result = extractFullFields({ type: 'object' });
      expect(result.properties).toEqual({});
    });
  });
});
