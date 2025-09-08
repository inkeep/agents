import { describe, expect, it } from 'vitest';
import {
  compareJsonObjects,
  getDifferenceSummary,
  normalizeJsonObject,
} from '../../utils/json-comparator';

describe('json-comparator', () => {
  describe('compareJsonObjects', () => {
    it('should return true for identical objects', () => {
      const obj1 = { a: 1, b: 'test', c: [1, 2, 3] };
      const obj2 = { a: 1, b: 'test', c: [1, 2, 3] };

      const result = compareJsonObjects(obj1, obj2);

      expect(result.isEqual).toBe(true);
      expect(result.differences).toHaveLength(0);
    });

    it('should return false for different objects', () => {
      const obj1 = { a: 1, b: 'test' };
      const obj2 = { a: 2, b: 'test' };

      const result = compareJsonObjects(obj1, obj2);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].path).toBe('a');
      expect(result.differences[0].type).toBe('different');
    });

    it('should handle arrays with different order when ignoreArrayOrder is true', () => {
      const obj1 = { items: [1, 2, 3] };
      const obj2 = { items: [3, 1, 2] };

      const result = compareJsonObjects(obj1, obj2, { ignoreArrayOrder: true });

      expect(result.isEqual).toBe(true);
    });

    it('should detect arrays with different order when ignoreArrayOrder is false', () => {
      const obj1 = { items: [1, 2, 3] };
      const obj2 = { items: [3, 1, 2] };

      const result = compareJsonObjects(obj1, obj2, { ignoreArrayOrder: false });

      expect(result.isEqual).toBe(false);
    });

    it('should handle missing keys', () => {
      const obj1 = { a: 1, b: 2 };
      const obj2 = { a: 1 };

      const result = compareJsonObjects(obj1, obj2);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('extra');
      expect(result.differences[0].path).toBe('b');
    });

    it('should handle extra keys', () => {
      const obj1 = { a: 1 };
      const obj2 = { a: 1, b: 2 };

      const result = compareJsonObjects(obj1, obj2);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('missing');
      expect(result.differences[0].path).toBe('b');
    });

    it('should handle nested objects', () => {
      const obj1 = { user: { name: 'John', age: 30 } };
      const obj2 = { user: { name: 'John', age: 31 } };

      const result = compareJsonObjects(obj1, obj2);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].path).toBe('user.age');
    });

    it('should handle type mismatches', () => {
      const obj1 = { value: '123' };
      const obj2 = { value: 123 };

      const result = compareJsonObjects(obj1, obj2);

      expect(result.isEqual).toBe(false);
      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('type_mismatch');
    });

    it('should ignore specified paths', () => {
      const obj1 = { a: 1, b: 2, c: 3 };
      const obj2 = { a: 1, b: 999, c: 3 };

      const result = compareJsonObjects(obj1, obj2, { ignorePaths: ['b'] });

      expect(result.isEqual).toBe(true);
    });

    it('should ignore paths with wildcards', () => {
      const obj1 = { user: { name: 'John', age: 30 }, meta: { created: '2023-01-01' } };
      const obj2 = { user: { name: 'John', age: 30 }, meta: { created: '2023-01-02' } };

      const result = compareJsonObjects(obj1, obj2, { ignorePaths: ['meta.*'] });

      expect(result.isEqual).toBe(true);
    });

    it('should handle case insensitive comparison', () => {
      const obj1 = { name: 'John' };
      const obj2 = { name: 'JOHN' };

      const result = compareJsonObjects(obj1, obj2, { ignoreCase: true });

      expect(result.isEqual).toBe(true);
    });

    it('should handle whitespace insensitive comparison', () => {
      const obj1 = { description: 'Hello world' };
      const obj2 = { description: '  Hello   world  ' };

      const result = compareJsonObjects(obj1, obj2, { ignoreWhitespace: true });

      expect(result.isEqual).toBe(true);
    });

    it('should provide accurate statistics', () => {
      const obj1 = { a: 1, b: 2, c: 3 };
      const obj2 = { a: 1, b: 999, d: 4 };

      const result = compareJsonObjects(obj1, obj2);

      expect(result.stats.totalKeys).toBe(4);
      expect(result.stats.differentKeys).toBe(1); // 'b' has different values
      expect(result.stats.missingKeys).toBe(1); // 'd' is missing in obj1
      expect(result.stats.extraKeys).toBe(1); // 'c' is extra in obj1
    });
  });

  describe('normalizeJsonObject', () => {
    it('should normalize strings with case and whitespace options', () => {
      const obj = { name: '  John DOE  ', items: ['A', 'B', 'C'] };

      const normalized = normalizeJsonObject(obj, {
        ignoreCase: true,
        ignoreWhitespace: true,
        ignoreArrayOrder: true,
      });

      expect(normalized.name).toBe('john doe');
      expect(normalized.items).toEqual(['a', 'b', 'c']); // Sorted alphabetically and case normalized
    });

    it('should sort object keys', () => {
      const obj = { c: 3, a: 1, b: 2 };

      const normalized = normalizeJsonObject(obj);

      expect(Object.keys(normalized)).toEqual(['a', 'b', 'c']);
    });

    it('should handle nested objects', () => {
      const obj = { user: { name: 'John', age: 30 }, meta: { version: '1.0' } };

      const normalized = normalizeJsonObject(obj);

      expect(Object.keys(normalized)).toEqual(['meta', 'user']);
      expect(Object.keys(normalized.user)).toEqual(['age', 'name']);
    });
  });

  describe('getDifferenceSummary', () => {
    it('should return success message for equal objects', () => {
      const result = {
        isEqual: true,
        differences: [],
        stats: { totalKeys: 0, differentKeys: 0, missingKeys: 0, extraKeys: 0 },
      };

      const summary = getDifferenceSummary(result);

      expect(summary).toBe('✅ Objects are equivalent');
    });

    it('should return detailed summary for different objects', () => {
      const result = {
        isEqual: false,
        differences: [
          {
            path: 'a',
            type: 'different' as const,
            value1: 1,
            value2: 2,
            description: 'Value mismatch',
          },
          { path: 'b', type: 'missing' as const, value2: 3, description: 'Missing key' },
        ],
        stats: { totalKeys: 2, differentKeys: 1, missingKeys: 1, extraKeys: 0 },
      };

      const summary = getDifferenceSummary(result);

      expect(summary).toContain('❌ Objects differ');
      expect(summary).toContain('Total keys: 2');
      expect(summary).toContain('Different values: 1');
      expect(summary).toContain('Missing keys: 1');
      expect(summary).toContain('a: Value mismatch');
      expect(summary).toContain('b: Missing key');
    });

    it('should limit displayed differences to 10', () => {
      const differences = Array.from({ length: 15 }, (_, i) => ({
        path: `key${i}`,
        type: 'different' as const,
        value1: i,
        value2: i + 1,
        description: `Difference ${i}`,
      }));

      const result = {
        isEqual: false,
        differences,
        stats: { totalKeys: 15, differentKeys: 15, missingKeys: 0, extraKeys: 0 },
      };

      const summary = getDifferenceSummary(result);

      expect(summary).toContain('... and 5 more differences');
    });
  });
});
