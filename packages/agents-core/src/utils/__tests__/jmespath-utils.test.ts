import { describe, expect, it } from 'vitest';
import {
  compileJMESPath,
  DANGEROUS_PATTERNS,
  jmespathString,
  MAX_EXPRESSION_LENGTH,
  searchJMESPath,
  validateJMESPath,
  validateJMESPathSecure,
  validateRegex,
  type ValidationResult,
} from '../jmespath-utils';

describe('jmespath-utils', () => {
  describe('validateJMESPath', () => {
    describe('valid expressions', () => {
      it('should validate simple property paths', () => {
        const result = validateJMESPath('body');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate nested property paths', () => {
        const result = validateJMESPath('body.user.id');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate array indexing', () => {
        const result = validateJMESPath('items[0].name');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate wildcard expressions', () => {
        const result = validateJMESPath('items[*].name');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate pipe expressions', () => {
        const result = validateJMESPath('items | [0]');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate filter expressions', () => {
        const result = validateJMESPath('items[?price > `10`].name');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate multi-select hash', () => {
        const result = validateJMESPath('{name: name, id: id}');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate function expressions', () => {
        const result = validateJMESPath('length(items)');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    describe('invalid expressions', () => {
      it('should reject empty string', () => {
        const result = validateJMESPath('');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('non-empty string');
      });

      it('should reject null', () => {
        const result = validateJMESPath(null as any);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('non-empty string');
      });

      it('should reject undefined', () => {
        const result = validateJMESPath(undefined as any);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('non-empty string');
      });

      it('should reject malformed bracket notation', () => {
        const result = validateJMESPath('items[');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid JMESPath');
      });

      it('should reject unmatched braces', () => {
        const result = validateJMESPath('{name: name');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid JMESPath');
      });
    });
  });

  describe('validateRegex', () => {
    describe('valid patterns', () => {
      it('should validate simple patterns', () => {
        const result = validateRegex('test');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate empty string', () => {
        const result = validateRegex('');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate patterns with character classes', () => {
        const result = validateRegex('[a-zA-Z0-9]+');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should validate patterns with capture groups', () => {
        const result = validateRegex('v\\d+,(.+)');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    describe('invalid patterns', () => {
      it('should reject null', () => {
        const result = validateRegex(null as any);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be provided');
      });

      it('should reject undefined', () => {
        const result = validateRegex(undefined as any);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be provided');
      });

      it('should reject non-string values', () => {
        const result = validateRegex(123 as any);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must be a string');
      });

      it('should reject unmatched brackets', () => {
        const result = validateRegex('[a-z');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid regex pattern');
      });

      it('should reject invalid quantifiers', () => {
        const result = validateRegex('a{2,1}');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid regex pattern');
      });
    });
  });

  describe('validateJMESPathSecure', () => {
    describe('length validation', () => {
      it('should accept expressions within default length limit', () => {
        const result = validateJMESPathSecure('body.user.id');
        expect(result.valid).toBe(true);
      });

      it('should reject expressions exceeding default length limit', () => {
        const longExpression = 'a'.repeat(MAX_EXPRESSION_LENGTH + 1);
        const result = validateJMESPathSecure(longExpression);
        expect(result.valid).toBe(false);
        expect(result.error).toContain(`exceeds maximum length of ${MAX_EXPRESSION_LENGTH}`);
      });

      it('should accept expressions at exactly the max length', () => {
        const exactLengthExpression = 'body.' + 'x'.repeat(MAX_EXPRESSION_LENGTH - 5);
        const result = validateJMESPathSecure(exactLengthExpression);
        expect(result.valid).toBe(true);
      });

      it('should use custom maxLength from options', () => {
        const result = validateJMESPathSecure('body.user', { maxLength: 5 });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds maximum length of 5');
      });
    });

    describe('dangerous pattern detection', () => {
      it('should reject template injection patterns', () => {
        const result = validateJMESPathSecure('body.${user.id}');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('dangerous pattern');
        expect(result.error).toContain('\\$\\{.*\\}');
      });

      it('should reject eval calls', () => {
        const result = validateJMESPathSecure('body.eval(code)');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('dangerous pattern');
        expect(result.error).toContain('eval\\s*\\(');
      });

      it('should reject function definitions', () => {
        const result = validateJMESPathSecure('body.function ()');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('dangerous pattern');
        expect(result.error).toContain('function\\s*\\(');
      });

      it('should reject constructor access', () => {
        const result = validateJMESPathSecure('body.constructor');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('dangerous pattern');
        expect(result.error).toContain('constructor');
      });

      it('should reject prototype access', () => {
        const result = validateJMESPathSecure('body.prototype');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('dangerous pattern');
        expect(result.error).toContain('prototype');
      });

      it('should reject __proto__ access', () => {
        const result = validateJMESPathSecure('body.__proto__');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('dangerous pattern');
        expect(result.error).toContain('__proto__');
      });

      it('should have exactly 6 dangerous patterns defined', () => {
        expect(DANGEROUS_PATTERNS).toHaveLength(6);
      });
    });

    describe('custom options', () => {
      it('should accept custom dangerous patterns', () => {
        const customPatterns = [/forbidden/];
        const result = validateJMESPathSecure('body.forbidden', {
          dangerousPatterns: customPatterns,
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('dangerous pattern');
        expect(result.error).toContain('forbidden');
      });

      it('should allow normally dangerous patterns when custom patterns are empty', () => {
        const result = validateJMESPathSecure('body.constructor', { dangerousPatterns: [] });
        expect(result.valid).toBe(true);
      });
    });

    describe('validation order', () => {
      it('should check length before patterns', () => {
        const longEvalExpression = 'eval(' + 'a'.repeat(MAX_EXPRESSION_LENGTH) + ')';
        const result = validateJMESPathSecure(longEvalExpression);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds maximum length');
      });

      it('should check patterns before compile', () => {
        const result = validateJMESPathSecure('body.${test}');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('dangerous pattern');
      });
    });
  });

  describe('searchJMESPath', () => {
    it('should search simple property paths', () => {
      const data = { name: 'Alice' };
      const result = searchJMESPath(data, 'name');
      expect(result).toBe('Alice');
    });

    it('should search nested property paths', () => {
      const data = { user: { name: 'Bob', age: 30 } };
      const result = searchJMESPath(data, 'user.name');
      expect(result).toBe('Bob');
    });

    it('should search array indexing', () => {
      const data = { items: ['a', 'b', 'c'] };
      const result = searchJMESPath(data, 'items[0]');
      expect(result).toBe('a');
    });

    it('should search with wildcards', () => {
      const data = { items: [{ name: 'a' }, { name: 'b' }] };
      const result = searchJMESPath(data, 'items[*].name');
      expect(result).toEqual(['a', 'b']);
    });

    it('should return null for non-existent paths', () => {
      const data = { name: 'Alice' };
      const result = searchJMESPath(data, 'age');
      expect(result).toBeNull();
    });

    it('should support type inference', () => {
      const data = { count: 42 };
      const result = searchJMESPath<number>(data, 'count');
      expect(result).toBe(42);
      expect(typeof result).toBe('number');
    });

    it('should support complex type inference', () => {
      const data = { users: [{ name: 'Alice' }, { name: 'Bob' }] };
      const result = searchJMESPath<Array<{ name: string }>>(data, 'users');
      expect(result).toEqual([{ name: 'Alice' }, { name: 'Bob' }]);
    });
  });

  describe('compileJMESPath', () => {
    it('should compile valid expressions', () => {
      const compiled = compileJMESPath('body.user.id');
      expect(compiled).toBeDefined();
    });

    it('should compile complex expressions', () => {
      const compiled = compileJMESPath('items[*].{name: name, id: id}');
      expect(compiled).toBeDefined();
    });

    it('should throw on invalid syntax', () => {
      expect(() => compileJMESPath('items[')).toThrow();
    });

    it('should throw on unmatched braces', () => {
      expect(() => compileJMESPath('{name: name')).toThrow();
    });

    it('should throw on invalid filter expression', () => {
      expect(() => compileJMESPath('items[?]')).toThrow();
    });
  });

  describe('jmespathString', () => {
    it('should return a schema with default maxLength', () => {
      const schema = jmespathString();
      expect(schema._def).toBeDefined();
    });

    it('should return a schema with custom maxLength', () => {
      const schema = jmespathString({ maxLength: 500 });
      expect(schema._def).toBeDefined();
    });

    it('should have description with valid examples', () => {
      const schema = jmespathString();
      const description = schema.description;
      expect(description).toContain('data.items[0].name');
      expect(description).toContain("results[?status=='active']");
      expect(description).toContain('keys(@)');
    });

    it('should have description with invalid examples', () => {
      const schema = jmespathString();
      const description = schema.description;
      expect(description).toContain('${...}');
      expect(description).toContain('eval(...)');
      expect(description).toContain('constructor');
      expect(description).toContain('__proto__');
    });

    it('should include maxLength in description', () => {
      const schema = jmespathString({ maxLength: 500 });
      const description = schema.description;
      expect(description).toContain('max 500 chars');
    });

    it('should validate strings within maxLength', () => {
      const schema = jmespathString({ maxLength: 10 });
      const result = schema.safeParse('body');
      expect(result.success).toBe(true);
    });

    it('should reject strings exceeding maxLength', () => {
      const schema = jmespathString({ maxLength: 5 });
      const result = schema.safeParse('body.user.id');
      expect(result.success).toBe(false);
    });
  });

  describe('MAX_EXPRESSION_LENGTH constant', () => {
    it('should be 1000', () => {
      expect(MAX_EXPRESSION_LENGTH).toBe(1000);
    });
  });

  describe('ValidationResult type', () => {
    it('should accept valid result objects', () => {
      const validResult: ValidationResult = { valid: true };
      const invalidResult: ValidationResult = { valid: false, error: 'Some error' };
      expect(validResult.valid).toBe(true);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.error).toBe('Some error');
    });
  });
});
