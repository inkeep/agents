import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
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
  getAgentGraphWithDefaultAgent: vi.fn(),
}));

vi.mock('../../data-access/contextConfigs', () => ({
  getContextConfigById: vi.fn(),
}));

describe('ContextValidation - Headers Only Implementation', () => {
  let getAgentGraphWithDefaultAgent: any;
  let getContextConfigById: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const agentGraphModule = await import('../../data-access/agentGraphs');
    const contextConfigModule = await import('../../data-access/contextConfigs');
    getAgentGraphWithDefaultAgent = agentGraphModule.getAgentGraphWithDefaultAgent;
    getContextConfigById = contextConfigModule.getContextConfigById;
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

        const result = await validateHttpRequestHeaders(
          headersSchema,
          invalidRequest as any
        );

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
            'test': { type: 'unknown_type' },
          },
        };

        const httpRequest: ParsedHttpRequest = {
          headers: { 'test': 'value' },
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