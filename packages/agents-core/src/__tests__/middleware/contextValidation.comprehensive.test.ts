import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createRequestSchema } from '../../context/ContextConfig.js';
import {
  getCachedValidator,
  HTTP_REQUEST_PARTS,
  type HttpRequestPart,
  isComprehensiveRequestSchema,
  isValidHttpRequest,
  type ParsedHttpRequest,
  validateHttpRequestParts,
  validateRequestContext,
} from '../../middleware/contextValidation.js';
import { dbClient } from '../setup.js';

// Mock @inkeep/agents-core functions
vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    getAgentGraphWithDefaultAgent: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(null)),
    getContextConfigById: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(null)),
  };
});

describe('ContextValidation - Comprehensive Request Schema', () => {
  let getAgentGraphWithDefaultAgent: any;
  let getContextConfigById: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const coreModule = await import('@inkeep/agents-core');
    getAgentGraphWithDefaultAgent = coreModule.getAgentGraphWithDefaultAgent;
    getContextConfigById = coreModule.getContextConfigById;
  });

  describe('isComprehensiveRequestSchema', () => {
    it('should identify comprehensive request schema', () => {
      const comprehensiveSchema = {
        schemas: {
          body: { type: 'object' },
          headers: { type: 'object' },
        },
        options: {},
      };

      expect(isComprehensiveRequestSchema(comprehensiveSchema)).toBe(true);
    });

    it('should identify legacy schema', () => {
      const legacySchema = {
        type: 'object',
        properties: {
          userId: { type: 'string' },
        },
      };

      expect(isComprehensiveRequestSchema(legacySchema)).toBe(false);
    });
  });

  describe('validateHttpRequestParts', () => {
    it('should validate all HTTP parts successfully', async () => {
      const requestSchema = createRequestSchema({
        body: z.object({
          org_alias: z.string(),
          project_id: z.string(),
        }),
        headers: z.object({
          authorization: z.string().startsWith('Bearer '),
        }),
        query: z.object({
          page: z.coerce.number().min(1).default(1),
        }),
        params: z.object({
          id: z.coerce.number(),
        }),
      });

      const httpRequest: ParsedHttpRequest = {
        body: {
          org_alias: 'test-org',
          project_id: 'test-project',
        },
        headers: {
          authorization: 'Bearer token123',
        },
        query: {
          page: 2,
        },
        params: {
          id: 123,
        },
      };

      const result = await validateHttpRequestParts(requestSchema.toJsonSchema(), httpRequest);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.validatedContext).toBeDefined();
      expect(result.validatedContext?.body).toEqual({
        org_alias: 'test-org',
        project_id: 'test-project',
      });
      expect(result.validatedContext?.headers).toEqual({
        authorization: 'Bearer token123',
      });
    });

    it('should handle validation errors for specific parts', async () => {
      const requestSchema = createRequestSchema({
        body: z.object({
          org_alias: z.string(),
          project_id: z.string(),
        }),
        headers: z.object({
          authorization: z.string().startsWith('Bearer '),
        }),
      });

      const httpRequest: ParsedHttpRequest = {
        body: {
          org_alias: 'test-org',
          // missing project_id
        },
        headers: {
          authorization: 'InvalidToken', // doesn't start with Bearer
        },
      };

      const result = await validateHttpRequestParts(requestSchema.toJsonSchema(), httpRequest);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.field.includes('body'))).toBe(true);
      expect(result.errors.some((e) => e.field.includes('headers'))).toBe(true);
    });

    it('should validate headers correctly', async () => {
      const requestSchema = createRequestSchema({
        headers: z.object({
          'x-user-id': z.string().uuid().optional(),
          authorization: z.string().optional(),
        }),
      });

      const httpRequest: ParsedHttpRequest = {
        headers: {
          'x-user-id': '123e4567-e89b-12d3-a456-426614174000',
          authorization: 'Bearer token',
        },
      };

      const result = await validateHttpRequestParts(requestSchema.toJsonSchema(), httpRequest);

      expect(result.valid).toBe(true);
      expect(result.validatedContext?.headers).toBeDefined();
      expect(result.validatedContext?.headers['x-user-id']).toBe(
        '123e4567-e89b-12d3-a456-426614174000'
      );
      expect(result.validatedContext?.headers.authorization).toBe('Bearer token');
    });
  });

  describe('validateRequestContext integration', () => {
    it('should handle comprehensive schema in end-to-end validation', async () => {
      const comprehensiveSchema = createRequestSchema({
        body: z.object({
          org_alias: z.string(),
          project_id: z.string(),
        }),
        headers: z.object({
          authorization: z.string().startsWith('Bearer '),
        }),
      });

      vi.mocked(getAgentGraphWithDefaultAgent).mockReturnValue(
        vi.fn().mockResolvedValue({
          id: 'test-graph',
          contextConfigId: 'test-config',
        } as any)
      );

      vi.mocked(getContextConfigById).mockReturnValue(
        vi.fn().mockResolvedValue({
          id: 'test-config',
          requestContextSchema: comprehensiveSchema.toJsonSchema(),
        } as any)
      );

      const httpRequest: ParsedHttpRequest = {
        body: {
          org_alias: 'test-org',
          project_id: 'test-project',
        },
        headers: {
          authorization: 'Bearer token123',
        },
      };

      const result = await validateRequestContext(
        'test-tenant',
        'test-project',
        'test-graph',
        'test-conversation',
        httpRequest,
        dbClient
      );

      expect(result.valid).toBe(true);
      expect(result.validatedContext).toBeDefined();
    });
  });

  describe('Validation Improvements', () => {
    describe('Type Guards', () => {
      it('should identify valid HTTP requests', () => {
        const validRequest: ParsedHttpRequest = {
          body: { name: 'test' },
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
          {}, // Empty object with no HTTP parts
          { randomKey: 'value' }, // Object without HTTP parts
        ];

        for (const invalid of invalidRequests) {
          expect(isValidHttpRequest(invalid)).toBe(false);
        }
      });

      it('should accept requests with any HTTP part', () => {
        for (const part of HTTP_REQUEST_PARTS) {
          const request = { [part]: { test: 'data' } };
          expect(isValidHttpRequest(request)).toBe(true);
        }
      });
    });

    describe('Schema Caching', () => {
      it('should cache compiled validators', () => {
        const schema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
        };

        const validator1 = getCachedValidator(schema);
        const validator2 = getCachedValidator(schema);

        // Should return the same cached instance
        expect(validator1).toBe(validator2);
      });

      it('should create different validators for different schemas', () => {
        const schema1 = { type: 'string' };
        const schema2 = { type: 'number' };

        const validator1 = getCachedValidator(schema1);
        const validator2 = getCachedValidator(schema2);

        // Should be different validators
        expect(validator1).not.toBe(validator2);
      });

      it('should validate correctly with cached validators', () => {
        const schema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        };

        const validator = getCachedValidator(schema);

        expect(validator({ name: 'John' })).toBe(true);
        expect(validator({})).toBe(false); // Missing required field
        expect(validator({ name: 123 })).toBe(false); // Wrong type
      });
    });

    describe('Constants', () => {
      it('should export HTTP_REQUEST_PARTS constant', () => {
        expect(HTTP_REQUEST_PARTS).toEqual(['body', 'headers', 'query', 'params']);
      });

      it('should have correct type for HttpRequestPart', () => {
        const validParts: HttpRequestPart[] = ['body', 'headers', 'query', 'params'];
        expect(validParts).toEqual(HTTP_REQUEST_PARTS);
      });
    });

    describe('Performance Improvements', () => {
      it('should use the same validator instance for identical schemas', () => {
        const schema = {
          type: 'object',
          properties: { id: { type: 'string' } },
        };

        // Multiple calls should use cached validator
        const start = performance.now();
        for (let i = 0; i < 100; i++) {
          getCachedValidator(schema);
        }
        const end = performance.now();

        // Should be very fast due to caching
        expect(end - start).toBeLessThan(50); // Less than 50ms for 100 calls (generous for CI)
      });
    });

    describe('HTTP Request Validation with Type Guards', () => {
      it('should reject invalid HTTP requests in validateHttpRequestParts', async () => {
        const requestSchema = createRequestSchema({
          body: z.object({ name: z.string() }),
        });

        const invalidRequest = {} as ParsedHttpRequest; // Empty object

        const result = await validateHttpRequestParts(requestSchema.toJsonSchema(), invalidRequest);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].field).toBe('httpRequest');
        expect(result.errors[0].message).toContain('Invalid HTTP request format');
      });
    });
  });
});
