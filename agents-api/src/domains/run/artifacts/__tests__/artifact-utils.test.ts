import { describe, expect, it } from 'vitest';
import { generateStructureInfo } from '../artifact-utils';

describe('artifact-utils', () => {
  describe('generateStructureInfo', () => {
    it('should describe an array', () => {
      const data = [1, 2, 3, 4, 5];
      expect(generateStructureInfo(data)).toBe('Array with 5 items');
    });

    it('should describe an object with few keys', () => {
      const data = { foo: 'bar', baz: 'qux', test: 123 };
      expect(generateStructureInfo(data)).toBe('Object with 3 keys: foo, baz, test');
    });

    it('should truncate object keys list to 5', () => {
      const data = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 };
      const result = generateStructureInfo(data);
      expect(result).toBe('Object with 7 keys: a, b, c, d, e, ...');
    });

    it('should describe a multi-line string', () => {
      const data = 'Hello\nWorld\nTest';
      expect(generateStructureInfo(data)).toBe('String: 16 characters, 3 lines');
    });

    it('should describe primitive types', () => {
      expect(generateStructureInfo(123)).toBe('number value');
      expect(generateStructureInfo(true)).toBe('boolean value');
    });

    it('should handle null', () => {
      expect(generateStructureInfo(null)).toBe('object value');
    });

    it('should handle circular references gracefully', () => {
      // Object.keys() doesn't error on circular references, just lists the keys
      const circular: any = { name: 'test' };
      circular.self = circular;
      expect(generateStructureInfo(circular)).toBe('Object with 2 keys: name, self');
    });

    it('should handle empty array', () => {
      expect(generateStructureInfo([])).toBe('Array with 0 items');
    });

    it('should handle empty object', () => {
      expect(generateStructureInfo({})).toBe('Object with 0 keys: ');
    });

    it('should handle single-line string', () => {
      const data = 'Hello World';
      expect(generateStructureInfo(data)).toBe('String: 11 characters, 1 lines');
    });
  });
});
