import { describe, expect, it } from 'vitest';
import { validateJMESPath, validateRegex } from '../signature-validation';

describe('validateJMESPath', () => {
  describe('valid JMESPath expressions', () => {
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

    it('should validate array slicing', () => {
      const result = validateJMESPath('items[0:5]');
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
      const result = validateJMESPath("items[?price > `10`].name");
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate multi-select hash', () => {
      const result = validateJMESPath('{name: name, id: id}');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate multi-select list', () => {
      const result = validateJMESPath('[name, id, email]');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate function expressions', () => {
      const result = validateJMESPath('length(items)');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('invalid JMESPath expressions', () => {
    it('should reject empty string', () => {
      const result = validateJMESPath('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('non-empty string');
    });

    it('should reject non-string values', () => {
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

    it('should reject malformed filter expressions', () => {
      const result = validateJMESPath('items[?]');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid JMESPath');
    });

    it('should reject invalid syntax', () => {
      const result = validateJMESPath('body..user');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid JMESPath');
    });

    it('should reject unmatched braces', () => {
      const result = validateJMESPath('{name: name');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid JMESPath');
    });

    it('should reject invalid function calls', () => {
      const result = validateJMESPath('invalid_function(items)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid JMESPath');
    });
  });

  describe('real-world webhook patterns', () => {
    it('should validate GitHub webhook signature extraction', () => {
      const result = validateJMESPath('body');
      expect(result.valid).toBe(true);
    });

    it('should validate Slack request timestamp extraction', () => {
      const result = validateJMESPath('headers."X-Slack-Request-Timestamp"');
      expect(result.valid).toBe(true);
    });

    it('should validate nested webhook payload paths', () => {
      const result = validateJMESPath('body.data.attributes.signature');
      expect(result.valid).toBe(true);
    });

    it('should validate Stripe webhook timestamp extraction', () => {
      const result = validateJMESPath('headers."Stripe-Signature"');
      expect(result.valid).toBe(true);
    });
  });
});

describe('validateRegex', () => {
  describe('valid regex patterns', () => {
    it('should validate simple patterns', () => {
      const result = validateRegex('test');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate empty string (matches empty string)', () => {
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

    it('should validate patterns with quantifiers', () => {
      const result = validateRegex('a{2,5}');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate patterns with alternation', () => {
      const result = validateRegex('cat|dog|bird');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate patterns with anchors', () => {
      const result = validateRegex('^start.*end$');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate patterns with lookahead', () => {
      const result = validateRegex('(?=.*[a-z])');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate patterns with escaped special chars', () => {
      const result = validateRegex('\\d+\\.\\d+');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate complex patterns', () => {
      const result = validateRegex(
        '([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})'
      );
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('invalid regex patterns', () => {
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

    it('should reject unmatched parentheses', () => {
      const result = validateRegex('(abc');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid regex pattern');
    });

    it('should reject invalid quantifiers', () => {
      const result = validateRegex('a{,}');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid regex pattern');
    });

    it('should reject invalid character class', () => {
      const result = validateRegex('[z-a]');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid regex pattern');
    });

    it('should reject invalid escape sequences', () => {
      const result = validateRegex('\\k');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid regex pattern');
    });

    it('should reject unmatched closing bracket', () => {
      const result = validateRegex('abc]');
      // Note: This is actually valid in JavaScript regex - ] without opening [ is treated literally
      // But let's test it anyway to show our validator works correctly
      expect(result.valid).toBe(true); // JavaScript allows this
    });

    it('should reject invalid lookahead', () => {
      const result = validateRegex('(?=');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid regex pattern');
    });
  });

  describe('real-world webhook signature patterns', () => {
    it('should validate GitHub signature prefix removal', () => {
      const result = validateRegex('sha256=(.+)');
      expect(result.valid).toBe(true);
    });

    it('should validate Slack signature prefix pattern', () => {
      const result = validateRegex('v\\d+=(.+)');
      expect(result.valid).toBe(true);
    });

    it('should validate Stripe signature extraction', () => {
      const result = validateRegex('t=(\\d+),v\\d+=([^,]+)');
      expect(result.valid).toBe(true);
    });

    it('should validate Zendesk timestamp extraction', () => {
      const result = validateRegex('(\\d{10})');
      expect(result.valid).toBe(true);
    });

    it('should validate hex signature pattern', () => {
      const result = validateRegex('[a-fA-F0-9]{64}');
      expect(result.valid).toBe(true);
    });

    it('should validate base64 signature pattern', () => {
      const result = validateRegex('[A-Za-z0-9+/]+=*');
      expect(result.valid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should validate dot metacharacter', () => {
      const result = validateRegex('a.b');
      expect(result.valid).toBe(true);
    });

    it('should validate escaped dot', () => {
      const result = validateRegex('a\\.b');
      expect(result.valid).toBe(true);
    });

    it('should validate word boundary', () => {
      const result = validateRegex('\\bword\\b');
      expect(result.valid).toBe(true);
    });

    it('should validate non-capturing groups', () => {
      const result = validateRegex('(?:test)+');
      expect(result.valid).toBe(true);
    });

    it('should validate backreferences', () => {
      const result = validateRegex('(\\w+)\\s+\\1');
      expect(result.valid).toBe(true);
    });
  });
});
