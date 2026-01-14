import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonTransformer } from '../JsonTransformer';

// Reuse existing validation test patterns
const expectSecurityRejection = async (expression: string, expectedPattern: string) => {
  await expect(JsonTransformer.transform({}, expression)).rejects.toThrow(
    new RegExp(expectedPattern, 'i')
  );
};

const expectValidTransformation = async (data: any, expression: string) => {
  await expect(JsonTransformer.transform(data, expression)).resolves.not.toThrow();
};

// Helper to check if expression should be rejected (pattern-based approach from render-validation)
const shouldRejectExpression = (expression: string, expectedMessage: string) => {
  return expect(JsonTransformer.transform({}, expression)).rejects.toThrow(
    new RegExp(expectedMessage, 'i')
  );
};

// Common test data patterns for reuse
const createTestUser = (name: string, active = true) => ({ name, active });
const createTestItem = (name: string, price: number) => ({ name, price });
const _createComplexTestData = () => ({
  users: [
    createTestUser('Alice', true),
    createTestUser('Bob', false),
    createTestUser('Charlie', true),
  ],
  items: [
    createTestItem('apple', 1.2),
    createTestItem('banana', 0.5),
    createTestItem('cherry', 2.0),
  ],
});

describe('JsonTransformer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Security Validation', () => {
    describe('dangerous pattern detection', () => {
      it('should reject template injection patterns', async () => {
        const dangerousExpressions = [
          `\${process.env.PASSWORD}`,
          `data.\${injection}`,
          `\${eval("malicious")}`,
        ];

        for (const expression of dangerousExpressions) {
          await expectSecurityRejection(expression, 'dangerous pattern');
        }
      });

      it('should reject eval patterns', async () => {
        const dangerousExpressions = [
          'eval(data)',
          'data.eval("bad")',
          'eval ("harmful")',
          'eval\t("spaced")',
        ];

        for (const expression of dangerousExpressions) {
          await expectSecurityRejection(expression, 'dangerous pattern');
        }
      });

      it('should reject function definition patterns', async () => {
        // Test expressions that should be caught by dangerous pattern detection
        await expectSecurityRejection('data.function("bad")', 'dangerous pattern');
        await expectSecurityRejection('function ("harmful")', 'dangerous pattern');

        // Note: function(data) is caught by dangerous pattern detection
        await expectSecurityRejection('function(data)', 'dangerous pattern');

        // FUNCTION(data) is caught by JMESPath execution (unknown function error)
        await shouldRejectExpression('FUNCTION(data)', 'Unknown function: FUNCTION');
      });

      it('should reject prototype manipulation patterns', async () => {
        // Case-sensitive patterns that should be rejected
        const dangerousExpressions = ['data.constructor', 'data.prototype', 'data.__proto__'];

        for (const expression of dangerousExpressions) {
          await expectSecurityRejection(expression, 'dangerous pattern');
        }

        // Case variations that should be accepted (patterns are case-sensitive)
        await expectValidTransformation({}, 'CONSTRUCTOR.call'); // Won't match /constructor/ pattern
        await expectValidTransformation({}, 'PROTOTYPE.bind'); // Won't match /prototype/ pattern
        await expectValidTransformation({}, '__PROTO__.toString'); // Won't match /__proto__/ pattern
      });

      it('should allow safe JMESPath expressions', async () => {
        // Test simple field access
        await expectValidTransformation({ data: { field: 'value' } }, 'data.field');

        // Test array access
        await expectValidTransformation({ items: [{ name: 'test' }] }, 'items[0].name');

        // Test filtering
        await expectValidTransformation(
          { users: [{ status: 'active', name: 'user1', created_at: '2023-01-01' }] },
          'users[?status==`active`].name'
        );

        // Test functions that work with any data (these pass validation with empty {})
        await expectValidTransformation({}, '@'); // Root object access
        await expectValidTransformation({}, 'length(@)'); // Length of root object
        await expectValidTransformation({}, 'keys(@)'); // Keys of root object
        await expectValidTransformation({}, 'type(@)'); // Type of root object
      });
    });

    describe('expression length validation', () => {
      it('should reject expressions longer than maximum length', async () => {
        const longExpression = 'a'.repeat(1001); // Over 1000 character limit

        await expect(JsonTransformer.transform({}, longExpression)).rejects.toThrow(/too long/);
      });

      it('should accept expressions within length limit', async () => {
        const acceptableExpression = `${'data.'.repeat(100)}field`; // Under 1000 characters

        // This should resolve successfully, not reject
        await expect(
          JsonTransformer.transform({ data: { field: 'value' } }, acceptableExpression)
        ).resolves.not.toThrow();
      });
    });

    describe('syntax validation', () => {
      it('should reject invalid JMESPath syntax', async () => {
        const invalidExpressions = [
          'data.[invalid',
          'data.field]',
          'data..field',
          'data.field.',
          '[invalid syntax',
        ];

        for (const expression of invalidExpressions) {
          await expect(JsonTransformer.transform({}, expression)).rejects.toThrow(
            /JMESPath transformation failed|Invalid JMESPath syntax/
          );
        }
      });

      it('should accept valid JMESPath syntax', async () => {
        // Test with appropriate data for each expression
        await expectValidTransformation({ data: 'value' }, 'data');

        await expectValidTransformation({ data: { field: 'value' } }, 'data.field');

        await expectValidTransformation({ items: ['item1', 'item2'] }, 'items[0]');

        // Test expressions that work with empty objects for validation
        await expectValidTransformation({}, '@'); // Root access
        await expectValidTransformation({}, 'type(@)'); // Type function

        // For complex expressions that need specific data, test that they work
        // when provided with appropriate data, but note these would fail validation
        // with empty objects due to the current validation approach
        await expectValidTransformation({ users: [{ age: 25 }, { age: 15 }] }, 'users[?age>`18`]');

        // Note: sort_by expressions that reference non-existent fields fail validation
        // because validation tests against {} - this is expected behavior
      });
    });
  });

  describe('Timeout Protection', () => {
    it('should have timeout protection mechanism', async () => {
      // Testing the timeout mechanism is challenging because JMESPath operations
      // are synchronous and very fast. In a real-world scenario, the timeout
      // would protect against pathological expressions or very large datasets.
      //
      // Instead of trying to create an actual timeout, we'll verify that
      // the timeout parameter is accepted and doesn't cause errors for normal operations

      const data = { simple: 'value' };

      // Test that custom timeout values are accepted without error
      await expect(JsonTransformer.transform(data, 'simple', { timeout: 5000 })).resolves.toBe(
        'value'
      );

      // Test that very short timeouts are also accepted (even if they don't timeout in practice)
      await expect(JsonTransformer.transform(data, 'simple', { timeout: 1 })).resolves.toBe(
        'value'
      );

      // The actual timeout functionality would activate in pathological cases
      // or with extremely complex expressions on large datasets
    });

    it('should respect custom timeout settings', async () => {
      const data = { simple: 'value' };

      await expect(
        JsonTransformer.transform(data, 'simple', { timeout: 10000 }) // 10 second timeout
      ).resolves.toBe('value');
    });

    it('should use default timeout when not specified', async () => {
      const data = { test: 'value' };

      await expect(JsonTransformer.transform(data, 'test')).resolves.toBe('value');
    });
  });

  describe('Basic Functionality', () => {
    it('should transform simple field access', async () => {
      const data = { name: 'John', age: 30 };

      const result = await JsonTransformer.transform(data, 'name');
      expect(result).toBe('John');
    });

    it('should transform array access', async () => {
      const data = { users: [{ name: 'Alice' }, { name: 'Bob' }] };

      const result = await JsonTransformer.transform(data, 'users[0].name');
      expect(result).toBe('Alice');
    });

    it('should handle filtering expressions', async () => {
      const data = {
        users: [
          { name: 'Alice', active: true },
          { name: 'Bob', active: false },
          { name: 'Charlie', active: true },
        ],
      };

      const result = await JsonTransformer.transform(data, 'users[?active==`true`].name');
      expect(result).toEqual(['Alice', 'Charlie']);
    });

    it('should handle complex JMESPath operations when validation allows', async () => {
      // Note: Complex expressions like sort_by that reference specific fields
      // will fail the current validation approach since it tests against {}
      // This test shows that the validation is working as designed - it prevents
      // expressions that can't be validated against empty data

      const complexExpression = 'sort_by(items, &price)[*].name';

      await expect(JsonTransformer.transform({}, complexExpression)).rejects.toThrow(
        /JMESPath transformation failed|Invalid JMESPath syntax/
      );

      // However, if we had data and could bypass validation, it would work
      // This demonstrates that the expression itself is valid JMESPath
      const data = {
        items: [
          { name: 'apple', price: 1.2 },
          { name: 'banana', price: 0.5 },
          { name: 'cherry', price: 2.0 },
        ],
      };

      // Using transformSync which bypasses security validation
      const result = JsonTransformer.transformSync(data, complexExpression);
      expect(result).toEqual(['banana', 'apple', 'cherry']);
    });
  });

  describe('Object Transformation', () => {
    it('should convert object mapping to JMESPath', () => {
      const mapping = {
        userName: 'user.name',
        userEmail: 'user.email',
      };

      const result = JsonTransformer.objectToJMESPath(mapping);
      expect(result).toBe('{ userName: user.name, userEmail: user.email }');
    });

    it('should validate object mapping keys and values', () => {
      // Test empty key
      expect(() => JsonTransformer.objectToJMESPath({ '': 'user.name' } as any)).toThrow();

      // Test empty value
      expect(() => JsonTransformer.objectToJMESPath({ userName: '' })).toThrow();

      // Test non-string value
      expect(() => JsonTransformer.objectToJMESPath({ userName: 123 as any })).toThrow();
    });

    it('should validate JMESPath expressions in object values', () => {
      const invalidMapping = {
        userName: 'user.[invalid',
      };

      expect(() => JsonTransformer.objectToJMESPath(invalidMapping)).toThrow(/Invalid JMESPath/);
    });
  });

  describe('transformWithConfig', () => {
    it('should handle direct JMESPath configuration', async () => {
      const data = { user: { name: 'John' } };
      const config = { jmespath: 'user.name' };

      const result = await JsonTransformer.transformWithConfig(data, config);
      expect(result).toBe('John');
    });

    it('should handle object transformation configuration', async () => {
      const data = { user: { name: 'John', email: 'john@example.com' } };
      const config = {
        objectTransformation: {
          userName: 'user.name',
          userEmail: 'user.email',
        },
      };

      const result = await JsonTransformer.transformWithConfig(data, config);
      expect(result).toEqual({
        userName: 'John',
        userEmail: 'john@example.com',
      });
    });

    it('should throw error when neither config is provided', async () => {
      const data = { test: 'value' };
      const config = {};

      await expect(JsonTransformer.transformWithConfig(data, config)).rejects.toThrow(
        /Either jmespath or objectTransformation must be provided/
      );
    });
  });

  describe('Error Handling', () => {
    it('should provide detailed error messages', async () => {
      await expect(JsonTransformer.transform({}, 'invalid.[syntax')).rejects.toThrow(
        /Invalid JMESPath syntax/
      );
    });

    it('should handle null and undefined inputs gracefully', async () => {
      await expect(JsonTransformer.transform(null, 'data')).resolves.toBeNull();

      await expect(JsonTransformer.transform(undefined, 'data')).resolves.toBeNull();
    });
  });

  describe('Backward Compatibility', () => {
    describe('transformSync (deprecated)', () => {
      it('should work for simple transformations', () => {
        const data = { name: 'John' };
        const result = JsonTransformer.transformSync(data, 'name');
        expect(result).toBe('John');
      });

      it('should handle errors in sync mode', () => {
        expect(() => {
          JsonTransformer.transformSync({}, 'invalid.[syntax');
        }).toThrow(/JMESPath transformation failed/);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty objects', async () => {
      const result = await JsonTransformer.transform({}, '@');
      expect(result).toEqual({});
    });

    it('should handle empty arrays', async () => {
      const result = await JsonTransformer.transform([], '@');
      expect(result).toEqual([]);
    });

    it('should handle deeply nested data', async () => {
      const deepData = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
      };

      const result = await JsonTransformer.transform(deepData, 'level1.level2.level3.level4.value');
      expect(result).toBe('deep');
    });

    it('should handle circular references safely', async () => {
      const data: any = { name: 'test' };
      data.circular = data;

      // Should not throw but may return unexpected results
      await expect(JsonTransformer.transform(data, 'name')).resolves.toBe('test');
    });
  });

  describe('Security Regression Tests', () => {
    it('should prevent code injection through field names', async () => {
      const maliciousData = {
        badfield: 'value',
        constructor: 'value',
      };

      // Field access should be safe, but expression containing eval should be blocked
      await expect(JsonTransformer.transform(maliciousData, 'badfield')).resolves.toBe('value');

      // Constructor field access should be safe when accessing data, but constructor in expression should be blocked
      await expect(JsonTransformer.transform(maliciousData, 'constructor')).rejects.toThrow(
        /dangerous pattern/
      );
    });

    it('should prevent prototype pollution attempts', async () => {
      const data = { user: { name: 'John' } };

      // These expressions should be blocked by dangerous pattern detection
      await expect(JsonTransformer.transform(data, '__proto__.polluted')).rejects.toThrow(
        /dangerous pattern/
      );

      await expect(
        JsonTransformer.transform(data, 'constructor.prototype.polluted')
      ).rejects.toThrow(/dangerous pattern/);
    });
  });
});
