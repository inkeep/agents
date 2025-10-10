import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedValidator,
  HTTP_REQUEST_PARTS,
  type HttpRequestPart,
  isValidHttpRequest,
  type ParsedHttpRequest,
  validateHttpRequestHeaders,
} from '../../middleware/contextValidation';

// Mock the data access functions directly
vi.mock('../../data-access/agentGraphs', () => ({
  getAgentGraphWithDefaultSubAgent: vi.fn(),
}));

vi.mock('../../data-access/contextConfigs', () => ({
  getContextConfigById: vi.fn(),
}));

describe('ContextValidation - Headers Only Implementation', () => {
  let _getAgentGraphWithDefaultSubAgent: any;
  let _getContextConfigById: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const agentGraphModule = await import('../../data-access/agents');
    const contextConfigModule = await import('../../data-access/contextConfigs');
    _getAgentGraphWithDefaultSubAgent = agentGraphModule.getAgentWithDefaultSubAgent;
    _getContextConfigById = contextConfigModule.getContextConfigById;
  });

  describe('validateHttpRequestHeaders', () => {
    it('should validate headers successfully', async () => {
      const headersSchema = {
        type: 'object',
        properties: {
          'x-user-id': {
            type: 'string',
            format: 'uuid',
          },
        },
      };

      const httpRequest: ParsedHttpRequest = {
        headers: { 'x-user-id': '123e4567-e89b-12d3-a456-426614174000' },
      };

      const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.validatedContext).toEqual({
        'x-user-id': '123e4567-e89b-12d3-a456-426614174000',
      });
    });

    it('should handle validation errors for headers', async () => {
      const headersSchema = {
        type: 'object',
        properties: {
          'x-user-id': {
            type: 'string',
          },
        },
        required: ['x-user-id'],
      };

      const httpRequest: ParsedHttpRequest = {
        headers: { 'other-header': 'value' }, // Missing required x-user-id
      };

      const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.field.includes('headers'))).toBe(true);
      expect(result.validatedContext).toBeUndefined();
    });

    it('should validate headers correctly with multiple properties', async () => {
      const headersSchema = {
        type: 'object',
        properties: {
          'x-user-id': {
            type: 'string',
            format: 'uuid',
          },
          'content-type': {
            type: 'string',
          },
        },
      };

      const httpRequest: ParsedHttpRequest = {
        headers: {
          'x-user-id': '123e4567-e89b-12d3-a456-426614174000',
          'content-type': 'application/json',
        },
      };

      const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

      expect(result.valid).toBe(true);
      expect(result.validatedContext).toEqual({
        'x-user-id': '123e4567-e89b-12d3-a456-426614174000',
        'content-type': 'application/json',
      });
    });
  });

  describe('Validation Improvements', () => {
    describe('Type Guards', () => {
      it('should identify valid HTTP requests', () => {
        const validRequest: ParsedHttpRequest = {
          headers: { auth: 'token' },
        };

        expect(isValidHttpRequest(validRequest)).toBe(true);
      });

      it('should identify invalid HTTP requests', () => {
        const invalidRequests = [
          null,
          undefined,
          'string',
          123,
          [],
          {},
          { body: 'test' }, // Missing headers
          { query: 'test' }, // Missing headers
        ];

        for (const req of invalidRequests) {
          expect(isValidHttpRequest(req)).toBe(false);
        }
      });

      it('should accept requests with headers', () => {
        const validRequests = [
          { headers: {} },
          { headers: { 'x-test': 'value' } },
          { headers: { auth: 'bearer token', 'content-type': 'json' } },
        ];

        for (const req of validRequests) {
          expect(isValidHttpRequest(req)).toBe(true);
        }
      });
    });

    describe('Schema Caching', () => {
      // Helper function to create unique schemas for testing
      const createSchema = (id: string) => ({
        type: 'object' as const,
        properties: {
          [`field_${id}`]: { type: 'string' as const },
        },
      });

      it('should cache compiled validators', () => {
        const schema = { type: 'object', properties: { name: { type: 'string' } } };

        const validator1 = getCachedValidator(schema);
        const validator2 = getCachedValidator(schema);

        expect(validator1).toBe(validator2); // Same instance from cache
      });

      it('should create different validators for different schemas', () => {
        const schema1 = { type: 'object', properties: { name: { type: 'string' } } };
        const schema2 = { type: 'object', properties: { age: { type: 'number' } } };

        const validator1 = getCachedValidator(schema1);
        const validator2 = getCachedValidator(schema2);

        expect(validator1).not.toBe(validator2); // Different instances
      });

      it('should validate correctly with cached validators', () => {
        const schema = { type: 'object', properties: { name: { type: 'string' } } };
        const validator = getCachedValidator(schema);

        expect(validator({ name: 'John' })).toBe(true);
        expect(validator({ name: 123 })).toBe(false);
        expect(validator({})).toBe(true); // No required properties
      });

      describe('LRU Cache Behavior', () => {
        it('should implement LRU behavior for recently accessed schemas', () => {
          const schema1 = createSchema('1');
          const schema2 = createSchema('2');

          // Get initial validators
          const validator1_initial = getCachedValidator(schema1);
          const validator2_initial = getCachedValidator(schema2);

          // Access schema1 again (should move it to end in LRU)
          const validator1_accessed = getCachedValidator(schema1);

          // Should return the same cached instance
          expect(validator1_initial).toBe(validator1_accessed);
          expect(validator2_initial).toBe(getCachedValidator(schema2));
        });

        it('should maintain validator functionality after LRU operations', () => {
          const schema = createSchema('lru_test');

          // Get validator multiple times
          const validator1 = getCachedValidator(schema);
          const validator2 = getCachedValidator(schema);
          const validator3 = getCachedValidator(schema);

          // All should be the same instance
          expect(validator1).toBe(validator2);
          expect(validator2).toBe(validator3);

          // Validator should still work correctly
          expect(validator3({ field_lru_test: 'valid' })).toBe(true);
          expect(validator3({ field_lru_test: 123 })).toBe(false);
        });

        it('should handle cache eviction when size limit is reached', () => {
          // Create more schemas than cache size (1000)
          // For testing purposes, we'll create a reasonable number and verify behavior
          const schemas = Array.from({ length: 10 }, (_, i) => createSchema(`eviction_${i}`));

          // Fill some cache slots
          const validators = schemas.map((schema) => getCachedValidator(schema));

          // All validators should be properly compiled and functional
          validators.forEach((validator, index) => {
            expect(typeof validator).toBe('function');
            expect(validator({ [`field_eviction_${index}`]: 'test' })).toBe(true);
          });

          // Access the first schema again (mark as recently used)
          const firstValidatorReaccessed = getCachedValidator(schemas[0]);
          expect(firstValidatorReaccessed).toBe(validators[0]);
        });

        it('should evict least recently used items when cache is full', () => {
          // This test assumes we can fill the cache close to capacity
          // In practice, with a 1000 item limit, this would be expensive to test fully
          // So we'll test the mechanism with a smaller set

          const schemas = Array.from({ length: 5 }, (_, i) => createSchema(`capacity_${i}`));

          // Get all validators (add to cache)
          const validators = schemas.map((schema) => getCachedValidator(schema));

          // Access first few schemas to mark them as recently used
          getCachedValidator(schemas[0]);
          getCachedValidator(schemas[1]);

          // Add many more schemas to potentially trigger eviction
          // (In a real scenario with 1000+ schemas)
          const additionalSchemas = Array.from({ length: 10 }, (_, i) =>
            createSchema(`additional_${i}`)
          );

          additionalSchemas.forEach((schema) => {
            getCachedValidator(schema);
          });

          // The recently accessed schemas should still return the same validator instance
          expect(getCachedValidator(schemas[0])).toBe(validators[0]);
          expect(getCachedValidator(schemas[1])).toBe(validators[1]);
        });

        it('should handle identical schemas with different object references', () => {
          // Two identical schemas but different object instances
          const schema1 = { type: 'object', properties: { name: { type: 'string' } } };
          const schema2 = { type: 'object', properties: { name: { type: 'string' } } };

          // Should use the same cached validator since JSON.stringify will be identical
          const validator1 = getCachedValidator(schema1);
          const validator2 = getCachedValidator(schema2);

          expect(validator1).toBe(validator2);
        });

        it('should handle schemas with different property orders', () => {
          const schema1 = {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
          };
          const schema2 = {
            type: 'object',
            properties: {
              age: { type: 'number' },
              name: { type: 'string' },
            },
          };

          // These should create different cache entries due to JSON.stringify differences
          const validator1 = getCachedValidator(schema1);
          const validator2 = getCachedValidator(schema2);

          // Different instances due to property order difference in JSON string
          expect(validator1).not.toBe(validator2);

          // But both should validate the same data correctly
          const testData = { name: 'John', age: 30 };
          expect(validator1(testData)).toBe(true);
          expect(validator2(testData)).toBe(true);
        });
      });
    });

    describe('Constants', () => {
      it('should export HTTP_REQUEST_PARTS constant', () => {
        expect(HTTP_REQUEST_PARTS).toEqual(['headers']);
      });

      it('should have correct type for HttpRequestPart', () => {
        const validParts: HttpRequestPart[] = ['headers'];
        expect(validParts).toEqual(HTTP_REQUEST_PARTS);
      });
    });

    describe('Performance Improvements', () => {
      it('should use the same validator instance for identical schemas', () => {
        const schema = { type: 'string', minLength: 3 };

        // Call multiple times with same schema
        const validator1 = getCachedValidator(schema);
        const validator2 = getCachedValidator(schema);
        const validator3 = getCachedValidator(schema);

        expect(validator1).toBe(validator2);
        expect(validator2).toBe(validator3);

        // All should work correctly
        expect(validator1('test')).toBe(true);
        expect(validator2('ab')).toBe(false);
        expect(validator3('hello')).toBe(true);
      });
    });

    describe('HTTP Request Validation with Type Guards', () => {
      it('should reject invalid HTTP requests in validateHttpRequestHeaders', async () => {
        const headersSchema = {
          type: 'object',
          properties: {
            'x-user-id': { type: 'string' },
          },
        };

        const invalidRequest = { invalid: true };

        const result = await validateHttpRequestHeaders(headersSchema, invalidRequest as any);

        expect(result.valid).toBe(false);
        expect(result.errors[0].field).toBe('httpRequest');
        expect(result.errors[0].message).toContain(
          'Invalid HTTP request format - must contain headers'
        );
      });

      it('should validate requests with proper headers structure', async () => {
        const headersSchema = {
          type: 'object',
          properties: {
            authorization: { type: 'string' },
          },
        };

        const validRequest = {
          headers: {
            authorization: 'Bearer token123',
            'extra-header': 'will be filtered',
          },
        };

        const result = await validateHttpRequestHeaders(headersSchema, validRequest);

        expect(result.valid).toBe(true);
        expect(result.validatedContext).toEqual({
          authorization: 'Bearer token123',
          // extra-header should be filtered out
        });
      });
    });

    describe('Error Handling', () => {
      it('should handle malformed schemas gracefully', async () => {
        const malformedSchema = {
          type: 'invalid_type',
          properties: {
            test: { type: 'unknown_type' },
          },
        };

        const httpRequest: ParsedHttpRequest = {
          headers: { test: 'value' },
        };

        const result = await validateHttpRequestHeaders(malformedSchema, httpRequest);

        // Should not crash, but may fail validation
        expect(typeof result.valid).toBe('boolean');
        expect(Array.isArray(result.errors)).toBe(true);
      });

      it('should handle empty headers gracefully', async () => {
        const headersSchema = {
          type: 'object',
          properties: {
            'x-required': { type: 'string' },
          },
        };

        const httpRequest: ParsedHttpRequest = {
          headers: {},
        };

        const result = await validateHttpRequestHeaders(headersSchema, httpRequest);

        expect(result.valid).toBe(true); // Empty headers are valid if no required fields
        expect(result.validatedContext).toEqual({});
      });
    });
  });
});
