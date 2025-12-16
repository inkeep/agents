import { describe, expect, it } from 'vitest';
import { parseEmbeddedJson } from '../json-parser';

describe('parseEmbeddedJson', () => {
  describe('normal cases - should not modify', () => {
    it('should not modify regular objects', () => {
      const input = { key: 'value', nested: { prop: 123 } };
      const result = parseEmbeddedJson(input);
      expect(result).toEqual(input);
      // Note: traverse() creates a new instance even if no changes are made
    });

    it('should not modify primitive values', () => {
      expect(parseEmbeddedJson('regular string')).toBe('regular string');
      expect(parseEmbeddedJson(123)).toBe(123);
      expect(parseEmbeddedJson(true)).toBe(true);
      expect(parseEmbeddedJson(null)).toBe(null);
      expect(parseEmbeddedJson(undefined)).toBe(undefined);
    });

    it('should not modify arrays of primitives', () => {
      const input = [1, 2, 'hello', true];
      const result = parseEmbeddedJson(input);
      expect(result).toEqual(input);
    });

    it('should not modify non-JSON strings', () => {
      const input = { message: 'This is just a regular string' };
      const result = parseEmbeddedJson(input);
      expect(result).toEqual(input);
    });
  });

  describe('stringified JSON cases - should parse', () => {
    it('should parse stringified objects', () => {
      const input = {
        normal: 'value',
        stringified: '{"page_id": "abc123", "type": "page"}'
      };
      const result = parseEmbeddedJson(input);
      
      expect(result).toEqual({
        normal: 'value',
        stringified: { page_id: 'abc123', type: 'page' }
      });
    });

    it('should parse stringified arrays', () => {
      const input = {
        items: '[{"name": "item1"}, {"name": "item2"}]'
      };
      const result = parseEmbeddedJson(input);
      
      expect(result).toEqual({
        items: [{ name: 'item1' }, { name: 'item2' }]
      });
    });

    it('should handle nested stringified JSON', () => {
      const input = {
        parent: '{"nested": "{\\"deep\\": \\"value\\"}"}' 
      };
      const result = parseEmbeddedJson(input);
      
      // parseEmbeddedJson processes all levels in one pass
      expect(result).toEqual({
        parent: { nested: { deep: 'value' } }
      });
    });

    it('should handle mixed structures', () => {
      const input = {
        regular: 'normal string',
        number: 42,
        stringifiedObj: '{"prop": "value"}',
        stringifiedArray: '[1, 2, 3]',
        nested: {
          deep: '{"inner": "stringified"}'
        }
      };
      const result = parseEmbeddedJson(input);
      
      expect(result).toEqual({
        regular: 'normal string',
        number: 42,
        stringifiedObj: { prop: 'value' },
        stringifiedArray: [1, 2, 3],
        nested: {
          deep: { inner: 'stringified' }
        }
      });
    });
  });

  describe('edge cases', () => {
    it('should safely handle null input', () => {
      expect(parseEmbeddedJson(null)).toBe(null);
    });

    it('should safely handle undefined input', () => {
      expect(parseEmbeddedJson(undefined)).toBe(undefined);
    });

    it('should safely handle primitive inputs', () => {
      expect(parseEmbeddedJson('string')).toBe('string');
      expect(parseEmbeddedJson(42)).toBe(42);
      expect(parseEmbeddedJson(true)).toBe(true);
    });

    it('should handle malformed JSON strings gracefully', () => {
      const input = {
        malformed: '{"incomplete": true',
        invalid: '{not json at all}',
        empty: '',
        whitespace: '   '
      };
      const result = parseEmbeddedJson(input);
      
      // Should leave malformed JSON unchanged
      expect(result).toEqual(input);
    });

    it('should handle null and undefined values', () => {
      const input = {
        nullValue: null,
        undefinedValue: undefined,
        stringNull: 'null',
        stringUndefined: 'undefined'
      };
      const result = parseEmbeddedJson(input);
      
      expect(result).toEqual({
        nullValue: null,
        undefinedValue: undefined,
        stringNull: 'null', // 'null' string stays as string (destr doesn't parse bare 'null')
        stringUndefined: 'undefined' // 'undefined' string stays as string
      });
    });

    it('should handle empty objects and arrays', () => {
      const input = {
        emptyObj: '{}',
        emptyArray: '[]',
        existingEmpty: {},
        existingEmptyArray: []
      };
      const result = parseEmbeddedJson(input);
      
      expect(result).toEqual({
        emptyObj: {},
        emptyArray: [],
        existingEmpty: {},
        existingEmptyArray: []
      });
    });

    it('should handle deeply nested structures', () => {
      const input = {
        deep: {
          level1: {
            level2: {
              level3: '{"stringified": "deep down"}'
            }
          }
        }
      };
      const result = parseEmbeddedJson(input);
      
      expect(result.deep.level1.level2.level3).toEqual({
        stringified: 'deep down'
      });
    });

    it('should not cause infinite recursion with circular references', () => {
      const input: any = { prop: 'value' };
      input.circular = input;
      
      // Should not throw error - traverse library handles circular refs
      expect(() => parseEmbeddedJson(input)).not.toThrow();
    });
  });

  describe('performance considerations', () => {
    it('should not significantly impact performance for normal objects', () => {
      const largeNormalObject = {
        ...Array.from({ length: 1000 }, (_, i) => ({ [`key${i}`]: `value${i}` })).reduce((acc, obj) => ({ ...acc, ...obj }), {})
      };
      
      const start = Date.now();
      const result = parseEmbeddedJson(largeNormalObject);
      const duration = Date.now() - start;
      
      expect(result).toEqual(largeNormalObject);
      expect(duration).toBeLessThan(100); // Should process quickly
    });

    it('should handle large stringified objects efficiently', () => {
      const largeStringifiedObject = JSON.stringify({
        ...Array.from({ length: 100 }, (_, i) => ({ [`prop${i}`]: `value${i}` })).reduce((acc, obj) => ({ ...acc, ...obj }), {})
      });
      
      const input = { large: largeStringifiedObject };
      
      const start = Date.now();
      const result = parseEmbeddedJson(input);
      const duration = Date.now() - start;
      
      expect(typeof result.large).toBe('object');
      expect(duration).toBeLessThan(200); // Should still be reasonable
    });
  });

  describe('real-world Claude scenarios', () => {
    it('should fix Claude notion-create-pages stringified JSON issue', () => {
      const claudeInput = {
        parent: '{"page_id": "2c745f35-b5ad-813b-aee2-c1b1ef058a64"}',
        pages: '[{"properties": {"title": "Example Page"}}]'
      };
      
      const result = parseEmbeddedJson(claudeInput);
      
      expect(result).toEqual({
        parent: { page_id: '2c745f35-b5ad-813b-aee2-c1b1ef058a64' },
        pages: [{ properties: { title: 'Example Page' } }]
      });
    });

    it('should preserve GPT-style proper objects', () => {
      const gptInput = {
        parent: { page_id: '2c745f35-b5ad-813b-aee2-c1b1ef058a64' },
        pages: [{ properties: { title: 'Example Page' } }]
      };
      
      const result = parseEmbeddedJson(gptInput);
      
      // Should remain unchanged
      expect(result).toEqual(gptInput);
    });
  });
});